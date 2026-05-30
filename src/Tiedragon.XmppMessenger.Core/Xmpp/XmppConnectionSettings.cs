namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppConnectionSettings
{
    public const int ClientPort = 5222;
    public const int DirectTlsClientPort = 5223;

    public XmppConnectionSettings(
        XmppAddress account,
        string host,
        int port,
        bool requireTls,
        bool directTls = false,
        string? tlsServerName = null)
    {
        ArgumentNullException.ThrowIfNull(account);

        if (string.IsNullOrWhiteSpace(host))
        {
            throw new ArgumentException("Host is required.", nameof(host));
        }

        if (port is <= 0 or > 65535)
        {
            throw new ArgumentOutOfRangeException(nameof(port), "Port must be between 1 and 65535.");
        }

        Account = account;
        Host = host;
        Port = port;
        RequireTls = requireTls;
        DirectTls = directTls;
        TlsServerName = string.IsNullOrWhiteSpace(tlsServerName)
            ? account.DomainPart
            : tlsServerName.Trim();
    }

    public XmppAddress Account { get; }

    public string Host { get; }

    public int Port { get; }

    public bool RequireTls { get; }

    public bool DirectTls { get; }

    public string TlsServerName { get; }

    public static XmppConnectionSettings ForAccount(XmppAddress account)
    {
        ArgumentNullException.ThrowIfNull(account);
        return new XmppConnectionSettings(account, account.DomainPart, ClientPort, requireTls: true);
    }

    public static XmppConnectionSettings FromEndpoint(
        XmppAddress account,
        XmppClientConnectionEndpoint endpoint)
    {
        ArgumentNullException.ThrowIfNull(account);
        ArgumentNullException.ThrowIfNull(endpoint);

        return new XmppConnectionSettings(
            account,
            endpoint.Host,
            endpoint.Port,
            requireTls: true,
            directTls: endpoint.DirectTls,
            tlsServerName: account.DomainPart);
    }

    public XmppConnectionSettings WithDirectTls(int port = DirectTlsClientPort)
    {
        return new XmppConnectionSettings(
            Account,
            Host,
            port,
            requireTls: true,
            directTls: true,
            tlsServerName: TlsServerName);
    }
}
