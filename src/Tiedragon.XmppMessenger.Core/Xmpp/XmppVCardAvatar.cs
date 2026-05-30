using System.Security.Cryptography;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppVCardAvatar
{
    public const string UpdateNamespaceName = "vcard-temp:x:update";

    public const string PepVCardConversionFeature = "urn:xmpp:pep-vcard-conversion:0";

    public static string ComputePhotoHash(ReadOnlySpan<byte> imageData)
    {
        var hash = SHA1.HashData(imageData);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static XmppVCardPhoto CreatePhoto(
        byte[] imageData,
        string contentType = XmppUserAvatar.RequiredContentType)
    {
        ArgumentNullException.ThrowIfNull(imageData);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentType);
        if (imageData.Length == 0)
        {
            throw new ArgumentException("Avatar image data cannot be empty.", nameof(imageData));
        }

        return new XmppVCardPhoto(contentType, Convert.ToBase64String(imageData));
    }

    public static XmppVCardTemp CreateVCard(
        byte[] imageData,
        string contentType = XmppUserAvatar.RequiredContentType,
        string? fullName = null,
        string? nickname = null)
    {
        return new XmppVCardTemp(
            FullName: fullName,
            Nickname: nickname,
            Photo: CreatePhoto(imageData, contentType));
    }

    public static bool TryCreateUserAvatarData(XmppVCardPhoto photo, out XmppUserAvatarData? data)
    {
        data = null;
        if (!TryReadPhotoBytes(photo, out var bytes))
        {
            return false;
        }

        data = new XmppUserAvatarData(ComputePhotoHash(bytes), Convert.ToBase64String(bytes));
        return true;
    }

    public static bool TryCreateUserAvatarInfo(
        XmppVCardPhoto photo,
        out XmppUserAvatarInfo? info,
        ushort? width = null,
        ushort? height = null)
    {
        info = null;
        if (!TryReadPhotoBytes(photo, out var bytes))
        {
            return false;
        }

        info = new XmppUserAvatarInfo(
            Id: ComputePhotoHash(bytes),
            ContentType: string.IsNullOrWhiteSpace(photo.ContentType)
                ? XmppUserAvatar.RequiredContentType
                : photo.ContentType!,
            Bytes: checked((uint)bytes.Length),
            Width: width,
            Height: height);
        return true;
    }

    public static bool SupportsPepVCardConversion(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(PepVCardConversionFeature);
    }

    private static bool TryReadPhotoBytes(XmppVCardPhoto photo, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(photo.Base64Data))
        {
            return false;
        }

        try
        {
            bytes = Convert.FromBase64String(photo.Base64Data);
            return bytes.Length > 0;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed record XmppVCardAvatarUpdate(string? PhotoHash)
{
    public static XmppVCardAvatarUpdate FromImageData(byte[] imageData)
    {
        ArgumentNullException.ThrowIfNull(imageData);
        return new XmppVCardAvatarUpdate(XmppVCardAvatar.ComputePhotoHash(imageData));
    }

    public static XmppVCardAvatarUpdate Disabled { get; } = new(string.Empty);

    public bool IsDisabled => string.IsNullOrEmpty(PhotoHash);

    public XElement ToXml()
    {
        return new XElement(
            XName.Get("x", XmppVCardAvatar.UpdateNamespaceName),
            new XElement(XName.Get("photo", XmppVCardAvatar.UpdateNamespaceName), PhotoHash ?? string.Empty));
    }

    public static bool TryParse(XElement? element, out XmppVCardAvatarUpdate? update)
    {
        update = null;
        if (element is null || element.Name != XName.Get("x", XmppVCardAvatar.UpdateNamespaceName))
        {
            return false;
        }

        var photo = element.Element(XName.Get("photo", XmppVCardAvatar.UpdateNamespaceName));
        if (photo is null)
        {
            return false;
        }

        update = new XmppVCardAvatarUpdate(photo.Value.Trim());
        return true;
    }
}
