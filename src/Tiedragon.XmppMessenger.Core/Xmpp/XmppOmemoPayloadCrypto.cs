using System.Security.Cryptography;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppOmemoPayloadCrypto
{
    public const int PayloadKeySize = 32;

    public const int NonceSize = 12;

    public const int AuthenticationTagSize = 16;

    public static XmppOmemoPayloadCipher EncryptString(
        string text,
        Encoding? encoding = null,
        ReadOnlySpan<byte> associatedData = default)
    {
        ArgumentNullException.ThrowIfNull(text);
        return Encrypt((encoding ?? Encoding.UTF8).GetBytes(text), associatedData);
    }

    public static XmppOmemoPayloadCipher Encrypt(
        ReadOnlySpan<byte> plaintext,
        ReadOnlySpan<byte> associatedData = default)
    {
        var payloadKey = RandomNumberGenerator.GetBytes(PayloadKeySize);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        return Encrypt(plaintext, payloadKey, nonce, associatedData);
    }

    public static XmppOmemoPayloadCipher Encrypt(
        ReadOnlySpan<byte> plaintext,
        ReadOnlySpan<byte> payloadKey,
        ReadOnlySpan<byte> nonce,
        ReadOnlySpan<byte> associatedData = default)
    {
        ValidatePayloadKey(payloadKey);
        ValidateNonce(nonce);

        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[AuthenticationTagSize];
        using var aes = new AesGcm(payloadKey.ToArray(), AuthenticationTagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag, associatedData);

        var payload = new byte[ciphertext.Length + tag.Length];
        ciphertext.CopyTo(payload, 0);
        tag.CopyTo(payload, ciphertext.Length);

        var secret = new byte[payloadKey.Length + nonce.Length];
        payloadKey.CopyTo(secret);
        nonce.CopyTo(secret.AsSpan(payloadKey.Length));

        return new XmppOmemoPayloadCipher(
            Convert.ToBase64String(payload),
            Convert.ToBase64String(secret),
            Convert.ToBase64String(nonce));
    }

    public static byte[] Decrypt(
        XmppOmemoPayloadCipher cipher,
        ReadOnlySpan<byte> associatedData = default)
    {
        ArgumentNullException.ThrowIfNull(cipher);
        return Decrypt(
            Convert.FromBase64String(cipher.Payload),
            Convert.FromBase64String(cipher.PayloadSecret),
            associatedData);
    }

    public static byte[] Decrypt(
        ReadOnlySpan<byte> payload,
        ReadOnlySpan<byte> payloadSecret,
        ReadOnlySpan<byte> associatedData = default)
    {
        if (payload.Length < AuthenticationTagSize)
        {
            throw new ArgumentException("The OMEMO payload is shorter than the authentication tag.", nameof(payload));
        }

        if (payloadSecret.Length != PayloadKeySize + NonceSize)
        {
            throw new ArgumentException("The OMEMO payload secret must contain the payload key followed by nonce.", nameof(payloadSecret));
        }

        var payloadKey = payloadSecret[..PayloadKeySize];
        var nonce = payloadSecret.Slice(PayloadKeySize, NonceSize);
        var ciphertext = payload[..^AuthenticationTagSize];
        var tag = payload[^AuthenticationTagSize..];
        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(payloadKey.ToArray(), AuthenticationTagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext, associatedData);
        return plaintext;
    }

    public static string DecryptToString(
        XmppOmemoPayloadCipher cipher,
        Encoding? encoding = null,
        ReadOnlySpan<byte> associatedData = default)
    {
        return (encoding ?? Encoding.UTF8).GetString(Decrypt(cipher, associatedData));
    }

    private static void ValidatePayloadKey(ReadOnlySpan<byte> payloadKey)
    {
        if (payloadKey.Length != PayloadKeySize)
        {
            throw new ArgumentException($"The OMEMO payload key must be {PayloadKeySize} bytes.", nameof(payloadKey));
        }
    }

    private static void ValidateNonce(ReadOnlySpan<byte> nonce)
    {
        if (nonce.Length != NonceSize)
        {
            throw new ArgumentException($"The OMEMO payload nonce must be {NonceSize} bytes.", nameof(nonce));
        }
    }
}

public sealed record XmppOmemoPayloadCipher(
    string Payload,
    string PayloadSecret,
    string Nonce);
