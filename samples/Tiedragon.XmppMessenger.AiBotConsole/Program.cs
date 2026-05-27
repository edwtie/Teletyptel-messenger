using System.Net.WebSockets;
using System.Text;
using System.Threading.Channels;
using Tiedragon.XmppMessenger.Core.Rtt;

var uri = args.FirstOrDefault(argument => argument.StartsWith("ws://", StringComparison.OrdinalIgnoreCase)
    || argument.StartsWith("wss://", StringComparison.OrdinalIgnoreCase)) is { } url
    ? new Uri(url)
    : new Uri("ws://127.0.0.1:8787");

var quietMilliseconds = GetIntArgument(args, "--quiet", 1200);
var typingDelayMilliseconds = GetIntArgument(args, "--typing-delay", 35);

using var client = new ClientWebSocket();
using var cancellation = new CancellationTokenSource();
var receivedTexts = Channel.CreateUnbounded<string>();
var bot = new DemoAiBot();

Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    cancellation.Cancel();
};

Console.WriteLine($"AI bot connecting to {uri} ...");
await client.ConnectAsync(uri, cancellation.Token);
Console.WriteLine("AI bot connected. It only answers lines that start with ai: or @ai.");

var composer = new RttComposer();
await SendPacketAsync(client, composer.Reset(string.Empty), string.Empty, cancellation.Token);

var receiveTask = ReceiveLoopAsync(client, receivedTexts.Writer, cancellation.Token);
var responseTask = ResponseLoopAsync(
    client,
    composer,
    bot,
    receivedTexts.Reader,
    TimeSpan.FromMilliseconds(quietMilliseconds),
    TimeSpan.FromMilliseconds(typingDelayMilliseconds),
    cancellation.Token);

await Task.WhenAny(receiveTask, responseTask);

static int GetIntArgument(string[] args, string name, int defaultValue)
{
    var index = Array.IndexOf(args, name);
    if (index < 0 || index + 1 >= args.Length || !int.TryParse(args[index + 1], out var value))
    {
        return defaultValue;
    }

    return Math.Max(0, value);
}

static async Task ReceiveLoopAsync(
    ClientWebSocket client,
    ChannelWriter<string> receivedTexts,
    CancellationToken cancellationToken)
{
    var remoteState = new RttMessageState();
    var buffer = new byte[8192];

    try
    {
        while (!cancellationToken.IsCancellationRequested && client.State == WebSocketState.Open)
        {
            var builder = new StringBuilder();
            WebSocketReceiveResult result;
            do
            {
                result = await client.ReceiveAsync(buffer, cancellationToken);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    receivedTexts.Complete();
                    return;
                }

                builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            }
            while (!result.EndOfMessage);

            if (!RttJsonEnvelope.TryParse(builder.ToString(), out var envelope) || envelope is null)
            {
                continue;
            }

            if (envelope.Type == "message")
            {
                remoteState.AcceptFinalBody(envelope.Text);
            }
            else
            {
                var packet = RttPacket.Parse(envelope.Xml);
                if (!remoteState.Apply(packet))
                {
                    remoteState.AcceptFinalBody(envelope.Text);
                }
            }

            Console.WriteLine($"Human live text: {remoteState.Text}");
            await receivedTexts.WriteAsync(remoteState.Text, cancellationToken);
        }
    }
    catch (OperationCanceledException)
    {
    }
    catch (WebSocketException ex)
    {
        Console.WriteLine($"WebSocket closed: {ex.Message}");
    }
    finally
    {
        receivedTexts.TryComplete();
    }
}

static async Task ResponseLoopAsync(
    ClientWebSocket client,
    RttComposer composer,
    DemoAiBot bot,
    ChannelReader<string> receivedTexts,
    TimeSpan quietTime,
    TimeSpan typingDelay,
    CancellationToken cancellationToken)
{
    var lastSeenText = string.Empty;
    var lastAnsweredLine = string.Empty;

    while (await receivedTexts.WaitToReadAsync(cancellationToken))
    {
        while (receivedTexts.TryRead(out var text))
        {
            lastSeenText = text;
        }

        await Task.Delay(quietTime, cancellationToken);

        while (receivedTexts.TryRead(out var newerText))
        {
            lastSeenText = newerText;
        }

        var completedLine = TryGetLastCompletedLine(lastSeenText);
        if (completedLine is null || completedLine == lastAnsweredLine)
        {
            continue;
        }

        var prompt = TryExtractBotPrompt(completedLine);
        if (prompt is null)
        {
            continue;
        }

        lastAnsweredLine = completedLine;
        var response = bot.Reply(prompt) + Environment.NewLine;
        Console.WriteLine($"AI reply: {response}");
        await TypeResponseAsync(client, composer, response, typingDelay, cancellationToken);
    }
}

static string? TryGetLastCompletedLine(string text)
{
    var normalized = text.Replace("\r\n", "\n").Replace('\r', '\n');
    if (!normalized.EndsWith('\n'))
    {
        return null;
    }

    var lines = normalized.Split('\n', StringSplitOptions.None);
    for (var index = lines.Length - 2; index >= 0; index--)
    {
        var line = lines[index].Trim();
        if (line.Length > 0)
        {
            return line;
        }
    }

    return null;
}

static string? TryExtractBotPrompt(string line)
{
    var trimmed = line.Trim();
    if (trimmed.StartsWith("ai:", StringComparison.OrdinalIgnoreCase))
    {
        return trimmed[3..].Trim();
    }

    if (trimmed.StartsWith("@ai", StringComparison.OrdinalIgnoreCase))
    {
        return trimmed[3..].TrimStart(':', ' ', '\t');
    }

    return null;
}

static async Task TypeResponseAsync(
    ClientWebSocket client,
    RttComposer composer,
    string response,
    TimeSpan typingDelay,
    CancellationToken cancellationToken)
{
    await SendPacketAsync(client, composer.Reset(string.Empty), string.Empty, cancellationToken);

    var draft = string.Empty;
    foreach (var rune in response.EnumerateRunes())
    {
        draft += rune.ToString();
        await SendPacketAsync(client, composer.Replace(draft), draft, cancellationToken);
        await Task.Delay(typingDelay, cancellationToken);
    }
}

static async Task SendPacketAsync(
    ClientWebSocket client,
    RttPacket packet,
    string text,
    CancellationToken cancellationToken)
{
    if (client.State != WebSocketState.Open)
    {
        return;
    }

    var envelope = RttJsonEnvelope.FromPacket(packet, text);
    var bytes = Encoding.UTF8.GetBytes(envelope.ToJson());
    await client.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
}

internal sealed class DemoAiBot
{
    public string Reply(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "Ik luister. Zet je vraag achter ai: of @ai.";
        }

        var lower = text.ToLowerInvariant();

        if (lower.Contains("hallo") || lower.Contains("hoi") || lower.Contains("hello"))
        {
            return "Hallo, ik ben de RTT AI-bot. Ik lees je tekst live mee.";
        }

        if (lower.Contains("space") || lower.Contains("spatie"))
        {
            return "Spaties komen nu als echte RTT-insert binnen. Dat was een goede bug om te vinden.";
        }

        if (lower.Contains("test"))
        {
            return $"Test ontvangen: {text}";
        }

        if (text.EndsWith('?'))
        {
            return "Goede vraag. In deze demo geef ik nog lokale antwoorden; later kan hier een echte AI-service achter.";
        }

        return $"Ik lees live: {text}";
    }
}
