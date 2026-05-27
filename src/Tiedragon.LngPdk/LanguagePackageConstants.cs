using System.Text;

namespace Tiedragon.LngPdk;

internal static class LanguagePackageConstants
{
    public const int ContainerFormat = 1;
    public const int MaxHeaderBytes = 64 * 1024;
    public const long MaxEntryBytes = 16L * 1024 * 1024;
    public const long MaxPayloadBytes = 192L * 1024 * 1024;
    public const string PackageType = "language";
    public const string PayloadFormat = "zip";
    public static readonly byte[] Magic = Encoding.ASCII.GetBytes("SYSCALC-LNGPDK");
}
