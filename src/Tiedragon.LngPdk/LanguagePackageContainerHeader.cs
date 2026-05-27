namespace Tiedragon.LngPdk;

internal sealed class LanguagePackageContainerHeader
{
    public string SoftwareId { get; set; } = "";
    public string PackageType { get; set; } = "";
    public string PayloadFormat { get; set; } = "";
    public string PayloadSha256 { get; set; } = "";
    public bool Encrypted { get; set; }
    public bool Signed { get; set; }
    public string SignatureAlgorithm { get; set; } = "";
    public string SignatureKeyId { get; set; } = "";
    public string Signature { get; set; } = "";
}
