using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppChatMessage(
    XmppAddress To,
    string Body,
    XmppAddress? From = null,
    string? Id = null,
    XmppMessageType Type = XmppMessageType.Chat,
    Uri? OutOfBandUrl = null,
    string? OutOfBandDescription = null,
    string? ReplaceId = null)
{
    public const string OutOfBandNamespace = "jabber:x:oob";

    public static XmppChatMessage CreateOutOfBandMessage(
        XmppAddress to,
        Uri url,
        string? description = null,
        string? id = null,
        XmppMessageType type = XmppMessageType.Chat)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentNullException.ThrowIfNull(url);
        return new XmppChatMessage(
            to,
            url.ToString(),
            Id: id,
            Type: type,
            OutOfBandUrl: url,
            OutOfBandDescription: description);
    }

    public static XmppChatMessage CreateCorrection(
        XmppAddress to,
        string correctedBody,
        string replaceId,
        string? id = null,
        XmppMessageType type = XmppMessageType.Chat)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentNullException.ThrowIfNull(correctedBody);
        ArgumentException.ThrowIfNullOrWhiteSpace(replaceId);

        return new XmppChatMessage(
            to,
            correctedBody,
            Id: id,
            Type: type,
            ReplaceId: replaceId);
    }

    public static bool TryParse(XElement element, out XmppChatMessage? message)
    {
        message = null;

        if (element.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || !XmppXmlValue.TryParseMessageType((string?)element.Attribute("type"), out var type)
            || !XmppAddress.TryParse((string?)element.Attribute("to"), out var to)
            || to is null)
        {
            return false;
        }

        XmppAddress.TryParse((string?)element.Attribute("from"), out var from);
        var outOfBand = element.Element(XName.Get("x", OutOfBandNamespace));
        Uri.TryCreate(outOfBand?.Element(XName.Get("url", OutOfBandNamespace))?.Value, UriKind.Absolute, out var outOfBandUrl);
        XmppMessageCorrection.TryGetReplaceId(element, out var replaceId);

        message = new XmppChatMessage(
            To: to,
            Body: element.Element(XName.Get("body", XmppXmlNames.ClientNamespace))?.Value ?? string.Empty,
            From: from,
            Id: (string?)element.Attribute("id"),
            Type: type,
            OutOfBandUrl: outOfBandUrl,
            OutOfBandDescription: outOfBand?.Element(XName.Get("desc", OutOfBandNamespace))?.Value,
            ReplaceId: replaceId);
        return true;
    }

    public static bool TryParse(string xml, out XmppChatMessage? message)
    {
        message = null;

        try
        {
            return TryParse(XElement.Parse(xml), out message);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public XElement ToXml()
    {
        ArgumentNullException.ThrowIfNull(To);

        var element = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", To.Full),
            new XAttribute("type", XmppXmlValue.MessageType(Type)));

        if (From is not null)
        {
            element.SetAttributeValue("from", From.Full);
        }

        if (!string.IsNullOrWhiteSpace(Id))
        {
            element.SetAttributeValue("id", Id);
        }

        if (!string.IsNullOrEmpty(Body))
        {
            element.Add(new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), Body));
        }

        if (OutOfBandUrl is not null)
        {
            var x = new XElement(XName.Get("x", OutOfBandNamespace),
                new XElement(XName.Get("url", OutOfBandNamespace), OutOfBandUrl.ToString()));
            if (!string.IsNullOrWhiteSpace(OutOfBandDescription))
            {
                x.Add(new XElement(XName.Get("desc", OutOfBandNamespace), OutOfBandDescription));
            }

            element.Add(x);
        }

        if (!string.IsNullOrWhiteSpace(ReplaceId))
        {
            element.Add(XmppMessageCorrection.CreateReplace(ReplaceId));
        }

        return element;
    }
}
