namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppConnectionSettings
{
    public const int ClientPort = 5222;

    public XmppConnectionSettings(XmppAddress account, string host, int port, bool requireTls)
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
    }

    public XmppAddress Account { get; }

    public string Host { get; }

    public int Port { get; }

    public bool RequireTls { get; }

    public static XmppConnectionSettings ForAccount(XmppAddress account)
    {
        ArgumentNullException.ThrowIfNull(account);
        return new XmppConnectionSettings(account, account.DomainPart, ClientPort, requireTls: true);
    }
}
