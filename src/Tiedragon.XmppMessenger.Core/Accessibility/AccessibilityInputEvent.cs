namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed record AccessibilityInputEvent(
    AccessibilityInputKind Kind,
    DateTimeOffset Timestamp,
    string SourceId,
    string? Text = null,
    byte[]? Payload = null,
    string? ContentType = null,
    SpeakerLabel? Speaker = null)
{
    public static AccessibilityInputEvent FromText(
        AccessibilityInputKind kind,
        string sourceId,
        string text,
        SpeakerLabel? speaker = null,
        DateTimeOffset? timestamp = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceId);

        return new AccessibilityInputEvent(
            kind,
            timestamp ?? DateTimeOffset.UtcNow,
            sourceId,
            text ?? string.Empty,
            Speaker: speaker);
    }

    public static AccessibilityInputEvent FromPayload(
        AccessibilityInputKind kind,
        string sourceId,
        byte[] payload,
        string contentType,
        SpeakerLabel? speaker = null,
        DateTimeOffset? timestamp = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceId);
        ArgumentNullException.ThrowIfNull(payload);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentType);

        return new AccessibilityInputEvent(
            kind,
            timestamp ?? DateTimeOffset.UtcNow,
            sourceId,
            Payload: payload,
            ContentType: contentType,
            Speaker: speaker);
    }
}
