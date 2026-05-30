using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPersistentPrivateData
{
    public const string PublishOptionsNamespaceName = "http://jabber.org/protocol/pubsub#publish-options";

    public const string PublishOptionsFeature = XmppPersonalEventing.PubSubNamespaceName + "#publish-options";

    public const string PersistItemsField = "pubsub#persist_items";

    public const string AccessModelField = "pubsub#access_model";

    public const string PrivateAccessModel = "whitelist";

    public static bool SupportsPersistentPrivateData(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return XmppPersonalEventing.SupportsPersonalEventing(info)
            && info.Supports(PublishOptionsFeature);
    }

    public static string CreateNotificationFeature(string node)
    {
        return XmppPersonalEventing.CreateNotificationFeature(node);
    }

    public static XmppIq CreateStoreRequest(
        string id,
        string node,
        XElement payload,
        string? itemId = null,
        XmppAddress? to = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(payload);
        ValidatePayloadName(payload.Name);

        var item = new XElement(
            XName.Get("item", XmppPersonalEventing.PubSubNamespaceName),
            new XElement(payload));
        if (!string.IsNullOrWhiteSpace(itemId))
        {
            item.SetAttributeValue("id", itemId);
        }

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("pubsub", XmppPersonalEventing.PubSubNamespaceName),
                new XElement(
                    XName.Get("publish", XmppPersonalEventing.PubSubNamespaceName),
                    new XAttribute("node", node),
                    item),
                CreatePrivatePublishOptions()),
            To: to);
    }

    public static XmppIq CreateItemsRequest(
        string id,
        string node,
        XmppAddress? owner = null,
        string? itemId = null,
        int? maxItems = null)
    {
        return XmppPersonalEventing.CreateItemsRequest(id, node, owner, itemId, maxItems);
    }

    public static XElement CreatePrivatePublishOptions()
    {
        return new XElement(
            XName.Get("publish-options", XmppPersonalEventing.PubSubNamespaceName),
            new XElement(
                XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
                new XAttribute("type", "submit"),
                CreateDataField("FORM_TYPE", PublishOptionsNamespaceName, "hidden"),
                CreateDataField(PersistItemsField, "true"),
                CreateDataField(AccessModelField, PrivateAccessModel)));
    }

    public static bool TryParseItemsResult(
        XmppIq iq,
        string node,
        out IReadOnlyList<XmppPersistentPrivateDataItem>? items)
    {
        items = null;
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        if (!XmppPersonalEventing.TryParseItemsResult(iq, out var nodeItems)
            || nodeItems is null
            || !string.Equals(nodeItems.Node, node, StringComparison.Ordinal))
        {
            return false;
        }

        items = nodeItems.Items.Select(MapItem).ToArray();
        return true;
    }

    public static bool TryParseNotification(
        XElement message,
        XmppAddress account,
        string node,
        out XmppPersistentPrivateDataNotification? notification)
    {
        notification = null;
        ArgumentNullException.ThrowIfNull(account);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        if (!XmppPersonalEventing.TryParseNotification(message, out var personalEvent)
            || personalEvent is null
            || !IsTrustedPrivateDataPublisher(personalEvent.From, account))
        {
            return false;
        }

        var nodeEvent = personalEvent.ForNode(node).SingleOrDefault();
        if (nodeEvent is null)
        {
            return false;
        }

        notification = new XmppPersistentPrivateDataNotification(
            From: personalEvent.From,
            To: personalEvent.To,
            Node: nodeEvent.Node,
            Items: nodeEvent.Items.Select(MapItem).ToArray(),
            RetractedItemIds: nodeEvent.RetractedItemIds,
            IsPurge: nodeEvent.IsPurge,
            IsDelete: nodeEvent.IsDelete);
        return true;
    }

    public static bool IsTrustedPrivateDataPublisher(XmppAddress? from, XmppAddress account)
    {
        ArgumentNullException.ThrowIfNull(account);
        return from is null || string.Equals(from.Bare, account.Bare, StringComparison.Ordinal);
    }

    private static XmppPersistentPrivateDataItem MapItem(XmppPersonalEventItem item)
    {
        return new XmppPersistentPrivateDataItem(
            item.Id,
            item.Payloads.Select(payload => new XElement(payload)).ToArray());
    }

    private static XElement CreateDataField(string name, string value, string? type = null)
    {
        var field = new XElement(
            XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("var", name),
            new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), value));
        if (!string.IsNullOrWhiteSpace(type))
        {
            field.SetAttributeValue("type", type);
        }

        return field;
    }

    private static void ValidatePayloadName(XName payloadName)
    {
        ArgumentNullException.ThrowIfNull(payloadName);
        if (string.IsNullOrWhiteSpace(payloadName.NamespaceName))
        {
            throw new ArgumentException("Persistent private data payloads must have a namespace.", nameof(payloadName));
        }
    }
}

public sealed record XmppPersistentPrivateDataItem(
    string? Id,
    IReadOnlyList<XElement> Payloads);

public sealed record XmppPersistentPrivateDataNotification(
    XmppAddress? From,
    XmppAddress? To,
    string Node,
    IReadOnlyList<XmppPersistentPrivateDataItem> Items,
    IReadOnlyList<string> RetractedItemIds,
    bool IsPurge,
    bool IsDelete);
