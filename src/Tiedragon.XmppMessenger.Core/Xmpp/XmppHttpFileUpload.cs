using System.Net;
using System.Net.Http.Headers;
using System.Globalization;
using System.Xml;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppHttpFileUpload
{
    public const string NamespaceName = "urn:xmpp:http:upload:0";

    public const string PurposeNamespaceName = "urn:xmpp:http:upload:purpose:0";

    public const string PurposeMessageFeature = PurposeNamespaceName + "#message";

    public const string PurposeProfileFeature = PurposeNamespaceName + "#profile";

    public const string PurposeEphemeralFeature = PurposeNamespaceName + "#ephemeral";

    public const string PurposePermanentFeature = PurposeNamespaceName + "#permanent";

    private static readonly HashSet<string> AllowedHeaderNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Authorization",
        "Cookie",
        "Expires"
    };

    public static XmppIq CreateSlotRequest(
        string id,
        XmppAddress uploadService,
        string fileName,
        long size,
        string? contentType = null,
        XmppHttpUploadPurpose purpose = XmppHttpUploadPurpose.Default,
        DateTimeOffset? expireBefore = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(uploadService);
        EnsureRequestAllowed(fileName, size, contentType);

        var request = new XElement(XName.Get("request", NamespaceName),
            new XAttribute("filename", fileName),
            new XAttribute("size", size));

        if (!string.IsNullOrWhiteSpace(contentType))
        {
            request.SetAttributeValue("content-type", contentType);
        }

        var purposeElement = PurposeElement(purpose, expireBefore);
        if (purposeElement is not null)
        {
            request.Add(purposeElement);
        }

        return new XmppIq(XmppIqType.Get, id, request, To: uploadService);
    }

    public static bool TryParseSlotResult(XmppIq iq, out XmppHttpUploadSlot? slot)
    {
        slot = null;

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("slot", NamespaceName))
        {
            return false;
        }

        var put = iq.Payload.Element(XName.Get("put", NamespaceName));
        var get = iq.Payload.Element(XName.Get("get", NamespaceName));
        var putUrl = (string?)put?.Attribute("url");
        var getUrl = (string?)get?.Attribute("url");
        if (!Uri.TryCreate(putUrl, UriKind.Absolute, out var putUri)
            || !Uri.TryCreate(getUrl, UriKind.Absolute, out var getUri)
            || !IsAllowedUploadUri(putUri)
            || !IsAllowedUploadUri(getUri))
        {
            return false;
        }

        var headers = put?.Elements(XName.Get("header", NamespaceName))
            .Select(element => new XmppHttpUploadHeader(
                SanitizeHeader((string?)element.Attribute("name") ?? string.Empty),
                SanitizeHeader(element.Value)))
            .Where(header => AllowedHeaderNames.Contains(header.Name))
            .ToArray() ?? [];

        slot = new XmppHttpUploadSlot(putUri, getUri, headers);
        return true;
    }

    private static bool IsAllowedUploadUri(Uri uri)
    {
        if (uri.Scheme == Uri.UriSchemeHttps)
        {
            return true;
        }

        // LocalServer uses a loopback HTTP endpoint for repeatable lab smokes.
        // Internet-facing upload services must still use HTTPS.
        if (uri.Scheme != Uri.UriSchemeHttp)
        {
            return false;
        }

        return string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            || (IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address));
    }

    public static bool TryParseFileTooLarge(XmppIq iq, out long? maxFileSize)
    {
        maxFileSize = null;
        if (iq.Type != XmppIqType.Error)
        {
            return false;
        }

        var fileTooLarge = iq.ToXml()
            .Element(XName.Get("error", XmppXmlNames.ClientNamespace))
            ?.Element(XName.Get("file-too-large", NamespaceName));
        var value = fileTooLarge?.Element(XName.Get("max-file-size", NamespaceName))?.Value;
        if (long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed))
        {
            maxFileSize = parsed;
        }

        return fileTooLarge is not null;
    }

    public static bool TryParseRetry(XmppIq iq, out DateTimeOffset? retryAt)
    {
        retryAt = null;
        if (iq.Type != XmppIqType.Error)
        {
            return false;
        }

        var retry = iq.ToXml()
            .Element(XName.Get("error", XmppXmlNames.ClientNamespace))
            ?.Element(XName.Get("retry", NamespaceName));
        var stamp = (string?)retry?.Attribute("stamp");
        if (!string.IsNullOrWhiteSpace(stamp)
            && DateTimeOffset.TryParse(
                stamp,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            retryAt = parsed;
        }

        return retry is not null;
    }

    public static bool TryGetAdvertisedMaxFileSize(
        XmppServiceDiscoveryInfo info,
        out long? maxFileSize)
    {
        ArgumentNullException.ThrowIfNull(info);
        maxFileSize = null;

        foreach (var form in info.DataForms)
        {
            if (!string.Equals(form.FormType, NamespaceName, StringComparison.Ordinal))
            {
                continue;
            }

            var value = form.GetFirstValue("max-file-size");
            if (long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed)
                && parsed >= 0)
            {
                maxFileSize = parsed;
                return true;
            }
        }

        return false;
    }

    public static long? GetAdvertisedMaxFileSize(XmppServiceDiscoveryInfo info)
    {
        return TryGetAdvertisedMaxFileSize(info, out var maxFileSize) ? maxFileSize : null;
    }

    public static async Task<XmppHttpUploadCompletion> UploadAsync(
        XmppHttpUploadSlot slot,
        Stream content,
        long contentLength,
        string? contentType = null,
        HttpClient? httpClient = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(slot);
        ArgumentNullException.ThrowIfNull(content);
        if (contentLength < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(contentLength), "Content length cannot be negative.");
        }

        var ownsClient = httpClient is null;
        httpClient ??= new HttpClient();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Put, slot.PutUrl);
            request.Content = new StreamContent(content);
            request.Content.Headers.ContentLength = contentLength;
            request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(
                string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType);

            foreach (var header in slot.Headers)
            {
                var name = SanitizeHeader(header.Name);
                var value = SanitizeHeader(header.Value);
                if (!AllowedHeaderNames.Contains(name))
                {
                    continue;
                }

                if (!request.Headers.TryAddWithoutValidation(name, value))
                {
                    request.Content.Headers.TryAddWithoutValidation(name, value);
                }
            }

            using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode != HttpStatusCode.Created)
            {
                throw new HttpRequestException(
                    $"HTTP upload failed with status {(int)response.StatusCode} {response.ReasonPhrase}.",
                    null,
                    response.StatusCode);
            }

            return new XmppHttpUploadCompletion(slot.GetUrl, contentLength, contentType);
        }
        finally
        {
            if (ownsClient)
            {
                httpClient.Dispose();
            }
        }
    }

    public static void EnsureRequestAllowed(
        string fileName,
        long size,
        string? contentType = null,
        long? maxFileSize = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);
        if (size < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(size), "File size cannot be negative.");
        }

        if (maxFileSize is not null && size > maxFileSize.Value)
        {
            throw new ArgumentOutOfRangeException(nameof(size), $"File size exceeds the advertised maximum of {maxFileSize.Value} bytes.");
        }

        if (!string.IsNullOrWhiteSpace(contentType))
        {
            _ = MediaTypeHeaderValue.Parse(contentType);
        }
    }

    public static bool SupportsHttpUpload(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppChatMessage CreateFileMessage(
        XmppAddress to,
        XmppHttpUploadCompletion upload,
        string fileName,
        string? id = null)
    {
        ArgumentNullException.ThrowIfNull(upload);
        return XmppChatMessage.CreateOutOfBandMessage(to, upload.GetUrl, fileName, id);
    }

    private static XElement? PurposeElement(XmppHttpUploadPurpose purpose, DateTimeOffset? expireBefore)
    {
        return purpose switch
        {
            XmppHttpUploadPurpose.Default => null,
            XmppHttpUploadPurpose.Message => new XElement(XName.Get("message", PurposeNamespaceName)),
            XmppHttpUploadPurpose.Profile => new XElement(XName.Get("profile", PurposeNamespaceName)),
            XmppHttpUploadPurpose.Ephemeral => CreateEphemeralPurpose(expireBefore),
            XmppHttpUploadPurpose.Permanent => new XElement(XName.Get("permanent", PurposeNamespaceName)),
            _ => throw new ArgumentOutOfRangeException(nameof(purpose))
        };
    }

    private static XElement CreateEphemeralPurpose(DateTimeOffset? expireBefore)
    {
        if (expireBefore is null)
        {
            throw new ArgumentException("Ephemeral HTTP upload requests require an expire-before timestamp.", nameof(expireBefore));
        }

        return new XElement(
            XName.Get("ephemeral", PurposeNamespaceName),
            new XAttribute(
                "expire-before",
                XmlConvert.ToString(expireBefore.Value.UtcDateTime, XmlDateTimeSerializationMode.Utc)));
    }

    private static string SanitizeHeader(string value)
    {
        return value.Replace("\r", string.Empty, StringComparison.Ordinal)
            .Replace("\n", string.Empty, StringComparison.Ordinal);
    }
}

public enum XmppHttpUploadPurpose
{
    Default,
    Message,
    Profile,
    Ephemeral,
    Permanent
}

public sealed record XmppHttpUploadSlot(
    Uri PutUrl,
    Uri GetUrl,
    IReadOnlyList<XmppHttpUploadHeader> Headers);

public sealed record XmppHttpUploadHeader(string Name, string Value);

public sealed record XmppHttpUploadCompletion(
    Uri GetUrl,
    long Size,
    string? ContentType);
