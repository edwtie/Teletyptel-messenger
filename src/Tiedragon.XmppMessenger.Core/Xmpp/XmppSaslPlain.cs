using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppSaslPlain
{
    public const string Mechanism = "PLAIN";

    public static XElement CreateAuthElement(string authorizationIdentity, string authenticationIdentity, string password)
    {
        ArgumentNullException.ThrowIfNull(authorizationIdentity);
        ArgumentNullException.ThrowIfNull(authenticationIdentity);
        ArgumentNullException.ThrowIfNull(password);

        var bytes = Encoding.UTF8.GetBytes($"{authorizationIdentity}\0{authenticationIdentity}\0{password}");
        return new XElement(
            XName.Get("auth", XmppXmlNames.SaslNamespace),
            new XAttribute("mechanism", Mechanism),
            Convert.ToBase64String(bytes));
    }

    public static bool IsSuccess(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);
        return element.Name == XName.Get("success", XmppXmlNames.SaslNamespace);
    }

    public static bool IsFailure(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);
        return element.Name == XName.Get("failure", XmppXmlNames.SaslNamespace);
    }
}
