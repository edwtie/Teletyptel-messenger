using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppEntityCapabilities(
    string Node,
    string Verification,
    string HashAlgorithm = XmppEntityCapabilities.Sha1HashAlgorithm)
{
    public const string NamespaceName = "http://jabber.org/protocol/caps";
    public const string Sha1HashAlgorithm = "sha-1";

    public XElement ToXml()
    {
        return new XElement(
            XName.Get("c", NamespaceName),
            new XAttribute("hash", HashAlgorithm),
            new XAttribute("node", Node),
            new XAttribute("ver", Verification));
    }

    public static XmppEntityCapabilities FromDiscoInfo(string node, XmppServiceDiscoveryInfo info)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(node);
        ArgumentNullException.ThrowIfNull(info);

        return new XmppEntityCapabilities(
            Node: node,
            Verification: CreateVerificationHash(info));
    }

    public static bool TryParse(XElement element, out XmppEntityCapabilities? capabilities)
    {
        capabilities = null;

        if (element.Name != XName.Get("c", NamespaceName))
        {
            return false;
        }

        var node = (string?)element.Attribute("node");
        var verification = (string?)element.Attribute("ver");
        var hash = (string?)element.Attribute("hash") ?? Sha1HashAlgorithm;
        if (string.IsNullOrWhiteSpace(node) || string.IsNullOrWhiteSpace(verification))
        {
            return false;
        }

        capabilities = new XmppEntityCapabilities(node, verification, hash);
        return true;
    }

    public static string CreateVerificationHash(XmppServiceDiscoveryInfo info)
    {
        var verificationString = CreateVerificationString(info);
        var bytes = SHA1.HashData(Encoding.UTF8.GetBytes(verificationString));
        return Convert.ToBase64String(bytes);
    }

    public static string CreateVerificationString(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);

        var builder = new StringBuilder();

        foreach (var identity in info.Identities.OrderBy(IdentitySortKey, StringComparer.Ordinal))
        {
            builder
                .Append(identity.Category).Append('/')
                .Append(identity.Type).Append('/')
                .Append(identity.Language ?? string.Empty).Append('/')
                .Append(identity.Name ?? string.Empty).Append('<');
        }

        foreach (var feature in info.Features.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            builder.Append(feature).Append('<');
        }

        return builder.ToString();
    }

    private static string IdentitySortKey(XmppServiceIdentity identity)
    {
        return string.Join(
            '/',
            identity.Category,
            identity.Type,
            identity.Language ?? string.Empty,
            identity.Name ?? string.Empty);
    }
}

