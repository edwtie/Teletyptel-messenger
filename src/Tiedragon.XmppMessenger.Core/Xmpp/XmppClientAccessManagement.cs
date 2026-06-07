using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppClientAccessEntry(
    string Id,
    string Type,
    bool Connected,
    DateTimeOffset? FirstSeen = null,
    DateTimeOffset? LastSeen = null,
    IReadOnlyList<string>? AuthMethods = null,
    string? PermissionStatus = null,
    string? Software = null,
    Uri? Uri = null,
    string? Device = null)
{
    public IReadOnlyList<string> AuthenticationMethods { get; init; } =
        AuthMethods ?? Array.Empty<string>();
}

public static class XmppClientAccessManagement
{
    public const string NamespaceName = "urn:xmpp:cam:0";

    public const string ClientTypeSession = "session";

    public const string ClientTypeAccess = "access";

    public const string PermissionUnrestricted = "unrestricted";

    public const string PermissionNormal = "normal";

    public const string PermissionRestricted = "restricted";

    public static XmppIq CreateListRequest(string id)
    {
        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("list", NamespaceName)));
    }

    public static XmppIq CreateRevokeRequest(string id, string clientId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(clientId);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("revoke", NamespaceName),
                new XAttribute("id", clientId)));
    }

    public static XElement CreateClientsElement(IEnumerable<XmppClientAccessEntry> clients)
    {
        ArgumentNullException.ThrowIfNull(clients);

        return new XElement(
            XName.Get("clients", NamespaceName),
            clients.Select(ToClientElement));
    }

    public static bool TryParseClientsResult(XmppIq iq, out IReadOnlyList<XmppClientAccessEntry> clients)
    {
        clients = Array.Empty<XmppClientAccessEntry>();

        if (iq.Type != XmppIqType.Result
            || iq.Payload?.Name != XName.Get("clients", NamespaceName))
        {
            return false;
        }

        clients = iq.Payload
            .Elements(XName.Get("client", NamespaceName))
            .Select(TryParseClient)
            .Where(client => client is not null)
            .Cast<XmppClientAccessEntry>()
            .ToArray();
        return true;
    }

    private static XElement ToClientElement(XmppClientAccessEntry client)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(client.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(client.Type);

        var element = new XElement(
            XName.Get("client", NamespaceName),
            new XAttribute("connected", client.Connected ? "true" : "false"),
            new XAttribute("id", client.Id),
            new XAttribute("type", client.Type));

        AddDateElement(element, "first-seen", client.FirstSeen);
        AddDateElement(element, "last-seen", client.LastSeen);

        var auth = new XElement(XName.Get("auth", NamespaceName));
        foreach (var method in client.AuthenticationMethods.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            auth.Add(new XElement(XName.Get(method.Trim(), NamespaceName)));
        }

        element.Add(auth);

        if (!string.IsNullOrWhiteSpace(client.PermissionStatus))
        {
            element.Add(new XElement(
                XName.Get("permission", NamespaceName),
                new XAttribute("status", client.PermissionStatus)));
        }

        if (!string.IsNullOrWhiteSpace(client.Software)
            || client.Uri is not null
            || !string.IsNullOrWhiteSpace(client.Device))
        {
            var userAgent = new XElement(XName.Get("user-agent", NamespaceName));
            AddTextElement(userAgent, "software", client.Software);
            AddTextElement(userAgent, "uri", client.Uri?.AbsoluteUri);
            AddTextElement(userAgent, "device", client.Device);
            element.Add(userAgent);
        }

        return element;
    }

    private static XmppClientAccessEntry? TryParseClient(XElement element)
    {
        var id = ((string?)element.Attribute("id"))?.Trim();
        var type = ((string?)element.Attribute("type"))?.Trim();
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(type))
        {
            return null;
        }

        Uri.TryCreate(
            element.Element(XName.Get("user-agent", NamespaceName))
                ?.Element(XName.Get("uri", NamespaceName))
                ?.Value,
            UriKind.Absolute,
            out var uri);

        return new XmppClientAccessEntry(
            Id: id,
            Type: type,
            Connected: string.Equals((string?)element.Attribute("connected"), "true", StringComparison.OrdinalIgnoreCase),
            FirstSeen: TryParseDate(element.Element(XName.Get("first-seen", NamespaceName))?.Value),
            LastSeen: TryParseDate(element.Element(XName.Get("last-seen", NamespaceName))?.Value),
            AuthMethods: element
                .Element(XName.Get("auth", NamespaceName))
                ?.Elements()
                .Where(child => child.Name.NamespaceName == NamespaceName)
                .Select(child => child.Name.LocalName)
                .ToArray() ?? Array.Empty<string>(),
            PermissionStatus: element
                .Element(XName.Get("permission", NamespaceName))
                ?.Attribute("status")
                ?.Value,
            Software: element
                .Element(XName.Get("user-agent", NamespaceName))
                ?.Element(XName.Get("software", NamespaceName))
                ?.Value,
            Uri: uri,
            Device: element
                .Element(XName.Get("user-agent", NamespaceName))
                ?.Element(XName.Get("device", NamespaceName))
                ?.Value);
    }

    private static void AddDateElement(XElement parent, string name, DateTimeOffset? value)
    {
        if (value is null)
        {
            return;
        }

        parent.Add(new XElement(
            XName.Get(name, NamespaceName),
            value.Value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture)));
    }

    private static void AddTextElement(XElement parent, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            parent.Add(new XElement(XName.Get(name, NamespaceName), value));
        }
    }

    private static DateTimeOffset? TryParseDate(string? value)
    {
        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed)
            ? parsed
            : null;
    }
}
