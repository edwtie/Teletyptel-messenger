namespace Tiedragon.XmppMessenger.Core.Xmpp;

internal static class XmppXmlValue
{
    public static string MessageType(XmppMessageType type)
    {
        return type switch
        {
            XmppMessageType.Normal => "normal",
            XmppMessageType.Chat => "chat",
            XmppMessageType.GroupChat => "groupchat",
            XmppMessageType.Headline => "headline",
            XmppMessageType.Error => "error",
            _ => throw new ArgumentOutOfRangeException(nameof(type))
        };
    }

    public static bool TryParseMessageType(string? value, out XmppMessageType type)
    {
        type = value switch
        {
            null or "" or "normal" => XmppMessageType.Normal,
            "chat" => XmppMessageType.Chat,
            "groupchat" => XmppMessageType.GroupChat,
            "headline" => XmppMessageType.Headline,
            "error" => XmppMessageType.Error,
            _ => XmppMessageType.Normal
        };

        return value is null or "" or "normal" or "chat" or "groupchat" or "headline" or "error";
    }

    public static string PresenceShow(XmppPresenceShow show)
    {
        return show switch
        {
            XmppPresenceShow.Online => "online",
            XmppPresenceShow.Away => "away",
            XmppPresenceShow.Chat => "chat",
            XmppPresenceShow.DoNotDisturb => "dnd",
            XmppPresenceShow.ExtendedAway => "xa",
            _ => throw new ArgumentOutOfRangeException(nameof(show))
        };
    }

    public static bool TryParsePresenceShow(string? value, out XmppPresenceShow show)
    {
        show = value switch
        {
            null or "" or "online" => XmppPresenceShow.Online,
            "away" => XmppPresenceShow.Away,
            "chat" => XmppPresenceShow.Chat,
            "dnd" => XmppPresenceShow.DoNotDisturb,
            "xa" => XmppPresenceShow.ExtendedAway,
            _ => XmppPresenceShow.Online
        };

        return value is null or "" or "online" or "away" or "chat" or "dnd" or "xa";
    }

    public static string PresenceType(XmppPresenceType type)
    {
        return type switch
        {
            XmppPresenceType.Available => "available",
            XmppPresenceType.Unavailable => "unavailable",
            XmppPresenceType.Subscribe => "subscribe",
            XmppPresenceType.Subscribed => "subscribed",
            XmppPresenceType.Unsubscribe => "unsubscribe",
            XmppPresenceType.Unsubscribed => "unsubscribed",
            XmppPresenceType.Probe => "probe",
            XmppPresenceType.Error => "error",
            _ => throw new ArgumentOutOfRangeException(nameof(type))
        };
    }

    public static bool TryParsePresenceType(string? value, out XmppPresenceType type)
    {
        type = value switch
        {
            null or "" or "available" => XmppPresenceType.Available,
            "unavailable" => XmppPresenceType.Unavailable,
            "subscribe" => XmppPresenceType.Subscribe,
            "subscribed" => XmppPresenceType.Subscribed,
            "unsubscribe" => XmppPresenceType.Unsubscribe,
            "unsubscribed" => XmppPresenceType.Unsubscribed,
            "probe" => XmppPresenceType.Probe,
            "error" => XmppPresenceType.Error,
            _ => XmppPresenceType.Available
        };

        return value is null or "" or "available" or "unavailable" or "subscribe" or "subscribed"
            or "unsubscribe" or "unsubscribed" or "probe" or "error";
    }

    public static string IqType(XmppIqType type)
    {
        return type switch
        {
            XmppIqType.Get => "get",
            XmppIqType.Set => "set",
            XmppIqType.Result => "result",
            XmppIqType.Error => "error",
            _ => throw new ArgumentOutOfRangeException(nameof(type))
        };
    }

    public static bool TryParseIqType(string? value, out XmppIqType type)
    {
        type = value switch
        {
            "get" => XmppIqType.Get,
            "set" => XmppIqType.Set,
            "result" => XmppIqType.Result,
            "error" => XmppIqType.Error,
            _ => XmppIqType.Get
        };

        return value is "get" or "set" or "result" or "error";
    }

    public static string RosterSubscription(XmppRosterSubscription subscription)
    {
        return subscription switch
        {
            XmppRosterSubscription.None => "none",
            XmppRosterSubscription.To => "to",
            XmppRosterSubscription.From => "from",
            XmppRosterSubscription.Both => "both",
            XmppRosterSubscription.Remove => "remove",
            _ => throw new ArgumentOutOfRangeException(nameof(subscription))
        };
    }

    public static bool TryParseRosterSubscription(string? value, out XmppRosterSubscription subscription)
    {
        subscription = value switch
        {
            null or "" or "none" => XmppRosterSubscription.None,
            "to" => XmppRosterSubscription.To,
            "from" => XmppRosterSubscription.From,
            "both" => XmppRosterSubscription.Both,
            "remove" => XmppRosterSubscription.Remove,
            _ => XmppRosterSubscription.None
        };

        return value is null or "" or "none" or "to" or "from" or "both" or "remove";
    }
}
