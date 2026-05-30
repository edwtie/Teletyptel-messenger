using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppIncomingStanza(
    XElement Element,
    XmppChatMessage? Message = null,
    XmppPresence? Presence = null,
    XmppIq? Iq = null,
    XmppRealTimeTextMessage? RealTimeText = null,
    XmppCarbonMessage? Carbon = null,
    XmppPersonalEventNotification? PersonalEvent = null)
{
    public bool IsMessage => Element.Name == XName.Get("message", XmppXmlNames.ClientNamespace);

    public bool IsPresence => Presence is not null;

    public bool IsIq => Iq is not null;

    public bool IsRealTimeText => RealTimeText is not null;

    public bool IsCarbon => Carbon is not null;

    public bool IsPersonalEvent => PersonalEvent is not null;

    public static XmppIncomingStanza FromElement(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);

        if (element.Name == XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            XmppMessageCarbons.TryParse(element, out var carbon);
            XmppRealTimeTextMessage.TryParse(element, out var realTimeText);
            XmppChatMessage.TryParse(element, out var message);
            XmppPersonalEventing.TryParseNotification(element, out var personalEvent);
            return new XmppIncomingStanza(
                element,
                Message: message,
                RealTimeText: realTimeText,
                Carbon: carbon,
                PersonalEvent: personalEvent);
        }

        if (XmppPresence.TryParse(element, out var presence) && presence is not null)
        {
            return new XmppIncomingStanza(element, Presence: presence);
        }

        if (XmppIq.TryParse(element, out var iq) && iq is not null)
        {
            return new XmppIncomingStanza(element, Iq: iq);
        }

        return new XmppIncomingStanza(element);
    }
}
