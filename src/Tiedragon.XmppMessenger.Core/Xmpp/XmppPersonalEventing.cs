using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPersonalEventing
{
    public const string PubSubNamespaceName = "http://jabber.org/protocol/pubsub";

    public const string PubSubEventNamespaceName = "http://jabber.org/protocol/pubsub#event";

    public const string PubSubOwnerNamespaceName = "http://jabber.org/protocol/pubsub#owner";

    public const string PublishFeature = PubSubNamespaceName + "#publish";

    public const string AutoCreateFeature = PubSubNamespaceName + "#auto-create";

    public const string AutoSubscribeFeature = PubSubNamespaceName + "#auto-subscribe";

    public const string RetrieveItemsFeature = PubSubNamespaceName + "#retrieve-items";

    public const string SubscribeFeature = PubSubNamespaceName + "#subscribe";

    public static bool SupportsPersonalEventing(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Identities.Any(identity =>
            string.Equals(identity.Category, "pubsub", StringComparison.Ordinal)
            && string.Equals(identity.Type, "pep", StringComparison.Ordinal));
    }

    public static bool SupportsPublishing(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return SupportsPersonalEventing(info) && info.Supports(PublishFeature);
    }

    public static string CreateNotificationFeature(string node)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        return node + "+notify";
    }

    public static XmppIq CreatePublishRequest(
        string id,
        string node,
        string? itemId,
        XElement payload,
        XmppAddress? to = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(payload);

        var item = new XElement(XName.Get("item", PubSubNamespaceName), new XElement(payload));
        if (!string.IsNullOrWhiteSpace(itemId))
        {
            item.SetAttributeValue("id", itemId);
        }

        var pubsub = new XElement(
            XName.Get("pubsub", PubSubNamespaceName),
            new XElement(
                XName.Get("publish", PubSubNamespaceName),
                new XAttribute("node", node),
                item));
        return new XmppIq(XmppIqType.Set, id, pubsub, To: to);
    }

    public static XmppIq CreateItemsRequest(
        string id,
        string node,
        XmppAddress? to = null,
        string? itemId = null,
        int? maxItems = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        var items = new XElement(
            XName.Get("items", PubSubNamespaceName),
            new XAttribute("node", node));
        if (!string.IsNullOrWhiteSpace(itemId))
        {
            items.Add(new XElement(
                XName.Get("item", PubSubNamespaceName),
                new XAttribute("id", itemId)));
        }

        if (maxItems is not null)
        {
            if (maxItems.Value <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxItems), "The item count must be greater than zero.");
            }

            items.SetAttributeValue("max_items", maxItems.Value);
        }

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("pubsub", PubSubNamespaceName), items),
            To: to);
    }

    public static XmppIq CreateRetractRequest(
        string id,
        string node,
        string itemId,
        bool notify = true,
        XmppAddress? to = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentException.ThrowIfNullOrWhiteSpace(itemId);

        var retract = new XElement(
            XName.Get("retract", PubSubNamespaceName),
            new XAttribute("node", node),
            new XAttribute("notify", notify ? "true" : "false"),
            new XElement(
                XName.Get("item", PubSubNamespaceName),
                new XAttribute("id", itemId)));

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("pubsub", PubSubNamespaceName), retract),
            To: to);
    }

    public static XmppIq CreateDeleteNodeRequest(string id, string node, XmppAddress? to = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("pubsub", PubSubOwnerNamespaceName),
                new XElement(
                    XName.Get("delete", PubSubOwnerNamespaceName),
                    new XAttribute("node", node))),
            To: to);
    }

    public static bool TryParseItemsResult(XmppIq iq, out XmppPersonalEventNodeItems? nodeItems)
    {
        nodeItems = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", PubSubNamespaceName))
        {
            return false;
        }

        var items = iq.Payload.Element(XName.Get("items", PubSubNamespaceName));
        return TryParseNodeItems(items, PubSubNamespaceName, out nodeItems);
    }

    public static bool TryParseNotification(
        XElement message,
        out XmppPersonalEventNotification? notification)
    {
        notification = null;
        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var eventElement = message.Element(XName.Get("event", PubSubEventNamespaceName));
        if (eventElement is null)
        {
            return false;
        }

        XmppAddress.TryParse((string?)message.Attribute("from"), out var from);
        XmppAddress.TryParse((string?)message.Attribute("to"), out var to);
        XmppXmlValue.TryParseMessageType((string?)message.Attribute("type"), out var type);

        var nodes = eventElement
            .Elements()
            .Select(ParseEventChild)
            .Where(nodeEvent => nodeEvent is not null)
            .Cast<XmppPersonalEventNodeEvent>()
            .ToArray();

        if (nodes.Length == 0)
        {
            return false;
        }

        notification = new XmppPersonalEventNotification(
            From: from,
            To: to,
            Type: type,
            Nodes: nodes);
        return true;
    }

    private static XmppPersonalEventNodeEvent? ParseEventChild(XElement element)
    {
        if (element.Name == XName.Get("items", PubSubEventNamespaceName)
            && TryParseNodeItems(element, PubSubEventNamespaceName, out var items)
            && items is not null)
        {
            return new XmppPersonalEventNodeEvent(
                Node: items.Node,
                Items: items.Items,
                RetractedItemIds: element
                    .Elements(XName.Get("retract", PubSubEventNamespaceName))
                    .Select(retract => (string?)retract.Attribute("id"))
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Cast<string>()
                    .ToArray(),
                IsPurge: false,
                IsDelete: false);
        }

        if (element.Name == XName.Get("purge", PubSubEventNamespaceName))
        {
            var node = (string?)element.Attribute("node");
            return string.IsNullOrWhiteSpace(node)
                ? null
                : new XmppPersonalEventNodeEvent(node, [], [], IsPurge: true, IsDelete: false);
        }

        if (element.Name == XName.Get("delete", PubSubEventNamespaceName))
        {
            var node = (string?)element.Attribute("node");
            return string.IsNullOrWhiteSpace(node)
                ? null
                : new XmppPersonalEventNodeEvent(node, [], [], IsPurge: false, IsDelete: true);
        }

        return null;
    }

    private static bool TryParseNodeItems(
        XElement? items,
        string itemNamespace,
        out XmppPersonalEventNodeItems? nodeItems)
    {
        nodeItems = null;
        if (items is null)
        {
            return false;
        }

        var node = (string?)items.Attribute("node");
        if (string.IsNullOrWhiteSpace(node))
        {
            return false;
        }

        nodeItems = new XmppPersonalEventNodeItems(
            Node: node,
            Items: items
                .Elements(XName.Get("item", itemNamespace))
                .Select(item => new XmppPersonalEventItem(
                    Id: (string?)item.Attribute("id"),
                    Payloads: item.Elements().Select(payload => new XElement(payload)).ToArray()))
                .ToArray());
        return true;
    }
}

public sealed record XmppPersonalEventNotification(
    XmppAddress? From,
    XmppAddress? To,
    XmppMessageType Type,
    IReadOnlyList<XmppPersonalEventNodeEvent> Nodes)
{
    public IEnumerable<XmppPersonalEventNodeEvent> ForNode(string node)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        return Nodes.Where(entry => string.Equals(entry.Node, node, StringComparison.Ordinal));
    }
}

public sealed record XmppPersonalEventNodeEvent(
    string Node,
    IReadOnlyList<XmppPersonalEventItem> Items,
    IReadOnlyList<string> RetractedItemIds,
    bool IsPurge,
    bool IsDelete);

public sealed record XmppPersonalEventNodeItems(
    string Node,
    IReadOnlyList<XmppPersonalEventItem> Items);

public sealed record XmppPersonalEventItem(
    string? Id,
    IReadOnlyList<XElement> Payloads);
