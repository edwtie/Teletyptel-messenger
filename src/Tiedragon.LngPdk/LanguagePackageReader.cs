using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SharpCompress.Archives;

namespace Tiedragon.LngPdk;

public static class LanguagePackageReader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static IReadOnlyList<LanguagePackageInfo> ListInstalled(string baseDirectory)
    {
        var root = Path.Combine(baseDirectory, "LanguagePackages");
        if (!Directory.Exists(root))
        {
            return [];
        }

        var packages = new List<LanguagePackageInfo>();
        foreach (var path in Directory.GetFiles(root, "*.lngpdk"))
        {
            if (TryReadPackageInfo(path, out var package))
            {
                packages.Add(package);
            }
        }

        foreach (var directory in Directory.GetDirectories(root))
        {
            var manifestPath = Path.Combine(directory, "manifest.json");
            if (!File.Exists(manifestPath))
            {
                continue;
            }

            var manifest = JsonSerializer.Deserialize<LanguagePackageManifest>(
                File.ReadAllText(manifestPath, Encoding.UTF8),
                JsonOptions);
            if (manifest is not null && File.Exists(Path.Combine(directory, "language", manifest.LanguageCode + ".lng")))
            {
                packages.Add(new LanguagePackageInfo(manifest, directory, IsArchive: false));
            }
        }

        return packages
            .OrderBy(package => package.Manifest.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(package => package.Manifest.PackageKey, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static bool TryReadLanguage(string baseDirectory, string languageCode, out string text)
    {
        text = "";

        foreach (var package in ListInstalled(baseDirectory))
        {
            if (!package.Manifest.LanguageCode.Equals(languageCode, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return package.IsArchive
                ? TryReadArchiveEntry(package.PackagePath, "language/" + package.Manifest.LanguageCode + ".lng", out text)
                : TryReadDirectoryEntry(package.PackagePath, "language/" + package.Manifest.LanguageCode + ".lng", out text);
        }

        return false;
    }

    public static bool TryReadPackageInfo(string packagePath, out LanguagePackageInfo package)
    {
        package = null!;

        try
        {
            if (!TryReadArchiveEntry(packagePath, "manifest.json", out var manifestText))
            {
                return false;
            }

            var manifest = JsonSerializer.Deserialize<LanguagePackageManifest>(manifestText, JsonOptions);
            if (manifest is null || string.IsNullOrWhiteSpace(manifest.LanguageCode))
            {
                return false;
            }

            if (!TryReadArchiveEntry(packagePath, "language/" + manifest.LanguageCode + ".lng", out _))
            {
                return false;
            }

            package = new LanguagePackageInfo(manifest, packagePath, IsArchive: true);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryReadDirectoryEntry(string packageRoot, string entryName, out string text)
    {
        text = "";
        var root = Path.GetFullPath(packageRoot);
        var path = Path.GetFullPath(Path.Combine(root, entryName.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
        {
            return false;
        }

        text = File.ReadAllText(path, Encoding.UTF8);
        return true;
    }

    internal static bool TryReadArchiveEntry(string packagePath, string entryName, out string text)
    {
        text = "";
        using var stream = OpenArchivePayloadStream(packagePath);
        using var archive = ArchiveFactory.OpenArchive(stream);
        var entry = archive.Entries.FirstOrDefault(entry =>
            !entry.IsDirectory &&
            NormalizeEntryName(entry.Key).Equals(entryName, StringComparison.OrdinalIgnoreCase));
        if (entry is null)
        {
            return false;
        }

        using var entryStream = entry.OpenEntryStream();
        using var reader = new StreamReader(entryStream, Encoding.UTF8);
        text = reader.ReadToEnd();
        return true;
    }

    private static Stream OpenArchivePayloadStream(string packagePath)
    {
        var bytes = File.ReadAllBytes(packagePath);
        if (bytes.Length < LanguagePackageConstants.Magic.Length + sizeof(int) + sizeof(int) ||
            !bytes.AsSpan(0, LanguagePackageConstants.Magic.Length).SequenceEqual(LanguagePackageConstants.Magic))
        {
            return new MemoryStream(bytes, writable: false);
        }

        using var memory = new MemoryStream(bytes);
        memory.Position = LanguagePackageConstants.Magic.Length;
        using var reader = new BinaryReader(memory, Encoding.UTF8, leaveOpen: true);
        var format = reader.ReadInt32();
        if (format != LanguagePackageConstants.ContainerFormat)
        {
            throw new InvalidDataException("Unsupported language package container format.");
        }

        var headerLength = reader.ReadInt32();
        if (headerLength <= 0 || headerLength > LanguagePackageConstants.MaxHeaderBytes)
        {
            throw new InvalidDataException("Invalid language package header length.");
        }

        var headerBytes = reader.ReadBytes(headerLength);
        var header = JsonSerializer.Deserialize<LanguagePackageContainerHeader>(
            Encoding.UTF8.GetString(headerBytes),
            JsonOptions) ?? throw new InvalidDataException("Invalid language package header.");
        ValidateHeader(header);

        var payload = reader.ReadBytes((int)(memory.Length - memory.Position));
        if (payload.LongLength > LanguagePackageConstants.MaxPayloadBytes)
        {
            throw new InvalidDataException("Language package payload is too large.");
        }

        if (!string.IsNullOrWhiteSpace(header.PayloadSha256))
        {
            var hash = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
            if (!hash.Equals(header.PayloadSha256.Trim().ToLowerInvariant(), StringComparison.Ordinal))
            {
                throw new InvalidDataException("Language package payload SHA-256 does not match header.");
            }
        }

        return new MemoryStream(payload, writable: false);
    }

    private static void ValidateHeader(LanguagePackageContainerHeader header)
    {
        if (!LanguagePackageConstants.PackageType.Equals(header.PackageType, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Unsupported language package type.");
        }

        if (header.Encrypted)
        {
            throw new InvalidDataException("Encrypted language packages are not supported yet.");
        }
    }

    internal static string NormalizeEntryName(string? value)
    {
        return (value ?? "").Replace('\\', '/').TrimStart('/');
    }
}
