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
        MergeText(values, text, overwrite: true);
        return new LanguageCatalog(values);
    }

    private static void MergeText(Dictionary<string, string> values, string? text, bool overwrite)
    {
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
            if (key.Length > 0 && (overwrite || !values.ContainsKey(key)))
            {
                values[key] = value;
            }
        }
    }

    public static LanguageCatalog Load(string languageCode, string? baseDirectory = null)
    {
        baseDirectory ??= AppContext.BaseDirectory;
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (!languageCode.Equals("eng", StringComparison.OrdinalIgnoreCase) &&
            LanguagePackageReader.TryReadLanguage(baseDirectory, "eng", out var fallbackPackageText))
        {
            MergeText(values, fallbackPackageText, overwrite: false);
        }

        var fallbackPath = Path.Combine(baseDirectory, "lang", "eng.lng");
        if (!languageCode.Equals("eng", StringComparison.OrdinalIgnoreCase) && File.Exists(fallbackPath))
        {
            MergeText(values, File.ReadAllText(fallbackPath), overwrite: false);
        }

        var legacyFallbackPath = Path.Combine(baseDirectory, "lang", "en.lng");
        if (!languageCode.Equals("eng", StringComparison.OrdinalIgnoreCase) && File.Exists(legacyFallbackPath))
        {
            MergeText(values, File.ReadAllText(legacyFallbackPath), overwrite: false);
        }

        if (LanguagePackageReader.TryReadLanguage(baseDirectory, languageCode, out var packageText))
        {
            MergeText(values, packageText, overwrite: true);
        }

        var path = Path.Combine(baseDirectory, "lang", $"{languageCode}.lng");
        if (File.Exists(path))
        {
            MergeText(values, File.ReadAllText(path), overwrite: true);
        }

        if (values.Count == 0 && File.Exists(fallbackPath))
        {
            MergeText(values, File.ReadAllText(fallbackPath), overwrite: true);
        }

        if (values.Count == 0 && File.Exists(legacyFallbackPath))
        {
            MergeText(values, File.ReadAllText(legacyFallbackPath), overwrite: true);
        }

        return new LanguageCatalog(values);
    }

    public string Get(string key, string? fallback = null)
    {
        return _values.TryGetValue(key, out var value) ? value : fallback ?? key;
    }
}
