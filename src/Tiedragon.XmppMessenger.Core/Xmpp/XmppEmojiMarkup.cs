using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppEmojiMarkup
{
    public const string NamespaceName = "urn:xmpp:markup:emoji:0";

    public const string MarkupNamespaceName = "urn:xmpp:markup:0";

    public static bool SupportsEmojiMarkup(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XElement CreateMarkup(IEnumerable<XmppCustomEmojiSpan> emojis)
    {
        ArgumentNullException.ThrowIfNull(emojis);

        var spans = emojis.Select(CreateSpan).ToArray();
        if (spans.Length == 0)
        {
            throw new ArgumentException("At least one custom emoji span is required.", nameof(emojis));
        }

        return new XElement(XName.Get("markup", MarkupNamespaceName), spans);
    }

    public static XElement CreateCustomEmojiMessage(
        XmppAddress to,
        string body,
        IEnumerable<XmppCustomEmojiSpan> emojis,
        IEnumerable<XElement> mediaElements,
        string? id = null,
        XmppAddress? from = null,
        XmppMessageType type = XmppMessageType.Chat)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentNullException.ThrowIfNull(body);
        ArgumentNullException.ThrowIfNull(mediaElements);

        var media = mediaElements.ToArray();
        if (media.Length == 0)
        {
            throw new ArgumentException("Emoji markup needs matching media metadata.", nameof(mediaElements));
        }

        var message = new XElement(
            XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(type)),
            new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), body),
            CreateMarkup(emojis),
            media);

        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        return message;
    }

    public static bool TryParse(
        XElement message,
        out IReadOnlyList<XmppCustomEmojiSpan> emojis)
    {
        emojis = [];
        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var parsed = message
            .Elements(XName.Get("markup", MarkupNamespaceName))
            .Elements(XName.Get("span", MarkupNamespaceName))
            .Select(TryParseSpan)
            .Where(span => span is not null)
            .Cast<XmppCustomEmojiSpan>()
            .ToArray();

        emojis = parsed;
        return parsed.Length > 0;
    }

    public static bool TryFindInlineMediaForEmoji(
        XmppCustomEmojiSpan emoji,
        IEnumerable<XmppStatelessInlineMedia> media,
        out XmppStatelessInlineMedia? match)
    {
        ArgumentNullException.ThrowIfNull(emoji);
        ArgumentNullException.ThrowIfNull(media);

        match = media.FirstOrDefault(item => item.File.Hashes?.Any(fileHash =>
            emoji.Hashes.Any(emojiHash =>
                string.Equals(fileHash.Algorithm, emojiHash.Algorithm, StringComparison.OrdinalIgnoreCase)
                && string.Equals(fileHash.Value, emojiHash.Value, StringComparison.Ordinal))) == true);
        return match is not null;
    }

    private static XElement CreateSpan(XmppCustomEmojiSpan emoji)
    {
        ArgumentNullException.ThrowIfNull(emoji);
        if (emoji.Start < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(emoji), "Emoji span start must be non-negative.");
        }

        if (emoji.End < emoji.Start)
        {
            throw new ArgumentOutOfRangeException(nameof(emoji), "Emoji span end must be greater than or equal to start.");
        }

        if (emoji.Hashes.Count == 0)
        {
            throw new ArgumentException("Custom emoji markup requires at least one XEP-0300 hash.", nameof(emoji));
        }

        var emojiElement = new XElement(
            XName.Get("emoji", NamespaceName),
            emoji.Hashes.Select(hash => hash.ToXml()));
        if (!string.IsNullOrWhiteSpace(emoji.Name))
        {
            emojiElement.SetAttributeValue("name", emoji.Name);
        }

        return new XElement(
            XName.Get("span", MarkupNamespaceName),
            new XAttribute("start", emoji.Start),
            new XAttribute("end", emoji.End),
            emojiElement);
    }

    private static XmppCustomEmojiSpan? TryParseSpan(XElement span)
    {
        if (!int.TryParse((string?)span.Attribute("start"), out var start)
            || !int.TryParse((string?)span.Attribute("end"), out var end)
            || start < 0
            || end < start)
        {
            return null;
        }

        var emoji = span.Element(XName.Get("emoji", NamespaceName));
        if (emoji is null)
        {
            return null;
        }

        var hashes = emoji
            .Elements(XName.Get("hash", XmppJingleFileTransfer.HashesNamespaceName))
            .Select(hash => XmppJingleFileHash.TryParse(hash, out var parsed) ? parsed : null)
            .Where(hash => hash is not null)
            .Cast<XmppJingleFileHash>()
            .ToArray();
        if (hashes.Length == 0)
        {
            return null;
        }

        return new XmppCustomEmojiSpan(
            start,
            end,
            (string?)emoji.Attribute("name"),
            hashes);
    }
}

public sealed record XmppCustomEmojiSpan(
    int Start,
    int End,
    string? Name,
    IReadOnlyList<XmppJingleFileHash> Hashes);
