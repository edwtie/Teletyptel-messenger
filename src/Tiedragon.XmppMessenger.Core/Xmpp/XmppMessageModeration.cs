using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppMessageModeration
{
    public const string NamespaceName = "urn:xmpp:message-moderate:1";

    public static bool SupportsMessageModeration(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppIq CreateModeratedRetractionRequest(
        string id,
        XmppAddress room,
        string stanzaId,
        string? reason = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);
        ArgumentException.ThrowIfNullOrWhiteSpace(stanzaId);

        var moderate = new XElement(XName.Get("moderate", NamespaceName),
            new XAttribute("id", stanzaId),
            new XElement(XName.Get("retract", XmppMessageRetraction.NamespaceName)));
        if (!string.IsNullOrWhiteSpace(reason))
        {
            moderate.Add(new XElement(XName.Get("reason", NamespaceName), reason));
        }

        return new XmppIq(XmppIqType.Set, id, moderate, To: room);
    }

    public static XElement CreateModerated(XmppModeratedRetraction moderation)
    {
        ArgumentNullException.ThrowIfNull(moderation);

        var element = new XElement(XName.Get("moderated", NamespaceName));
        if (moderation.By is not null)
        {
            element.SetAttributeValue("by", moderation.By.Full);
        }

        return element;
    }

    public static XmppModeratedRetraction? ParseModerated(XElement parent)
    {
        ArgumentNullException.ThrowIfNull(parent);

        var moderated = parent.Element(XName.Get("moderated", NamespaceName));
        if (moderated is null)
        {
            return null;
        }

        XmppAddress.TryParse((string?)moderated.Attribute("by"), out var by);
        var reason = parent.Element(XName.Get("reason", NamespaceName))?.Value
            ?? parent.Element(XName.Get("reason", XmppMessageRetraction.NamespaceName))?.Value;
        return new XmppModeratedRetraction(by, reason);
    }
}

public sealed record XmppModeratedRetraction(
    XmppAddress? By = null,
    string? Reason = null);
