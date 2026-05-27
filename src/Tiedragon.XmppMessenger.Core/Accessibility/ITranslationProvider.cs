namespace Tiedragon.XmppMessenger.Core.Accessibility;

public interface ITranslationProvider
{
    string ProviderName { get; }

    Task<string> TranslateAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        TranscriptPrivacySettings privacy,
        CancellationToken cancellationToken = default);
}
