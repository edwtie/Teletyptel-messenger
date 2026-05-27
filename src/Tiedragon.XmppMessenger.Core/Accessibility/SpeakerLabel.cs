namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed record SpeakerLabel(
    string Id,
    string DisplayName,
    string? DeviceId = null,
    double? Confidence = null)
{
    public static SpeakerLabel Unknown(string id = "unknown")
    {
        return new SpeakerLabel(id, "Unknown");
    }
}
