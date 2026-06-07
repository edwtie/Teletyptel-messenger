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
    string? ReplaceId = null,
    bool StylingDisabled = false,
    XmppMessageRetractionEvent? Retraction = null,
    XmppMessageTombstone? Tombstone = null)
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
        XmppMessageRetraction.TryParseRetract(element, out var retraction);
        XmppMessageRetraction.TryParseTombstone(element, out var tombstone);

        message = new XmppChatMessage(
            To: to,
            Body: element.Element(XName.Get("body", XmppXmlNames.ClientNamespace))?.Value ?? string.Empty,
            From: from,
            Id: (string?)element.Attribute("id"),
            Type: type,
            OutOfBandUrl: outOfBandUrl,
            OutOfBandDescription: outOfBand?.Element(XName.Get("desc", OutOfBandNamespace))?.Value,
            ReplaceId: replaceId,
            StylingDisabled: XmppMessageStyling.IsStylingDisabled(element),
            Retraction: retraction,
            Tombstone: tombstone);
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

        if (Retraction is not null)
        {
            element.Add(XmppMessageRetraction.CreateRetract(Retraction.TargetMessageId));
        }

        if (Tombstone is not null && !string.IsNullOrWhiteSpace(Tombstone.RetractionMessageId))
        {
            element.Add(XmppMessageRetraction.CreateTombstone(
                Tombstone.RetractionMessageId,
                Tombstone.Stamp,
                Tombstone.Moderation));
        }

        if (StylingDisabled)
        {
            element.Add(XmppMessageStyling.CreateUnstyled());
        }

        return element;
    }
}
