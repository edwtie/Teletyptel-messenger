using System.Net.WebSockets;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppClientWebSocketTransport : IXmppWebSocketTransport
{
    private readonly ClientWebSocket _webSocket;

    public XmppClientWebSocketTransport(ClientWebSocket? webSocket = null)
    {
        _webSocket = webSocket ?? new ClientWebSocket();
        _webSocket.Options.AddSubProtocol(XmppWebSocketFrame.Subprotocol);
    }

    public Task ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(uri);
        return _webSocket.ConnectAsync(uri, cancellationToken);
    }

    public async Task SendTextAsync(string text, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(text);
        var bytes = Encoding.UTF8.GetBytes(text);
        await _webSocket.SendAsync(
            bytes,
            WebSocketMessageType.Text,
            endOfMessage: true,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<string?> ReceiveTextAsync(CancellationToken cancellationToken = default)
    {
        var buffer = new byte[8192];
        using var stream = new MemoryStream();

        while (true)
        {
            var result = await _webSocket.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return null;
            }

            stream.Write(buffer, 0, result.Count);
            if (result.EndOfMessage)
            {
                return Encoding.UTF8.GetString(stream.ToArray());
            }
        }
    }

    public async Task CloseAsync(CancellationToken cancellationToken = default)
    {
        if (_webSocket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            await _webSocket.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "XMPP WebSocket close",
                cancellationToken).ConfigureAwait(false);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await CloseAsync(CancellationToken.None).ConfigureAwait(false);
        _webSocket.Dispose();
    }
}
