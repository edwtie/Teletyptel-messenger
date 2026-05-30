using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppBlockingAction
{
    Block,
    Unblock
}

public sealed record XmppBlockingPush(
    XmppBlockingAction Action,
    IReadOnlyList<XmppAddress> Jids,
    bool UnblocksAll = false);

public static class XmppBlockingCommand
{
    public const string NamespaceName = "urn:xmpp:blocking";

    public static XmppIq CreateBlockListRequest(string id)
    {
        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("blocklist", NamespaceName)));
    }

    public static XmppIq CreateBlockRequest(string id, IEnumerable<XmppAddress> jids)
    {
        ArgumentNullException.ThrowIfNull(jids);
        var items = CreateItems(jids).ToArray();
        if (items.Length == 0)
        {
            throw new ArgumentException("At least one JID is required when blocking contacts.", nameof(jids));
        }

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("block", NamespaceName), items));
    }

    public static XmppIq CreateBlockRequest(string id, XmppAddress jid)
    {
        ArgumentNullException.ThrowIfNull(jid);
        return CreateBlockRequest(id, [jid]);
    }

    public static XmppIq CreateUnblockRequest(string id, IEnumerable<XmppAddress> jids)
    {
        ArgumentNullException.ThrowIfNull(jids);
        var items = CreateItems(jids).ToArray();
        if (items.Length == 0)
        {
            throw new ArgumentException("At least one JID is required when unblocking contacts. Use CreateUnblockAllRequest for all contacts.", nameof(jids));
        }

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("unblock", NamespaceName), items));
    }

    public static XmppIq CreateUnblockRequest(string id, XmppAddress jid)
    {
        ArgumentNullException.ThrowIfNull(jid);
        return CreateUnblockRequest(id, [jid]);
    }

    public static XmppIq CreateUnblockAllRequest(string id)
    {
        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(XName.Get("unblock", NamespaceName)));
    }

    public static XmppIq CreatePushAcknowledgement(string id, XmppAddress? to = null)
    {
        return new XmppIq(XmppIqType.Result, id, To: to);
    }

    public static bool TryParseBlockListResult(XmppIq iq, out IReadOnlyList<XmppAddress> blocked)
    {
        ArgumentNullException.ThrowIfNull(iq);
        blocked = [];

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("blocklist", NamespaceName))
        {
            return false;
        }

        blocked = ParseJidItems(iq.Payload).ToArray();
        return true;
    }

    public static bool TryParsePush(XmppIq iq, out XmppBlockingPush? push)
    {
        ArgumentNullException.ThrowIfNull(iq);
        push = null;

        if (iq.Type != XmppIqType.Set || iq.Payload is null)
        {
            return false;
        }

        var action = iq.Payload.Name == XName.Get("block", NamespaceName)
            ? XmppBlockingAction.Block
            : iq.Payload.Name == XName.Get("unblock", NamespaceName)
                ? XmppBlockingAction.Unblock
                : (XmppBlockingAction?)null;
        if (action is null)
        {
            return false;
        }

        var jids = ParseJidItems(iq.Payload).ToArray();
        if (action == XmppBlockingAction.Block && jids.Length == 0)
        {
            return false;
        }

        push = new XmppBlockingPush(
            action.Value,
            jids,
            UnblocksAll: action == XmppBlockingAction.Unblock && jids.Length == 0);
        return true;
    }

    public static bool SupportsBlocking(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    private static IEnumerable<XElement> CreateItems(IEnumerable<XmppAddress> jids)
    {
        foreach (var jid in jids)
        {
            ArgumentNullException.ThrowIfNull(jid);
            yield return new XElement(
                XName.Get("item", NamespaceName),
                new XAttribute("jid", jid.Full));
        }
    }

    private static IEnumerable<XmppAddress> ParseJidItems(XElement parent)
    {
        return parent.Elements(XName.Get("item", NamespaceName))
            .Select(element => (string?)element.Attribute("jid"))
            .Select(value => XmppAddress.TryParse(value, out var jid) ? jid : null)
            .Where(jid => jid is not null)
            .Cast<XmppAddress>();
    }
}
