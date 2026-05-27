using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppChatStateNotifications
{
    public const string NamespaceName = "http://jabber.org/protocol/chatstates";

    public static XElement ToElement(XmppChatState state)
    {
        return new XElement(XName.Get(FormatState(state), NamespaceName));
    }

    public static XElement CreateMessage(
        XmppAddress to,
        XmppChatState state,
        XmppAddress? from = null,
        string? id = null)
    {
        ArgumentNullException.ThrowIfNull(to);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(XmppMessageType.Chat)),
            ToElement(state));

        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        return message;
    }

    public static bool TryParse(XElement message, out XmppChatState state)
    {
        state = default;

        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        foreach (var child in message.Elements())
        {
            if (child.Name.NamespaceName == NamespaceName && TryParseState(child.Name.LocalName, out state))
            {
                return true;
            }
        }

        return false;
    }

    public static bool TryParse(string xml, out XmppChatState state)
    {
        state = default;

        try
        {
            return TryParse(XElement.Parse(xml), out state);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    private static bool TryParseState(string value, out XmppChatState state)
    {
        switch (value)
        {
            case "active":
                state = XmppChatState.Active;
                return true;
            case "composing":
                state = XmppChatState.Composing;
                return true;
            case "paused":
                state = XmppChatState.Paused;
                return true;
            case "inactive":
                state = XmppChatState.Inactive;
                return true;
            case "gone":
                state = XmppChatState.Gone;
                return true;
            default:
                state = default;
                return false;
        }
    }

    private static string FormatState(XmppChatState state)
    {
        return state switch
        {
            XmppChatState.Active => "active",
            XmppChatState.Composing => "composing",
            XmppChatState.Paused => "paused",
            XmppChatState.Inactive => "inactive",
            XmppChatState.Gone => "gone",
            _ => throw new NotSupportedException($"Unsupported chat state {state}.")
        };
    }
}
