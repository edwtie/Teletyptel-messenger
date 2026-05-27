using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppServiceDiscovery
{
    public const string InfoNamespace = "http://jabber.org/protocol/disco#info";

    public static bool SupportsRealTimeText(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(Tiedragon.XmppMessenger.Core.Rtt.RttPacket.NamespaceName);
    }

    public static XmppIq CreateInfoRequest(string id, XmppAddress? to = null, string? node = null)
    {
        var query = new XElement(XName.Get("query", InfoNamespace));
        if (!string.IsNullOrWhiteSpace(node))
        {
            query.SetAttributeValue("node", node);
        }

        return new XmppIq(XmppIqType.Get, id, query, To: to);
    }

    public static bool TryParseInfoResult(XmppIq iq, out XmppServiceDiscoveryInfo? info)
    {
        info = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("query", InfoNamespace))
        {
            return false;
        }

        var identities = iq.Payload.Elements(XName.Get("identity", InfoNamespace))
            .Select(element => new XmppServiceIdentity(
                Category: (string?)element.Attribute("category") ?? string.Empty,
                Type: (string?)element.Attribute("type") ?? string.Empty,
                Name: (string?)element.Attribute("name"),
                Language: (string?)element.Attribute(XNamespace.Xml + "lang")))
            .Where(identity => identity.Category.Length > 0 || identity.Type.Length > 0)
            .ToArray();

        var features = iq.Payload.Elements(XName.Get("feature", InfoNamespace))
            .Select(element => (string?)element.Attribute("var"))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        info = new XmppServiceDiscoveryInfo(
            Node: (string?)iq.Payload.Attribute("node"),
            Identities: identities,
            Features: features);
        return true;
    }
}

public sealed record XmppServiceDiscoveryInfo(
    string? Node,
    IReadOnlyList<XmppServiceIdentity> Identities,
    IReadOnlyList<string> Features)
{
    public bool Supports(string feature)
    {
        return Features.Any(value => string.Equals(value, feature, StringComparison.Ordinal));
    }
}

public sealed record XmppServiceIdentity(
    string Category,
    string Type,
    string? Name = null,
    string? Language = null);
