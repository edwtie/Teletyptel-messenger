using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppJingleFileTransfer
{
    public const string NamespaceName = "urn:xmpp:jingle:apps:file-transfer:5";

    public const string ErrorsNamespaceName = "urn:xmpp:jingle:apps:file-transfer:errors:0";

    public const string HashesNamespaceName = "urn:xmpp:hashes:2";

    public static bool SupportsJingleFileTransfer(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppJingleContent CreateFileContent(
        string contentName,
        XmppJingleFile file,
        XElement transport,
        string creator = "initiator",
        string senders = "initiator")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(contentName);
        ArgumentNullException.ThrowIfNull(file);
        ArgumentNullException.ThrowIfNull(transport);

        return new XmppJingleContent(
            contentName,
            creator,
            senders,
            file.ToDescriptionXml(),
            transport);
    }

    public static bool TryParseFile(XmppJingleContent content, out XmppJingleFile? file)
    {
        ArgumentNullException.ThrowIfNull(content);
        return XmppJingleFile.TryParseDescription(content.Description, out file);
    }

    public static XElement CreateReceivedInfo(string creator, string contentName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(creator);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentName);
        return new XElement(XName.Get("received", NamespaceName),
            new XAttribute("creator", creator),
            new XAttribute("name", contentName));
    }

    public static bool TryParseReceivedInfo(
        XElement? element,
        out XmppJingleFileTransferInfo? info)
    {
        info = null;
        if (element?.Name != XName.Get("received", NamespaceName))
        {
            return false;
        }

        var creator = (string?)element.Attribute("creator");
        var name = (string?)element.Attribute("name");
        if (string.IsNullOrWhiteSpace(creator) || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        info = new XmppJingleFileTransferInfo("received", creator, name, null);
        return true;
    }

    public static XElement CreateChecksumInfo(
        string creator,
        string contentName,
        IEnumerable<XmppJingleFileHash> hashes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(creator);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentName);
        ArgumentNullException.ThrowIfNull(hashes);

        return new XElement(XName.Get("checksum", NamespaceName),
            new XAttribute("creator", creator),
            new XAttribute("name", contentName),
            new XElement(XName.Get("file", NamespaceName), hashes.Select(hash => hash.ToXml())));
    }

    public static bool TryParseChecksumInfo(
        XElement? element,
        out XmppJingleFileTransferInfo? info)
    {
        info = null;
        if (element?.Name != XName.Get("checksum", NamespaceName))
        {
            return false;
        }

        var creator = (string?)element.Attribute("creator");
        var name = (string?)element.Attribute("name");
        if (string.IsNullOrWhiteSpace(creator) || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var hashes = element.Element(XName.Get("file", NamespaceName))
            ?.Elements(XName.Get("hash", HashesNamespaceName))
            .Select(hash => XmppJingleFileHash.TryParse(hash, out var parsed) ? parsed : null)
            .Where(hash => hash is not null)
            .Cast<XmppJingleFileHash>()
            .ToArray() ?? [];

        info = new XmppJingleFileTransferInfo("checksum", creator, name, hashes);
        return true;
    }
}

