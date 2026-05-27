namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed record LiveCaptionSegment(
    string Text,
    CaptionState State,
    DateTimeOffset Timestamp,
    SpeakerLabel? Speaker = null,
    string Language = "",
    double? Confidence = null,
    bool IsUncertain = false)
{
    public static LiveCaptionSegment Partial(
        string text,
        SpeakerLabel? speaker = null,
        string language = "",
        double? confidence = null,
        DateTimeOffset? timestamp = null)
    {
        return new LiveCaptionSegment(
            text ?? string.Empty,
            CaptionState.Partial,
            timestamp ?? DateTimeOffset.UtcNow,
            speaker,
            language,
            confidence,
            confidence.HasValue && confidence.Value < 0.65);
    }

    public static LiveCaptionSegment Final(
        string text,
        SpeakerLabel? speaker = null,
        string language = "",
        double? confidence = null,
        DateTimeOffset? timestamp = null)
    {
        return new LiveCaptionSegment(
            text ?? string.Empty,
            CaptionState.Final,
            timestamp ?? DateTimeOffset.UtcNow,
            speaker,
            language,
            confidence,
            confidence.HasValue && confidence.Value < 0.65);
    }
}
