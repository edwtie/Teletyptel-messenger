using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppBookmarks
{
    public const string NamespaceName = "urn:xmpp:bookmarks:1";

    public const string LegacyStorageNamespaceName = "storage:bookmarks";

    public const string PrivateXmlNamespaceName = XmppPrivateXmlStorage.NamespaceName;

    public const string PublishOptionsNamespaceName = "http://jabber.org/protocol/pubsub#publish-options";

    public static string NotificationFeature => XmppPersonalEventing.CreateNotificationFeature(NamespaceName);

    public static XElement CreateConferenceElement(XmppConferenceBookmark bookmark)
    {
        ArgumentNullException.ThrowIfNull(bookmark);

        var conference = new XElement(
            XName.Get("conference", NamespaceName),
            new XAttribute("autojoin", bookmark.AutoJoin ? "true" : "false"));

        if (!string.IsNullOrWhiteSpace(bookmark.Name))
        {
            conference.SetAttributeValue("name", bookmark.Name);
        }

        if (!string.IsNullOrWhiteSpace(bookmark.Nickname))
        {
            conference.Add(new XElement(XName.Get("nick", NamespaceName), bookmark.Nickname));
        }

        if (!string.IsNullOrWhiteSpace(bookmark.Password))
        {
            conference.Add(new XElement(XName.Get("password", NamespaceName), bookmark.Password));
        }

        if (bookmark.Extensions.Count > 0)
        {
            conference.Add(new XElement(
                XName.Get("extensions", NamespaceName),
                bookmark.Extensions.Select(extension => new XElement(extension))));
        }

        return conference;
    }

    public static XmppIq CreatePublishConferenceRequest(
        string id,
        XmppConferenceBookmark bookmark,
        bool addPublishOptions = true)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(bookmark);

        var pubsub = new XElement(
            XName.Get("pubsub", XmppPersonalEventing.PubSubNamespaceName),
            new XElement(
                XName.Get("publish", XmppPersonalEventing.PubSubNamespaceName),
                new XAttribute("node", NamespaceName),
                new XElement(
                    XName.Get("item", XmppPersonalEventing.PubSubNamespaceName),
                    new XAttribute("id", bookmark.Room.Bare),
                    CreateConferenceElement(bookmark))));

        if (addPublishOptions)
        {
            pubsub.Add(CreateBookmarkPublishOptions());
        }

        return new XmppIq(XmppIqType.Set, id, pubsub);
    }

    public static XmppIq CreateBookmarksRequest(
        string id,
        XmppAddress? owner = null,
        int? maxItems = null)
    {
        return XmppPersonalEventing.CreateItemsRequest(
            id,
            NamespaceName,
            owner,
            maxItems: maxItems);
    }

    public static XmppIq CreateRetractConferenceRequest(
        string id,
        XmppAddress room,
        bool notify = true)
    {
        ArgumentNullException.ThrowIfNull(room);
        return XmppPersonalEventing.CreateRetractRequest(
            id,
            NamespaceName,
            room.Bare,
            notify);
    }

    public static bool TryParseBookmarksResult(
        XmppIq iq,
        out IReadOnlyList<XmppConferenceBookmark>? bookmarks)
    {
        bookmarks = null;
        if (!XmppPersonalEventing.TryParseItemsResult(iq, out var items) || items is null)
        {
            return false;
        }

        if (!string.Equals(items.Node, NamespaceName, StringComparison.Ordinal))
        {
            return false;
        }

        bookmarks = items.Items
            .Select(ParseConferenceBookmark)
            .Where(bookmark => bookmark is not null)
            .Cast<XmppConferenceBookmark>()
            .ToArray();
        return true;
    }

    public static bool TryParseBookmarkNotification(
        XElement message,
        out XmppBookmarkNotification? notification)
    {
        notification = null;
        if (!XmppPersonalEventing.TryParseNotification(message, out var personalEvent)
            || personalEvent is null)
        {
            return false;
        }

        var node = personalEvent.ForNode(NamespaceName).SingleOrDefault();
        if (node is null)
        {
            return false;
        }

        notification = new XmppBookmarkNotification(
            From: personalEvent.From,
            To: personalEvent.To,
            Bookmarks: node.Items
                .Select(ParseConferenceBookmark)
                .Where(bookmark => bookmark is not null)
                .Cast<XmppConferenceBookmark>()
                .ToArray(),
            RetractedRooms: node.RetractedItemIds
                .Select(id => XmppAddress.TryParse(id, out var address) ? address : null)
                .Where(address => address is not null)
                .Cast<XmppAddress>()
                .ToArray(),
            IsPurge: node.IsPurge,
            IsDelete: node.IsDelete);
        return true;
    }

    public static XmppIq CreateLegacyBookmarksRequest(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return XmppPrivateXmlStorage.CreateGetRequest(
            id,
            XName.Get("storage", LegacyStorageNamespaceName));
    }

    public static XmppIq CreateLegacyBookmarksSetRequest(
        string id,
        IEnumerable<XmppConferenceBookmark> bookmarks)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(bookmarks);

        return XmppPrivateXmlStorage.CreateSetRequest(
            id,
            new XElement(
                XName.Get("storage", LegacyStorageNamespaceName),
                bookmarks.Select(CreateLegacyConferenceElement)));
    }

    public static bool TryParseLegacyBookmarksResult(
        XmppIq iq,
        out IReadOnlyList<XmppConferenceBookmark>? bookmarks)
    {
        bookmarks = null;
        if (!XmppPrivateXmlStorage.TryParseResult(
            iq,
            XName.Get("storage", LegacyStorageNamespaceName),
            out var storage)
            || storage is null)
        {
            return false;
        }

        bookmarks = storage
            .Elements(XName.Get("conference", LegacyStorageNamespaceName))
            .Select(ParseLegacyConferenceBookmark)
            .Where(bookmark => bookmark is not null)
            .Cast<XmppConferenceBookmark>()
            .ToArray();
        return true;
    }

    private static XElement CreateBookmarkPublishOptions()
    {
        return new XElement(
            XName.Get("publish-options", XmppPersonalEventing.PubSubNamespaceName),
            new XElement(
                XName.Get("x", XmppMessageArchive.DataFormsNamespace),
                new XAttribute("type", "submit"),
                CreateDataField("FORM_TYPE", PublishOptionsNamespaceName, "hidden"),
                CreateDataField("pubsub#persist_items", "true"),
                CreateDataField("pubsub#access_model", "whitelist")));
    }

    private static XElement CreateDataField(string name, string value, string? type = null)
    {
        var field = new XElement(
            XName.Get("field", XmppMessageArchive.DataFormsNamespace),
            new XAttribute("var", name),
            new XElement(XName.Get("value", XmppMessageArchive.DataFormsNamespace), value));
        if (!string.IsNullOrWhiteSpace(type))
        {
            field.SetAttributeValue("type", type);
        }

        return field;
    }

    private static XElement CreateLegacyConferenceElement(XmppConferenceBookmark bookmark)
    {
        var conference = new XElement(
            XName.Get("conference", LegacyStorageNamespaceName),
            new XAttribute("jid", bookmark.Room.Bare),
            new XAttribute("autojoin", bookmark.AutoJoin ? "true" : "false"));

        if (!string.IsNullOrWhiteSpace(bookmark.Name))
        {
            conference.SetAttributeValue("name", bookmark.Name);
        }

        if (!string.IsNullOrWhiteSpace(bookmark.Nickname))
        {
            conference.Add(new XElement(XName.Get("nick", LegacyStorageNamespaceName), bookmark.Nickname));
        }

        if (!string.IsNullOrWhiteSpace(bookmark.Password))
        {
            conference.Add(new XElement(XName.Get("password", LegacyStorageNamespaceName), bookmark.Password));
        }

        return conference;
    }

    private static XmppConferenceBookmark? ParseConferenceBookmark(XmppPersonalEventItem item)
    {
        var conference = item.Payloads.FirstOrDefault(payload => payload.Name == XName.Get("conference", NamespaceName));
        if (conference is null)
        {
            return null;
        }

        return ParseConferenceElement(conference, item.Id);
    }

    private static XmppConferenceBookmark? ParseConferenceElement(XElement conference, string? itemId)
    {
        var roomText = itemId;
        if (string.IsNullOrWhiteSpace(roomText))
        {
            roomText = (string?)conference.Attribute("jid");
        }

        if (!XmppAddress.TryParse(roomText, out var room) || room is null)
        {
            return null;
        }

        var extensions = conference
            .Element(XName.Get("extensions", NamespaceName))
            ?.Elements()
            .Select(extension => new XElement(extension))
            .ToArray()
            ?? [];

        return new XmppConferenceBookmark(
            Room: XmppAddress.Parse(room.Bare),
            Name: (string?)conference.Attribute("name"),
            AutoJoin: IsTrue((string?)conference.Attribute("autojoin")),
            Nickname: conference.Element(XName.Get("nick", NamespaceName))?.Value,
            Password: conference.Element(XName.Get("password", NamespaceName))?.Value,
            Extensions: extensions);
    }

    private static XmppConferenceBookmark? ParseLegacyConferenceBookmark(XElement conference)
    {
        if (!XmppAddress.TryParse((string?)conference.Attribute("jid"), out var room) || room is null)
        {
            return null;
        }

        return new XmppConferenceBookmark(
            Room: XmppAddress.Parse(room.Bare),
            Name: (string?)conference.Attribute("name"),
            AutoJoin: IsTrue((string?)conference.Attribute("autojoin")),
            Nickname: conference.Element(XName.Get("nick", LegacyStorageNamespaceName))?.Value,
            Password: conference.Element(XName.Get("password", LegacyStorageNamespaceName))?.Value);
    }

    private static bool IsTrue(string? value)
    {
        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, "1", StringComparison.Ordinal);
    }
}

public sealed record XmppConferenceBookmark(
    XmppAddress Room,
    string? Name = null,
    bool AutoJoin = false,
    string? Nickname = null,
    string? Password = null,
    IReadOnlyList<XElement>? Extensions = null)
{
    public IReadOnlyList<XElement> Extensions { get; init; } = Extensions ?? [];
}

public sealed record XmppBookmarkNotification(
    XmppAddress? From,
    XmppAddress? To,
    IReadOnlyList<XmppConferenceBookmark> Bookmarks,
    IReadOnlyList<XmppAddress> RetractedRooms,
    bool IsPurge,
    bool IsDelete);
