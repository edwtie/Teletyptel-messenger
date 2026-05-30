using Org.BouncyCastle.Math.EC.Rfc7748;
using Org.BouncyCastle.Security;
using System.Security.Cryptography;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppOmemoX3DhAgreement
{
    public const int X25519KeySize = 32;

    public static XmppOmemoX25519KeyPair GenerateIdentityKeyPair()
    {
        return GenerateKeyPair(XmppOmemoX25519KeyUse.Identity);
    }

    public static XmppOmemoX25519KeyPair GenerateEphemeralKeyPair()
    {
        return GenerateKeyPair(XmppOmemoX25519KeyUse.Ephemeral);
    }

    public static XmppOmemoX25519KeyPair GenerateSignedPreKeyPair()
    {
        return GenerateKeyPair(XmppOmemoX25519KeyUse.SignedPreKey);
    }

    public static XmppOmemoX25519KeyPair GenerateOneTimePreKeyPair(uint preKeyId)
    {
        return GenerateKeyPair(XmppOmemoX25519KeyUse.OneTimePreKey, preKeyId);
    }

    public static XmppOmemoX25519KeyPair GenerateKeyPair(
        XmppOmemoX25519KeyUse keyUse,
        uint? preKeyId = null,
        SecureRandom? random = null)
    {
        var privateKey = new byte[X25519KeySize];
        X25519.GeneratePrivateKey(random ?? new SecureRandom(), privateKey);
        var publicKey = new byte[X25519KeySize];
        X25519.GeneratePublicKey(privateKey, 0, publicKey, 0);
        return new XmppOmemoX25519KeyPair(
            Convert.ToBase64String(publicKey),
            Convert.ToBase64String(privateKey),
            keyUse,
            preKeyId);
    }

    public static XmppOmemoX3DhAgreementResult InitiatorAgree(XmppOmemoX3DhInitiatorAgreementRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var bundleValidation = XmppOmemoX3Dh.ValidateBundle(request.RemoteBundle);
        if (!bundleValidation.IsUsable)
        {
            throw new InvalidOperationException("The remote OMEMO bundle is not usable: " + string.Join("; ", bundleValidation.Issues));
        }

        var signedPreKeyVerification = VerifySignedPreKeyIfRequired(request);
        var identityPrivate = DecodePrivateKey(request.LocalIdentityKeyPair, XmppOmemoX25519KeyUse.Identity);
        var identityPublic = DecodePublicKey(request.LocalIdentityKeyPair);
        var ephemeralPrivate = DecodePrivateKey(request.LocalEphemeralKeyPair, XmppOmemoX25519KeyUse.Ephemeral);
        var remoteIdentityPublic = DecodePublicKey(request.RemoteBundle.IdentityKey, "remote identityKey");
        var remoteSignedPreKeyPublic = DecodePublicKey(request.RemoteBundle.SignedPreKeyPublic, "remote signedPreKeyPublic");
        var selectedPreKey = SelectPreKey(request.RemoteBundle, request.RemoteOneTimePreKeyId);
        var remoteOneTimePreKeyPublic = selectedPreKey is null
            ? null
            : DecodePublicKey(selectedPreKey.PublicKey, $"remote preKeyPublic {selectedPreKey.Id}");

        var dhOutputs = new List<byte[]>
        {
            CalculateAgreement(identityPrivate, remoteSignedPreKeyPublic),
            CalculateAgreement(ephemeralPrivate, remoteIdentityPublic),
            CalculateAgreement(ephemeralPrivate, remoteSignedPreKeyPublic)
        };
        if (remoteOneTimePreKeyPublic is not null)
        {
            dhOutputs.Add(CalculateAgreement(ephemeralPrivate, remoteOneTimePreKeyPublic));
        }

        var parameters = request.Parameters ?? XmppOmemoX3DhParameters.Default;
        var sharedSecret = XmppOmemoX3Dh.DeriveSharedSecret(dhOutputs, parameters);
        var associatedData = XmppOmemoX3Dh.CreateAssociatedData(
            Convert.ToBase64String(identityPublic),
            request.RemoteBundle.IdentityKey,
            request.LocalAccount.Bare,
            request.RemoteAccount.Bare);

        return new XmppOmemoX3DhAgreementResult(
            sharedSecret,
            associatedData,
            selectedPreKey?.Id,
            XmppOmemoX3Dh.CreateDhPlan(selectedPreKey is not null),
            parameters,
            signedPreKeyVerification);
    }

    public static XmppOmemoX3DhAgreementResult ResponderAgree(XmppOmemoX3DhResponderAgreementRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var identityPrivate = DecodePrivateKey(request.LocalIdentityKeyPair, XmppOmemoX25519KeyUse.Identity);
        var identityPublic = DecodePublicKey(request.LocalIdentityKeyPair);
        var signedPreKeyPrivate = DecodePrivateKey(request.LocalSignedPreKeyPair, XmppOmemoX25519KeyUse.SignedPreKey);
        var remoteIdentityPublic = DecodePublicKey(request.RemoteIdentityPublicKey, "remote identity public key");
        var remoteEphemeralPublic = DecodePublicKey(request.RemoteEphemeralPublicKey, "remote ephemeral public key");

        byte[]? oneTimePreKeyPrivate = null;
        if (request.LocalOneTimePreKeyPair is not null)
        {
            if (request.OneTimePreKeyId is not null && request.LocalOneTimePreKeyPair.PreKeyId != request.OneTimePreKeyId)
            {
                throw new InvalidOperationException("The selected one-time pre-key id does not match the local key pair.");
            }

            oneTimePreKeyPrivate = DecodePrivateKey(request.LocalOneTimePreKeyPair, XmppOmemoX25519KeyUse.OneTimePreKey);
        }

        var dhOutputs = new List<byte[]>
        {
            CalculateAgreement(signedPreKeyPrivate, remoteIdentityPublic),
            CalculateAgreement(identityPrivate, remoteEphemeralPublic),
            CalculateAgreement(signedPreKeyPrivate, remoteEphemeralPublic)
        };
        if (oneTimePreKeyPrivate is not null)
        {
            dhOutputs.Add(CalculateAgreement(oneTimePreKeyPrivate, remoteEphemeralPublic));
        }

        var parameters = request.Parameters ?? XmppOmemoX3DhParameters.Default;
        var sharedSecret = XmppOmemoX3Dh.DeriveSharedSecret(dhOutputs, parameters);
        var associatedData = XmppOmemoX3Dh.CreateAssociatedData(
            request.RemoteIdentityPublicKey,
            Convert.ToBase64String(identityPublic),
            request.RemoteAccount.Bare,
            request.LocalAccount.Bare);

        return new XmppOmemoX3DhAgreementResult(
            sharedSecret,
            associatedData,
            request.LocalOneTimePreKeyPair?.PreKeyId,
            XmppOmemoX3Dh.CreateDhPlan(request.LocalOneTimePreKeyPair is not null),
            parameters);
    }

    private static XmppOmemoSignedPreKeyVerification? VerifySignedPreKeyIfRequired(
        XmppOmemoX3DhInitiatorAgreementRequest request)
    {
        if (!request.RequireSignedPreKeyVerification)
        {
            return null;
        }

        var verifier = request.SignedPreKeyVerifier ?? XmppOmemoUnavailableSignedPreKeyVerifier.Instance;
        var verification = verifier.Verify(new XmppOmemoSignedPreKeyVerificationRequest(
            request.RemoteAccount,
            request.RemoteBundle.IdentityKey,
            request.RemoteBundle.SignedPreKeyId,
            request.RemoteBundle.SignedPreKeyPublic,
            request.RemoteBundle.SignedPreKeySignature));

        if (!verification.IsVerified)
        {
            var reason = string.IsNullOrWhiteSpace(verification.FailureReason)
                ? "invalid signed pre-key signature"
                : verification.FailureReason;
            throw new InvalidOperationException(
                $"OMEMO signed pre-key verification failed using {verification.VerifierName}: {reason}");
        }

        if (!verifier.IsAudited || !verification.UsedAuditedVerifier)
        {
            throw new InvalidOperationException(
                $"OMEMO signed pre-key verification requires an audited verifier; {verifier.Name} is not production-ready.");
        }

        return verification;
    }

    private static XmppOmemoPreKey? SelectPreKey(XmppOmemoBundle bundle, uint? requestedPreKeyId)
    {
        if (requestedPreKeyId is null)
        {
            return bundle.PreKeys.OrderBy(preKey => preKey.Id).FirstOrDefault();
        }

        var selected = bundle.PreKeys.FirstOrDefault(preKey => preKey.Id == requestedPreKeyId.Value);
        if (selected is null)
        {
            throw new InvalidOperationException($"The remote OMEMO bundle does not contain one-time pre-key {requestedPreKeyId.Value}.");
        }

        return selected;
    }

    private static byte[] CalculateAgreement(byte[] privateKey, byte[] publicKey)
    {
        var output = new byte[X25519KeySize];
        if (!X25519.CalculateAgreement(privateKey, 0, publicKey, 0, output, 0))
        {
            throw new CryptographicException("X25519 agreement failed.");
        }

        return output;
    }

    private static byte[] DecodePrivateKey(XmppOmemoX25519KeyPair keyPair, XmppOmemoX25519KeyUse expectedUse)
    {
        if (keyPair.KeyUse != expectedUse)
        {
            throw new InvalidOperationException($"Expected {expectedUse} key pair, got {keyPair.KeyUse}.");
        }

        return DecodeX25519Key(keyPair.PrivateKey, $"{expectedUse} private key");
    }

    private static byte[] DecodePublicKey(XmppOmemoX25519KeyPair keyPair)
    {
        return DecodeX25519Key(keyPair.PublicKey, $"{keyPair.KeyUse} public key");
    }

    private static byte[] DecodePublicKey(string value, string name)
    {
        return DecodeX25519Key(value, name);
    }

    private static byte[] DecodeX25519Key(string value, string name)
    {
        byte[] key;
        try
        {
            key = Convert.FromBase64String(value);
        }
        catch (FormatException ex)
        {
            throw new FormatException($"{name} is not valid base64.", ex);
        }

        if (key.Length != X25519KeySize)
        {
            throw new ArgumentException($"{name} must be {X25519KeySize} bytes.", nameof(value));
        }

        return key;
    }
}

