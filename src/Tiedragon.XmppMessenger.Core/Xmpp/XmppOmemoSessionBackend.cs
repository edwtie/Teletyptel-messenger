namespace Tiedragon.XmppMessenger.Core.Xmpp;

[Flags]
public enum XmppOmemoBackendCapability
{
    None = 0,
    X3Dh = 1,
    DoubleRatchet = 2,
    PersistentSessionStore = 4,
    SignedPreKeyVerification = 8,
    OneTimePreKeyConsumption = 16
}

public interface IXmppOmemoSessionBackend
{
    string Name { get; }

    bool IsProductionReady { get; }

    XmppOmemoBackendCapability Capabilities { get; }

    Task<XmppOmemoSessionSetupResult> EnsureSessionAsync(
        XmppOmemoSessionSetupRequest request,
        CancellationToken cancellationToken = default);

    Task<XmppOmemoRatchetEncryptResult> EncryptPayloadSecretAsync(
        XmppOmemoRatchetEncryptRequest request,
        CancellationToken cancellationToken = default);

    Task<XmppOmemoRatchetDecryptResult> DecryptPayloadSecretAsync(
        XmppOmemoRatchetDecryptRequest request,
        CancellationToken cancellationToken = default);
}

public static class XmppOmemoProductionGuard
{
    private const XmppOmemoBackendCapability RequiredCapabilities =
        XmppOmemoBackendCapability.X3Dh
        | XmppOmemoBackendCapability.DoubleRatchet
        | XmppOmemoBackendCapability.PersistentSessionStore
        | XmppOmemoBackendCapability.SignedPreKeyVerification
        | XmppOmemoBackendCapability.OneTimePreKeyConsumption;

    public static void RequireProductionBackend(IXmppOmemoSessionBackend backend)
    {
        ArgumentNullException.ThrowIfNull(backend);
        var missing = RequiredCapabilities & ~backend.Capabilities;
        if (!backend.IsProductionReady || missing != XmppOmemoBackendCapability.None)
        {
            throw new InvalidOperationException(
                $"OMEMO requires a reviewed production OMEMO session backend. Backend '{backend.Name}' is missing: {missing}.");
        }
    }
}

public sealed class XmppOmemoUnavailableSessionBackend : IXmppOmemoSessionBackend
{
    public static XmppOmemoUnavailableSessionBackend Instance { get; } = new();

    public string Name => "unavailable";

    public bool IsProductionReady => false;

    public XmppOmemoBackendCapability Capabilities => XmppOmemoBackendCapability.None;

    public Task<XmppOmemoSessionSetupResult> EnsureSessionAsync(
        XmppOmemoSessionSetupRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = request;
        _ = cancellationToken;
        return Task.FromException<XmppOmemoSessionSetupResult>(CreateException());
    }

    public Task<XmppOmemoRatchetEncryptResult> EncryptPayloadSecretAsync(
        XmppOmemoRatchetEncryptRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = request;
        _ = cancellationToken;
        return Task.FromException<XmppOmemoRatchetEncryptResult>(CreateException());
    }

    public Task<XmppOmemoRatchetDecryptResult> DecryptPayloadSecretAsync(
        XmppOmemoRatchetDecryptRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = request;
        _ = cancellationToken;
        return Task.FromException<XmppOmemoRatchetDecryptResult>(CreateException());
    }

    private static NotSupportedException CreateException()
    {
        return new NotSupportedException(
            "Production OMEMO needs a reviewed backend for X3DH, Double Ratchet sessions, signed pre-key verification and one-time pre-key consumption.");
    }
}

public sealed record XmppOmemoSessionSetupRequest(
    XmppAddress LocalAccount,
    uint LocalDeviceId,
    XmppAddress RemoteAccount,
    uint RemoteDeviceId,
    XmppOmemoBundle RemoteBundle,
    XmppOmemoTrustState TrustState);

public sealed record XmppOmemoSessionSetupResult(
    XmppAddress RemoteAccount,
    uint RemoteDeviceId,
    string RemoteIdentityFingerprint,
    bool UsedPreKey);

public sealed record XmppOmemoRatchetEncryptRequest(
    XmppAddress LocalAccount,
    uint LocalDeviceId,
    XmppAddress RemoteAccount,
    uint RemoteDeviceId,
    byte[] PayloadSecret);

public sealed record XmppOmemoRatchetEncryptResult(
    XmppOmemoKeyTransport KeyTransport);

public sealed record XmppOmemoRatchetDecryptRequest(
    XmppAddress LocalAccount,
    uint LocalDeviceId,
    XmppAddress RemoteAccount,
    uint RemoteDeviceId,
    XmppOmemoKeyTransport KeyTransport);

public sealed record XmppOmemoRatchetDecryptResult(
    byte[] PayloadSecret);
