using Org.BouncyCastle.Math.EC.Rfc7748;
using Org.BouncyCastle.Security;
using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppOmemoDoubleRatchet
{
    public const int RootKeySize = 32;
    public const int ChainKeySize = 32;
    public const int MessageKeySize = 32;
    public const int HeaderVersion = 1;
    public const int DefaultMaxSkip = 1000;

    private const string RootInfo = "Tiedragon TeleTypTel OMEMO Double Ratchet root v1";
    private const string MessageInfo = "Tiedragon TeleTypTel OMEMO Double Ratchet message v1";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static XmppOmemoDoubleRatchetState CreateInitiatorState(
        ReadOnlySpan<byte> sharedSecret,
        string remoteRatchetPublicKey,
        SecureRandom? random = null)
    {
        ValidateKeyLength(sharedSecret, RootKeySize, nameof(sharedSecret));
        var localRatchetKeyPair = XmppOmemoX3DhAgreement.GenerateKeyPair(
            XmppOmemoX25519KeyUse.Ephemeral,
            random: random);
        var rootStep = DeriveRootStep(
            sharedSecret,
            CalculateAgreement(localRatchetKeyPair.PrivateKey, remoteRatchetPublicKey));

        return new XmppOmemoDoubleRatchetState(
            RootKey: Convert.ToBase64String(rootStep.RootKey),
            LocalRatchetKeyPair: localRatchetKeyPair,
            RemoteRatchetPublicKey: remoteRatchetPublicKey,
            SendingChainKey: Convert.ToBase64String(rootStep.ChainKey),
            ReceivingChainKey: null,
            SendingMessageNumber: 0,
            ReceivingMessageNumber: 0,
            PreviousSendingChainLength: 0,
            SkippedMessageKeys: new Dictionary<string, string>(StringComparer.Ordinal),
            UpdatedAt: DateTimeOffset.UtcNow);
    }

    public static XmppOmemoDoubleRatchetState CreateResponderState(
        ReadOnlySpan<byte> sharedSecret,
        XmppOmemoX25519KeyPair localRatchetKeyPair)
    {
        ValidateKeyLength(sharedSecret, RootKeySize, nameof(sharedSecret));
        ValidateKeyPair(localRatchetKeyPair);

        return new XmppOmemoDoubleRatchetState(
            RootKey: Convert.ToBase64String(sharedSecret),
            LocalRatchetKeyPair: localRatchetKeyPair,
            RemoteRatchetPublicKey: null,
            SendingChainKey: null,
            ReceivingChainKey: null,
            SendingMessageNumber: 0,
            ReceivingMessageNumber: 0,
            PreviousSendingChainLength: 0,
            SkippedMessageKeys: new Dictionary<string, string>(StringComparer.Ordinal),
            UpdatedAt: DateTimeOffset.UtcNow);
    }

    public static XmppOmemoDoubleRatchetEncryptResult Encrypt(
        XmppOmemoDoubleRatchetState state,
        ReadOnlySpan<byte> plaintext,
        ReadOnlySpan<byte> associatedData = default)
    {
        ArgumentNullException.ThrowIfNull(state);
        if (string.IsNullOrWhiteSpace(state.SendingChainKey))
        {
            throw new InvalidOperationException("The Double Ratchet sending chain is not initialized.");
        }

        var chainStep = DeriveChainStep(DecodeKey(state.SendingChainKey, ChainKeySize, nameof(state.SendingChainKey)));
        var header = new XmppOmemoDoubleRatchetHeader(
            state.LocalRatchetKeyPair.PublicKey,
            state.PreviousSendingChainLength,
            state.SendingMessageNumber);
        var ciphertext = EncryptWithMessageKey(chainStep.MessageKey, header, plaintext, associatedData);
        CryptographicOperations.ZeroMemory(chainStep.MessageKey);

        return new XmppOmemoDoubleRatchetEncryptResult(
            state with
            {
                SendingChainKey = Convert.ToBase64String(chainStep.ChainKey),
                SendingMessageNumber = checked(state.SendingMessageNumber + 1),
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new XmppOmemoDoubleRatchetMessage(header, Convert.ToBase64String(ciphertext)));
    }

    public static XmppOmemoDoubleRatchetDecryptResult Decrypt(
        XmppOmemoDoubleRatchetState state,
        XmppOmemoDoubleRatchetMessage message,
        ReadOnlySpan<byte> associatedData = default,
        int maxSkip = DefaultMaxSkip)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(message);
        if (maxSkip < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxSkip), "The Double Ratchet max-skip value cannot be negative.");
        }

        var working = CloneState(state);
        var skipped = working.SkippedMessageKeys.ToDictionary(StringComparer.Ordinal);
        if (TryUseSkippedMessageKey(message.Header, skipped, out var skippedMessageKey))
        {
            var plaintext = DecryptWithMessageKey(skippedMessageKey, message, associatedData);
            CryptographicOperations.ZeroMemory(skippedMessageKey);
            return new XmppOmemoDoubleRatchetDecryptResult(
                working with
                {
                    SkippedMessageKeys = skipped,
                    UpdatedAt = DateTimeOffset.UtcNow
                },
                plaintext);
        }

        if (!string.Equals(working.RemoteRatchetPublicKey, message.Header.RatchetPublicKey, StringComparison.Ordinal))
        {
            working = SkipMessageKeys(working, message.Header.PreviousSendingChainLength, skipped, maxSkip);
            working = RatchetStep(working, message.Header.RatchetPublicKey);
        }

        working = SkipMessageKeys(working, message.Header.MessageNumber, skipped, maxSkip);
        if (string.IsNullOrWhiteSpace(working.ReceivingChainKey))
        {
            throw new InvalidOperationException("The Double Ratchet receiving chain is not initialized.");
        }

        var chainStep = DeriveChainStep(DecodeKey(working.ReceivingChainKey, ChainKeySize, nameof(working.ReceivingChainKey)));
        var decrypted = DecryptWithMessageKey(chainStep.MessageKey, message, associatedData);
        CryptographicOperations.ZeroMemory(chainStep.MessageKey);

        return new XmppOmemoDoubleRatchetDecryptResult(
            working with
            {
                ReceivingChainKey = Convert.ToBase64String(chainStep.ChainKey),
                ReceivingMessageNumber = checked(working.ReceivingMessageNumber + 1),
                SkippedMessageKeys = skipped,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            decrypted);
    }

    public static byte[] ExportState(XmppOmemoDoubleRatchetState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        ValidateKeyPair(state.LocalRatchetKeyPair);
        return JsonSerializer.SerializeToUtf8Bytes(state, JsonOptions);
    }

    public static XmppOmemoKeyTransport CreateKeyTransport(
        uint recipientDeviceId,
        XmppOmemoDoubleRatchetMessage message,
        bool isPreKey = false,
        XmppAddress? recipientJid = null)
    {
        ArgumentNullException.ThrowIfNull(message);
        var envelope = new XmppOmemoDoubleRatchetKeyEnvelope(
            HeaderVersion,
            message.Header.RatchetPublicKey,
            message.Header.PreviousSendingChainLength,
            message.Header.MessageNumber,
            message.CipherText);
        return new XmppOmemoKeyTransport(
            recipientDeviceId,
            Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(envelope, JsonOptions)),
            isPreKey,
            recipientJid);
    }

    public static bool TryParseKeyTransport(
        XmppOmemoKeyTransport keyTransport,
        out XmppOmemoDoubleRatchetMessage? message)
    {
        ArgumentNullException.ThrowIfNull(keyTransport);
        message = null;

        try
        {
            var envelopeJson = Convert.FromBase64String(keyTransport.CipherText);
            var envelope = JsonSerializer.Deserialize<XmppOmemoDoubleRatchetKeyEnvelope>(envelopeJson, JsonOptions);
            if (envelope is null || envelope.Version != HeaderVersion)
            {
                return false;
            }

            DecodeKey(envelope.RatchetPublicKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(envelope.RatchetPublicKey));
            _ = Convert.FromBase64String(envelope.CipherText);
            message = new XmppOmemoDoubleRatchetMessage(
                new XmppOmemoDoubleRatchetHeader(
                    envelope.RatchetPublicKey,
                    envelope.PreviousSendingChainLength,
                    envelope.MessageNumber),
                envelope.CipherText);
            return true;
        }
        catch (Exception ex) when (ex is FormatException or JsonException or ArgumentException)
        {
            return false;
        }
    }

    public static XmppOmemoDoubleRatchetState ImportState(ReadOnlySpan<byte> state)
    {
        if (state.Length == 0)
        {
            throw new ArgumentException("The Double Ratchet state cannot be empty.", nameof(state));
        }

        var imported = JsonSerializer.Deserialize<XmppOmemoDoubleRatchetState>(state, JsonOptions)
            ?? throw new InvalidDataException("The Double Ratchet state could not be decoded.");
        ValidateState(imported);
        return imported with
        {
            SkippedMessageKeys = imported.SkippedMessageKeys.ToDictionary(StringComparer.Ordinal)
        };
    }

    public static byte[] EncodeHeader(XmppOmemoDoubleRatchetHeader header)
    {
        ArgumentNullException.ThrowIfNull(header);
        var publicKey = DecodeKey(header.RatchetPublicKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(header.RatchetPublicKey));
        var encoded = new byte[1 + 2 + publicKey.Length + 4 + 4];
        encoded[0] = HeaderVersion;
        BinaryPrimitives.WriteUInt16BigEndian(encoded.AsSpan(1, 2), checked((ushort)publicKey.Length));
        publicKey.CopyTo(encoded.AsSpan(3));
        BinaryPrimitives.WriteUInt32BigEndian(encoded.AsSpan(3 + publicKey.Length, 4), header.PreviousSendingChainLength);
        BinaryPrimitives.WriteUInt32BigEndian(encoded.AsSpan(7 + publicKey.Length, 4), header.MessageNumber);
        return encoded;
    }

    private static XmppOmemoDoubleRatchetState SkipMessageKeys(
        XmppOmemoDoubleRatchetState state,
        uint untilMessageNumber,
        Dictionary<string, string> skipped,
        int maxSkip)
    {
        if (state.ReceivingMessageNumber + maxSkip < untilMessageNumber)
        {
            throw new InvalidOperationException("Too many skipped Double Ratchet message keys.");
        }

        if (string.IsNullOrWhiteSpace(state.ReceivingChainKey) || string.IsNullOrWhiteSpace(state.RemoteRatchetPublicKey))
        {
            return state;
        }

        var receivingChainKey = DecodeKey(state.ReceivingChainKey, ChainKeySize, nameof(state.ReceivingChainKey));
        var receivingMessageNumber = state.ReceivingMessageNumber;
        while (receivingMessageNumber < untilMessageNumber)
        {
            var chainStep = DeriveChainStep(receivingChainKey);
            var skippedKey = SkippedKey(state.RemoteRatchetPublicKey, receivingMessageNumber);
            skipped[skippedKey] = Convert.ToBase64String(chainStep.MessageKey);
            receivingChainKey = chainStep.ChainKey;
            receivingMessageNumber++;
        }

        return state with
        {
            ReceivingChainKey = Convert.ToBase64String(receivingChainKey),
            ReceivingMessageNumber = receivingMessageNumber,
            SkippedMessageKeys = skipped
        };
    }

    private static XmppOmemoDoubleRatchetState RatchetStep(
        XmppOmemoDoubleRatchetState state,
        string remoteRatchetPublicKey)
    {
        var firstRootStep = DeriveRootStep(
            DecodeKey(state.RootKey, RootKeySize, nameof(state.RootKey)),
            CalculateAgreement(state.LocalRatchetKeyPair.PrivateKey, remoteRatchetPublicKey));
        var localRatchetKeyPair = XmppOmemoX3DhAgreement.GenerateKeyPair(XmppOmemoX25519KeyUse.Ephemeral);
        var secondRootStep = DeriveRootStep(
            firstRootStep.RootKey,
            CalculateAgreement(localRatchetKeyPair.PrivateKey, remoteRatchetPublicKey));

        return state with
        {
            RootKey = Convert.ToBase64String(secondRootStep.RootKey),
            LocalRatchetKeyPair = localRatchetKeyPair,
            RemoteRatchetPublicKey = remoteRatchetPublicKey,
            ReceivingChainKey = Convert.ToBase64String(firstRootStep.ChainKey),
            SendingChainKey = Convert.ToBase64String(secondRootStep.ChainKey),
            PreviousSendingChainLength = state.SendingMessageNumber,
            SendingMessageNumber = 0,
            ReceivingMessageNumber = 0,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    private static bool TryUseSkippedMessageKey(
        XmppOmemoDoubleRatchetHeader header,
        Dictionary<string, string> skipped,
        out byte[] messageKey)
    {
        var key = SkippedKey(header.RatchetPublicKey, header.MessageNumber);
        if (!skipped.TryGetValue(key, out var encodedMessageKey))
        {
            messageKey = [];
            return false;
        }

        skipped.Remove(key);
        messageKey = DecodeKey(encodedMessageKey, MessageKeySize, "skipped message key");
        return true;
    }

    private static byte[] EncryptWithMessageKey(
        byte[] messageKey,
        XmppOmemoDoubleRatchetHeader header,
        ReadOnlySpan<byte> plaintext,
        ReadOnlySpan<byte> associatedData)
    {
        var material = DeriveMessageMaterial(messageKey);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[XmppOmemoPayloadCrypto.AuthenticationTagSize];
        var aad = CreateAssociatedData(header, associatedData);
        using var aes = new AesGcm(material.Key, tag.Length);
        aes.Encrypt(material.Nonce, plaintext, ciphertext, tag, aad);
        return Concatenate(ciphertext, tag);
    }

    private static byte[] DecryptWithMessageKey(
        byte[] messageKey,
        XmppOmemoDoubleRatchetMessage message,
        ReadOnlySpan<byte> associatedData)
    {
        var payload = Convert.FromBase64String(message.CipherText);
        if (payload.Length < XmppOmemoPayloadCrypto.AuthenticationTagSize)
        {
            throw new ArgumentException("The Double Ratchet ciphertext is shorter than the authentication tag.", nameof(message));
        }

        var material = DeriveMessageMaterial(messageKey);
        var ciphertext = payload.AsSpan(..^XmppOmemoPayloadCrypto.AuthenticationTagSize);
        var tag = payload.AsSpan(^XmppOmemoPayloadCrypto.AuthenticationTagSize..);
        var plaintext = new byte[ciphertext.Length];
        var aad = CreateAssociatedData(message.Header, associatedData);
        using var aes = new AesGcm(material.Key, tag.Length);
        aes.Decrypt(material.Nonce, ciphertext, tag, plaintext, aad);
        return plaintext;
    }

    private static XmppOmemoDoubleRatchetRootStep DeriveRootStep(ReadOnlySpan<byte> rootKey, byte[] dhOutput)
    {
        var material = Hkdf(
            dhOutput,
            rootKey.ToArray(),
            Encoding.ASCII.GetBytes(RootInfo),
            RootKeySize + ChainKeySize);
        return new XmppOmemoDoubleRatchetRootStep(
            material[..RootKeySize],
            material[RootKeySize..]);
    }

    private static XmppOmemoDoubleRatchetChainStep DeriveChainStep(byte[] chainKey)
    {
        return new XmppOmemoDoubleRatchetChainStep(
            HMACSHA256.HashData(chainKey, new byte[] { 0x02 }),
            HMACSHA256.HashData(chainKey, new byte[] { 0x01 }));
    }

    private static XmppOmemoDoubleRatchetMessageMaterial DeriveMessageMaterial(byte[] messageKey)
    {
        var material = Hkdf(
            messageKey,
            new byte[MessageKeySize],
            Encoding.ASCII.GetBytes(MessageInfo),
            XmppOmemoPayloadCrypto.PayloadKeySize + XmppOmemoPayloadCrypto.NonceSize);
        return new XmppOmemoDoubleRatchetMessageMaterial(
            material[..XmppOmemoPayloadCrypto.PayloadKeySize],
            material[XmppOmemoPayloadCrypto.PayloadKeySize..]);
    }

    private static byte[] Hkdf(byte[] inputKeyMaterial, byte[] salt, byte[] info, int outputLength)
    {
        var pseudoRandomKey = HMACSHA256.HashData(salt, inputKeyMaterial);
        var output = new List<byte>(outputLength);
        var previous = Array.Empty<byte>();
        byte counter = 1;
        while (output.Count < outputLength)
        {
            previous = HMACSHA256.HashData(pseudoRandomKey, Concatenate(previous, info, [counter]));
            output.AddRange(previous);
            counter++;
        }

        return output.Take(outputLength).ToArray();
    }

    private static byte[] CalculateAgreement(string privateKey, string publicKey)
    {
        var privateKeyBytes = DecodeKey(privateKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(privateKey));
        var publicKeyBytes = DecodeKey(publicKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(publicKey));
        var output = new byte[XmppOmemoX3DhAgreement.X25519KeySize];
        if (!X25519.CalculateAgreement(privateKeyBytes, 0, publicKeyBytes, 0, output, 0))
        {
            throw new CryptographicException("Double Ratchet X25519 agreement failed.");
        }

        return output;
    }

    private static byte[] DecodeKey(string value, int size, string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        byte[] decoded;
        try
        {
            decoded = Convert.FromBase64String(value);
        }
        catch (FormatException ex)
        {
            throw new FormatException($"{name} is not valid base64.", ex);
        }

        ValidateKeyLength(decoded, size, name);
        return decoded;
    }

    private static void ValidateState(XmppOmemoDoubleRatchetState state)
    {
        DecodeKey(state.RootKey, RootKeySize, nameof(state.RootKey));
        ValidateKeyPair(state.LocalRatchetKeyPair);
        if (state.RemoteRatchetPublicKey is not null)
        {
            DecodeKey(state.RemoteRatchetPublicKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(state.RemoteRatchetPublicKey));
        }

        if (state.SendingChainKey is not null)
        {
            DecodeKey(state.SendingChainKey, ChainKeySize, nameof(state.SendingChainKey));
        }

        if (state.ReceivingChainKey is not null)
        {
            DecodeKey(state.ReceivingChainKey, ChainKeySize, nameof(state.ReceivingChainKey));
        }
    }

    private static void ValidateKeyPair(XmppOmemoX25519KeyPair keyPair)
    {
        ArgumentNullException.ThrowIfNull(keyPair);
        DecodeKey(keyPair.PublicKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(keyPair.PublicKey));
        DecodeKey(keyPair.PrivateKey, XmppOmemoX3DhAgreement.X25519KeySize, nameof(keyPair.PrivateKey));
    }

    private static void ValidateKeyLength(ReadOnlySpan<byte> key, int expectedLength, string name)
    {
        if (key.Length != expectedLength)
        {
            throw new ArgumentException($"{name} must be {expectedLength} bytes.", name);
        }
    }

    private static XmppOmemoDoubleRatchetState CloneState(XmppOmemoDoubleRatchetState state)
    {
        ValidateState(state);
        return state with
        {
            SkippedMessageKeys = state.SkippedMessageKeys.ToDictionary(StringComparer.Ordinal)
        };
    }

    private static string SkippedKey(string ratchetPublicKey, uint messageNumber)
    {
        return ratchetPublicKey + "|" + messageNumber.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private static byte[] CreateAssociatedData(
        XmppOmemoDoubleRatchetHeader header,
        ReadOnlySpan<byte> associatedData)
    {
        var headerBytes = EncodeHeader(header);
        if (associatedData.IsEmpty)
        {
            return headerBytes;
        }

        var result = new byte[associatedData.Length + headerBytes.Length];
        associatedData.CopyTo(result);
        headerBytes.CopyTo(result.AsSpan(associatedData.Length));
        return result;
    }

    private static byte[] Concatenate(params byte[][] parts)
    {
        var result = new byte[parts.Sum(part => part.Length)];
        var offset = 0;
        foreach (var part in parts)
        {
            part.CopyTo(result, offset);
            offset += part.Length;
        }

        return result;
    }
}

public sealed record XmppOmemoDoubleRatchetState(
    string RootKey,
    XmppOmemoX25519KeyPair LocalRatchetKeyPair,
    string? RemoteRatchetPublicKey,
    string? SendingChainKey,
    string? ReceivingChainKey,
    uint SendingMessageNumber,
    uint ReceivingMessageNumber,
    uint PreviousSendingChainLength,
    IReadOnlyDictionary<string, string> SkippedMessageKeys,
    DateTimeOffset UpdatedAt);

public sealed record XmppOmemoDoubleRatchetHeader(
    string RatchetPublicKey,
    uint PreviousSendingChainLength,
    uint MessageNumber);

public sealed record XmppOmemoDoubleRatchetMessage(
    XmppOmemoDoubleRatchetHeader Header,
    string CipherText);

public sealed record XmppOmemoDoubleRatchetKeyEnvelope(
    int Version,
    string RatchetPublicKey,
    uint PreviousSendingChainLength,
    uint MessageNumber,
    string CipherText);

public sealed record XmppOmemoDoubleRatchetEncryptResult(
    XmppOmemoDoubleRatchetState State,
    XmppOmemoDoubleRatchetMessage Message);

public sealed record XmppOmemoDoubleRatchetDecryptResult(
    XmppOmemoDoubleRatchetState State,
    byte[] Plaintext);

internal sealed record XmppOmemoDoubleRatchetRootStep(
    byte[] RootKey,
    byte[] ChainKey);

internal sealed record XmppOmemoDoubleRatchetChainStep(
    byte[] ChainKey,
    byte[] MessageKey);

internal sealed record XmppOmemoDoubleRatchetMessageMaterial(
    byte[] Key,
    byte[] Nonce);
