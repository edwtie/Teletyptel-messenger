using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppBosh
{
    public const string NamespaceName = "http://jabber.org/protocol/httpbind";

    public const string XmppNamespaceName = "urn:xmpp:xbosh";

    public const string ContentType = "text/xml; charset=utf-8";

    private static readonly XNamespace BoshNamespace = NamespaceName;

    private static readonly XNamespace XmppNamespace = XmppNamespaceName;

    public static XElement CreateSessionRequest(
        long rid,
        string to,
        int wait = 60,
        int hold = 1,
        string version = "1.6",
        string xmppVersion = "1.0",
        string? language = null,
        string? route = null,
        bool? secure = null)
    {
        ValidateRid(rid);
        ArgumentException.ThrowIfNullOrWhiteSpace(to);
        if (wait < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(wait), "Wait must not be negative.");
        }

        if (hold < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(hold), "Hold must not be negative.");
        }

        var body = new XElement(
            BoshNamespace + "body",
            new XAttribute(XNamespace.Xmlns + "xmpp", XmppNamespaceName),
            new XAttribute("content", ContentType),
            new XAttribute("rid", rid.ToString(CultureInfo.InvariantCulture)),
            new XAttribute("to", to),
            new XAttribute("wait", wait.ToString(CultureInfo.InvariantCulture)),
            new XAttribute("hold", hold.ToString(CultureInfo.InvariantCulture)),
            new XAttribute("ver", version),
            new XAttribute(XmppNamespace + "version", xmppVersion));

        SetOptionalAttribute(body, XNamespace.Xml + "lang", language);
        SetOptionalAttribute(body, "route", route);
        if (secure is not null)
        {
            body.SetAttributeValue("secure", secure.Value ? "true" : "false");
        }

        return body;
    }

    public static XElement CreateRequest(long rid, string sid, IEnumerable<XElement>? payloads = null)
    {
        ValidateRid(rid);
        ArgumentException.ThrowIfNullOrWhiteSpace(sid);

        return new XElement(
            BoshNamespace + "body",
            new XAttribute("rid", rid.ToString(CultureInfo.InvariantCulture)),
            new XAttribute("sid", sid),
            (payloads ?? []).Select(payload => new XElement(payload)));
    }

    public static XElement CreateRestartRequest(long rid, string sid, string? language = null)
    {
        ValidateRid(rid);
        ArgumentException.ThrowIfNullOrWhiteSpace(sid);

        var body = new XElement(
            BoshNamespace + "body",
            new XAttribute(XNamespace.Xmlns + "xmpp", XmppNamespaceName),
            new XAttribute("rid", rid.ToString(CultureInfo.InvariantCulture)),
            new XAttribute("sid", sid),
            new XAttribute(XmppNamespace + "restart", "true"));
        SetOptionalAttribute(body, XNamespace.Xml + "lang", language);
        return body;
    }

    public static XElement CreateTerminateRequest(
        long rid,
        string sid,
        string? condition = null,
        IEnumerable<XElement>? payloads = null)
    {
        var body = CreateRequest(rid, sid, payloads);
        body.SetAttributeValue("type", "terminate");
        SetOptionalAttribute(body, "condition", condition);
        return body;
    }

    public static bool TryParseBody(string xml, out XmppBoshBody? body)
    {
        body = null;
        try
        {
            return TryParseBody(XElement.Parse(xml), out body);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public static bool TryParseBody(XElement element, out XmppBoshBody? body)
    {
        body = null;
        if (element.Name != BoshNamespace + "body")
        {
            return false;
        }

        body = new XmppBoshBody(
            Rid: ParseLongAttribute(element, "rid"),
            Sid: (string?)element.Attribute("sid"),
            Type: (string?)element.Attribute("type"),
            Condition: (string?)element.Attribute("condition"),
            From: (string?)element.Attribute("from"),
            To: (string?)element.Attribute("to"),
            AuthId: (string?)element.Attribute("authid"),
            Version: (string?)element.Attribute("ver"),
            XmppVersion: (string?)element.Attribute(XmppNamespace + "version"),
            Wait: ParseIntAttribute(element, "wait"),
            Hold: ParseIntAttribute(element, "hold"),
            Requests: ParseIntAttribute(element, "requests"),
            Inactivity: ParseIntAttribute(element, "inactivity"),
            Polling: ParseIntAttribute(element, "polling"),
            Secure: ParseBoolAttribute(element, "secure"),
            Restart: ParseBoolAttribute(element, XmppNamespace + "restart"),
            Payloads: element.Elements().Select(payload => new XElement(payload)).ToArray());
        return true;
    }

    public static bool TryParseSessionResponse(XElement element, out XmppBoshSession? session)
    {
        session = null;
        if (!TryParseBody(element, out var body) || body is null || string.IsNullOrWhiteSpace(body.Sid))
        {
            return false;
        }

        session = new XmppBoshSession(
            Sid: body.Sid,
            From: body.From,
            AuthId: body.AuthId,
            Version: body.Version,
            XmppVersion: body.XmppVersion,
            Wait: body.Wait,
            Hold: body.Hold,
            Requests: body.Requests,
            Inactivity: body.Inactivity,
            Polling: body.Polling,
            Secure: body.Secure,
            Payloads: body.Payloads);
        return true;
    }

    public static bool IsTerminate(XmppBoshBody body)
    {
        ArgumentNullException.ThrowIfNull(body);
        return string.Equals(body.Type, "terminate", StringComparison.Ordinal);
    }

    private static void ValidateRid(long rid)
    {
        if (rid <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(rid), "RID must be greater than zero.");
        }
    }

    private static long? ParseLongAttribute(XElement element, XName name)
    {
        return long.TryParse(
            (string?)element.Attribute(name),
            NumberStyles.None,
            CultureInfo.InvariantCulture,
            out var parsed)
            ? parsed
            : null;
    }

    private static int? ParseIntAttribute(XElement element, XName name)
    {
        return int.TryParse(
            (string?)element.Attribute(name),
            NumberStyles.None,
            CultureInfo.InvariantCulture,
            out var parsed)
            ? parsed
            : null;
    }

    private static bool? ParseBoolAttribute(XElement element, XName name)
    {
        var raw = (string?)element.Attribute(name);
        return raw switch
        {
            "true" or "1" => true,
            "false" or "0" => false,
            _ => null
        };
    }

    private static void SetOptionalAttribute(XElement element, XName name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            element.SetAttributeValue(name, value);
        }
    }
}

public sealed record XmppBoshBody(
    long? Rid,
    string? Sid,
    string? Type,
    string? Condition,
    string? From,
    string? To,
    string? AuthId,
    string? Version,
    string? XmppVersion,
    int? Wait,
    int? Hold,
    int? Requests,
    int? Inactivity,
    int? Polling,
    bool? Secure,
    bool? Restart,
    IReadOnlyList<XElement> Payloads);

public sealed record XmppBoshSession(
    string Sid,
    string? From,
    string? AuthId,
    string? Version,
    string? XmppVersion,
    int? Wait,
    int? Hold,
    int? Requests,
    int? Inactivity,
    int? Polling,
    bool? Secure,
    IReadOnlyList<XElement> Payloads);
