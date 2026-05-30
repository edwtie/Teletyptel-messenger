using System.Security.Cryptography;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppUserAvatar
{
    public const string DataNamespaceName = "urn:xmpp:avatar:data";

    public const string MetadataNamespaceName = "urn:xmpp:avatar:metadata";

    public const string MetadataNotificationFeature = MetadataNamespaceName + "+notify";

    public const string PubSubNamespaceName = XmppPersonalEventing.PubSubNamespaceName;

    public const string PubSubEventNamespaceName = XmppPersonalEventing.PubSubEventNamespaceName;

    public const string RequiredContentType = "image/png";

    public static string ComputeId(ReadOnlySpan<byte> imageData)
    {
        var hash = SHA1.HashData(imageData);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static XmppUserAvatarInfo CreatePngInfo(
        byte[] imageData,
        ushort? width = null,
        ushort? height = null,
        Uri? url = null)
    {
        ArgumentNullException.ThrowIfNull(imageData);
        if (imageData.Length == 0)
        {
            throw new ArgumentException("Avatar image data cannot be empty.", nameof(imageData));
        }

        return new XmppUserAvatarInfo(
            Id: ComputeId(imageData),
            ContentType: RequiredContentType,
            Bytes: checked((uint)imageData.Length),
            Width: width,
            Height: height,
            Url: url);
    }

    public static XElement CreateDataElement(byte[] imageData)
    {
        ArgumentNullException.ThrowIfNull(imageData);
        if (imageData.Length == 0)
        {
            throw new ArgumentException("Avatar image data cannot be empty.", nameof(imageData));
        }

        return new XElement(XName.Get("data", DataNamespaceName), Convert.ToBase64String(imageData));
    }

    public static XElement CreateMetadataElement(
        IEnumerable<XmppUserAvatarInfo> infos,
        IEnumerable<XElement>? pointerElements = null)
    {
        ArgumentNullException.ThrowIfNull(infos);

        var infoArray = infos.ToArray();
        var pointerArray = (pointerElements ?? []).ToArray();
        if (pointerArray.Length > 0 && infoArray.Length == 0)
        {
            throw new ArgumentException("Avatar pointer metadata must include at least one fallback info element.", nameof(pointerElements));
        }

        return new XElement(
            XName.Get("metadata", MetadataNamespaceName),
            infoArray.Select(info => info.ToXml()),
            pointerArray.Select(pointer => new XElement(pointer)));
    }

    public static XElement CreateDisabledMetadataElement()
    {
        return new XElement(XName.Get("metadata", MetadataNamespaceName));
    }

    public static XElement CreatePointerElement(
        IEnumerable<XElement> children,
        string? id = null,
        string? contentType = null,
        uint? bytes = null,
        ushort? width = null,
        ushort? height = null)
    {
        ArgumentNullException.ThrowIfNull(children);

        var element = new XElement(
            XName.Get("pointer", MetadataNamespaceName),
            children.Select(child => new XElement(child)));
        SetOptionalAttribute(element, "bytes", bytes?.ToString(System.Globalization.CultureInfo.InvariantCulture));
        SetOptionalAttribute(element, "height", height?.ToString(System.Globalization.CultureInfo.InvariantCulture));
        SetOptionalAttribute(element, "id", id);
        SetOptionalAttribute(element, "type", contentType);
        SetOptionalAttribute(element, "width", width?.ToString(System.Globalization.CultureInfo.InvariantCulture));
        return element;
    }

    public static XmppIq CreateDataPublish(string id, byte[] pngData)
    {
        ArgumentNullException.ThrowIfNull(pngData);
        return CreatePubSubPublishRequest(id, DataNamespaceName, ComputeId(pngData), CreateDataElement(pngData));
    }

    public static XmppIq CreateMetadataPublish(
        string id,
        IEnumerable<XmppUserAvatarInfo> infos,
        IEnumerable<XElement>? pointerElements = null,
        string? itemId = null)
    {
        ArgumentNullException.ThrowIfNull(infos);

        var infoArray = infos.ToArray();
        if (infoArray.Length == 0)
        {
            throw new ArgumentException("Use CreateDisableMetadataPublish for empty avatar metadata.", nameof(infos));
        }

        return CreatePubSubPublishRequest(
            id,
            MetadataNamespaceName,
            itemId ?? infoArray[0].Id,
            CreateMetadataElement(infoArray, pointerElements));
    }

    public static XmppIq CreateDisableMetadataPublish(string id)
    {
        return CreatePubSubPublishRequest(id, MetadataNamespaceName, itemId: null, CreateDisabledMetadataElement());
    }

    public static XmppIq CreateDataRequest(string id, XmppAddress contact, string avatarId)
    {
        ArgumentNullException.ThrowIfNull(contact);
        ArgumentException.ThrowIfNullOrWhiteSpace(avatarId);
        return CreatePubSubItemsRequest(id, contact, DataNamespaceName, avatarId);
    }

    public static XmppIq CreateMetadataRequest(string id, XmppAddress contact, string? avatarId = null)
    {
        ArgumentNullException.ThrowIfNull(contact);
        return CreatePubSubItemsRequest(id, contact, MetadataNamespaceName, avatarId);
    }

    public static bool TryParseData(XmppIq iq, out XmppUserAvatarData? data)
    {
        data = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", PubSubNamespaceName))
        {
            return false;
        }

        var dataElement = iq.Payload.Descendants(XName.Get("data", DataNamespaceName)).FirstOrDefault();
        if (dataElement is null)
        {
            return false;
        }

        var itemId = dataElement
            .Ancestors(XName.Get("item", PubSubNamespaceName))
            .FirstOrDefault()
            ?.Attribute("id")
            ?.Value;
        return TryParseDataElement(dataElement, itemId, out data);
    }

    public static bool TryParseDataElement(XElement element, string? itemId, out XmppUserAvatarData? data)
    {
        data = null;
        if (element.Name != XName.Get("data", DataNamespaceName))
        {
            return false;
        }

        byte[] imageData;
        try
        {
            imageData = Convert.FromBase64String(element.Value);
        }
        catch (FormatException)
        {
            return false;
        }

        if (imageData.Length == 0)
        {
            return false;
        }

        var computedId = ComputeId(imageData);
        if (!string.IsNullOrWhiteSpace(itemId)
            && !string.Equals(itemId, computedId, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        data = new XmppUserAvatarData(computedId, Convert.ToBase64String(imageData));
        return true;
    }

    public static bool TryParseMetadata(XmppIq iq, out XmppUserAvatarMetadata? metadata)
    {
        metadata = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("pubsub", PubSubNamespaceName))
        {
            return false;
        }

        var metadataElement = iq.Payload.Descendants(XName.Get("metadata", MetadataNamespaceName)).FirstOrDefault();
        return metadataElement is not null && TryParseMetadataElement(metadataElement, out metadata);
    }

    public static bool TryParseMetadataNotification(XElement message, out XmppUserAvatarMetadata? metadata)
    {
        metadata = null;
        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var eventElement = message.Element(XName.Get("event", PubSubEventNamespaceName));
        var items = eventElement?.Elements(XName.Get("items", PubSubEventNamespaceName))
            .FirstOrDefault(element => string.Equals(
                (string?)element.Attribute("node"),
                MetadataNamespaceName,
                StringComparison.Ordinal));
        var metadataElement = items?.Descendants(XName.Get("metadata", MetadataNamespaceName)).FirstOrDefault();
        return metadataElement is not null && TryParseMetadataElement(metadataElement, out metadata);
    }

    public static bool TryParseMetadataElement(XElement element, out XmppUserAvatarMetadata? metadata)
    {
        metadata = null;
        if (element.Name != XName.Get("metadata", MetadataNamespaceName))
        {
            return false;
        }

        var infos = element
            .Elements(XName.Get("info", MetadataNamespaceName))
            .Select(info => XmppUserAvatarInfo.TryParse(info, out var parsedInfo) ? parsedInfo : null)
            .Where(info => info is not null)
            .Cast<XmppUserAvatarInfo>()
            .ToArray();
        var pointers = element
            .Elements(XName.Get("pointer", MetadataNamespaceName))
            .Select(pointer => new XElement(pointer))
            .ToArray();

        metadata = new XmppUserAvatarMetadata(infos, pointers);
        return true;
    }

    private static XmppIq CreatePubSubItemsRequest(string id, XmppAddress contact, string node, string? itemId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(contact);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        return XmppPersonalEventing.CreateItemsRequest(id, node, contact, itemId);
    }

    private static XmppIq CreatePubSubPublishRequest(string id, string node, string? itemId, XElement payload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(payload);

        return XmppPersonalEventing.CreatePublishRequest(id, node, itemId, payload);
    }

    private static void SetOptionalAttribute(XElement element, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            element.SetAttributeValue(name, value);
        }
    }
}

public sealed record XmppUserAvatarInfo(
    string Id,
    string ContentType,
    uint Bytes,
    ushort? Width = null,
    ushort? Height = null,
    Uri? Url = null)
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(ContentType);

        if (Url is not null && Url.Scheme is not "http" and not "https")
        {
            throw new InvalidOperationException("Avatar URLs must use http or https.");
        }

        var element = new XElement(
            XName.Get("info", XmppUserAvatar.MetadataNamespaceName),
            new XAttribute("bytes", Bytes),
            new XAttribute("id", Id),
            new XAttribute("type", ContentType));
        if (Height is not null)
        {
            element.SetAttributeValue("height", Height.Value);
        }

        if (Url is not null)
        {
            element.SetAttributeValue("url", Url.AbsoluteUri);
        }

        if (Width is not null)
        {
            element.SetAttributeValue("width", Width.Value);
        }

        return element;
    }

    public static bool TryParse(XElement element, out XmppUserAvatarInfo? info)
    {
        info = null;
        if (element.Name != XName.Get("info", XmppUserAvatar.MetadataNamespaceName))
        {
            return false;
        }

        var id = (string?)element.Attribute("id");
        var contentType = (string?)element.Attribute("type");
        if (string.IsNullOrWhiteSpace(id)
            || string.IsNullOrWhiteSpace(contentType)
            || !uint.TryParse((string?)element.Attribute("bytes"), out var bytes))
        {
            return false;
        }

        if (!TryParseOptionalUShort(element, "width", out var width)
            || !TryParseOptionalUShort(element, "height", out var height)
            || !TryParseOptionalHttpUrl(element, out var url))
        {
            return false;
        }

        info = new XmppUserAvatarInfo(id, contentType, bytes, width, height, url);
        return true;
    }

    private static bool TryParseOptionalUShort(XElement element, string name, out ushort? value)
    {
        value = null;
        var raw = (string?)element.Attribute(name);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        if (!ushort.TryParse(raw, out var parsed))
        {
            return false;
        }

        value = parsed;
        return true;
    }

    private static bool TryParseOptionalHttpUrl(XElement element, out Uri? url)
    {
        url = null;
        var raw = (string?)element.Attribute("url");
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed)
            || parsed.Scheme is not "http" and not "https")
        {
            return false;
        }

        url = parsed;
        return true;
    }
}

public sealed record XmppUserAvatarData(
    string Id,
    string Base64Data)
{
    public byte[] ToByteArray()
    {
        return Convert.FromBase64String(Base64Data);
    }
}

public sealed record XmppUserAvatarMetadata(
    IReadOnlyList<XmppUserAvatarInfo> Infos,
    IReadOnlyList<XElement> Pointers)
{
    public bool IsDisabled => Infos.Count == 0 && Pointers.Count == 0;

    public XmppUserAvatarInfo? RequiredPng => Infos.FirstOrDefault(info =>
        string.Equals(info.ContentType, XmppUserAvatar.RequiredContentType, StringComparison.OrdinalIgnoreCase));
}
