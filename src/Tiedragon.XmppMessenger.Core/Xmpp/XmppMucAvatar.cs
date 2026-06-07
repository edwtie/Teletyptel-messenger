namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppMucAvatar
{
    public const string RoomInfoFormType = "http://jabber.org/protocol/muc#roominfo";

    public const string AvatarHashField = "muc#roominfo_avatarhash";

    public static bool SupportsAvatars(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(XmppMultiUserChat.NamespaceName)
            && info.Supports(XmppVCardTemp.NamespaceName);
    }

    public static IReadOnlyList<string> GetRoomAvatarHashes(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);

        var form = info.DataForms.FirstOrDefault(form =>
            string.Equals(form.FormType, RoomInfoFormType, StringComparison.Ordinal));
        if (form is null || !form.Fields.TryGetValue(AvatarHashField, out var values))
        {
            return [];
        }

        return values
            .Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    public static XmppIq CreateGetRequest(string id, XmppAddress room)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);

        return XmppVCardTemp.CreateGetRequest(id, XmppAddress.Parse(room.Bare));
    }

    public static XmppIq CreateSetRequest(
        string id,
        XmppAddress room,
        byte[] imageData,
        string contentType = XmppUserAvatar.RequiredContentType)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(imageData);
        if (imageData.Length == 0)
        {
            throw new ArgumentException("Room avatar image data cannot be empty.", nameof(imageData));
        }

        var vCard = new XmppVCardTemp(Photo: XmppVCardAvatar.CreatePhoto(imageData, contentType));
        return XmppVCardTemp.CreateSetRequest(id, vCard, XmppAddress.Parse(room.Bare));
    }

    public static XmppIq CreateRemoveRequest(string id, XmppAddress room)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);

        return XmppVCardTemp.CreateSetRequest(id, new XmppVCardTemp(), XmppAddress.Parse(room.Bare));
    }

    public static bool TryParseVerifiedAvatar(
        XmppIq iq,
        IReadOnlyList<string> advertisedHashes,
        out XmppMucAvatarPhoto? photo)
    {
        photo = null;
        ArgumentNullException.ThrowIfNull(advertisedHashes);

        if (!XmppVCardTemp.TryParseResult(iq, out var vCard)
            || vCard?.Photo?.Base64Data is null)
        {
            return false;
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(vCard.Photo.Base64Data);
        }
        catch (FormatException)
        {
            return false;
        }

        var hash = XmppVCardAvatar.ComputePhotoHash(bytes);
        var matched = advertisedHashes.Count == 0
            || advertisedHashes.Any(value => string.Equals(value, hash, StringComparison.OrdinalIgnoreCase));
        photo = new XmppMucAvatarPhoto(
            ContentType: string.IsNullOrWhiteSpace(vCard.Photo.ContentType)
                ? XmppUserAvatar.RequiredContentType
                : vCard.Photo.ContentType,
            Data: bytes,
            Hash: hash,
            MatchedAdvertisedHash: matched);
        return true;
    }
}

public sealed record XmppMucAvatarPhoto(
    string ContentType,
    byte[] Data,
    string Hash,
    bool MatchedAdvertisedHash);
