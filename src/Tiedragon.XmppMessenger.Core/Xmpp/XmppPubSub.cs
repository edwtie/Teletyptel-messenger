using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPubSub
{
    public const string NamespaceName = XmppPersonalEventing.PubSubNamespaceName;

    public const string EventNamespaceName = XmppPersonalEventing.PubSubEventNamespaceName;

    public const string OwnerNamespaceName = XmppPersonalEventing.PubSubOwnerNamespaceName;

    public const string NodeConfigNamespaceName = NamespaceName + "#node_config";

    public const string SubscribeOptionsNamespaceName = NamespaceName + "#subscribe_options";

    public const string PublishFeature = XmppPersonalEventing.PublishFeature;

    public const string SubscribeFeature = XmppPersonalEventing.SubscribeFeature;

    public const string RetrieveItemsFeature = XmppPersonalEventing.RetrieveItemsFeature;

    public const string CreateNodesFeature = NamespaceName + "#create-nodes";

    public const string ConfigureNodesFeature = NamespaceName + "#config-node";

    public const string DeleteNodesFeature = NamespaceName + "#delete-nodes";

    public const string PurgeNodesFeature = NamespaceName + "#purge-nodes";

    public const string RetrieveSubscriptionsFeature = NamespaceName + "#retrieve-subscriptions";

    public const string RetrieveAffiliationsFeature = NamespaceName + "#retrieve-affiliations";

    public static bool SupportsPubSub(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Identities.Any(identity =>
            string.Equals(identity.Category, "pubsub", StringComparison.Ordinal));
    }

    public static XmppIq CreatePublishRequest(
        string id,
        string node,
        string? itemId,
        XElement payload,
        XmppAddress? service = null)
    {
        return XmppPersonalEventing.CreatePublishRequest(id, node, itemId, payload, service);
    }

    public static XmppIq CreateItemsRequest(
        string id,
        string node,
        XmppAddress? service = null,
        string? itemId = null,
        int? maxItems = null)
    {
        return XmppPersonalEventing.CreateItemsRequest(id, node, service, itemId, maxItems);
    }

    public static XmppIq CreateRetractRequest(
        string id,
        string node,
        string itemId,
        bool notify = true,
        XmppAddress? service = null)
    {
        return XmppPersonalEventing.CreateRetractRequest(id, node, itemId, notify, service);
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

    public static XmppIq CreateCreateNodeRequest(
        string id,
        string node,
        XmppAddress? service = null,
        XElement? configureForm = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        var children = new List<object>
        {
            new XElement(
                XName.Get("create", NamespaceName),
                new XAttribute("node", node))
        };
        if (configureForm is not null)
        {
            children.Add(new XElement(
                XName.Get("configure", NamespaceName),
                new XElement(configureForm)));
        }

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("pubsub", NamespaceName), children),
            To: service);
    }

    public static XmppIq CreateDeleteNodeRequest(string id, string node, XmppAddress? service = null)
    {
        return XmppPersonalEventing.CreateDeleteNodeRequest(id, node, service);
    }

    public static XmppIq CreatePurgeNodeRequest(string id, string node, XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("pubsub", OwnerNamespaceName),
                new XElement(
                    XName.Get("purge", OwnerNamespaceName),
                    new XAttribute("node", node))),
            To: service);
    }

    public static XmppIq CreateConfigurationRequest(string id, string node, XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(
                XName.Get("pubsub", OwnerNamespaceName),
                new XElement(
                    XName.Get("configure", OwnerNamespaceName),
                    new XAttribute("node", node))),
            To: service);
    }

    public static XmppIq CreateConfigureNodeRequest(
        string id,
        string node,
        XElement configureForm,
        XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(configureForm);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("pubsub", OwnerNamespaceName),
                new XElement(
                    XName.Get("configure", OwnerNamespaceName),
                    new XAttribute("node", node),
                    new XElement(configureForm))),
            To: service);
    }

    public static XmppIq CreateSubscriptionsRequest(string id, string? node = null, XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);

        var subscriptions = new XElement(XName.Get("subscriptions", NamespaceName));
        if (!string.IsNullOrWhiteSpace(node))
        {
            subscriptions.SetAttributeValue("node", node);
        }

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("pubsub", NamespaceName), subscriptions),
            To: service);
    }

    public static XmppIq CreateAffiliationsRequest(string id, string? node = null, XmppAddress? service = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);

        var affiliations = new XElement(XName.Get("affiliations", NamespaceName));
        if (!string.IsNullOrWhiteSpace(node))
        {
            affiliations.SetAttributeValue("node", node);
        }

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("pubsub", NamespaceName), affiliations),
            To: service);
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

        return TryParseSubscriptionElement(element, out subscription) && subscription is not null;
    }

    public static bool TryParseSubscriptionsResult(
        XmppIq iq,
        out IReadOnlyList<XmppPubSubSubscription> subscriptions)
    {
        subscriptions = Array.Empty<XmppPubSubSubscription>();
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", NamespaceName))
        {
            return false;
        }

        var element = iq.Payload.Element(XName.Get("subscriptions", NamespaceName));
        if (element is null)
        {
            return false;
        }

        var parsed = element
            .Elements(XName.Get("subscription", NamespaceName))
            .Select(child => TryParseSubscriptionElement(child, out var subscription) ? subscription : null)
            .Where(subscription => subscription is not null)
            .Cast<XmppPubSubSubscription>()
            .ToArray();

        subscriptions = parsed;
        return true;
    }

    public static bool TryParseConfigurationResult(XmppIq iq, out XmppDataForm? form)
    {
        form = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", OwnerNamespaceName))
        {
            return false;
        }

        var configure = iq.Payload.Element(XName.Get("configure", OwnerNamespaceName));
        var formElement = configure?.Element(XName.Get("x", XmppServiceDiscovery.DataFormNamespace));
        if (formElement is null)
        {
            return false;
        }

        form = XmppServiceDiscovery.ParseDataForm(formElement);
        return true;
    }

    public static bool TryParseAffiliationsResult(
        XmppIq iq,
        out IReadOnlyList<XmppPubSubAffiliation> affiliations)
    {
        affiliations = Array.Empty<XmppPubSubAffiliation>();
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", NamespaceName))
        {
            return false;
        }

        var element = iq.Payload.Element(XName.Get("affiliations", NamespaceName));
        if (element is null)
        {
            return false;
        }

        var parsed = element
            .Elements(XName.Get("affiliation", NamespaceName))
            .Select(ParseAffiliationElement)
            .Where(affiliation => affiliation is not null)
            .Cast<XmppPubSubAffiliation>()
            .ToArray();

        affiliations = parsed;
        return true;
    }

    private static bool TryParseSubscriptionElement(
        XElement element,
        out XmppPubSubSubscription? subscription)
    {
        subscription = null;
        var state = (string?)element.Attribute("subscription");
        if (string.IsNullOrWhiteSpace(state)
            || !XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid)
            || jid is null)
        {
            return false;
        }

        subscription = new XmppPubSubSubscription(
            Node: (string?)element.Attribute("node"),
            Jid: jid,
            State: state,
            SubscriptionId: (string?)element.Attribute("subid"),
            Expiry: (string?)element.Attribute("expiry"));
        return true;
    }

    private static XmppPubSubAffiliation? ParseAffiliationElement(XElement element)
    {
        var state = (string?)element.Attribute("affiliation");
        if (string.IsNullOrWhiteSpace(state))
        {
            return null;
        }

        XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid);
        return new XmppPubSubAffiliation(
            Node: (string?)element.Attribute("node"),
            Jid: jid,
            State: state);
    }
}

public sealed record XmppPubSubSubscription(
    string? Node,
    XmppAddress Jid,
    string State,
    string? SubscriptionId,
    string? Expiry = null);

public sealed record XmppPubSubAffiliation(
    string? Node,
    XmppAddress? Jid,
    string State);
