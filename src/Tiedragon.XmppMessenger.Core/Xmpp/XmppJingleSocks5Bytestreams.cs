using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppJingleSocks5Bytestreams
{
    public const string NamespaceName = "urn:xmpp:jingle:transports:s5b:1";

    public static bool SupportsJingleSocks5Bytestreams(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static string ComputeDestinationAddress(string streamId, XmppAddress requester, XmppAddress target)
    {
        return XmppSocks5Bytestreams.ComputeDestinationAddress(streamId, requester, target);
    }

    public static XmppJingleContent CreateTransportContent(
        string name,
        XmppJingleSocks5Transport transport,
        string creator = "initiator",
        string senders = "initiator")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(transport);
        return new XmppJingleContent(name, creator, senders, null, transport.ToXml());
    }

    public static bool TryParseTransport(
        XmppJingleContent content,
        out XmppJingleSocks5Transport? transport)
    {
        ArgumentNullException.ThrowIfNull(content);
        return XmppJingleSocks5Transport.TryParse(content.Transport, out transport);
    }
}

public sealed record XmppJingleSocks5Transport(
    string StreamId,
    string? DestinationAddress = null,
    string Mode = "tcp",
    IReadOnlyList<XmppJingleSocks5Candidate>? Candidates = null,
    XmppJingleSocks5CandidateUsed? CandidateUsed = null,
    bool CandidateError = false,
    XmppJingleSocks5Activated? Activated = null,
    bool ProxyError = false)
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(StreamId);

        var element = new XElement(XName.Get("transport", XmppJingleSocks5Bytestreams.NamespaceName),
            new XAttribute("sid", StreamId));
        if (!string.IsNullOrWhiteSpace(DestinationAddress))
        {
            element.SetAttributeValue("dstaddr", DestinationAddress);
        }

        if (!string.IsNullOrWhiteSpace(Mode) && !string.Equals(Mode, "tcp", StringComparison.Ordinal))
        {
            element.SetAttributeValue("mode", Mode);
        }

        if (Candidates is not null)
        {
            element.Add(Candidates.Select(candidate => candidate.ToXml()));
        }

        if (CandidateUsed is not null)
        {
            element.Add(CandidateUsed.ToXml());
        }

        if (CandidateError)
        {
            element.Add(new XElement(XName.Get("candidate-error", XmppJingleSocks5Bytestreams.NamespaceName)));
        }

        if (Activated is not null)
        {
            element.Add(Activated.ToXml());
        }

        if (ProxyError)
        {
            element.Add(new XElement(XName.Get("proxy-error", XmppJingleSocks5Bytestreams.NamespaceName)));
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppJingleSocks5Transport? transport)
    {
        transport = null;
        if (element?.Name != XName.Get("transport", XmppJingleSocks5Bytestreams.NamespaceName))
        {
            return false;
        }

        var streamId = (string?)element.Attribute("sid");
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return false;
        }

        var candidates = element.Elements(XName.Get("candidate", XmppJingleSocks5Bytestreams.NamespaceName))
            .Select(candidate => XmppJingleSocks5Candidate.TryParse(candidate, out var parsed) ? parsed : null)
            .Where(candidate => candidate is not null)
            .Cast<XmppJingleSocks5Candidate>()
            .ToArray();

        XmppJingleSocks5CandidateUsed.TryParse(
            element.Element(XName.Get("candidate-used", XmppJingleSocks5Bytestreams.NamespaceName)),
            out var candidateUsed);
        XmppJingleSocks5Activated.TryParse(
            element.Element(XName.Get("activated", XmppJingleSocks5Bytestreams.NamespaceName)),
            out var activated);

        transport = new XmppJingleSocks5Transport(
            streamId,
            (string?)element.Attribute("dstaddr"),
            (string?)element.Attribute("mode") ?? "tcp",
            candidates,
            candidateUsed,
            element.Element(XName.Get("candidate-error", XmppJingleSocks5Bytestreams.NamespaceName)) is not null,
            activated,
            element.Element(XName.Get("proxy-error", XmppJingleSocks5Bytestreams.NamespaceName)) is not null);
        return true;
    }
}

public sealed record XmppJingleSocks5Candidate(
    string CandidateId,
    string Host,
    XmppAddress Jid,
    int Port,
    long Priority,
    string Type = "direct")
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(CandidateId);
        ArgumentException.ThrowIfNullOrWhiteSpace(Host);
        ArgumentNullException.ThrowIfNull(Jid);
        ArgumentException.ThrowIfNullOrWhiteSpace(Type);

        return new XElement(XName.Get("candidate", XmppJingleSocks5Bytestreams.NamespaceName),
            new XAttribute("cid", CandidateId),
            new XAttribute("host", Host),
            new XAttribute("jid", Jid.Full),
            new XAttribute("port", Port),
            new XAttribute("priority", Priority),
            new XAttribute("type", Type));
    }

    public static bool TryParse(XElement element, out XmppJingleSocks5Candidate? candidate)
    {
        candidate = null;
        if (element.Name != XName.Get("candidate", XmppJingleSocks5Bytestreams.NamespaceName)
            || !XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid)
            || jid is null
            || !XmppSocks5Bytestreams.TryParseInt((string?)element.Attribute("port"), out var port)
            || !XmppSocks5Bytestreams.TryParseLong((string?)element.Attribute("priority"), out var priority))
        {
            return false;
        }

        var cid = (string?)element.Attribute("cid");
        var host = (string?)element.Attribute("host");
        if (string.IsNullOrWhiteSpace(cid) || string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        candidate = new XmppJingleSocks5Candidate(
            cid,
            host,
            jid,
            port,
            priority,
            (string?)element.Attribute("type") ?? "direct");
        return true;
    }
}

public sealed record XmppJingleSocks5CandidateUsed(string CandidateId)
{
    public XElement ToXml()
    {
        return new XElement(XName.Get("candidate-used", XmppJingleSocks5Bytestreams.NamespaceName),
            new XAttribute("cid", CandidateId));
    }

    public static bool TryParse(XElement? element, out XmppJingleSocks5CandidateUsed? candidateUsed)
    {
        candidateUsed = null;
        if (element?.Name != XName.Get("candidate-used", XmppJingleSocks5Bytestreams.NamespaceName))
        {
            return false;
        }

        var cid = (string?)element.Attribute("cid");
        if (string.IsNullOrWhiteSpace(cid))
        {
            return false;
        }

        candidateUsed = new XmppJingleSocks5CandidateUsed(cid);
        return true;
    }
}

public sealed record XmppJingleSocks5Activated(string? CandidateId = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("activated", XmppJingleSocks5Bytestreams.NamespaceName));
        if (!string.IsNullOrWhiteSpace(CandidateId))
        {
            element.SetAttributeValue("cid", CandidateId);
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppJingleSocks5Activated? activated)
    {
        activated = null;
        if (element?.Name != XName.Get("activated", XmppJingleSocks5Bytestreams.NamespaceName))
        {
            return false;
        }

        activated = new XmppJingleSocks5Activated((string?)element.Attribute("cid"));
        return true;
    }
}
