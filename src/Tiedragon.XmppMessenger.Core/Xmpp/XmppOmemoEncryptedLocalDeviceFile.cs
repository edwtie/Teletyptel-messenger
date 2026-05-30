using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppOmemoEncryptedLocalDeviceFile
{
    public const string FormatName = "tiedragon-omemo-local-devices";
    public const int CurrentVersion = 1;
    public const int SaltSize = 16;
    public const int NonceSize = 12;
    public const int TagSize = 16;
    public const int KeySize = 32;
    public const int DefaultIterations = 210_000;

    private const string KdfName = "pbkdf2-sha256";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static async Task SaveAsync(
        string path,
        XmppOmemoLocalDeviceStore store,
        string passphrase,
        int iterations = DefaultIterations,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentNullException.ThrowIfNull(store);
        ValidatePassphrase(passphrase);
        if (iterations < 100_000)
        {
            throw new ArgumentOutOfRangeException(nameof(iterations), "Use at least 100000 PBKDF2 iterations.");
        }

        var plain = PlainStoreDto.FromStore(store);
        var plainBytes = JsonSerializer.SerializeToUtf8Bytes(plain, JsonOptions);
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var tag = new byte[TagSize];
        var cipherText = new byte[plainBytes.Length];
        var header = new HeaderDto(FormatName, CurrentVersion, KdfName, iterations, Convert.ToBase64String(salt));

        var key = DeriveKey(passphrase, salt, iterations);
        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Encrypt(nonce, plainBytes, cipherText, tag, AssociatedData(header));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
            CryptographicOperations.ZeroMemory(plainBytes);
        }

        var envelope = new EncryptedStoreDto(
            header.Format,
            header.Version,
            header.Kdf,
            header.Iterations,
            header.Salt,
            Convert.ToBase64String(nonce),
            Convert.ToBase64String(tag),
            Convert.ToBase64String(cipherText));

        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var tempPath = path + ".tmp";
        await File.WriteAllTextAsync(
            tempPath,
            JsonSerializer.Serialize(envelope, JsonOptions),
            Encoding.UTF8,
            cancellationToken);
        File.Move(tempPath, path, overwrite: true);
    }

    public static async Task SaveWithVaultAsync(
        string path,
        XmppOmemoLocalDeviceStore store,
        IXmppOmemoSecretVault secretVault,
        string secretName,
        string passphrase,
        int iterations = DefaultIterations,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(secretVault);
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        ValidatePassphrase(passphrase);
        await secretVault.SaveSecretAsync(secretName, passphrase, cancellationToken);
        await SaveAsync(path, store, passphrase, iterations, cancellationToken);
    }

    public static async Task<XmppOmemoLocalDeviceStore> LoadAsync(
        string path,
        string passphrase,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ValidatePassphrase(passphrase);

        var json = await File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken);
        var envelope = JsonSerializer.Deserialize<EncryptedStoreDto>(json, JsonOptions)
            ?? throw new InvalidDataException("The OMEMO local device file is empty.");
        ValidateEnvelope(envelope);

        var salt = Convert.FromBase64String(envelope.Salt);
        var nonce = Convert.FromBase64String(envelope.Nonce);
        var tag = Convert.FromBase64String(envelope.Tag);
        var cipherText = Convert.FromBase64String(envelope.CipherText);
        var plainBytes = new byte[cipherText.Length];
        var header = new HeaderDto(envelope.Format, envelope.Version, envelope.Kdf, envelope.Iterations, envelope.Salt);

        var key = DeriveKey(passphrase, salt, envelope.Iterations);
        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(nonce, cipherText, tag, plainBytes, AssociatedData(header));
            var plain = JsonSerializer.Deserialize<PlainStoreDto>(plainBytes, JsonOptions)
                ?? throw new InvalidDataException("The decrypted OMEMO local device file is empty.");
            return plain.ToStore();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
            CryptographicOperations.ZeroMemory(plainBytes);
        }
    }

    public static async Task<XmppOmemoLocalDeviceStore> LoadWithVaultAsync(
        string path,
        IXmppOmemoSecretVault secretVault,
        string secretName,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(secretVault);
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        var passphrase = await secretVault.LoadSecretAsync(secretName, cancellationToken);
        if (string.IsNullOrWhiteSpace(passphrase))
        {
            throw new InvalidOperationException("The OMEMO key-store passphrase was not found in the secret vault.");
        }

        return await LoadAsync(path, passphrase, cancellationToken);
    }

    private static void ValidateEnvelope(EncryptedStoreDto envelope)
    {
        if (!string.Equals(envelope.Format, FormatName, StringComparison.Ordinal))
        {
            throw new InvalidDataException("The OMEMO local device file format is not supported.");
        }

        if (envelope.Version != CurrentVersion)
        {
            throw new InvalidDataException($"Unsupported OMEMO local device file version {envelope.Version}.");
        }

        if (!string.Equals(envelope.Kdf, KdfName, StringComparison.Ordinal))
        {
            throw new InvalidDataException("The OMEMO local device file KDF is not supported.");
        }
    }

    private static void ValidatePassphrase(string passphrase)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(passphrase);
        if (passphrase.Length < 12)
        {
            throw new ArgumentException("Use a longer OMEMO key-store passphrase.", nameof(passphrase));
        }
    }

    private static byte[] DeriveKey(string passphrase, byte[] salt, int iterations)
    {
        return Rfc2898DeriveBytes.Pbkdf2(
            passphrase,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            KeySize);
    }

    private static byte[] AssociatedData(HeaderDto header)
    {
        return Encoding.UTF8.GetBytes(
            string.Join("|", header.Format, header.Version, header.Kdf, header.Iterations, header.Salt));
    }

    private sealed record HeaderDto(
        string Format,
        int Version,
        string Kdf,
        int Iterations,
        string Salt);

    private sealed record EncryptedStoreDto(
        string Format,
        int Version,
        string Kdf,
        int Iterations,
        string Salt,
        string Nonce,
        string Tag,
        string CipherText);

    private sealed record PlainStoreDto(DeviceDto[] Devices)
    {
        public static PlainStoreDto FromStore(XmppOmemoLocalDeviceStore store)
        {
            return new PlainStoreDto(store.ListDeviceIds()
                .Select(deviceId => DeviceDto.FromDevice(store.GetDevice(deviceId)))
                .ToArray());
        }

        public XmppOmemoLocalDeviceStore ToStore()
        {
            var store = new XmppOmemoLocalDeviceStore();
            foreach (var device in Devices)
            {
                store.AddOrUpdate(device.ToDevice());
            }

            return store;
        }
    }

    private sealed record DeviceDto(
        uint DeviceId,
        KeyPairDto IdentityKeyPair,
        KeyPairDto SignedPreKeyPair,
        uint SignedPreKeyId,
        string SignedPreKeySignature,
        KeyPairDto[] OneTimePreKeyPairs)
    {
        public static DeviceDto FromDevice(XmppOmemoLocalDevice device)
        {
            return new DeviceDto(
                device.DeviceId,
                KeyPairDto.FromKeyPair(device.IdentityKeyPair),
                KeyPairDto.FromKeyPair(device.SignedPreKeyPair),
                device.SignedPreKeyId,
                device.SignedPreKeySignature,
                device.OneTimePreKeyPairs.Select(KeyPairDto.FromKeyPair).ToArray());
        }

        public XmppOmemoLocalDevice ToDevice()
        {
            return new XmppOmemoLocalDevice(
                DeviceId,
                IdentityKeyPair.ToKeyPair(),
                SignedPreKeyPair.ToKeyPair(),
                SignedPreKeyId,
                SignedPreKeySignature,
                OneTimePreKeyPairs.Select(preKey => preKey.ToKeyPair()).ToArray());
        }
    }

    private sealed record KeyPairDto(
        string PublicKey,
        string PrivateKey,
        XmppOmemoX25519KeyUse KeyUse,
        uint? PreKeyId)
    {
        public static KeyPairDto FromKeyPair(XmppOmemoX25519KeyPair keyPair)
        {
            return new KeyPairDto(keyPair.PublicKey, keyPair.PrivateKey, keyPair.KeyUse, keyPair.PreKeyId);
        }

        public XmppOmemoX25519KeyPair ToKeyPair()
        {
            return new XmppOmemoX25519KeyPair(PublicKey, PrivateKey, KeyUse, PreKeyId);
        }
    }
}
