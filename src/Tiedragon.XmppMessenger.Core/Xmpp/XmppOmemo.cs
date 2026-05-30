using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppOmemo
{
    public const string NamespaceName = "urn:xmpp:omemo:2";

    public const string DeviceListNode = NamespaceName + ":devices";

    public const string BundlesNode = NamespaceName + ":bundles";

    [Obsolete("OMEMO v2 stores bundles on urn:xmpp:omemo:2:bundles with item id = device id.")]
    public const string BundleNodePrefix = NamespaceName + ":bundles:";

    public const string PubSubNamespaceName = "http://jabber.org/protocol/pubsub";

    public static string BundleNode(uint deviceId)
    {
        _ = deviceId;
        return BundlesNode;
    }

    public static XmppIq CreateDeviceListRequest(string id, XmppAddress contact)
    {
        ArgumentNullException.ThrowIfNull(contact);
        return CreatePubSubItemsRequest(id, contact, DeviceListNode);
    }

    public static XmppIq CreateBundleRequest(string id, XmppAddress contact, uint deviceId)
    {
        ArgumentNullException.ThrowIfNull(contact);
        return CreatePubSubItemsRequest(id, contact, BundlesNode, deviceId.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    public static XmppIq CreateDeviceListPublish(string id, IEnumerable<uint> deviceIds)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(deviceIds);

        var devices = new XElement(XName.Get("devices", NamespaceName),
            deviceIds
                .Distinct()
                .Order()
                .Select(deviceId => new XElement(
                    XName.Get("device", NamespaceName),
                    new XAttribute("id", deviceId))));

        return CreatePubSubPublishRequest(id, DeviceListNode, "current", devices);
    }

    public static XmppIq CreateBundlePublish(string id, uint deviceId, XmppOmemoBundle bundle)
    {
        ArgumentNullException.ThrowIfNull(bundle);
        return CreatePubSubPublishRequest(
            id,
            BundlesNode,
            deviceId.ToString(System.Globalization.CultureInfo.InvariantCulture),
            bundle.ToXml());
    }

    public static XElement CreateEncryptedMessage(
        XmppAddress to,
        uint senderDeviceId,
        IEnumerable<XmppOmemoKeyTransport> keys,
        string payload,
        string? id = null)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentNullException.ThrowIfNull(keys);
        ArgumentException.ThrowIfNullOrWhiteSpace(payload);

        var encrypted = new XElement(XName.Get("encrypted", NamespaceName),
            new XElement(XName.Get("header", NamespaceName),
                new XAttribute("sid", senderDeviceId),
                keys.GroupBy(
                    key => key.RecipientJid?.Bare ?? to.Bare,
                    StringComparer.Ordinal)
                    .OrderBy(group => group.Key, StringComparer.Ordinal)
                    .Select(group => new XElement(
                        XName.Get("keys", NamespaceName),
                        new XAttribute("jid", group.Key),
                        group.OrderBy(key => key.RecipientDeviceId)
                            .Select(key => new XElement(
                                XName.Get("key", NamespaceName),
                                new XAttribute("rid", key.RecipientDeviceId),
                                key.IsPreKey ? new XAttribute("prekey", "true") : null,
                                key.CipherText))))),
            new XElement(XName.Get("payload", NamespaceName), payload));

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", "chat"),
            encrypted);
        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        return message;
    }

    public static bool TryParseEncryptedMessage(XElement message, out XmppOmemoEncryptedMessage? encryptedMessage)
    {
        encryptedMessage = null;

        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var encrypted = message.Element(XName.Get("encrypted", NamespaceName));
        var header = encrypted?.Element(XName.Get("header", NamespaceName));
        if (encrypted is null
            || header is null
            || !uint.TryParse((string?)header.Attribute("sid"), out var senderDeviceId))
        {
            return false;
        }

        var keys = ParseKeyTransports(header, (string?)message.Attribute("to"));

        XmppAddress.TryParse((string?)message.Attribute("from"), out var from);
        XmppAddress.TryParse((string?)message.Attribute("to"), out var to);
        encryptedMessage = new XmppOmemoEncryptedMessage(
            SenderDeviceId: senderDeviceId,
            Keys: keys,
            Payload: encrypted.Element(XName.Get("payload", NamespaceName))?.Value,
            From: from,
            To: to,
            Id: (string?)message.Attribute("id"));
        return true;
    }

    public static bool TryParseDeviceList(XmppIq iq, out IReadOnlyList<uint> deviceIds)
    {
        deviceIds = Array.Empty<uint>();

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", PubSubNamespaceName))
        {
            return false;
        }

        var ids = iq.Payload
            .Descendants(XName.Get("device", NamespaceName))
            .Select(element => uint.TryParse((string?)element.Attribute("id"), out var id) ? id : (uint?)null)
            .Where(id => id is not null)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();

        deviceIds = ids;
        return ids.Length > 0;
    }

    public static bool TryParseBundle(XmppIq iq, out XmppOmemoBundle? bundle)
    {
        bundle = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", PubSubNamespaceName))
        {
            return false;
        }

        var bundleElement = iq.Payload.Descendants(XName.Get("bundle", NamespaceName)).FirstOrDefault();
        return XmppOmemoBundle.TryParse(bundleElement, out bundle);
    }

    public static bool IsValidBase64(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            _ = Convert.FromBase64String(value);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static IReadOnlyList<XmppOmemoKeyTransport> ParseKeyTransports(XElement header, string? fallbackJid)
    {
        var parsedKeys = new List<XmppOmemoKeyTransport>();
        foreach (var keysElement in header.Elements(XName.Get("keys", NamespaceName)))
        {
            XmppAddress.TryParse((string?)keysElement.Attribute("jid"), out var recipientJid);
            parsedKeys.AddRange(keysElement.Elements(XName.Get("key", NamespaceName))
                .Select(element => ParseKeyTransport(element, recipientJid))
                .Where(key => key is not null)
                .Cast<XmppOmemoKeyTransport>());
        }

        XmppAddress.TryParse(fallbackJid, out var fallbackAddress);
        parsedKeys.AddRange(header.Elements(XName.Get("key", NamespaceName))
            .Select(element => ParseKeyTransport(element, fallbackAddress))
            .Where(key => key is not null)
            .Cast<XmppOmemoKeyTransport>());

        return parsedKeys;
    }

    private static XmppOmemoKeyTransport? ParseKeyTransport(XElement element, XmppAddress? recipientJid)
    {
        return uint.TryParse((string?)element.Attribute("rid"), out var rid)
            ? new XmppOmemoKeyTransport(
                rid,
                element.Value.Trim(),
                string.Equals((string?)element.Attribute("prekey"), "true", StringComparison.OrdinalIgnoreCase),
                recipientJid)
            : null;
    }

    private static XmppIq CreatePubSubItemsRequest(string id, XmppAddress contact, string node, string? itemId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(contact);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        var items = new XElement(XName.Get("items", PubSubNamespaceName),
            new XAttribute("node", node));
        if (!string.IsNullOrWhiteSpace(itemId))
        {
            items.Add(new XElement(XName.Get("item", PubSubNamespaceName),
                new XAttribute("id", itemId)));
        }

        var pubsub = new XElement(XName.Get("pubsub", PubSubNamespaceName),
            items);
        return new XmppIq(XmppIqType.Get, id, pubsub, To: contact);
    }

    private static XmppIq CreatePubSubPublishRequest(string id, string node, string itemId, XElement payload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentException.ThrowIfNullOrWhiteSpace(itemId);
        ArgumentNullException.ThrowIfNull(payload);

        var pubsub = new XElement(XName.Get("pubsub", PubSubNamespaceName),
            new XElement(XName.Get("publish", PubSubNamespaceName),
                new XAttribute("node", node),
                new XElement(XName.Get("item", PubSubNamespaceName),
                    new XAttribute("id", itemId),
                    new XElement(payload))));
        return new XmppIq(XmppIqType.Set, id, pubsub);
    }
}

