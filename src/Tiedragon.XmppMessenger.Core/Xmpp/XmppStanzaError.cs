using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStanzaError(
    string Condition,
    string Type,
    string? Text = null,
    string? By = null,
    string? ApplicationCondition = null)
{
    public const string NamespaceName = "urn:ietf:params:xml:ns:xmpp-stanzas";

    public static bool TryParse(XElement stanza, out XmppStanzaError? error)
    {
        error = null;

        var errorElement = stanza.Element(XName.Get("error", XmppXmlNames.ClientNamespace));
        if (errorElement is null)
        {
            return false;
        }

        var condition = errorElement.Elements()
            .FirstOrDefault(child => child.Name.NamespaceName == NamespaceName && child.Name.LocalName != "text");
        if (condition is null)
        {
            return false;
        }

        var applicationCondition = errorElement.Elements()
            .FirstOrDefault(child => child.Name.NamespaceName != NamespaceName)
            ?.Name.ToString();

        error = new XmppStanzaError(
            condition.Name.LocalName,
            (string?)errorElement.Attribute("type") ?? string.Empty,
            errorElement.Element(XName.Get("text", NamespaceName))?.Value,
            (string?)errorElement.Attribute("by"),
            applicationCondition);
        return true;
    }

    public static bool TryParse(string xml, out XmppStanzaError? error)
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
