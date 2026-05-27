namespace Tiedragon.LngPdk;

public sealed record LanguagePackageInfo(
    LanguagePackageManifest Manifest,
    string PackagePath,
    bool IsArchive);
