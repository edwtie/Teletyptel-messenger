namespace Tiedragon.XmppMessenger.Core.Xmpp;

public interface IXmppOmemoSessionStore
{
    ValueTask SaveAsync(XmppOmemoStoredSession session, CancellationToken cancellationToken = default);

    ValueTask<XmppOmemoStoredSession?> LoadAsync(
        XmppOmemoSessionKey key,
        CancellationToken cancellationToken = default);

    ValueTask<bool> DeleteAsync(
        XmppOmemoSessionKey key,
        CancellationToken cancellationToken = default);

    ValueTask<IReadOnlyList<XmppOmemoStoredSession>> ListAsync(
        XmppAddress localAccount,
        uint localDeviceId,
        CancellationToken cancellationToken = default);
}

public sealed class XmppOmemoInMemorySessionStore : IXmppOmemoSessionStore
{
    private readonly Dictionary<string, XmppOmemoStoredSession> _sessions = new(StringComparer.Ordinal);

    public ValueTask SaveAsync(XmppOmemoStoredSession session, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ValidateSession(session);
        _sessions[StorageKey(session.Key)] = Clone(session);
        return ValueTask.CompletedTask;
    }

    public ValueTask<XmppOmemoStoredSession?> LoadAsync(
        XmppOmemoSessionKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(key);
        return ValueTask.FromResult(_sessions.TryGetValue(StorageKey(key), out var session)
            ? Clone(session)
            : null);
    }

    public ValueTask<bool> DeleteAsync(
        XmppOmemoSessionKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(key);
        return ValueTask.FromResult(_sessions.Remove(StorageKey(key)));
    }

    public ValueTask<IReadOnlyList<XmppOmemoStoredSession>> ListAsync(
        XmppAddress localAccount,
        uint localDeviceId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(localAccount);
        var sessions = _sessions.Values
            .Where(session => session.Key.LocalDeviceId == localDeviceId
                && string.Equals(session.Key.LocalAccount.Bare, localAccount.Bare, StringComparison.Ordinal))
            .OrderBy(session => session.Key.RemoteAccount.Bare, StringComparer.Ordinal)
            .ThenBy(session => session.Key.RemoteDeviceId)
            .Select(Clone)
            .ToArray();
        return ValueTask.FromResult<IReadOnlyList<XmppOmemoStoredSession>>(sessions);
    }

    private static void ValidateSession(XmppOmemoStoredSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        ArgumentNullException.ThrowIfNull(session.Key);
        ArgumentException.ThrowIfNullOrWhiteSpace(session.RemoteIdentityFingerprint);
        if (session.OpaqueState.Length == 0)
        {
            throw new ArgumentException("The OMEMO session state cannot be empty.", nameof(session));
        }
    }

    private static XmppOmemoStoredSession Clone(XmppOmemoStoredSession session)
    {
        return session with { OpaqueState = session.OpaqueState.ToArray() };
    }

    private static string StorageKey(XmppOmemoSessionKey key)
    {
        return string.Join(
            "|",
            key.LocalAccount.Bare,
            key.LocalDeviceId.ToString(System.Globalization.CultureInfo.InvariantCulture),
            key.RemoteAccount.Bare,
            key.RemoteDeviceId.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
}

public sealed record XmppOmemoSessionKey(
    XmppAddress LocalAccount,
    uint LocalDeviceId,
    XmppAddress RemoteAccount,
    uint RemoteDeviceId);

public sealed record XmppOmemoStoredSession(
    XmppOmemoSessionKey Key,
    string RemoteIdentityFingerprint,
    byte[] OpaqueState,
    DateTimeOffset UpdatedAt);
