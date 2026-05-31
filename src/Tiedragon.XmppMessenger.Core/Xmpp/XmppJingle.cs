using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppJingle
{
    public const string NamespaceName = "urn:xmpp:jingle:1";

    public const string RtpNamespaceName = "urn:xmpp:jingle:apps:rtp:1";

    public const string RtpInfoNamespaceName = "urn:xmpp:jingle:apps:rtp:info:1";

    public const string RtpAudioFeature = "urn:xmpp:jingle:apps:rtp:audio";

    public const string RtpVideoFeature = "urn:xmpp:jingle:apps:rtp:video";

    public const string IceUdpNamespaceName = "urn:xmpp:jingle:transports:ice-udp:1";

    public const string DtlsNamespaceName = "urn:xmpp:jingle:apps:dtls:0";

    public static bool SupportsRtpAudio(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(RtpNamespaceName) && info.Supports(RtpAudioFeature);
    }

    public static bool SupportsRtpVideo(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(RtpNamespaceName) && info.Supports(RtpVideoFeature);
    }

    public static XmppIq CreateSessionInitiate(
        string id,
        XmppAddress to,
        string sid,
        string creator,
        IEnumerable<XmppJingleContent> contents,
        string? initiator = null)
    {
        return CreateJingleIq(id, to, "session-initiate", sid, creator, contents, initiator: initiator);
    }

    public static XmppIq CreateSessionAccept(
        string id,
        XmppAddress to,
        string sid,
        string creator,
        IEnumerable<XmppJingleContent> contents,
        string? initiator = null,
        string? responder = null)
    {
        return CreateJingleIq(id, to, "session-accept", sid, creator, contents, initiator, responder);
    }

    public static XmppIq CreateTransportInfo(
        string id,
        XmppAddress to,
        string sid,
        string creator,
        IEnumerable<XmppJingleContent> contents,
        string? initiator = null,
        string? responder = null)
    {
        return CreateJingleIq(id, to, "transport-info", sid, creator, contents, initiator, responder);
    }

    public static XmppIq CreateSessionInfo(
        string id,
        XmppAddress to,
        string sid,
        XElement info,
        string? initiator = null,
        string? responder = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(sid);
        ArgumentNullException.ThrowIfNull(info);

        var jingle = CreateJingleElement("session-info", sid, initiator, responder);
        jingle.Add(new XElement(info));
        return new XmppIq(XmppIqType.Set, id, jingle, To: to);
    }

    public static XmppIq CreateRinging(
        string id,
        XmppAddress to,
        string sid,
        string? initiator = null,
        string? responder = null)
    {
        return CreateSessionInfo(id, to, sid, CreateRtpInfoElement("ringing"), initiator, responder);
    }

    public static XmppIq CreateHold(
        string id,
        XmppAddress to,
        string sid,
        string? initiator = null,
        string? responder = null)
    {
        return CreateSessionInfo(id, to, sid, CreateRtpInfoElement("hold"), initiator, responder);
    }

    public static XmppIq CreateUnhold(
        string id,
        XmppAddress to,
        string sid,
        string? initiator = null,
        string? responder = null)
    {
        return CreateSessionInfo(id, to, sid, CreateRtpInfoElement("unhold"), initiator, responder);
    }

    public static XmppIq CreateActive(
        string id,
        XmppAddress to,
        string sid,
        string? initiator = null,
        string? responder = null)
    {
        return CreateSessionInfo(id, to, sid, CreateRtpInfoElement("active"), initiator, responder);
    }

    public static XmppIq CreateMute(
        string id,
        XmppAddress to,
        string sid,
        string? creator = null,
        string? name = null,
        string? initiator = null,
        string? responder = null)
    {
        return CreateSessionInfo(id, to, sid, CreateRtpInfoElement("mute", creator, name), initiator, responder);
    }

    public static XmppIq CreateUnmute(
        string id,
        XmppAddress to,
        string sid,
        string? creator = null,
        string? name = null,
        string? initiator = null,
        string? responder = null)
    {
        return CreateSessionInfo(id, to, sid, CreateRtpInfoElement("unmute", creator, name), initiator, responder);
    }

    public static XmppIq CreateSessionTerminate(
        string id,
        XmppAddress to,
        string sid,
        string reason = "success",
        string? text = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(sid);
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);

        var reasonElement = new XElement(XName.Get("reason", NamespaceName),
            new XElement(XName.Get(reason, NamespaceName)));
        if (!string.IsNullOrWhiteSpace(text))
        {
            reasonElement.Add(new XElement(XName.Get("text", NamespaceName), text));
        }

        var jingle = CreateJingleElement("session-terminate", sid);
        jingle.Add(reasonElement);
        return new XmppIq(XmppIqType.Set, id, jingle, To: to);
    }

    public static XmppJingleContent CreateRtpContent(
        string name,
        string media,
        IEnumerable<XmppJinglePayloadType> payloadTypes,
        string creator = "initiator",
        string senders = "both",
        XmppJingleIceUdpTransport? transport = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(media);
        ArgumentNullException.ThrowIfNull(payloadTypes);

        var description = new XElement(XName.Get("description", RtpNamespaceName),
            new XAttribute("media", media),
            payloadTypes.Select(payload => payload.ToXml()));

        return new XmppJingleContent(
            name,
            creator,
            senders,
            description,
            transport?.ToXml() ?? new XElement(XName.Get("transport", IceUdpNamespaceName)));
    }

    public static XmppJingleContent CreateTransportContent(
        string name,
        XmppJingleIceUdpTransport transport,
        string creator = "initiator",
        string senders = "both")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(transport);
        return new XmppJingleContent(name, creator, senders, null, transport.ToXml());
    }

    public static XmppJingleContent CreateDefaultAudioContent(
        XmppJingleIceUdpTransport? transport = null,
        string creator = "initiator",
        string senders = "both")
    {
        return CreateRtpContent(
            "audio",
            "audio",
            [
                new XmppJinglePayloadType(
                    111,
                    "opus",
                    48000,
                    2,
                    new Dictionary<string, string>
                    {
                        ["minptime"] = "10",
                        ["useinbandfec"] = "1"
                    })
            ],
            creator,
            senders,
            transport);
    }

    public static XmppJingleContent CreateDefaultVideoContent(
        XmppJingleIceUdpTransport? transport = null,
        string creator = "initiator",
        string senders = "both")
    {
        return CreateRtpContent(
            "video",
            "video",
            [new XmppJinglePayloadType(96, "VP8", 90000)],
            creator,
            senders,
            transport);
    }

    public static bool TryParse(XmppIq iq, out XmppJingleSession? session)
    {
        session = null;

        if (iq.Payload?.Name != XName.Get("jingle", NamespaceName))
        {
            return false;
        }

        var sid = (string?)iq.Payload.Attribute("sid");
        var action = (string?)iq.Payload.Attribute("action");
        if (string.IsNullOrWhiteSpace(sid) || string.IsNullOrWhiteSpace(action))
        {
            return false;
        }

        var contents = iq.Payload.Elements(XName.Get("content", NamespaceName))
            .Select(element => new XmppJingleContent(
                Name: (string?)element.Attribute("name") ?? string.Empty,
                Creator: (string?)element.Attribute("creator") ?? string.Empty,
                Senders: (string?)element.Attribute("senders") ?? string.Empty,
                Description: element.Elements().FirstOrDefault(child => child.Name.LocalName == "description"),
                Transport: element.Elements().FirstOrDefault(child => child.Name.LocalName == "transport")))
            .ToArray();

        var reason = ParseReason(iq.Payload.Element(XName.Get("reason", NamespaceName)));
        var sessionInfo = iq.Payload.Elements()
            .FirstOrDefault(child =>
                child.Name != XName.Get("content", NamespaceName)
                && child.Name != XName.Get("reason", NamespaceName));

        session = new XmppJingleSession(
            Sid: sid,
            Action: action,
            Initiator: (string?)iq.Payload.Attribute("initiator"),
            Responder: (string?)iq.Payload.Attribute("responder"),
            Contents: contents,
            Reason: reason,
            SessionInfo: sessionInfo is null ? null : new XElement(sessionInfo));
        return true;
    }

    public static IReadOnlyList<XmppJinglePayloadType> ParsePayloadTypes(XmppJingleContent content)
    {
        ArgumentNullException.ThrowIfNull(content);
        return content.Description?.Elements(XName.Get("payload-type", RtpNamespaceName))
            .Select(ParsePayloadType)
            .Where(payload => payload is not null)
            .Cast<XmppJinglePayloadType>()
            .ToArray()
            ?? Array.Empty<XmppJinglePayloadType>();
    }

    public static bool TryParseIceUdpTransport(
        XmppJingleContent content,
        out XmppJingleIceUdpTransport? transport)
    {
        ArgumentNullException.ThrowIfNull(content);
        return XmppJingleIceUdpTransport.TryParse(content.Transport, out transport);
    }

    private static XmppIq CreateJingleIq(
        string id,
        XmppAddress to,
        string action,
        string sid,
        string creator,
        IEnumerable<XmppJingleContent> contents,
        string? initiator = null,
        string? responder = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(sid);
        ArgumentException.ThrowIfNullOrWhiteSpace(creator);
        ArgumentNullException.ThrowIfNull(contents);

        var jingle = CreateJingleElement(action, sid, initiator, responder);
        jingle.Add(contents.Select(content => content.ToXml()));
        return new XmppIq(XmppIqType.Set, id, jingle, To: to);
    }

    private static XElement CreateJingleElement(
        string action,
        string sid,
        string? initiator = null,
        string? responder = null)
    {
        var jingle = new XElement(XName.Get("jingle", NamespaceName),
            new XAttribute("action", action),
            new XAttribute("sid", sid));
        if (!string.IsNullOrWhiteSpace(initiator))
        {
            jingle.SetAttributeValue("initiator", initiator);
        }

        if (!string.IsNullOrWhiteSpace(responder))
        {
            jingle.SetAttributeValue("responder", responder);
        }

        return jingle;
    }

    private static XElement CreateRtpInfoElement(string name, string? creator = null, string? contentName = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        var element = new XElement(XName.Get(name, RtpInfoNamespaceName));
        if (!string.IsNullOrWhiteSpace(creator))
        {
            element.SetAttributeValue("creator", creator);
        }

        if (!string.IsNullOrWhiteSpace(contentName))
        {
            element.SetAttributeValue("name", contentName);
        }

        return element;
    }

    private static XmppJinglePayloadType? ParsePayloadType(XElement element)
    {
        if (!TryParseInt((string?)element.Attribute("id"), out var id))
        {
            return null;
        }

        var parameters = element.Elements(XName.Get("parameter", RtpNamespaceName))
            .Select(parameter => (
                Name: (string?)parameter.Attribute("name"),
                Value: (string?)parameter.Attribute("value")))
            .Where(parameter => !string.IsNullOrWhiteSpace(parameter.Name))
            .ToDictionary(
                parameter => parameter.Name!,
                parameter => parameter.Value ?? string.Empty,
                StringComparer.Ordinal);

        return new XmppJinglePayloadType(
            id,
            (string?)element.Attribute("name") ?? string.Empty,
            TryParseInt((string?)element.Attribute("clockrate"), out var clockRate) ? clockRate : null,
            TryParseInt((string?)element.Attribute("channels"), out var channels) ? channels : null,
            parameters.Count > 0 ? parameters : null);
    }

    private static XmppJingleReason? ParseReason(XElement? element)
    {
        if (element is null)
        {
            return null;
        }

        var condition = element.Elements()
            .FirstOrDefault(child => child.Name.NamespaceName == NamespaceName && child.Name.LocalName != "text");
        return condition is null
            ? null
            : new XmppJingleReason(
                condition.Name.LocalName,
                element.Element(XName.Get("text", NamespaceName))?.Value);
    }

    private static bool TryParseInt(string? value, out int result)
    {
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }
}

