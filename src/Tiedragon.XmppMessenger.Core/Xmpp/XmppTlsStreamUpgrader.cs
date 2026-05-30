using System.Net.Security;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppTlsStreamUpgrader : IXmppTlsStreamUpgrader
{
    public async Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken)
    {
        return await UpgradeAsync(
            stream,
            XmppTlsClientOptions.ForStartTls(targetHost),
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<Stream> UpgradeAsync(
        Stream stream,
        XmppTlsClientOptions options,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(options);

        var sslStream = new SslStream(stream, leaveInnerStreamOpen: false);
        try
        {
            var authenticationOptions = new SslClientAuthenticationOptions
            {
                TargetHost = options.TargetHost
            };

            if (options.UseXmppClientAlpn)
            {
                authenticationOptions.ApplicationProtocols =
                [
                    new SslApplicationProtocol(XmppDirectTls.XmppClientAlpnProtocol)
                ];
            }

            await sslStream.AuthenticateAsClientAsync(authenticationOptions, cancellationToken).ConfigureAwait(false);
            return sslStream;
        }
        catch
        {
            await sslStream.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }
}
