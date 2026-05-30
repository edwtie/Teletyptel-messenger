using System.Security.Cryptography;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppOmemoTrustState
{
    Unknown,
    Trusted,
    Distrusted
}

public static class XmppOmemoTrust
{
    public static string ComputeFingerprint(ReadOnlySpan<byte> identityKey)
    {
        if (identityKey.IsEmpty)
        {
            throw new ArgumentException("The OMEMO identity key is required.", nameof(identityKey));
        }

        var hash = SHA256.HashData(identityKey);
        return string.Join(
            " ",
            Convert.ToHexString(hash).Chunk(8).Select(chars => new string(chars)));
    }

    public static string ComputeFingerprintFromBase64(string identityKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(identityKey);
        return ComputeFingerprint(Convert.FromBase64String(identityKey));
    }

    public static string ComputeFingerprintFromText(string identityKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(identityKey);
        return ComputeFingerprint(Encoding.UTF8.GetBytes(identityKey));
    }
}

public sealed class XmppOmemoTrustStore
{
    private readonly Dictionary<string, XmppOmemoTrustEntry> _entries = new(StringComparer.Ordinal);

    public XmppOmemoTrustEntry SetTrust(
        XmppAddress owner,
        uint deviceId,
        string fingerprint,
        XmppOmemoTrustState state,
        DateTimeOffset? updatedAt = null)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentException.ThrowIfNullOrWhiteSpace(fingerprint);

        var entry = new XmppOmemoTrustEntry(
            owner,
            deviceId,
            fingerprint,
            state,
            updatedAt ?? DateTimeOffset.UtcNow);
        _entries[Key(owner, deviceId)] = entry;
        return entry;
    }

    public XmppOmemoTrustState GetTrust(XmppAddress owner, uint deviceId, string fingerprint)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentException.ThrowIfNullOrWhiteSpace(fingerprint);

        return _entries.TryGetValue(Key(owner, deviceId), out var entry)
            && string.Equals(entry.Fingerprint, fingerprint, StringComparison.Ordinal)
            ? entry.State
            : XmppOmemoTrustState.Unknown;
    }

    public IReadOnlyList<XmppOmemoTrustEntry> List()
    {
        return _entries.Values
            .OrderBy(entry => entry.Owner.Bare, StringComparer.Ordinal)
            .ThenBy(entry => entry.DeviceId)
            .ToArray();
    }

    private static string Key(XmppAddress owner, uint deviceId)
    {
        return owner.Bare + "/" + deviceId.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
}

public sealed record XmppOmemoTrustEntry(
    XmppAddress Owner,
    uint DeviceId,
    string Fingerprint,
    XmppOmemoTrustState State,
    DateTimeOffset UpdatedAt);