public sealed record XmppJingleSession(
    string Sid,
    string Action,
    string? Initiator,
    string? Responder,
    IReadOnlyList<XmppJingleContent> Contents,
    XmppJingleReason? Reason = null,
    XElement? SessionInfo = null);

public sealed record XmppJingleReason(
    string Condition,
    string? Text = null);

public sealed record XmppJingleContent(
    string Name,
    string Creator,
    string Senders,
    XElement? Description,
    XElement? Transport)
{
    public XElement ToXml()
    {
        var content = new XElement(XName.Get("content", XmppJingle.NamespaceName),
            new XAttribute("creator", Creator),
            new XAttribute("name", Name));
        if (!string.IsNullOrWhiteSpace(Senders))
        {
            content.SetAttributeValue("senders", Senders);
        }

        if (Description is not null)
        {
            content.Add(new XElement(Description));
        }

        if (Transport is not null)
        {
            content.Add(new XElement(Transport));
        }

        return content;
    }
}

public sealed record XmppJinglePayloadType(
    int Id,
    string Name,
    int? ClockRate = null,
    int? Channels = null,
    IReadOnlyDictionary<string, string>? Parameters = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("payload-type", XmppJingle.RtpNamespaceName),
            new XAttribute("id", Id),
            new XAttribute("name", Name));
        if (ClockRate is not null)
        {
            element.SetAttributeValue("clockrate", ClockRate.Value);
        }

        if (Channels is not null)
        {
            element.SetAttributeValue("channels", Channels.Value);
        }

        if (Parameters is not null)
        {
            element.Add(Parameters.Select(parameter => new XElement(
                XName.Get("parameter", XmppJingle.RtpNamespaceName),
                new XAttribute("name", parameter.Key),
                new XAttribute("value", parameter.Value))));
        }

        return element;
    }
}

