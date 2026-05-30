namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppOmemoLocalDeviceStore
{
    private readonly Dictionary<uint, XmppOmemoLocalDevice> _devices = new();

    public void AddOrUpdate(XmppOmemoLocalDevice device)
    {
        ArgumentNullException.ThrowIfNull(device);
        _devices[device.DeviceId] = device;
    }

    public XmppOmemoLocalDevice GetDevice(uint deviceId)
    {
        return _devices.TryGetValue(deviceId, out var device)
            ? device
            : throw new KeyNotFoundException($"OMEMO local device {deviceId} was not found.");
    }

    public bool RemoveDevice(uint deviceId)
    {
        return _devices.Remove(deviceId);
    }

    public IReadOnlyList<uint> ListDeviceIds()
    {
        return _devices.Keys.Order().ToArray();
    }

    public XmppOmemoX25519KeyPair ConsumeOneTimePreKey(uint deviceId, uint preKeyId)
    {
        var device = GetDevice(deviceId);
        var key = device.OneTimePreKeyPairs.FirstOrDefault(preKey => preKey.PreKeyId == preKeyId)
            ?? throw new KeyNotFoundException($"OMEMO one-time pre-key {preKeyId} was not found for device {deviceId}.");

        _devices[deviceId] = device with
        {
            OneTimePreKeyPairs = device.OneTimePreKeyPairs
                .Where(preKey => preKey.PreKeyId != preKeyId)
                .ToArray()
        };
        return key;
    }

    public void ReplenishOneTimePreKeys(uint deviceId, uint firstPreKeyId, int count)
    {
        if (count < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(count));
        }

        var device = GetDevice(deviceId);
        var additions = Enumerable.Range(0, count)
            .Select(offset => XmppOmemoX3DhAgreement.GenerateOneTimePreKeyPair(firstPreKeyId + (uint)offset))
            .ToArray();
        _devices[deviceId] = device.AddOneTimePreKeys(additions);
    }

    public IReadOnlyList<XmppIq> CreatePublishRequests(
        string idPrefix,
        uint deviceId,
        int? maxOneTimePreKeys = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(idPrefix);
        var device = GetDevice(deviceId);
        return
        [
            XmppOmemo.CreateDeviceListPublish(idPrefix + "-devices", ListDeviceIds()),
            XmppOmemo.CreateBundlePublish(idPrefix + "-bundle-" + deviceId.ToString(System.Globalization.CultureInfo.InvariantCulture), deviceId, device.ToBundle(maxOneTimePreKeys))
        ];
    }
}

public sealed record XmppOmemoLocalDevice(
    uint DeviceId,
    XmppOmemoX25519KeyPair IdentityKeyPair,
    XmppOmemoX25519KeyPair SignedPreKeyPair,
    uint SignedPreKeyId,
    string SignedPreKeySignature,
    IReadOnlyList<XmppOmemoX25519KeyPair> OneTimePreKeyPairs)
{
    public static XmppOmemoLocalDevice Create(
        uint deviceId,
        string signedPreKeySignature,
        uint signedPreKeyId = 1,
        uint firstOneTimePreKeyId = 1,
        int oneTimePreKeyCount = 100)
    {
        if (oneTimePreKeyCount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(oneTimePreKeyCount));
        }

        return new XmppOmemoLocalDevice(
            deviceId,
            XmppOmemoX3DhAgreement.GenerateIdentityKeyPair(),
            XmppOmemoX3DhAgreement.GenerateKeyPair(XmppOmemoX25519KeyUse.SignedPreKey, signedPreKeyId),
            signedPreKeyId,
            signedPreKeySignature,
            Enumerable.Range(0, oneTimePreKeyCount)
                .Select(offset => XmppOmemoX3DhAgreement.GenerateOneTimePreKeyPair(firstOneTimePreKeyId + (uint)offset))
                .ToArray());
    }

    public XmppOmemoBundle ToBundle(int? maxOneTimePreKeys = null)
    {
        Validate();
        var preKeys = OneTimePreKeyPairs
            .OrderBy(preKey => preKey.PreKeyId)
            .Take(maxOneTimePreKeys ?? int.MaxValue)
            .Select(preKey => new XmppOmemoPreKey(preKey.PreKeyId!.Value, preKey.PublicKey))
            .ToArray();

        return new XmppOmemoBundle(
            SignedPreKeyPair.PublicKey,
            SignedPreKeyId,
            SignedPreKeySignature,
            IdentityKeyPair.PublicKey,
            preKeys);
    }

    public XmppOmemoLocalDevice AddOneTimePreKeys(IEnumerable<XmppOmemoX25519KeyPair> preKeys)
    {
        ArgumentNullException.ThrowIfNull(preKeys);
        var additions = preKeys.ToArray();
        foreach (var preKey in additions)
        {
            ValidateKey(preKey, XmppOmemoX25519KeyUse.OneTimePreKey, nameof(preKeys));
        }

        var duplicate = OneTimePreKeyPairs
            .Concat(additions)
            .Where(preKey => preKey.PreKeyId is not null)
            .GroupBy(preKey => preKey.PreKeyId!.Value)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            throw new InvalidOperationException($"Duplicate OMEMO one-time pre-key id {duplicate.Key}.");
        }

        return this with
        {
            OneTimePreKeyPairs = OneTimePreKeyPairs.Concat(additions).ToArray()
        };
    }

    private void Validate()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(SignedPreKeySignature);
        ValidateKey(IdentityKeyPair, XmppOmemoX25519KeyUse.Identity, nameof(IdentityKeyPair));
        ValidateKey(SignedPreKeyPair, XmppOmemoX25519KeyUse.SignedPreKey, nameof(SignedPreKeyPair));
        if (SignedPreKeyPair.PreKeyId is not null && SignedPreKeyPair.PreKeyId.Value != SignedPreKeyId)
        {
            throw new InvalidOperationException("The signed pre-key id does not match the signed pre-key pair.");
        }

        foreach (var preKey in OneTimePreKeyPairs)
        {
            ValidateKey(preKey, XmppOmemoX25519KeyUse.OneTimePreKey, nameof(OneTimePreKeyPairs));
        }

        _ = AddOneTimePreKeys([]);
    }

    private static void ValidateKey(
        XmppOmemoX25519KeyPair keyPair,
        XmppOmemoX25519KeyUse expectedUse,
        string parameterName)
    {
        ArgumentNullException.ThrowIfNull(keyPair);
        if (keyPair.KeyUse != expectedUse)
        {
            throw new ArgumentException($"Expected {expectedUse} key pair, got {keyPair.KeyUse}.", parameterName);
        }

        if (expectedUse == XmppOmemoX25519KeyUse.OneTimePreKey && keyPair.PreKeyId is null)
        {
            throw new ArgumentException("One-time pre-keys require a pre-key id.", parameterName);
        }
    }
}
