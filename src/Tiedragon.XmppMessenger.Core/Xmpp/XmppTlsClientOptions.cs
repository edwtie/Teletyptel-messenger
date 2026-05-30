namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppTlsClientOptions
{
    public XmppTlsClientOptions(string targetHost, bool useXmppClientAlpn)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(targetHost);

        TargetHost = targetHost.Trim();
        UseXmppClientAlpn = useXmppClientAlpn;
    }

    public string TargetHost { get; }

    public bool UseXmppClientAlpn { get; }

    public static XmppTlsClientOptions ForStartTls(string targetHost)
    {
        return new XmppTlsClientOptions(targetHost, useXmppClientAlpn: false);
    }

    public static XmppTlsClientOptions ForDirectTls(string targetHost)
    {
        return new XmppTlsClientOptions(targetHost, useXmppClientAlpn: true);
    }
}
