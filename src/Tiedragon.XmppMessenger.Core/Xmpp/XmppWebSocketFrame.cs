using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppWebSocketOpenFrame(
    string To,
    string Version = "1.0",
    string? Language = null,
    string? Id = null,
    string? From = null)
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(To);

        var element = new XElement(
            XName.Get("open", XmppWebSocketFrame.FramingNamespace),
            new XAttribute("to", To),
            new XAttribute("version", Version));

        if (!string.IsNullOrWhiteSpace(Language))
        {
            element.SetAttributeValue(XNamespace.Xml + "lang", Language);
        }

        if (!string.IsNullOrWhiteSpace(Id))
        {
            element.SetAttributeValue("id", Id);
        }

        if (!string.IsNullOrWhiteSpace(From))
        {
            element.SetAttributeValue("from", From);
        }

        return element;
    }
}

public static class XmppWebSocketFrame
{
    public const string FramingNamespace = "urn:ietf:params:xml:ns:xmpp-framing";

    public const string Subprotocol = "xmpp";

    public static XElement CreateOpen(string to, string? language = null)
    {
        return new XmppWebSocketOpenFrame(to, Language: language).ToXml();
    }

    public static XElement CreateClose()
    {
        return new XElement(XName.Get("close", FramingNamespace));
    }

    public static bool TryParseOpen(string xml, out XmppWebSocketOpenFrame? frame)
    {
        frame = null;

        try
        {
            return TryParseOpen(XElement.Parse(xml), out frame);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public static bool TryParseOpen(XElement element, out XmppWebSocketOpenFrame? frame)
    {
        frame = null;

        if (element.Name != XName.Get("open", FramingNamespace))
        {
            return false;
        }

        var to = (string?)element.Attribute("to");
        if (string.IsNullOrWhiteSpace(to))
        {
            return false;
        }

        frame = new XmppWebSocketOpenFrame(
            to,
            (string?)element.Attribute("version") ?? "1.0",
            (string?)element.Attribute(XNamespace.Xml + "lang"),
            (string?)element.Attribute("id"),
            (string?)element.Attribute("from"));
        return true;
    }

    public static bool IsClose(XElement element)
    {
        return element.Name == XName.Get("close", FramingNamespace);
    }
}
