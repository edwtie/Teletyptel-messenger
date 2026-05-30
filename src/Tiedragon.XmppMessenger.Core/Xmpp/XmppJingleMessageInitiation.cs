using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppJingleMessageInitiation
{
    public const string NamespaceName = "urn:xmpp:jingle-message:0";

    public const string MessageHintsNamespaceName = "urn:xmpp:hints";

    public const string ProposeAction = "propose";

    public const string RingingAction = "ringing";

    public const string RetractAction = "retract";

    public const string ProceedAction = "proceed";

    public const string RejectAction = "reject";

    public const string FinishAction = "finish";

    private static readonly HashSet<string> Actions = new(StringComparer.Ordinal)
    {
        ProposeAction,
        RingingAction,
        RetractAction,
        ProceedAction,
        RejectAction,
        FinishAction
    };

    public static XElement CreateRtpDescription(string media)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(media);
        return new XElement(
            XName.Get("description", XmppJingle.RtpNamespaceName),
            new XAttribute("media", media));
    }

    public static XElement CreateProposeMessage(
        XmppAddress to,
        string sessionId,
        IEnumerable<XElement> descriptions,
        string? messageId = null,
        XmppAddress? from = null,
        XmppMessageType type = XmppMessageType.Chat,
        bool addStoreHint = true)
    {
        ArgumentNullException.ThrowIfNull(descriptions);
        var descriptionElements = descriptions.Select(description => new XElement(description)).ToArray();
        if (descriptionElements.Length == 0)
        {
            throw new ArgumentException("A Jingle message propose must include at least one description.", nameof(descriptions));
        }

        return CreateMessage(
            to,
            ProposeAction,
            sessionId,
            descriptionElements,
            messageId,
            from,
            type,
            addStoreHint);
    }

    public static XElement CreateAudioCallProposeMessage(
        XmppAddress to,
        string sessionId,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateProposeMessage(
            to,
            sessionId,
            [CreateRtpDescription("audio")],
            messageId,
            from,
            addStoreHint: addStoreHint);
    }

    public static XElement CreateAudioVideoCallProposeMessage(
        XmppAddress to,
        string sessionId,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateProposeMessage(
            to,
            sessionId,
            [CreateRtpDescription("audio"), CreateRtpDescription("video")],
            messageId,
            from,
            addStoreHint: addStoreHint);
    }

    public static XElement CreateRingingMessage(
        XmppAddress to,
        string sessionId,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateMessage(to, RingingAction, sessionId, [], messageId, from, addStoreHint: addStoreHint);
    }

    public static XElement CreateProceedMessage(
        XmppAddress to,
        string sessionId,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateMessage(to, ProceedAction, sessionId, [], messageId, from, addStoreHint: addStoreHint);
    }

    public static XElement CreateRetractMessage(
        XmppAddress to,
        string sessionId,
        string reason = "cancel",
        string? text = null,
        bool tieBreak = false,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateMessage(
            to,
            RetractAction,
            sessionId,
            [CreateReason(reason, text)],
            messageId,
            from,
            addStoreHint: addStoreHint,
            tieBreak: tieBreak);
    }

    public static XElement CreateRejectMessage(
        XmppAddress to,
        string sessionId,
        string reason = "busy",
        string? text = null,
        bool tieBreak = false,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateMessage(
            to,
            RejectAction,
            sessionId,
            [CreateReason(reason, text)],
            messageId,
            from,
            addStoreHint: addStoreHint,
            tieBreak: tieBreak);
    }

    public static XElement CreateFinishMessage(
        XmppAddress to,
        string sessionId,
        string reason = "success",
        string? text = null,
        string? migratedTo = null,
        string? messageId = null,
        XmppAddress? from = null,
        bool addStoreHint = true)
    {
        return CreateMessage(
            to,
            FinishAction,
            sessionId,
            [CreateReason(reason, text)],
            messageId,
            from,
            addStoreHint: addStoreHint,
            migratedTo: migratedTo);
    }

    public static XElement CreateReason(string condition, string? text = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(condition);
        var reason = new XElement(
            XName.Get("reason", XmppJingle.NamespaceName),
            new XElement(XName.Get(condition, XmppJingle.NamespaceName)));
        if (!string.IsNullOrWhiteSpace(text))
        {
            reason.Add(new XElement(XName.Get("text", XmppJingle.NamespaceName), text));
        }

        return reason;
    }

    public static bool TryParse(
        XElement message,
        out XmppJingleMessageInitiationEvent? initiation)
    {
        initiation = null;
        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || !XmppXmlValue.TryParseMessageType((string?)message.Attribute("type"), out var type))
        {
            return false;
        }

        var actionElement = message.Elements()
            .FirstOrDefault(element => element.Name.NamespaceName == NamespaceName
                && Actions.Contains(element.Name.LocalName));
        if (actionElement is null)
        {
            return false;
        }

        var sessionId = (string?)actionElement.Attribute("id");
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        XmppAddress.TryParse((string?)message.Attribute("from"), out var from);
        XmppAddress.TryParse((string?)message.Attribute("to"), out var to);
        var descriptions = actionElement.Elements()
            .Where(element => element.Name.LocalName == "description")
            .Select(element => new XElement(element))
            .ToArray();
        if (actionElement.Name.LocalName == ProposeAction && descriptions.Length == 0)
        {
            return false;
        }

        var reason = ParseReason(actionElement.Element(XName.Get("reason", XmppJingle.NamespaceName)));
        var migrated = actionElement.Element(XName.Get("migrated", NamespaceName));
        initiation = new XmppJingleMessageInitiationEvent(
            Action: actionElement.Name.LocalName,
            SessionId: sessionId,
            MessageId: (string?)message.Attribute("id"),
            From: from,
            To: to,
            Type: type,
            Descriptions: descriptions,
            Reason: reason,
            IsTieBreak: actionElement.Element(XName.Get("tie-break", NamespaceName)) is not null,
            MigratedTo: (string?)migrated?.Attribute("to"),
            HasStoreHint: message.Element(XName.Get("store", MessageHintsNamespaceName)) is not null);
        return true;
    }

    public static int CompareSessionIds(string left, string right)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(left);
        ArgumentException.ThrowIfNullOrWhiteSpace(right);
        return string.CompareOrdinal(left, right);
    }

    public static string GetTieBreakWinner(string left, string right)
    {
        return CompareSessionIds(left, right) <= 0 ? left : right;
    }

    private static XElement CreateMessage(
        XmppAddress to,
        string action,
        string sessionId,
        IEnumerable<XElement> children,
        string? messageId = null,
        XmppAddress? from = null,
        XmppMessageType type = XmppMessageType.Chat,
        bool addStoreHint = true,
        bool tieBreak = false,
        string? migratedTo = null)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(action);
        ArgumentException.ThrowIfNullOrWhiteSpace(sessionId);
        ArgumentNullException.ThrowIfNull(children);

        var actionElement = new XElement(
            XName.Get(action, NamespaceName),
            new XAttribute("id", sessionId),
            children.Select(child => new XElement(child)));
        if (tieBreak)
        {
            actionElement.Add(new XElement(XName.Get("tie-break", NamespaceName)));
        }

        if (!string.IsNullOrWhiteSpace(migratedTo))
        {
            actionElement.Add(new XElement(
                XName.Get("migrated", NamespaceName),
                new XAttribute("to", migratedTo)));
        }

        var message = new XElement(
            XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(type)),
            actionElement);
        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        if (!string.IsNullOrWhiteSpace(messageId))
        {
            message.SetAttributeValue("id", messageId);
        }

        if (addStoreHint)
        {
            message.Add(new XElement(XName.Get("store", MessageHintsNamespaceName)));
        }

        return message;
    }

    private static XmppJingleReason? ParseReason(XElement? element)
    {
        if (element is null)
        {
            return null;
        }

        var condition = element.Elements()
            .FirstOrDefault(child => child.Name.NamespaceName == XmppJingle.NamespaceName
                && child.Name.LocalName != "text");
        return condition is null
            ? null
            : new XmppJingleReason(
                condition.Name.LocalName,
                element.Element(XName.Get("text", XmppJingle.NamespaceName))?.Value);
    }
}

public sealed record XmppJingleMessageInitiationEvent(
    string Action,
    string SessionId,
    string? MessageId,
    XmppAddress? From,
    XmppAddress? To,
    XmppMessageType Type,
    IReadOnlyList<XElement> Descriptions,
    XmppJingleReason? Reason = null,
    bool IsTieBreak = false,
    string? MigratedTo = null,
    bool HasStoreHint = false);
