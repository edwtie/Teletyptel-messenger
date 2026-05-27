using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppWebSocketStream : IAsyncDisposable
{
    private readonly IXmppWebSocketTransport _transport;

    public XmppWebSocketStream(IXmppWebSocketTransport transport)
    {
        _transport = transport ?? throw new ArgumentNullException(nameof(transport));
    }

    public Task ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        return _transport.ConnectAsync(uri, cancellationToken);
    }

    public Task SendOpenAsync(string to, string? language = null, CancellationToken cancellationToken = default)
    {
        return SendElementAsync(XmppWebSocketFrame.CreateOpen(to, language), cancellationToken);
    }

    public Task SendCloseAsync(CancellationToken cancellationToken = default)
    {
        return SendElementAsync(XmppWebSocketFrame.CreateClose(), cancellationToken);
    }

    public Task SendElementAsync(XElement element, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(element);
        return _transport.SendTextAsync(element.ToString(SaveOptions.DisableFormatting), cancellationToken);
    }

    public Task<string?> ReceiveTextAsync(CancellationToken cancellationToken = default)
    {
        return _transport.ReceiveTextAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        await _transport.DisposeAsync().ConfigureAwait(false);
    }
}
