namespace Tiedragon.XmppMessenger.Core.Xmpp;

public interface IXmppWebSocketTransport : IAsyncDisposable
{
    Task ConnectAsync(Uri uri, CancellationToken cancellationToken = default);

    Task SendTextAsync(string text, CancellationToken cancellationToken = default);

    Task<string?> ReceiveTextAsync(CancellationToken cancellationToken = default);

    Task CloseAsync(CancellationToken cancellationToken = default);
}
