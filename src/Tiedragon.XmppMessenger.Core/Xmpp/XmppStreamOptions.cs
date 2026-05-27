namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStreamOptions
{
    public XmppStreamOptions(
        string preferredLanguage,
        string resource,
        TimeSpan connectTimeout,
        TimeSpan keepAliveInterval)
    {
        if (string.IsNullOrWhiteSpace(preferredLanguage))
        {
            throw new ArgumentException("Preferred language is required.", nameof(preferredLanguage));
        }

        if (string.IsNullOrWhiteSpace(resource))
        {
            throw new ArgumentException("Resource is required.", nameof(resource));
        }

        if (connectTimeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(connectTimeout));
        }

        if (keepAliveInterval <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(keepAliveInterval));
        }

        PreferredLanguage = preferredLanguage;
        Resource = resource;
        ConnectTimeout = connectTimeout;
        KeepAliveInterval = keepAliveInterval;
    }

    public string PreferredLanguage { get; }

    public string Resource { get; }

    public TimeSpan ConnectTimeout { get; }

    public TimeSpan KeepAliveInterval { get; }

    public static XmppStreamOptions Default { get; } = new(
        preferredLanguage: "en",
        resource: "Tiedragon.XmppMessenger",
        connectTimeout: TimeSpan.FromSeconds(15),
        keepAliveInterval: TimeSpan.FromSeconds(60));
}
