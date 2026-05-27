using Tiedragon.LngPdk;

if (args.Length == 0)
{
    return Usage();
}

try
{
    return args[0].ToLowerInvariant() switch
    {
        "compile" when args.Length == 3 => Compile(args[1], args[2]),
        "inspect" when args.Length == 2 => Inspect(args[1]),
        _ => Usage()
    };
}
catch (Exception ex)
{
    Console.Error.WriteLine("error: " + ex.Message);
    return 1;
}

static int Compile(string inputFolder, string outputPath)
{
    var result = LanguagePackageCompiler.CompileFolder(inputFolder, outputPath);
    Console.WriteLine("created: " + result.OutputPath);
    Console.WriteLine("key: " + result.PackageKey);
    Console.WriteLine("language: " + result.LanguageCode);
    Console.WriteLine("entries: " + result.EntryCount);
    Console.WriteLine("packageSha256: " + result.PackageSha256);
    Console.WriteLine("payloadSha256: " + result.PayloadSha256);
    return 0;
}

static int Inspect(string packagePath)
{
    if (!LanguagePackageReader.TryReadPackageInfo(packagePath, out var package))
    {
        Console.Error.WriteLine("error: invalid language package.");
        return 1;
    }

    Console.WriteLine("file: " + package.PackagePath);
    Console.WriteLine("key: " + package.Manifest.PackageKey);
    Console.WriteLine("softwareId: " + package.Manifest.SoftwareId);
    Console.WriteLine("language: " + package.Manifest.LanguageCode);
    Console.WriteLine("displayName: " + package.Manifest.DisplayName);
    return 0;
}

static int Usage()
{
    Console.WriteLine("Tiedragon.LngPdk.Tool");
    Console.WriteLine("Commands:");
    Console.WriteLine("  compile <input-folder> <output.lngpdk>");
    Console.WriteLine("  inspect <package.lngpdk>");
    return 2;
}
