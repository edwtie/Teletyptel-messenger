using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppMessageCorrection
{
    public const string NamespaceName = "urn:xmpp:message-correct:0";

    public static XElement CreateReplace(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);

        return new XElement(XName.Get("replace", NamespaceName),
            new XAttribute("id", id));
    }

    public static bool TryGetReplaceId(XElement messageElement, out string? id)
    {
        ArgumentNullException.ThrowIfNull(messageElement);

        id = (string?)messageElement
            .Element(XName.Get("replace", NamespaceName))
            ?.Attribute("id");
        return !string.IsNullOrWhiteSpace(id);
    }
}
