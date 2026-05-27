using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppCarbonDirection
{
    Sent,
    Received
}

public sealed record XmppCarbonMessage(XmppCarbonDirection Direction, XmppChatMessage ForwardedMessage);

public static class XmppMessageCarbons
{
    public const string NamespaceName = "urn:xmpp:carbons:2";

    public const string ForwardedNamespace = "urn:xmpp:forward:0";

    public static XmppIq CreateEnableRequest(string id)
    {
        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("enable", NamespaceName)));
    }

    public static XmppIq CreateDisableRequest(string id)
    {
        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("disable", NamespaceName)));
    }

    public static bool TryParse(XElement stanza, out XmppCarbonMessage? carbon)
    {
        carbon = null;

        if (stanza.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var sent = stanza.Element(XName.Get("sent", NamespaceName));
        var received = stanza.Element(XName.Get("received", NamespaceName));
        var direction = sent is not null ? XmppCarbonDirection.Sent : XmppCarbonDirection.Received;
        var wrapper = sent ?? received;
        if (wrapper is null)
        {
            return false;
        }

        var forwardedMessage = wrapper
            .Element(XName.Get("forwarded", ForwardedNamespace))
            ?.Element(XName.Get("message", XmppXmlNames.ClientNamespace));
        if (forwardedMessage is null || !XmppChatMessage.TryParse(forwardedMessage, out var message) || message is null)
        {
            return false;
        }

        carbon = new XmppCarbonMessage(direction, message);
        return true;
    }
}
