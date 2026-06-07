namespace Tiedragon.XmppMessenger.Core.Xmpp;

public interface IXmppOmemoSignedPreKeyVerifier
{
    string Name { get; }

    bool IsAudited { get; }

    XmppOmemoSignedPreKeyVerification Verify(XmppOmemoSignedPreKeyVerificationRequest request);
}

public sealed class XmppOmemoUnavailableSignedPreKeyVerifier : IXmppOmemoSignedPreKeyVerifier
{
    public static XmppOmemoUnavailableSignedPreKeyVerifier Instance { get; } = new();

    public string Name => "unavailable";

    public bool IsAudited => false;

    public XmppOmemoSignedPreKeyVerification Verify(XmppOmemoSignedPreKeyVerificationRequest request)
    {
        _ = request;
        return XmppOmemoSignedPreKeyVerification.Failed(
            "Signed pre-key verification requires a reviewed XEdDSA verifier.");
    }
}

public sealed record XmppOmemoSignedPreKeyVerificationRequest(
    XmppAddress Owner,
    string IdentityKey,
    uint SignedPreKeyId,
    string SignedPreKeyPublic,
    string SignedPreKeySignature);

public sealed record XmppOmemoSignedPreKeyVerification(
    bool IsVerified,
    bool UsedAuditedVerifier,
    string VerifierName,
    string? FailureReason = null)
{
    public static XmppOmemoSignedPreKeyVerification Verified(string verifierName, bool usedAuditedVerifier = true)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(verifierName);
        return new XmppOmemoSignedPreKeyVerification(true, usedAuditedVerifier, verifierName);
    }

    public static XmppOmemoSignedPreKeyVerification Failed(string reason, string verifierName = "unavailable")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        return new XmppOmemoSignedPreKeyVerification(false, false, verifierName, reason);
    }
}
