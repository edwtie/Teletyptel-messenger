using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPubSub
{
    public const string NamespaceName = XmppPersonalEventing.PubSubNamespaceName;

    public const string EventNamespaceName = XmppPersonalEventing.PubSubEventNamespaceName;

    public const string OwnerNamespaceName = XmppPersonalEventing.PubSubOwnerNamespaceName;

    public const string PublishFeature = XmppPersonalEventing.PublishFeature;

    public const string SubscribeFeature = XmppPersonalEventing.SubscribeFeature;

    public const string RetrieveItemsFeature = XmppPersonalEventing.RetrieveItemsFeature;

    public const string CreateNodesFeature = NamespaceName + "#create-nodes";

    public const string DeleteNodesFeature = NamespaceName + "#delete-nodes";

    public static bool SupportsPubSub(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Identities.Any(identity =>
            string.Equals(identity.Category, "pubsub", StringComparison.Ordinal));
    }

    public static XmppIq CreateSubscribeRequest(
        string id,
        string node,
        XmppAddress jid,
        XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(jid);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("pubsub", NamespaceName),
                new XElement(
                    XName.Get("subscribe", NamespaceName),
                    new XAttribute("node", node),
                    new XAttribute("jid", jid.Full))),
            To: service);
    }

    public static XmppIq CreateUnsubscribeRequest(
        string id,
        string node,
        XmppAddress jid,
        string? subscriptionId = null,
        XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(jid);

        var unsubscribe = new XElement(
            XName.Get("unsubscribe", NamespaceName),
            new XAttribute("node", node),
            new XAttribute("jid", jid.Full));
        if (!string.IsNullOrWhiteSpace(subscriptionId))
        {
            unsubscribe.SetAttributeValue("subid", subscriptionId);
        }

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("pubsub", NamespaceName), unsubscribe),
            To: service);
    }

    public static XmppIq CreateCreateNodeRequest(string id, string node, XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("pubsub", NamespaceName),
                new XElement(
                    XName.Get("create", NamespaceName),
                    new XAttribute("node", node))),
            To: service);
    }

    public static XmppIq CreateDeleteNodeRequest(string id, string node, XmppAddress? service = null)
    {
        return XmppPersonalEventing.CreateDeleteNodeRequest(id, node, service);
    }

    public static bool TryParseSubscriptionResult(XmppIq iq, out XmppPubSubSubscription? subscription)
    {
        subscription = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", NamespaceName))
        {
            return false;
        }

        var element = iq.Payload.Element(XName.Get("subscription", NamespaceName));
        if (element is null)
        {
            return false;
        }

        var node = (string?)element.Attribute("node");
        var state = (string?)element.Attribute("subscription");
        if (string.IsNullOrWhiteSpace(node)
            || string.IsNullOrWhiteSpace(state)
            || !XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid)
            || jid is null)
        {
            return false;
        }

        subscription = new XmppPubSubSubscription(
            Node: node,
            Jid: jid,
            State: state,
            SubscriptionId: (string?)element.Attribute("subid"));
        return true;
    }
}

public sealed record XmppPubSubSubscription(
    string Node,
    XmppAddress Jid,
    string State,
    string? SubscriptionId);
