namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed record TranscriptPrivacySettings(
    bool AllowCloudProcessing = false,
    bool SaveAudio = false,
    bool SaveVideo = false,
    bool SaveTranscript = false,
    TimeSpan? Retention = null)
{
    public static TranscriptPrivacySettings PrivateDefault { get; } = new();
}
