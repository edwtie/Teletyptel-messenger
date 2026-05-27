using System.Net.WebSockets;
using System.Text;
using Tiedragon.XmppMessenger.Core.Rtt;

var sendIndex = Array.IndexOf(args, "--send");
var sendText = sendIndex >= 0 && sendIndex + 1 < args.Length ? args[sendIndex + 1] : null;
var urlArgument = args.FirstOrDefault(argument => argument.StartsWith("ws://", StringComparison.OrdinalIgnoreCase)
    || argument.StartsWith("wss://", StringComparison.OrdinalIgnoreCase));

var uri = urlArgument is not null
    ? new Uri(urlArgument)
    : args.Length > 0 && sendIndex != 0
    ? new Uri(args[0])
    : new Uri("ws://127.0.0.1:8787");

using var client = new ClientWebSocket();
var cancellation = new CancellationTokenSource();

Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    if (!cancellation.IsCancellationRequested)
    {
        cancellation.Cancel();
    }
};

Console.WriteLine($"Connecting to {uri} ...");
try
{
    await client.ConnectAsync(uri, cancellation.Token);
}
catch (WebSocketException ex)
{
    Console.WriteLine($"Cannot connect: {ex.Message}");
    Console.WriteLine("Start php/rtt-websocket-server.php first, then run this sample again.");
    return;
}

Console.WriteLine("Connected.");

if (sendText is not null)
{
    var onceComposer = new RttComposer();
    await SendPacketAsync(client, onceComposer.Reset(string.Empty), string.Empty, cancellation.Token);
    await SendPacketAsync(client, onceComposer.Replace(sendText), sendText, cancellation.Token);
    Console.WriteLine($"Sent RTT text: {sendText}");
    return;
}

Console.WriteLine("Type a line and press Enter. Empty line clears the live text. Ctrl+C exits.");

var receiveTask = ReceiveLoopAsync(client, cancellation.Token);
var composer = new RttComposer();

await SendPacketAsync(client, composer.Reset(string.Empty), string.Empty, cancellation.Token);

while (!cancellation.IsCancellationRequested && client.State == WebSocketState.Open)
{
    var line = Console.ReadLine();
    if (line is null)
    {
        break;
    }

    var packet = composer.Replace(line);
    await SendPacketAsync(client, packet, line, cancellation.Token);
}

cancellation.Cancel();
await receiveTask;

static async Task SendPacketAsync(
    ClientWebSocket client,
    RttPacket packet,
    string text,
    CancellationToken cancellationToken)
{
    var envelope = RttJsonEnvelope.FromPacket(packet, text);
    var bytes = Encoding.UTF8.GetBytes(envelope.ToJson());
    await client.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
}

static async Task ReceiveLoopAsync(ClientWebSocket client, CancellationToken cancellationToken)
{
    var state = new RttMessageState();
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
                    return;
                }

                builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            }
            while (!result.EndOfMessage);

            var json = builder.ToString();
            if (!RttJsonEnvelope.TryParse(json, out var envelope) || envelope is null)
            {
                continue;
            }

            if (envelope.Type == "message")
            {
                state.AcceptFinalBody(envelope.Text);
                Console.WriteLine();
                Console.WriteLine($"Remote message: {state.Text}");
                continue;
            }

            var packet = RttPacket.Parse(envelope.Xml);
            if (state.Apply(packet))
            {
                Console.WriteLine();
                Console.WriteLine($"Remote live text: {state.Text}");
            }
            else
            {
                state.AcceptFinalBody(envelope.Text);
                Console.WriteLine();
                Console.WriteLine($"Remote live text: {state.Text}");
                Console.WriteLine("Remote RTT stream was out of sync; restored from envelope text snapshot.");
            }
        }
    }
    catch (OperationCanceledException)
    {
    }
    catch (WebSocketException)
    {
        Console.WriteLine();
        Console.WriteLine("WebSocket connection closed.");
    }
}
