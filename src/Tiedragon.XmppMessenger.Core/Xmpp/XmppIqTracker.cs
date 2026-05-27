namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppIqTracker
{
    private int _nextId;
    private readonly Dictionary<string, TaskCompletionSource<XmppIq>> _pending = new(StringComparer.Ordinal);

    public string CreateId(string prefix = "iq")
    {
        if (string.IsNullOrWhiteSpace(prefix))
        {
            prefix = "iq";
        }

        return $"{prefix}-{Interlocked.Increment(ref _nextId)}";
    }

    public Task<XmppIq> Track(string id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            throw new ArgumentException("IQ id is required.", nameof(id));
        }

        var source = new TaskCompletionSource<XmppIq>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_pending)
        {
            if (!_pending.TryAdd(id, source))
            {
                throw new InvalidOperationException($"IQ id '{id}' is already pending.");
            }
        }

        if (cancellationToken.CanBeCanceled)
        {
            cancellationToken.Register(() => Fail(id, new XmppProtocolException(
                XmppProtocolErrorKind.Timeout,
                $"IQ request '{id}' timed out or was cancelled.")));
        }

        return source.Task;
    }

    public bool TryComplete(XmppIq iq)
    {
        ArgumentNullException.ThrowIfNull(iq);

        TaskCompletionSource<XmppIq>? source;
        lock (_pending)
        {
            if (!_pending.Remove(iq.Id, out source))
            {
                return false;
            }
        }

        if (iq.Type == XmppIqType.Error)
        {
            source.SetException(new XmppProtocolException(
                XmppProtocolErrorKind.IqError,
                $"IQ request '{iq.Id}' returned an error.",
                iq.Payload));
        }
        else
        {
            source.SetResult(iq);
        }

        return true;
    }

    public bool Fail(string id, Exception exception)
    {
        TaskCompletionSource<XmppIq>? source;
        lock (_pending)
        {
            if (!_pending.Remove(id, out source))
            {
                return false;
            }
        }

        source.SetException(exception);
        return true;
    }
}
