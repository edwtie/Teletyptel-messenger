namespace Tiedragon.XmppMessenger.Core.Accessibility;

public interface IExternalMicrophoneKitProvider : IAccessibilityInputSource
{
    IReadOnlyList<SpeakerLabel> Speakers { get; }
}
