using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppMultiUserChat
{
    public const string NamespaceName = "http://jabber.org/protocol/muc";

    public const string UserNamespaceName = "http://jabber.org/protocol/muc#user";

    public const string AdminNamespaceName = "http://jabber.org/protocol/muc#admin";

    public const string OwnerNamespaceName = "http://jabber.org/protocol/muc#owner";

    public const string DirectInvitationNamespaceName = "jabber:x:conference";

    public static XmppIq CreateRoomDiscoveryRequest(string id, XmppAddress service)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(service);

        return XmppServiceDiscovery.CreateItemsRequest(id, service);
    }

    public static bool TryParseRoomDiscoveryResult(XmppIq iq, out IReadOnlyList<XmppMucRoom>? rooms)
    {
        rooms = null;
        if (!XmppServiceDiscovery.TryParseItemsResult(iq, out var items) || items is null)
        {
            return false;
        }

        rooms = items.Items
            .Where(item => item.Jid is not null)
            .Select(item => new XmppMucRoom(item.Jid!, item.Name, item.Node))
            .ToArray();
        return true;
    }

    public static XmppIq CreateRoomItemsRequest(string id, XmppAddress room)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);

        return XmppServiceDiscovery.CreateItemsRequest(id, room);
    }

    public static bool TryParseRoomItemsResult(XmppIq iq, out IReadOnlyList<XmppMucRoomItem>? roomItems)
    {
        roomItems = null;
        if (!XmppServiceDiscovery.TryParseItemsResult(iq, out var items) || items is null)
        {
            return false;
        }

        roomItems = items.Items
            .Select(item => new XmppMucRoomItem(item.Jid, item.Name, item.Node))
            .ToArray();
        return true;
    }

    public static XElement CreateJoinPresence(
        XmppAddress room,
        string nickname,
        string? password = null,
        int? historyMaxChars = null,
        XmppAddress? from = null)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentException.ThrowIfNullOrWhiteSpace(nickname);

        var presence = new XElement(XName.Get("presence", XmppXmlNames.ClientNamespace),
            new XAttribute("to", ToOccupantJid(room, nickname).Full),
            new XElement(XName.Get("x", NamespaceName)));

        if (from is not null)
        {
            presence.SetAttributeValue("from", from.Full);
        }

        var x = presence.Element(XName.Get("x", NamespaceName))!;
        if (!string.IsNullOrEmpty(password))
        {
            x.Add(new XElement(XName.Get("password", NamespaceName), password));
        }

        if (historyMaxChars is not null)
        {
            x.Add(new XElement(XName.Get("history", NamespaceName),
                new XAttribute("maxchars", historyMaxChars.Value)));
        }

        return presence;
    }

    public static XElement CreateLeavePresence(XmppAddress room, string nickname)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentException.ThrowIfNullOrWhiteSpace(nickname);

        return new XElement(XName.Get("presence", XmppXmlNames.ClientNamespace),
            new XAttribute("to", ToOccupantJid(room, nickname).Full),
            new XAttribute("type", "unavailable"));
    }

    public static XElement CreateGroupMessage(
        XmppAddress room,
        string body,
        string? id = null,
        string? replaceId = null)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(body);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", room.Bare),
            new XAttribute("type", "groupchat"),
            new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), body));

        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        if (!string.IsNullOrWhiteSpace(replaceId))
        {
            message.Add(XmppMessageCorrection.CreateReplace(replaceId));
        }

        return message;
    }

    public static XmppIq CreateModeratedRetractionRequest(
        string id,
        XmppAddress room,
        string stanzaId,
        string? reason = null)
    {
        return XmppMessageModeration.CreateModeratedRetractionRequest(id, room, stanzaId, reason);
    }

    public static XElement CreateDirectInvitation(
        XmppAddress invitee,
        XmppAddress room,
        string? reason = null)
    {
        ArgumentNullException.ThrowIfNull(invitee);
        ArgumentNullException.ThrowIfNull(room);

        var x = new XElement(XName.Get("x", DirectInvitationNamespaceName),
            new XAttribute("jid", room.Bare));
        if (!string.IsNullOrWhiteSpace(reason))
        {
            x.SetAttributeValue("reason", reason);
        }

        return new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", invitee.Full),
            x);
    }

    public static bool TryParseGroupMessage(XElement element, out XmppGroupChatMessage? message)
    {
        message = null;

        if (element.Name != XName.Get("message", XmppXmlNames.ClientNamespace)
            || !string.Equals((string?)element.Attribute("type"), "groupchat", StringComparison.Ordinal))
        {
            return false;
        }

        XmppAddress.TryParse((string?)element.Attribute("from"), out var from);
        XmppAddress.TryParse((string?)element.Attribute("to"), out var to);
        XmppMessageCorrection.TryGetReplaceId(element, out var replaceId);
        XmppMessageRetraction.TryParseRetract(element, out var retraction);
        XmppMessageRetraction.TryParseTombstone(element, out var tombstone);
        message = new XmppGroupChatMessage(
            Room: from is null ? null : XmppAddress.Parse(from.Bare),
            Nickname: from?.ResourcePart,
            Body: element.Element(XName.Get("body", XmppXmlNames.ClientNamespace))?.Value ?? string.Empty,
            From: from,
            To: to,
            Id: (string?)element.Attribute("id"),
            ReplaceId: replaceId,
            Retraction: retraction,
            Tombstone: tombstone);
        return true;
    }

    public static XmppIq CreateConfigurationFormRequest(string id, XmppAddress room)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("query", OwnerNamespaceName)),
            To: room);
    }

    public static bool TryParseConfigurationForm(XmppIq iq, out XmppDataForm? form)
    {
        form = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("query", OwnerNamespaceName))
        {
            return false;
        }

        var formElement = iq.Payload.Element(XName.Get("x", XmppServiceDiscovery.DataFormNamespace));
        if (formElement is null)
        {
            return false;
        }

        form = XmppServiceDiscovery.ParseDataForm(formElement);
        return true;
    }

    public static XmppIq CreateConfigurationSubmitRequest(
        string id,
        XmppAddress room,
        IEnumerable<XmppDataFormSubmitField> fields)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(fields);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("query", OwnerNamespaceName),
                CreateSubmitDataForm(fields)),
            To: room);
    }

    public static XmppIq CreateConfigurationCancelRequest(string id, XmppAddress room)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("query", OwnerNamespaceName),
                new XElement(XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
                    new XAttribute("type", "cancel"))),
            To: room);
    }

    public static XmppIq CreateAdminListRequest(
        string id,
        XmppAddress room,
        string? affiliation = null,
        string? role = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);
        if (string.IsNullOrWhiteSpace(affiliation) && string.IsNullOrWhiteSpace(role))
        {
            throw new ArgumentException("An affiliation or role filter is required.");
        }

        var item = new XElement(XName.Get("item", AdminNamespaceName));
        if (!string.IsNullOrWhiteSpace(affiliation))
        {
            item.SetAttributeValue("affiliation", affiliation);
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            item.SetAttributeValue("role", role);
        }

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("query", AdminNamespaceName), item),
            To: room);
    }

    public static XmppIq CreateAdminSetRequest(
        string id,
        XmppAddress room,
        IEnumerable<XmppMucAdminItem> items)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(items);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("query", AdminNamespaceName), items.Select(ToAdminItemElement)),
            To: room);
    }

    public static XmppIq CreateSetAffiliationRequest(
        string id,
        XmppAddress room,
        XmppAddress jid,
        string affiliation,
        string? reason = null)
    {
        ArgumentNullException.ThrowIfNull(jid);
        ArgumentException.ThrowIfNullOrWhiteSpace(affiliation);

        return CreateAdminSetRequest(
            id,
            room,
            [new XmppMucAdminItem(Jid: jid, Affiliation: affiliation, Reason: reason)]);
    }

    public static XmppIq CreateSetRoleRequest(
        string id,
        XmppAddress room,
        string nick,
        string role,
        string? reason = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(nick);
        ArgumentException.ThrowIfNullOrWhiteSpace(role);

        return CreateAdminSetRequest(
            id,
            room,
            [new XmppMucAdminItem(Nick: nick, Role: role, Reason: reason)]);
    }

    public static XmppIq CreateBanUserRequest(
        string id,
        XmppAddress room,
        XmppAddress jid,
        string? reason = null)
    {
        return CreateSetAffiliationRequest(id, room, jid, "outcast", reason);
    }

    public static XmppIq CreateKickOccupantRequest(
        string id,
        XmppAddress room,
        string nick,
        string? reason = null)
    {
        return CreateSetRoleRequest(id, room, nick, "none", reason);
    }

    public static bool TryParseAdminItemsResult(XmppIq iq, out IReadOnlyList<XmppMucAdminItem>? items)
    {
        items = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("query", AdminNamespaceName))
        {
            return false;
        }

        items = iq.Payload.Elements(XName.Get("item", AdminNamespaceName))
            .Select(ParseAdminItem)
            .ToArray();
        return true;
    }

    public static XmppAddress ToOccupantJid(XmppAddress room, string nickname)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentException.ThrowIfNullOrWhiteSpace(nickname);
        return XmppAddress.Parse(room.Bare + "/" + nickname);
    }

    private static XElement CreateSubmitDataForm(IEnumerable<XmppDataFormSubmitField> fields)
    {
        return new XElement(XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("type", "submit"),
            fields.Select(field =>
            {
                ArgumentException.ThrowIfNullOrWhiteSpace(field.Name);
                return new XElement(XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
                    new XAttribute("var", field.Name),
                    field.Values.Select(value => new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), value)));
            }));
    }

    private static XElement ToAdminItemElement(XmppMucAdminItem item)
    {
        var element = new XElement(XName.Get("item", AdminNamespaceName));
        if (item.Jid is not null)
        {
            element.SetAttributeValue("jid", item.Jid.Full);
        }

        if (!string.IsNullOrWhiteSpace(item.Nick))
        {
            element.SetAttributeValue("nick", item.Nick);
        }

        if (!string.IsNullOrWhiteSpace(item.Affiliation))
        {
            element.SetAttributeValue("affiliation", item.Affiliation);
        }

        if (!string.IsNullOrWhiteSpace(item.Role))
        {
            element.SetAttributeValue("role", item.Role);
        }

        if (!string.IsNullOrWhiteSpace(item.Reason))
        {
            element.Add(new XElement(XName.Get("reason", AdminNamespaceName), item.Reason));
        }

        return element;
    }

    private static XmppMucAdminItem ParseAdminItem(XElement element)
    {
        XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid);
        return new XmppMucAdminItem(
            Jid: jid,
            Nick: (string?)element.Attribute("nick"),
            Affiliation: (string?)element.Attribute("affiliation"),
            Role: (string?)element.Attribute("role"),
            Reason: element.Element(XName.Get("reason", AdminNamespaceName))?.Value);
    }
}

public sealed record XmppMucRoom(
    XmppAddress Jid,
    string? Name = null,
    string? Node = null);

public sealed record XmppMucRoomItem(
    XmppAddress? Jid,
    string? Name = null,
    string? Node = null);

public sealed record XmppDataFormSubmitField(
    string Name,
    IReadOnlyList<string> Values);

public sealed record XmppMucAdminItem(
    XmppAddress? Jid = null,
    string? Nick = null,
    string? Affiliation = null,
    string? Role = null,
    string? Reason = null);

public sealed record XmppGroupChatMessage(
    XmppAddress? Room,
    string? Nickname,
    string Body,
    XmppAddress? From = null,
    XmppAddress? To = null,
    string? Id = null,
    string? ReplaceId = null,
    XmppMessageRetractionEvent? Retraction = null,
    XmppMessageTombstone? Tombstone = null);
