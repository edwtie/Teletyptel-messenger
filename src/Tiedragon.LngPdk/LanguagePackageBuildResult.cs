namespace Tiedragon.LngPdk;

public sealed record LanguagePackageBuildResult(
    string OutputPath,
    string PackageKey,
    string LanguageCode,
    int EntryCount,
    string PackageSha256,
    string PayloadSha256);