public sealed record XmppOmemoKeyTransport(
    uint RecipientDeviceId,
    string CipherText,
    bool IsPreKey = false,
    XmppAddress? RecipientJid = null);

public sealed record XmppOmemoEncryptedMessage(
    uint SenderDeviceId,
    IReadOnlyList<XmppOmemoKeyTransport> Keys,
    string? Payload,
    XmppAddress? From = null,
    XmppAddress? To = null,
    string? Id = null);

public sealed record XmppOmemoBundle(
    string SignedPreKeyPublic,
    uint SignedPreKeyId,
    string SignedPreKeySignature,
    string IdentityKey,
    IReadOnlyList<XmppOmemoPreKey> PreKeys)
{
    public XElement ToXml()
    {
        return new XElement(XName.Get("bundle", XmppOmemo.NamespaceName),
            new XElement(
                XName.Get("signedPreKeyPublic", XmppOmemo.NamespaceName),
                new XAttribute("signedPreKeyId", SignedPreKeyId),
                SignedPreKeyPublic),
            new XElement(XName.Get("signedPreKeySignature", XmppOmemo.NamespaceName), SignedPreKeySignature),
            new XElement(XName.Get("identityKey", XmppOmemo.NamespaceName), IdentityKey),
            new XElement(
                XName.Get("prekeys", XmppOmemo.NamespaceName),
                PreKeys.OrderBy(preKey => preKey.Id)
                    .Select(preKey => new XElement(
                        XName.Get("preKeyPublic", XmppOmemo.NamespaceName),
                        new XAttribute("preKeyId", preKey.Id),
                        preKey.PublicKey))));
    }

    public static bool TryParse(XElement? element, out XmppOmemoBundle? bundle)
    {
        bundle = null;
        if (element?.Name != XName.Get("bundle", XmppOmemo.NamespaceName))
        {
            return false;
        }

        var signedPreKey = element.Element(XName.Get("signedPreKeyPublic", XmppOmemo.NamespaceName));
        var signature = element.Element(XName.Get("signedPreKeySignature", XmppOmemo.NamespaceName))?.Value.Trim();
        var identityKey = element.Element(XName.Get("identityKey", XmppOmemo.NamespaceName))?.Value.Trim();
        if (signedPreKey is null
            || !uint.TryParse((string?)signedPreKey.Attribute("signedPreKeyId"), out var signedPreKeyId)
            || string.IsNullOrWhiteSpace(signature)
            || string.IsNullOrWhiteSpace(identityKey))
        {
            return false;
        }

        var preKeys = element
            .Descendants(XName.Get("preKeyPublic", XmppOmemo.NamespaceName))
            .Select(preKey => uint.TryParse((string?)preKey.Attribute("preKeyId"), out var id)
                ? new XmppOmemoPreKey(id, preKey.Value.Trim())
                : null)
            .Where(preKey => preKey is not null)
            .Cast<XmppOmemoPreKey>()
            .ToArray();

        bundle = new XmppOmemoBundle(
            signedPreKey.Value.Trim(),
            signedPreKeyId,
            signature,
            identityKey,
            preKeys);
        return preKeys.Length > 0;
    }
}

public sealed record XmppOmemoPreKey(
    uint Id,
    string PublicKey);
