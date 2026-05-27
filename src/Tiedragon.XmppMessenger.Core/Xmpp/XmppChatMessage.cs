using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppChatMessage(
    XmppAddress To,
    string Body,
    XmppAddress? From = null,
    string? Id = null,
    XmppMessageType Type = XmppMessageType.Chat)
{
    public static bool TryParse(XElement element, out XmppChatMessage? message)
    {
        message = null;

        if (element.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || !XmppXmlValue.TryParseMessageType((string?)element.Attribute("type"), out var type)
            || !XmppAddress.TryParse((string?)element.Attribute("to"), out var to)
            || to is null)
        {
            return false;
        }

        XmppAddress.TryParse((string?)element.Attribute("from"), out var from);
        message = new XmppChatMessage(
            To: to,
            Body: element.Element(XName.Get("body", XmppXmlNames.ClientNamespace))?.Value ?? string.Empty,
            From: from,
            Id: (string?)element.Attribute("id"),
            Type: type);
        return true;
    }

    public static bool TryParse(string xml, out XmppChatMessage? message)
    {
        message = null;

        try
        {
            return TryParse(XElement.Parse(xml), out message);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public XElement ToXml()
    {
        ArgumentNullException.ThrowIfNull(To);

        var element = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", To.Full),
            new XAttribute("type", XmppXmlValue.MessageType(Type)));

        if (From is not null)
        {
            element.SetAttributeValue("from", From.Full);
        }

        if (!string.IsNullOrWhiteSpace(Id))
        {
            element.SetAttributeValue("id", Id);
        }

        if (!string.IsNullOrEmpty(Body))
        {
            element.Add(new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), Body));
        }

        return element;
    }
}
