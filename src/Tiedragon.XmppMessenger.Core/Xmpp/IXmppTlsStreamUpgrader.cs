namespace Tiedragon.XmppMessenger.Core.Xmpp;

public interface IXmppTlsStreamUpgrader
{
    Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken);

    Task<Stream> UpgradeAsync(
        Stream stream,
        XmppTlsClientOptions options,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(options);
        return UpgradeAsync(stream, options.TargetHost, cancellationToken);
    }
}
