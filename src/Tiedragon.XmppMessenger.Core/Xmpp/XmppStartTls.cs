using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppStartTls
{
    public static XElement CreateStartTlsElement()
    {
        return new XElement(XName.Get("starttls", XmppXmlNames.TlsNamespace));
    }

    public static bool IsProceed(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);
        return element.Name == XName.Get("proceed", XmppXmlNames.TlsNamespace);
    }

    public static bool IsFailure(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);
        return element.Name == XName.Get("failure", XmppXmlNames.TlsNamespace);
    }
}
