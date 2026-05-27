using System.Text.Json;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppAlternativeConnectionDiscovery
{
    public const string HostMetaPath = "/.well-known/host-meta";
    public const string HostMetaJsonPath = "/.well-known/host-meta.json";
    public const string WebSocketRelation = "urn:xmpp:alt-connections:websocket";
    public const string BoshRelation = "urn:xmpp:alt-connections:xbosh";

    private static readonly XNamespace XrdNamespace = "http://docs.oasis-open.org/ns/xri/xrd-1.0";

    public static Uri CreateHostMetaUri(string domain, bool json = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(domain);
        var path = json ? HostMetaJsonPath : HostMetaPath;
        return new UriBuilder(Uri.UriSchemeHttps, domain)
        {
            Path = path
        }.Uri;
    }

    public static IReadOnlyList<XmppAlternativeConnectionMethod> ParseXmlHostMeta(string xml)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(xml);

        var document = XDocument.Parse(xml);
        return document
            .Descendants(XrdNamespace + "Link")
            .Select(ParseXmlLink)
            .Where(method => method is not null)
            .Cast<XmppAlternativeConnectionMethod>()
            .ToArray();
    }

    public static IReadOnlyList<XmppAlternativeConnectionMethod> ParseJsonHostMeta(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);

        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("links", out var links)
            || links.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var methods = new List<XmppAlternativeConnectionMethod>();
        foreach (var link in links.EnumerateArray())
        {
            if (!link.TryGetProperty("rel", out var relElement)
                || !link.TryGetProperty("href", out var hrefElement)
                || relElement.ValueKind != JsonValueKind.String
                || hrefElement.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var rel = relElement.GetString();
            var href = hrefElement.GetString();
            if (TryCreateMethod(rel, href, out var method) && method is not null)
            {
                methods.Add(method);
            }
        }

        return methods;
    }

    public static IReadOnlyList<Uri> WebSocketUris(IEnumerable<XmppAlternativeConnectionMethod> methods)
    {
        ArgumentNullException.ThrowIfNull(methods);
        return methods
            .Where(method => method.Relation == WebSocketRelation)
            .Select(method => method.Uri)
            .ToArray();
    }

    private static XmppAlternativeConnectionMethod? ParseXmlLink(XElement link)
    {
        var rel = (string?)link.Attribute("rel");
        var href = (string?)link.Attribute("href");
        return TryCreateMethod(rel, href, out var method) ? method : null;
    }

    private static bool TryCreateMethod(
        string? relation,
        string? href,
        out XmppAlternativeConnectionMethod? method)
    {
        method = null;
        if (string.IsNullOrWhiteSpace(relation)
            || string.IsNullOrWhiteSpace(href)
            || (relation != WebSocketRelation && relation != BoshRelation)
            || !Uri.TryCreate(href, UriKind.Absolute, out var uri))
        {
            return false;
        }

        method = new XmppAlternativeConnectionMethod(relation, uri);
        return true;
    }
}

public sealed record XmppAlternativeConnectionMethod(
    string Relation,
    Uri Uri);
