namespace Tiedragon.XmppMessenger.Core.Accessibility;

public interface IAccessibilityInputSource
{
    string SourceId { get; }

    AccessibilityInputKind Kind { get; }

    IAsyncEnumerable<AccessibilityInputEvent> ReadEventsAsync(CancellationToken cancellationToken = default);
}
