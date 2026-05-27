using System.Xml.Linq;
using Tiedragon.XmppMessenger.Core.Rtt;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppRealTimeTextMessage(
    XmppAddress To,
    RttPacket Packet,
    string BodyFallback,
    XmppAddress? From = null,
    string? Id = null)
{
    public XElement ToXml()
    {
        ArgumentNullException.ThrowIfNull(To);
        ArgumentNullException.ThrowIfNull(Packet);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("type", XmppXmlValue.MessageType(XmppMessageType.Chat)),
            new XAttribute("to", To.Full));

        if (From is not null)
        {
            message.SetAttributeValue("from", From.Full);
        }

        if (!string.IsNullOrWhiteSpace(Id))
        {
            message.SetAttributeValue("id", Id);
        }

        message.Add(new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), BodyFallback ?? string.Empty));
        message.Add(XElement.Parse(Packet.ToXml(), LoadOptions.PreserveWhitespace));
        return message;
    }

    public static bool TryParse(XElement element, out XmppRealTimeTextMessage? message)
    {
        message = null;

        if (element.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || !XmppAddress.TryParse((string?)element.Attribute("to"), out var to)
            || to is null)
        {
            return false;
        }

        var rttElement = element.Element(XName.Get("rtt", RttPacket.NamespaceName));
        if (rttElement is null)
        {
            return false;
        }

        XmppAddress.TryParse((string?)element.Attribute("from"), out var from);
        message = new XmppRealTimeTextMessage(
            To: to,
            Packet: RttPacket.Parse(rttElement.ToString(SaveOptions.DisableFormatting)),
            BodyFallback: element.Element(XName.Get("body", XmppXmlNames.ClientNamespace))?.Value ?? string.Empty,
            From: from,
            Id: (string?)element.Attribute("id"));
        return true;
    }
}