public sealed record XmppJingleIceUdpTransport(
    string? Ufrag = null,
    string? Password = null,
    IReadOnlyList<XmppJingleIceCandidate>? Candidates = null,
    IReadOnlyList<XmppJingleDtlsFingerprint>? Fingerprints = null,
    XmppJingleRemoteCandidate? RemoteCandidate = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("transport", XmppJingle.IceUdpNamespaceName));
        if (!string.IsNullOrWhiteSpace(Password))
        {
            element.SetAttributeValue("pwd", Password);
        }

        if (!string.IsNullOrWhiteSpace(Ufrag))
        {
            element.SetAttributeValue("ufrag", Ufrag);
        }

        if (Fingerprints is not null)
        {
            element.Add(Fingerprints.Select(fingerprint => fingerprint.ToXml()));
        }

        if (Candidates is not null)
        {
            element.Add(Candidates.Select(candidate => candidate.ToXml()));
        }

        if (RemoteCandidate is not null)
        {
            element.Add(RemoteCandidate.ToXml());
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppJingleIceUdpTransport? transport)
    {
        transport = null;
        if (element?.Name != XName.Get("transport", XmppJingle.IceUdpNamespaceName))
        {
            return false;
        }

        var candidates = element.Elements(XName.Get("candidate", XmppJingle.IceUdpNamespaceName))
            .Select(candidate => XmppJingleIceCandidate.TryParse(candidate, out var parsed) ? parsed : null)
            .Where(candidate => candidate is not null)
            .Cast<XmppJingleIceCandidate>()
            .ToArray();
        var fingerprints = element.Elements(XName.Get("fingerprint", XmppJingle.DtlsNamespaceName))
            .Select(fingerprint => XmppJingleDtlsFingerprint.TryParse(fingerprint, out var parsed) ? parsed : null)
            .Where(fingerprint => fingerprint is not null)
            .Cast<XmppJingleDtlsFingerprint>()
            .ToArray();
        XmppJingleRemoteCandidate.TryParse(
            element.Element(XName.Get("remote-candidate", XmppJingle.IceUdpNamespaceName)),
            out var remoteCandidate);

        transport = new XmppJingleIceUdpTransport(
            (string?)element.Attribute("ufrag"),
            (string?)element.Attribute("pwd"),
            candidates,
            fingerprints,
            remoteCandidate);
        return true;
    }
}

