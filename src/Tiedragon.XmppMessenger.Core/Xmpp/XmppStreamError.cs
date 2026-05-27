using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStreamError(string Condition, string? Text = null, string? ApplicationCondition = null)
{
    public const string NamespaceName = "urn:ietf:params:xml:ns:xmpp-streams";

    public static bool TryParse(XElement element, out XmppStreamError? error)
    {
        error = null;

        if (element.Name != XName.Get("error", XmppXmlNames.StreamNamespace))
        {
            return false;
        }

        var condition = element.Elements()
            .FirstOrDefault(child => child.Name.NamespaceName == NamespaceName && child.Name.LocalName != "text");
        if (condition is null)
        {
            return false;
        }

        var applicationCondition = element.Elements()
            .FirstOrDefault(child => child.Name.NamespaceName != NamespaceName)
            ?.Name.ToString();

        error = new XmppStreamError(
            condition.Name.LocalName,
            element.Element(XName.Get("text", NamespaceName))?.Value,
            applicationCondition);
        return true;
    }

    public static bool TryParse(string xml, out XmppStreamError? error)
    {
        error = null;

        try
        {
            return TryParse(XElement.Parse(xml), out error);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }
}
