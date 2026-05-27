using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStreamNode(
    XmppStreamNodeType Type,
    XElement? Element = null,
    string? RawText = null)
{
    public static XmppStreamNode StreamOpened(string rawText)
    {
        return new XmppStreamNode(XmppStreamNodeType.StreamOpened, RawText: rawText);
    }

    public static XmppStreamNode StreamClosed()
    {
        return new XmppStreamNode(XmppStreamNodeType.StreamClosed);
    }

    public static XmppStreamNode FromElement(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);

        if (element.Name == XName.Get("features", XmppXmlNames.StreamNamespace))
        {
            return new XmppStreamNode(XmppStreamNodeType.Features, element);
        }

        if (element.Name == XName.Get("error", XmppXmlNames.StreamNamespace))
        {
            return new XmppStreamNode(XmppStreamNodeType.StreamError, element);
        }

        return new XmppStreamNode(XmppStreamNodeType.Stanza, element);
    }
}
