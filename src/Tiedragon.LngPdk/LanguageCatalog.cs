namespace Tiedragon.LngPdk;

public sealed class LanguageCatalog
{
    private readonly Dictionary<string, string> _values;

    private LanguageCatalog(Dictionary<string, string> values)
    {
        _values = values;
    }

    public string this[string key] => Get(key);

    public static LanguageCatalog FromText(string text)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var rawLine in (text ?? string.Empty).Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = line[..separatorIndex].Trim();
            var value = line[(separatorIndex + 1)..].Trim();
            if (key.Length > 0)
            {
                values[key] = value;
            }
        }

        return new LanguageCatalog(values);
    }

    public static LanguageCatalog Load(string languageCode, string? baseDirectory = null)
    {
        baseDirectory ??= AppContext.BaseDirectory;
        if (LanguagePackageReader.TryReadLanguage(baseDirectory, languageCode, out var packageText))
        {
            return FromText(packageText);
        }

        var path = Path.Combine(baseDirectory, "lang", $"{languageCode}.lng");
        if (File.Exists(path))
        {
            return FromText(File.ReadAllText(path));
        }

        if (!languageCode.Equals("eng", StringComparison.OrdinalIgnoreCase) &&
            LanguagePackageReader.TryReadLanguage(baseDirectory, "eng", out var fallbackPackageText))
        {
            return FromText(fallbackPackageText);
        }

        var fallbackPath = Path.Combine(baseDirectory, "lang", "eng.lng");
        if (File.Exists(fallbackPath))
        {
            return FromText(File.ReadAllText(fallbackPath));
        }

        var legacyFallbackPath = Path.Combine(baseDirectory, "lang", "en.lng");
        if (File.Exists(legacyFallbackPath))
        {
            return FromText(File.ReadAllText(legacyFallbackPath));
        }

        return FromText(string.Empty);
    }

    public string Get(string key, string? fallback = null)
    {
        return _values.TryGetValue(key, out var value) ? value : fallback ?? key;
    }
}
