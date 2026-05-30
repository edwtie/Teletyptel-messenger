using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppPresence(
    XmppPresenceShow Show = XmppPresenceShow.Online,
    string? Status = null,
    sbyte? Priority = null,
    XmppAddress? To = null,
    XmppAddress? From = null,
    XmppPresenceType Type = XmppPresenceType.Available,
    XmppEntityCapabilities? Capabilities = null,
    XmppVCardAvatarUpdate? VCardAvatarUpdate = null)
{
    public static bool TryParse(XElement element, out XmppPresence? presence)
    {
        presence = null;

        if (element.Name != XName.Get("presence", XmppXmlNames.ClientNamespace)
            || !XmppXmlValue.TryParsePresenceShow(element.Element(XName.Get("show", XmppXmlNames.ClientNamespace))?.Value, out var show)
            || !XmppXmlValue.TryParsePresenceType((string?)element.Attribute("type"), out var type))
        {
            return false;
        }

        XmppAddress.TryParse((string?)element.Attribute("to"), out var to);
        XmppAddress.TryParse((string?)element.Attribute("from"), out var from);

        sbyte? priority = null;
        var priorityText = element.Element(XName.Get("priority", XmppXmlNames.ClientNamespace))?.Value;
        if (!string.IsNullOrWhiteSpace(priorityText) && sbyte.TryParse(priorityText, out var parsedPriority))
        {
            priority = parsedPriority;
        }

        presence = new XmppPresence(
            Show: show,
            Status: element.Element(XName.Get("status", XmppXmlNames.ClientNamespace))?.Value,
            Priority: priority,
            To: to,
            From: from,
            Type: type,
            Capabilities: element
                .Elements(XName.Get("c", XmppEntityCapabilities.NamespaceName))
                .Select(child => XmppEntityCapabilities.TryParse(child, out var parsed) ? parsed : null)
                .FirstOrDefault(parsed => parsed is not null),
            VCardAvatarUpdate: element
                .Elements(XName.Get("x", XmppVCardAvatar.UpdateNamespaceName))
                .Select(child => XmppVCardAvatarUpdate.TryParse(child, out var parsed) ? parsed : null)
                .FirstOrDefault(parsed => parsed is not null));
        return true;
    }

    public static bool TryParse(string xml, out XmppPresence? presence)
    {
        presence = null;

        try
        {
            return TryParse(XElement.Parse(xml), out presence);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public XElement ToXml()
    {
        var element = new XElement(XName.Get("presence", XmppXmlNames.ClientNamespace));

        if (To is not null)
        {
            element.SetAttributeValue("to", To.Full);
        }

        if (From is not null)
        {
            element.SetAttributeValue("from", From.Full);
        }

        if (Type != XmppPresenceType.Available)
        {
            element.SetAttributeValue("type", XmppXmlValue.PresenceType(Type));
        }

        if (Show != XmppPresenceShow.Online)
        {
            element.Add(new XElement(XName.Get("show", XmppXmlNames.ClientNamespace), XmppXmlValue.PresenceShow(Show)));
        }

        if (!string.IsNullOrEmpty(Status))
        {
            element.Add(new XElement(XName.Get("status", XmppXmlNames.ClientNamespace), Status));
        }

        if (Priority.HasValue)
        {
            element.Add(new XElement(XName.Get("priority", XmppXmlNames.ClientNamespace), Priority.Value));
        }

        if (Capabilities is not null)
        {
            element.Add(Capabilities.ToXml());
        }

        if (VCardAvatarUpdate is not null)
        {
            element.Add(VCardAvatarUpdate.ToXml());
        }

        return element;
    }

    public static XmppPresence Subscribe(XmppAddress to)
    {
        return new XmppPresence(To: to, Type: XmppPresenceType.Subscribe);
    }

    public static XmppPresence Subscribed(XmppAddress to)
    {
        return new XmppPresence(To: to, Type: XmppPresenceType.Subscribed);
    }

    public static XmppPresence Unsubscribe(XmppAddress to)
    {
        return new XmppPresence(To: to, Type: XmppPresenceType.Unsubscribe);
    }

    public static XmppPresence Unsubscribed(XmppAddress to)
    {
        return new XmppPresence(To: to, Type: XmppPresenceType.Unsubscribed);
    }
}