public enum XmppOmemoX25519KeyUse
{
    Identity,
    Ephemeral,
    SignedPreKey,
    OneTimePreKey
}

public sealed record XmppOmemoX25519KeyPair(
    string PublicKey,
    string PrivateKey,
    XmppOmemoX25519KeyUse KeyUse,
    uint? PreKeyId = null);

public sealed record XmppOmemoX3DhInitiatorAgreementRequest(
    XmppAddress LocalAccount,
    XmppOmemoX25519KeyPair LocalIdentityKeyPair,
    XmppOmemoX25519KeyPair LocalEphemeralKeyPair,
    XmppAddress RemoteAccount,
    XmppOmemoBundle RemoteBundle,
    uint? RemoteOneTimePreKeyId = null,
    bool RequireSignedPreKeyVerification = false,
    IXmppOmemoSignedPreKeyVerifier? SignedPreKeyVerifier = null,
    XmppOmemoX3DhParameters? Parameters = null);

public sealed record XmppOmemoX3DhResponderAgreementRequest(
    XmppAddress LocalAccount,
    XmppOmemoX25519KeyPair LocalIdentityKeyPair,
    XmppOmemoX25519KeyPair LocalSignedPreKeyPair,
    XmppAddress RemoteAccount,
    string RemoteIdentityPublicKey,
    string RemoteEphemeralPublicKey,
    XmppOmemoX25519KeyPair? LocalOneTimePreKeyPair = null,
    uint? OneTimePreKeyId = null,
    XmppOmemoX3DhParameters? Parameters = null);

public sealed record XmppOmemoX3DhAgreementResult(
    byte[] SharedSecret,
    byte[] AssociatedData,
    uint? OneTimePreKeyId,
    IReadOnlyList<XmppOmemoX3DhDhStep> DhPlan,
    XmppOmemoX3DhParameters Parameters,
    XmppOmemoSignedPreKeyVerification? SignedPreKeyVerification = null);