public sealed record XmppJingleIceCandidate(
    string Id,
    int Component,
    string Foundation,
    int Generation,
    string Ip,
    int Network,
    int Port,
    long Priority,
    string Protocol,
    string Type,
    string? RelatedAddress = null,
    int? RelatedPort = null,
    string? TcpType = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("candidate", XmppJingle.IceUdpNamespaceName),
            new XAttribute("component", Component),
            new XAttribute("foundation", Foundation),
            new XAttribute("generation", Generation),
            new XAttribute("id", Id),
            new XAttribute("ip", Ip),
            new XAttribute("network", Network),
            new XAttribute("port", Port),
            new XAttribute("priority", Priority),
            new XAttribute("protocol", Protocol),
            new XAttribute("type", Type));
        if (!string.IsNullOrWhiteSpace(RelatedAddress))
        {
            element.SetAttributeValue("rel-addr", RelatedAddress);
        }

        if (RelatedPort is not null)
        {
            element.SetAttributeValue("rel-port", RelatedPort.Value);
        }

        if (!string.IsNullOrWhiteSpace(TcpType))
        {
            element.SetAttributeValue("tcptype", TcpType);
        }

        return element;
    }

    public static bool TryParse(XElement element, out XmppJingleIceCandidate? candidate)
    {
        candidate = null;
        if (element.Name != XName.Get("candidate", XmppJingle.IceUdpNamespaceName)
            || !TryParseInt((string?)element.Attribute("component"), out var component)
            || !TryParseInt((string?)element.Attribute("generation"), out var generation)
            || !TryParseInt((string?)element.Attribute("network"), out var network)
            || !TryParseInt((string?)element.Attribute("port"), out var port)
            || !TryParseLong((string?)element.Attribute("priority"), out var priority))
        {
            return false;
        }

        var relatedPort = TryParseInt((string?)element.Attribute("rel-port"), out var parsedRelatedPort)
            ? parsedRelatedPort
            : (int?)null;
        candidate = new XmppJingleIceCandidate(
            (string?)element.Attribute("id") ?? string.Empty,
            component,
            (string?)element.Attribute("foundation") ?? string.Empty,
            generation,
            (string?)element.Attribute("ip") ?? string.Empty,
            network,
            port,
            priority,
            (string?)element.Attribute("protocol") ?? string.Empty,
            (string?)element.Attribute("type") ?? string.Empty,
            (string?)element.Attribute("rel-addr"),
            relatedPort,
            (string?)element.Attribute("tcptype"));
        return true;
    }

    private static bool TryParseInt(string? value, out int result)
    {
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }

    private static bool TryParseLong(string? value, out long result)
    {
        return long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }
}

