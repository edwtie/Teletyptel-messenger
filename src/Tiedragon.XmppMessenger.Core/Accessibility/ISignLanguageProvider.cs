namespace Tiedragon.XmppMessenger.Core.Accessibility;

public interface ISignLanguageProvider
{
    string ProviderName { get; }

    IAsyncEnumerable<LiveCaptionSegment> RecognizeAsync(
        IAsyncEnumerable<AccessibilityInputEvent> videoEvents,
        CancellationToken cancellationToken = default);
}
