using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPubSubAnnouncements
{
    public const string DefaultNode = "urn:tiedragon:teletyptel:announcements";

    public const string AtomNamespaceName = "http://www.w3.org/2005/Atom";

    public const string PriorityScheme = "urn:tiedragon:teletyptel:announcement-priority";

    public static XmppIq CreatePublishRequest(
        string id,
        XmppAnnouncement announcement,
        string node = DefaultNode,
        XmppAddress? service = null)
    {
        ArgumentNullException.ThrowIfNull(announcement);
        return XmppPersonalEventing.CreatePublishRequest(
            id,
            node,
            announcement.Id,
            CreateAtomEntry(announcement),
            service);
    }

    public static XmppIq CreateItemsRequest(
        string id,
        XmppAddress? service,
        string node = DefaultNode,
        int? maxItems = null)
    {
        return XmppPersonalEventing.CreateItemsRequest(id, node, service, maxItems: maxItems);
    }

    public static XmppIq CreateSubscribeRequest(
        string id,
        XmppAddress jid,
        XmppAddress service,
        string node = DefaultNode)
    {
        return XmppPubSub.CreateSubscribeRequest(id, node, jid, service);
    }

    public static bool TryParseItems(
        XmppIq iq,
        out IReadOnlyList<XmppAnnouncement> announcements,
        string node = DefaultNode)
    {
        announcements = [];
        if (!XmppPersonalEventing.TryParseItemsResult(iq, out var items)
            || items is null
            || !string.Equals(items.Node, node, StringComparison.Ordinal))
        {
            return false;
        }

        announcements = items.Items
            .SelectMany(item => item.Payloads)
            .Select(payload => TryParseAtomEntry(payload, out var announcement) ? announcement : null)
            .Where(announcement => announcement is not null)
            .Cast<XmppAnnouncement>()
            .ToArray();
        return true;
    }

    public static bool TryParseNotification(
        XElement message,
        out IReadOnlyList<XmppAnnouncement> announcements,
        string node = DefaultNode)
    {
        announcements = [];
        if (!XmppPersonalEventing.TryParseNotification(message, out var notification)
            || notification is null)
        {
            return false;
        }

        announcements = notification
            .ForNode(node)
            .SelectMany(node => node.Items)
            .SelectMany(item => item.Payloads)
            .Select(payload => TryParseAtomEntry(payload, out var announcement) ? announcement : null)
            .Where(announcement => announcement is not null)
            .Cast<XmppAnnouncement>()
            .ToArray();
        return announcements.Count > 0;
    }

    public static XElement CreateAtomEntry(XmppAnnouncement announcement)
    {
        ArgumentNullException.ThrowIfNull(announcement);
        ArgumentException.ThrowIfNullOrWhiteSpace(announcement.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(announcement.Title);
        ArgumentException.ThrowIfNullOrWhiteSpace(announcement.Summary);

        var atom = XNamespace.Get(AtomNamespaceName);
        var entry = new XElement(
            atom + "entry",
            new XElement(atom + "id", announcement.Id),
            new XElement(atom + "title", announcement.Title),
            new XElement(atom + "summary", announcement.Summary));

        if (!string.IsNullOrWhiteSpace(announcement.Language))
        {
            entry.SetAttributeValue(XNamespace.Xml + "lang", announcement.Language);
        }

        if (announcement.Published is not null)
        {
            entry.Add(new XElement(atom + "published", FormatDate(announcement.Published.Value)));
        }

        entry.Add(new XElement(atom + "updated", FormatDate(announcement.Updated ?? announcement.Published ?? DateTimeOffset.UtcNow)));

        if (announcement.Link is not null)
        {
            entry.Add(new XElement(atom + "link", new XAttribute("href", announcement.Link.AbsoluteUri)));
        }

        if (!string.IsNullOrWhiteSpace(announcement.Category))
        {
            entry.Add(new XElement(atom + "category", new XAttribute("term", announcement.Category)));
        }

        if (!string.IsNullOrWhiteSpace(announcement.Priority))
        {
            entry.Add(new XElement(
                atom + "category",
                new XAttribute("scheme", PriorityScheme),
                new XAttribute("term", announcement.Priority)));
        }

        return entry;
    }

    public static bool TryParseAtomEntry(XElement element, out XmppAnnouncement? announcement)
    {
        announcement = null;
        var atom = XNamespace.Get(AtomNamespaceName);
        if (element.Name != atom + "entry")
        {
            return false;
        }

        var id = element.Element(atom + "id")?.Value;
        var title = element.Element(atom + "title")?.Value;
        var summary = element.Element(atom + "summary")?.Value;
        if (string.IsNullOrWhiteSpace(id)
            || string.IsNullOrWhiteSpace(title)
            || string.IsNullOrWhiteSpace(summary))
        {
            return false;
        }

        Uri.TryCreate((string?)element.Element(atom + "link")?.Attribute("href"), UriKind.Absolute, out var link);
        DateTimeOffset.TryParse(
            element.Element(atom + "published")?.Value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var published);
        DateTimeOffset.TryParse(
            element.Element(atom + "updated")?.Value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var updated);

        announcement = new XmppAnnouncement(
            Id: id,
            Title: title,
            Summary: summary,
            Link: link,
            Language: (string?)element.Attribute(XNamespace.Xml + "lang"),
            Category: element.Elements(atom + "category")
                .FirstOrDefault(category => category.Attribute("scheme") is null)
                ?.Attribute("term")
                ?.Value,
            Priority: element.Elements(atom + "category")
                .FirstOrDefault(category => string.Equals(
                    (string?)category.Attribute("scheme"),
                    PriorityScheme,
                    StringComparison.Ordinal))
                ?.Attribute("term")
                ?.Value,
            Published: published == default ? null : published,
            Updated: updated == default ? null : updated);
        return true;
    }

    private static string FormatDate(DateTimeOffset value)
    {
        return value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    }
}

public sealed record XmppAnnouncement(
    string Id,
    string Title,
    string Summary,
    Uri? Link = null,
    string? Language = null,
    string? Category = null,
    string? Priority = null,
    DateTimeOffset? Published = null,
    DateTimeOffset? Updated = null);
