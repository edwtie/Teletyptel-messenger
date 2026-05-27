namespace Tiedragon.XmppMessenger.Core.Xmpp;

public interface IXmppTlsStreamUpgrader
{
    Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken);
}