public sealed record XmppJingleRemoteCandidate(
    int Component,
    string Ip,
    int Port)
{
    public XElement ToXml()
    {
        return new XElement(XName.Get("remote-candidate", XmppJingle.IceUdpNamespaceName),
            new XAttribute("component", Component),
            new XAttribute("ip", Ip),
            new XAttribute("port", Port));
    }

    public static bool TryParse(XElement? element, out XmppJingleRemoteCandidate? candidate)
    {
        candidate = null;
        if (element?.Name != XName.Get("remote-candidate", XmppJingle.IceUdpNamespaceName)
            || !int.TryParse((string?)element.Attribute("component"), NumberStyles.None, CultureInfo.InvariantCulture, out var component)
            || !int.TryParse((string?)element.Attribute("port"), NumberStyles.None, CultureInfo.InvariantCulture, out var port))
        {
            return false;
        }

        candidate = new XmppJingleRemoteCandidate(
            component,
            (string?)element.Attribute("ip") ?? string.Empty,
            port);
        return true;
    }
}

public sealed record XmppJingleDtlsFingerprint(
    string Hash,
    string Fingerprint,
    string? Setup = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("fingerprint", XmppJingle.DtlsNamespaceName),
            new XAttribute("hash", Hash),
            Fingerprint);
        if (!string.IsNullOrWhiteSpace(Setup))
        {
            element.SetAttributeValue("setup", Setup);
        }

        return element;
    }

    public static bool TryParse(XElement element, out XmppJingleDtlsFingerprint? fingerprint)
    {
        fingerprint = null;
        if (element.Name != XName.Get("fingerprint", XmppJingle.DtlsNamespaceName))
        {
            return false;
        }

        var hash = (string?)element.Attribute("hash");
        if (string.IsNullOrWhiteSpace(hash))
        {
            return false;
        }

        fingerprint = new XmppJingleDtlsFingerprint(
            hash,
            element.Value.Trim(),
            (string?)element.Attribute("setup"));
        return true;
    }
}