public sealed record XmppJingleFile(
    string Name,
    long? Size = null,
    string? MediaType = null,
    DateTimeOffset? Date = null,
    string? Description = null,
    XmppJingleFileRange? Range = null,
    IReadOnlyList<XmppJingleFileHash>? Hashes = null)
{
    public XElement ToDescriptionXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(Name);
        var file = new XElement(XName.Get("file", XmppJingleFileTransfer.NamespaceName));
        if (!string.IsNullOrWhiteSpace(MediaType))
        {
            file.Add(new XElement(XName.Get("media-type", XmppJingleFileTransfer.NamespaceName), MediaType));
        }

        file.Add(new XElement(XName.Get("name", XmppJingleFileTransfer.NamespaceName), Name));
        if (Date is not null)
        {
            file.Add(new XElement(
                XName.Get("date", XmppJingleFileTransfer.NamespaceName),
                Date.Value.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture)));
        }

        if (!string.IsNullOrWhiteSpace(Description))
        {
            file.Add(new XElement(XName.Get("desc", XmppJingleFileTransfer.NamespaceName), Description));
        }

        if (Size is not null)
        {
            file.Add(new XElement(XName.Get("size", XmppJingleFileTransfer.NamespaceName), Size.Value));
        }

        if (Range is not null)
        {
            file.Add(Range.ToXml());
        }

        if (Hashes is not null)
        {
            file.Add(Hashes.Select(hash => hash.ToXml()));
        }

        return new XElement(XName.Get("description", XmppJingleFileTransfer.NamespaceName), file);
    }

    public static bool TryParseDescription(XElement? element, out XmppJingleFile? file)
    {
        file = null;
        if (element?.Name != XName.Get("description", XmppJingleFileTransfer.NamespaceName))
        {
            return false;
        }

        var fileElement = element.Element(XName.Get("file", XmppJingleFileTransfer.NamespaceName));
        var name = fileElement?.Element(XName.Get("name", XmppJingleFileTransfer.NamespaceName))?.Value;
        if (fileElement is null || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var size = long.TryParse(
            fileElement.Element(XName.Get("size", XmppJingleFileTransfer.NamespaceName))?.Value,
            NumberStyles.None,
            CultureInfo.InvariantCulture,
            out var parsedSize)
            ? parsedSize
            : (long?)null;
        var date = DateTimeOffset.TryParse(
            fileElement.Element(XName.Get("date", XmppJingleFileTransfer.NamespaceName))?.Value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsedDate)
            ? parsedDate
            : (DateTimeOffset?)null;
        XmppJingleFileRange.TryParse(
            fileElement.Element(XName.Get("range", XmppJingleFileTransfer.NamespaceName)),
            out var range);

        var hashes = fileElement.Elements(XName.Get("hash", XmppJingleFileTransfer.HashesNamespaceName))
            .Select(hash => XmppJingleFileHash.TryParse(hash, out var parsed) ? parsed : null)
            .Where(hash => hash is not null)
            .Cast<XmppJingleFileHash>()
            .ToArray();

        file = new XmppJingleFile(
            name,
            size,
            fileElement.Element(XName.Get("media-type", XmppJingleFileTransfer.NamespaceName))?.Value,
            date,
            fileElement.Element(XName.Get("desc", XmppJingleFileTransfer.NamespaceName))?.Value,
            range,
            hashes);
        return true;
    }
}

public sealed record XmppJingleFileRange(long? Offset = null, long? Length = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("range", XmppJingleFileTransfer.NamespaceName));
        if (Offset is not null)
        {
            element.SetAttributeValue("offset", Offset.Value);
        }

        if (Length is not null)
        {
            element.SetAttributeValue("length", Length.Value);
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppJingleFileRange? range)
    {
        range = null;
        if (element?.Name != XName.Get("range", XmppJingleFileTransfer.NamespaceName))
        {
            return false;
        }

        var offset = long.TryParse(
            (string?)element.Attribute("offset"),
            NumberStyles.None,
            CultureInfo.InvariantCulture,
            out var parsedOffset)
            ? parsedOffset
            : (long?)null;
        var length = long.TryParse(
            (string?)element.Attribute("length"),
            NumberStyles.None,
            CultureInfo.InvariantCulture,
            out var parsedLength)
            ? parsedLength
            : (long?)null;
        range = new XmppJingleFileRange(offset, length);
        return true;
    }
}

public sealed record XmppJingleFileHash(string Algorithm, string Value)
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(Algorithm);
        return new XElement(XName.Get("hash", XmppJingleFileTransfer.HashesNamespaceName),
            new XAttribute("algo", Algorithm),
            Value);
    }

    public static bool TryParse(XElement element, out XmppJingleFileHash? hash)
    {
        hash = null;
        if (element.Name != XName.Get("hash", XmppJingleFileTransfer.HashesNamespaceName))
        {
            return false;
        }

        var algorithm = (string?)element.Attribute("algo");
        if (string.IsNullOrWhiteSpace(algorithm))
        {
            return false;
        }

        hash = new XmppJingleFileHash(algorithm, element.Value.Trim());
        return true;
    }
}

public sealed record XmppJingleFileTransferInfo(
    string Kind,
    string Creator,
    string Name,
    IReadOnlyList<XmppJingleFileHash>? Hashes);
