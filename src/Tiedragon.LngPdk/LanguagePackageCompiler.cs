using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Tiedragon.LngPdk;

public static class LanguagePackageCompiler
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public static LanguagePackageBuildResult CompileFolder(string inputFolder, string outputPath)
    {
        inputFolder = Path.GetFullPath(inputFolder);
        outputPath = Path.GetFullPath(outputPath);

        var manifestPath = Path.Combine(inputFolder, "manifest.json");
        if (!File.Exists(manifestPath))
        {
            throw new FileNotFoundException("manifest.json is required.", manifestPath);
        }

        var manifest = JsonSerializer.Deserialize<LanguagePackageManifest>(
            File.ReadAllText(manifestPath, Encoding.UTF8),
            JsonOptions) ?? throw new InvalidDataException("manifest.json is invalid.");
        ValidateManifest(inputFolder, manifest);

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        var payload = BuildPayloadZip(inputFolder);
        var payloadSha256 = ComputeSha256(payload);
        var header = new LanguagePackageContainerHeader
        {
            SoftwareId = manifest.SoftwareId,
            PackageType = LanguagePackageConstants.PackageType,
            PayloadFormat = LanguagePackageConstants.PayloadFormat,
            PayloadSha256 = payloadSha256,
            Encrypted = false,
            Signed = false
        };

        WriteWrappedPackage(outputPath, header, payload);

        return new LanguagePackageBuildResult(
            OutputPath: outputPath,
            PackageKey: manifest.PackageKey,
            LanguageCode: manifest.LanguageCode,
            EntryCount: Directory.GetFiles(inputFolder, "*", SearchOption.AllDirectories).Length,
            PackageSha256: ComputeSha256(File.ReadAllBytes(outputPath)),
            PayloadSha256: payloadSha256);
    }

    private static byte[] BuildPayloadZip(string inputFolder)
    {
        using var memory = new MemoryStream();
        using (var archive = new ZipArchive(memory, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var file in Directory.GetFiles(inputFolder, "*", SearchOption.AllDirectories).Order(StringComparer.OrdinalIgnoreCase))
            {
                var relative = Path.GetRelativePath(inputFolder, file).Replace('\\', '/');
                ValidateEntryName(relative);
                var bytes = File.ReadAllBytes(file);
                if (bytes.LongLength > LanguagePackageConstants.MaxEntryBytes)
                {
                    throw new InvalidDataException("Language package entry is too large: " + relative);
                }

                var entry = archive.CreateEntry(relative, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                entryStream.Write(bytes);
            }
        }

        return memory.ToArray();
    }

    private static void WriteWrappedPackage(string outputPath, LanguagePackageContainerHeader header, byte[] payload)
    {
        var headerBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(header, JsonOptions));
        if (headerBytes.Length > LanguagePackageConstants.MaxHeaderBytes)
        {
            throw new InvalidDataException("Language package header is too large.");
        }

        if (payload.LongLength > LanguagePackageConstants.MaxPayloadBytes)
        {
            throw new InvalidDataException("Language package payload is too large.");
        }

        using var output = File.Create(outputPath);
        output.Write(LanguagePackageConstants.Magic);
        using var writer = new BinaryWriter(output, Encoding.UTF8, leaveOpen: true);
        writer.Write(LanguagePackageConstants.ContainerFormat);
        writer.Write(headerBytes.Length);
        writer.Write(headerBytes);
        writer.Write(payload);
    }

    private static void ValidateManifest(string inputFolder, LanguagePackageManifest manifest)
    {
        if (manifest.Format != 1)
        {
            throw new InvalidDataException("Manifest format is unsupported.");
        }

        if (!IsSafeKey(manifest.PackageKey))
        {
            throw new InvalidDataException("Manifest package key is invalid.");
        }

        if (!IsSafeKey(manifest.SoftwareId))
        {
            throw new InvalidDataException("Manifest softwareId is invalid.");
        }

        if (!IsSafeLanguageCode(manifest.LanguageCode))
        {
            throw new InvalidDataException("Manifest languageCode is invalid.");
        }

        if (string.IsNullOrWhiteSpace(manifest.DisplayName))
        {
            throw new InvalidDataException("Manifest displayName is required.");
        }

        if (!File.Exists(Path.Combine(inputFolder, "language", manifest.LanguageCode + ".lng")))
        {
            throw new InvalidDataException($"language/{manifest.LanguageCode}.lng is required.");
        }
    }

    private static void ValidateEntryName(string entryName)
    {
        var normalized = LanguagePackageReader.NormalizeEntryName(entryName);
        if (normalized.Length == 0 || Path.IsPathRooted(normalized) || normalized.Split('/').Any(part => part == ".."))
        {
            throw new InvalidDataException("Unsafe language package entry: " + entryName);
        }

        var extension = Path.GetExtension(normalized);
        if (!extension.Equals(".json", StringComparison.OrdinalIgnoreCase) &&
            !extension.Equals(".lng", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Unsupported language package entry: " + entryName);
        }
    }

    private static bool IsSafeKey(string value)
    {
        return value.Length is > 0 and <= 96 &&
            value.All(character => char.IsLetterOrDigit(character) || character is '.' or '-' or '_' or ':');
    }

    private static bool IsSafeLanguageCode(string value)
    {
        return value.Length is >= 2 and <= 12 &&
            value.All(character => char.IsLetterOrDigit(character) || character is '-' or '_');
    }

    private static string ComputeSha256(byte[] bytes)
    {
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
