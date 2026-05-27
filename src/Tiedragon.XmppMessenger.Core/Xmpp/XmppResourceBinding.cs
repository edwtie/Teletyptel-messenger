using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppResourceBinding
{
    public static XmppIq CreateBindRequest(string id, string? resource = null)
    {
        XNamespace bind = XmppXmlNames.BindNamespace;
        var payload = new XElement(bind + "bind");

        if (!string.IsNullOrWhiteSpace(resource))
        {
            payload.Add(new XElement(bind + "resource", resource));
        }

        return new XmppIq(XmppIqType.Set, id, payload);
    }

    public static bool TryGetBoundJid(XmppIq iq, out XmppAddress? jid)
    {
        jid = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("bind", XmppXmlNames.BindNamespace))
        {
            return false;
        }

        var jidText = iq.Payload.Element(XName.Get("jid", XmppXmlNames.BindNamespace))?.Value;
        return XmppAddress.TryParse(jidText, out jid);
    }
}
