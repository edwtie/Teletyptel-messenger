using System.Net.Security;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppTlsStreamUpgrader : IXmppTlsStreamUpgrader
{
    public async Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);

        if (string.IsNullOrWhiteSpace(targetHost))
        {
            throw new ArgumentException("Target host is required.", nameof(targetHost));
        }

        var sslStream = new SslStream(stream, leaveInnerStreamOpen: false);
        try
        {
            var options = new SslClientAuthenticationOptions
            {
                TargetHost = targetHost
            };

            await sslStream.AuthenticateAsClientAsync(options, cancellationToken).ConfigureAwait(false);
            return sslStream;
        }
        catch
        {
            await sslStream.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }
}
