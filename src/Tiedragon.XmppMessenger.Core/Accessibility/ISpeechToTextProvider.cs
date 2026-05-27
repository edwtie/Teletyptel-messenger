namespace Tiedragon.XmppMessenger.Core.Accessibility;

public interface ISpeechToTextProvider
{
    string ProviderName { get; }

    IAsyncEnumerable<LiveCaptionSegment> TranscribeAsync(
        IAsyncEnumerable<AccessibilityInputEvent> audioEvents,
        TranscriptPrivacySettings privacy,
        CancellationToken cancellationToken = default);
}
