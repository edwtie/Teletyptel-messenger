using System.Xml.Linq;
using System.Security.Cryptography;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppStatelessInlineMediaSharing
{
    public const string NamespaceName = "urn:xmpp:sims:1";

    public const string ReferenceNamespaceName = "urn:xmpp:reference:0";

    public static bool SupportsStatelessInlineMediaSharing(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XElement CreateMediaSharingReference(
        XmppJingleFile file,
        IEnumerable<Uri> sources,
        int begin = 0,
        int? end = null)
    {
        ArgumentNullException.ThrowIfNull(file);
        ArgumentNullException.ThrowIfNull(sources);

        var sourceElements = sources
            .Select(source => source ?? throw new ArgumentException("SIMS sources cannot contain null values.", nameof(sources)))
            .Select(source => new XElement(
                XName.Get("reference", ReferenceNamespaceName),
                new XAttribute("type", "data"),
                new XAttribute("uri", source.ToString())))
            .ToArray();
        if (sourceElements.Length == 0)
        {
            throw new ArgumentException("SIMS requires at least one media source.", nameof(sources));
        }

        var reference = new XElement(
            XName.Get("reference", ReferenceNamespaceName),
            new XAttribute("type", "data"),
            new XAttribute("begin", begin),
            new XElement(
                XName.Get("media-sharing", NamespaceName),
                file.ToFileXml(),
                new XElement(XName.Get("sources", NamespaceName), sourceElements)));

        if (end is not null)
        {
            reference.SetAttributeValue("end", end.Value);
        }

        return reference;
    }

    public static XElement CreateHttpUploadMessage(
        XmppAddress to,
        string body,
        XmppHttpUploadCompletion upload,
        string fileName,
        IReadOnlyList<XmppJingleFileHash> hashes,
        string? id = null,
        string? description = null,
        XmppMessageType type = XmppMessageType.Chat)
    {
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);
        ArgumentNullException.ThrowIfNull(upload);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);
        ArgumentNullException.ThrowIfNull(hashes);
        if (hashes.Count == 0)
        {
            throw new ArgumentException("SIMS file metadata should include at least one content hash.", nameof(hashes));
        }

        var file = new XmppJingleFile(
            fileName,
            upload.Size,
            upload.ContentType,
            Description: description,
            Hashes: hashes);
        var message = new XElement(
            XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", to.Full),
            new XAttribute("type", XmppXmlValue.MessageType(type)),
            new XElement(XName.Get("body", XmppXmlNames.ClientNamespace), body),
            CreateMediaSharingReference(file, [upload.GetUrl], 0, body.Length));

        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        return message;
    }

    public static XmppJingleFileHash CreateSha256Hash(ReadOnlySpan<byte> content)
    {
        var hash = SHA256.HashData(content);
        return new XmppJingleFileHash("sha-256", Convert.ToBase64String(hash));
    }

    public static async Task<XmppJingleFileHash> CreateSha256HashAsync(
        Stream content,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        var hash = await SHA256.HashDataAsync(content, cancellationToken).ConfigureAwait(false);
        return new XmppJingleFileHash("sha-256", Convert.ToBase64String(hash));
    }

    public static bool TryParse(
        XElement message,
        out XmppStatelessInlineMedia? media)
    {
        media = null;
        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        var reference = message.Elements(XName.Get("reference", ReferenceNamespaceName))
            .FirstOrDefault(element => element.Element(XName.Get("media-sharing", NamespaceName)) is not null);
        return TryParseReference(reference, out media);
    }

    public static bool TryParseReference(
        XElement? reference,
        out XmppStatelessInlineMedia? media)
    {
        media = null;
        if (reference?.Name != XName.Get("reference", ReferenceNamespaceName))
        {
            return false;
        }

        var mediaSharing = reference.Element(XName.Get("media-sharing", NamespaceName));
        var fileElement = mediaSharing?.Element(XName.Get("file", XmppJingleFileTransfer.NamespaceName));
        if (mediaSharing is null || !XmppJingleFile.TryParseFileElement(fileElement, out var file) || file is null)
        {
            return false;
        }

        var sources = mediaSharing.Element(XName.Get("sources", NamespaceName))
            ?.Elements(XName.Get("reference", ReferenceNamespaceName))
            .Select(element => Uri.TryCreate((string?)element.Attribute("uri"), UriKind.Absolute, out var uri) ? uri : null)
            .Where(uri => uri is not null)
            .Cast<Uri>()
            .ToArray() ?? [];
        if (sources.Length == 0)
        {
            return false;
        }

        media = new XmppStatelessInlineMedia(
            file,
            sources,
            (string?)reference.Attribute("id"),
            (int?)reference.Attribute("begin"),
            (int?)reference.Attribute("end"));
        return true;
    }
}

public sealed record XmppStatelessInlineMedia(
    XmppJingleFile File,
    IReadOnlyList<Uri> Sources,
    string? ReferenceId = null,
    int? Begin = null,
    int? End = null);
