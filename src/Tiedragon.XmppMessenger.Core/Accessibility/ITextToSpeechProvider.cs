namespace Tiedragon.XmppMessenger.Core.Accessibility;

public interface ITextToSpeechProvider
{
    string ProviderName { get; }

    Task<byte[]> SynthesizeAsync(
        string text,
        string language,
        TranscriptPrivacySettings privacy,
        CancellationToken cancellationToken = default);
}
