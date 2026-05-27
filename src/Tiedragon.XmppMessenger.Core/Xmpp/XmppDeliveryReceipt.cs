using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppDeliveryReceipt(string? RequestedId, string? ReceivedId)
{
    public const string NamespaceName = "urn:xmpp:receipts";

    public bool RequestsReceipt => RequestedId is not null;

    public bool IsReceipt => ReceivedId is not null;

    public static XElement CreateRequestMessage(
        XmppAddress to,
        string id,
        string body,
        XmppAddress? from = null)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(id);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(XmppMessageType.Chat)),
            new XAttribute("id", id),
            new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), body ?? string.Empty),
            new XElement(XName.Get("request", NamespaceName)));

        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        return message;
    }

    public static XElement CreateReceivedMessage(
        XmppAddress to,
        string receivedMessageId,
        string? id = null,
        XmppAddress? from = null)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(receivedMessageId);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(XmppMessageType.Chat)),
            new XElement(XName.Get("received", NamespaceName),
                new XAttribute("id", receivedMessageId)));

        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        return message;
    }

    public static bool TryParse(XElement message, out XmppDeliveryReceipt? receipt)
    {
        receipt = null;

        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var request = message.Element(XName.Get("request", NamespaceName));
        var received = message.Element(XName.Get("received", NamespaceName));
        var receivedId = (string?)received?.Attribute("id");

        if (request is null && string.IsNullOrWhiteSpace(receivedId))
        {
            return false;
        }

        receipt = new XmppDeliveryReceipt(
            request is not null ? (string?)message.Attribute("id") : null,
            string.IsNullOrWhiteSpace(receivedId) ? null : receivedId);
        return true;
    }

    public static bool TryParse(string xml, out XmppDeliveryReceipt? receipt)
    {
        receipt = null;

        try
        {
            return TryParse(XElement.Parse(xml), out receipt);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }
}
