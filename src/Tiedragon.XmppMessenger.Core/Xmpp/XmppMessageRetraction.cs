using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppMessageRetraction
{
    public const string NamespaceName = "urn:xmpp:message-retract:1";

    public const string TombstoneFeatureName = NamespaceName + "#tombstone";

    public const string FallbackNamespaceName = "urn:xmpp:fallback:0";

    public const string MessageHintsNamespaceName = "urn:xmpp:hints";

    public static bool SupportsMessageRetraction(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static bool SupportsMessageRetractionTombstones(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(TombstoneFeatureName);
    }

    public static XElement CreateRetract(string targetMessageId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(targetMessageId);

        return new XElement(XName.Get("retract", NamespaceName),
            new XAttribute("id", targetMessageId));
    }

    public static XElement CreateRetractMessage(
        XmppAddress to,
        string targetMessageId,
        string? id = null,
        XmppAddress? from = null,
        XmppMessageType type = XmppMessageType.Chat,
        string fallbackBody = "/me retracted a previous message, but it's unsupported by your client.")
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(targetMessageId);
        ArgumentNullException.ThrowIfNull(fallbackBody);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(type)),
            CreateRetract(targetMessageId),
            new XElement(XName.Get("fallback", FallbackNamespaceName),
                new XAttribute("for", NamespaceName)),
            new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), fallbackBody),
            new XElement(XName.Get("store", MessageHintsNamespaceName)));

        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        return message;
    }

    public static XElement CreateTombstone(string retractionMessageId, DateTimeOffset? stamp = null, XmppModeratedRetraction? moderation = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(retractionMessageId);

        var element = new XElement(XName.Get("retracted", NamespaceName),
            new XAttribute("id", retractionMessageId));
        if (stamp is not null)
        {
            element.SetAttributeValue("stamp", FormatTimestamp(stamp.Value));
        }

        if (moderation is not null)
        {
            element.Add(XmppMessageModeration.CreateModerated(moderation));
            if (!string.IsNullOrWhiteSpace(moderation.Reason))
            {
                element.Add(new XElement(XName.Get("reason", NamespaceName), moderation.Reason));
            }
        }

        return element;
    }

    public static bool TryParseRetract(XElement messageElement, out XmppMessageRetractionEvent? retraction)
    {
        ArgumentNullException.ThrowIfNull(messageElement);
        retraction = null;

        if (messageElement.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || messageElement.Element(XName.Get("retract", NamespaceName)) is not { } retract
            || string.IsNullOrWhiteSpace((string?)retract.Attribute("id")))
        {
            return false;
        }

        XmppAddress.TryParse((string?)messageElement.Attribute("from"), out var from);
        XmppAddress.TryParse((string?)messageElement.Attribute("to"), out var to);
        XmppXmlValue.TryParseMessageType((string?)messageElement.Attribute("type"), out var type);

        retraction = new XmppMessageRetractionEvent(
            TargetMessageId: ((string?)retract.Attribute("id"))!,
            RetractionMessageId: (string?)messageElement.Attribute("id"),
            From: from,
            To: to,
            Type: type,
            FallbackBody: messageElement.Element(XName.Get("body", XmppXmlNames.ClientNamespace))?.Value,
            Moderation: XmppMessageModeration.ParseModerated(retract));
        return true;
    }

    public static bool TryParseTombstone(XElement messageElement, out XmppMessageTombstone? tombstone)
    {
        ArgumentNullException.ThrowIfNull(messageElement);
        tombstone = null;

        if (messageElement.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || messageElement.Element(XName.Get("retracted", NamespaceName)) is not { } retracted)
        {
            return false;
        }

        DateTimeOffset? stamp = null;
        if (DateTimeOffset.TryParse(
            (string?)retracted.Attribute("stamp"),
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsedStamp))
        {
            stamp = parsedStamp;
        }

        tombstone = new XmppMessageTombstone(
            OriginalMessageId: (string?)messageElement.Attribute("id"),
            RetractionMessageId: (string?)retracted.Attribute("id"),
            Stamp: stamp,
            Moderation: XmppMessageModeration.ParseModerated(retracted));
        return true;
    }

    internal static string FormatTimestamp(DateTimeOffset stamp)
    {
        return stamp.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    }
}

public sealed record XmppMessageRetractionEvent(
    string TargetMessageId,
    string? RetractionMessageId = null,
    XmppAddress? From = null,
    XmppAddress? To = null,
    XmppMessageType Type = XmppMessageType.Chat,
    string? FallbackBody = null,
    XmppModeratedRetraction? Moderation = null)
{
    public bool IsModerated => Moderation is not null;
}

public sealed record XmppMessageTombstone(
    string? OriginalMessageId,
    string? RetractionMessageId,
    DateTimeOffset? Stamp = null,
    XmppModeratedRetraction? Moderation = null)
{
    public bool IsModerated => Moderation is not null;
}
