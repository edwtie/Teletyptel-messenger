using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppSocks5Bytestreams
{
    public const string NamespaceName = "http://jabber.org/protocol/bytestreams";

    public static bool SupportsSocks5Bytestreams(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static bool IsBytestreamProxy(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return SupportsSocks5Bytestreams(info)
            && info.Identities.Any(identity =>
                string.Equals(identity.Category, "proxy", StringComparison.Ordinal)
                && string.Equals(identity.Type, "bytestreams", StringComparison.Ordinal));
    }

    public static string ComputeDestinationAddress(string streamId, XmppAddress requester, XmppAddress target)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(streamId);
        ArgumentNullException.ThrowIfNull(requester);
        ArgumentNullException.ThrowIfNull(target);

        var bytes = Encoding.UTF8.GetBytes(streamId + requester.Full + target.Full);
        return Convert.ToHexString(SHA1.HashData(bytes)).ToLowerInvariant();
    }

    public static XmppIq CreateProxyAddressRequest(string id, XmppAddress proxy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(proxy);
        return new XmppIq(XmppIqType.Get, id, new XElement(XName.Get("query", NamespaceName)), To: proxy);
    }

    public static bool TryParseProxyAddressResult(
        XmppIq iq,
        out IReadOnlyList<XmppSocks5StreamHost> streamHosts)
    {
        streamHosts = [];
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("query", NamespaceName))
        {
            return false;
        }

        streamHosts = iq.Payload.Elements(XName.Get("streamhost", NamespaceName))
            .Select(element => XmppSocks5StreamHost.TryParse(element, out var host) ? host : null)
            .Where(host => host is not null)
            .Cast<XmppSocks5StreamHost>()
            .ToArray();
        return streamHosts.Count > 0;
    }

    public static XmppIq CreateBytestreamRequest(
        string id,
        XmppAddress target,
        string streamId,
        IEnumerable<XmppSocks5StreamHost> streamHosts,
        string mode = "tcp")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(target);
        ArgumentException.ThrowIfNullOrWhiteSpace(streamId);
        ArgumentNullException.ThrowIfNull(streamHosts);

        var query = new XElement(XName.Get("query", NamespaceName),
            new XAttribute("sid", streamId));
        if (!string.IsNullOrWhiteSpace(mode) && !string.Equals(mode, "tcp", StringComparison.Ordinal))
        {
            query.SetAttributeValue("mode", mode);
        }

        query.Add(streamHosts.Select(host => host.ToXml()));
        return new XmppIq(XmppIqType.Set, id, query, To: target);
    }

    public static bool TryParseBytestreamRequest(
        XmppIq iq,
        out XmppSocks5BytestreamRequest? request)
    {
        request = null;
        if (iq.Type != XmppIqType.Set || iq.Payload?.Name != XName.Get("query", NamespaceName))
        {
            return false;
        }

        var streamId = (string?)iq.Payload.Attribute("sid");
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return false;
        }

        var hosts = iq.Payload.Elements(XName.Get("streamhost", NamespaceName))
            .Select(element => XmppSocks5StreamHost.TryParse(element, out var host) ? host : null)
            .Where(host => host is not null)
            .Cast<XmppSocks5StreamHost>()
            .ToArray();
        if (hosts.Length == 0)
        {
            return false;
        }

        request = new XmppSocks5BytestreamRequest(
            streamId,
            (string?)iq.Payload.Attribute("mode") ?? "tcp",
            hosts);
        return true;
    }

    public static XmppIq CreateStreamHostUsedResult(
        string id,
        XmppAddress requester,
        XmppAddress streamHost)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(requester);
        ArgumentNullException.ThrowIfNull(streamHost);

        var query = new XElement(XName.Get("query", NamespaceName),
            new XElement(XName.Get("streamhost-used", NamespaceName),
                new XAttribute("jid", streamHost.Full)));
        return new XmppIq(XmppIqType.Result, id, query, To: requester);
    }

    public static bool TryParseStreamHostUsedResult(XmppIq iq, out XmppAddress? streamHost)
    {
        streamHost = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("query", NamespaceName))
        {
            return false;
        }

        var jid = (string?)iq.Payload
            .Element(XName.Get("streamhost-used", NamespaceName))
            ?.Attribute("jid");
        return XmppAddress.TryParse(jid, out streamHost);
    }

    public static XmppIq CreateActivationRequest(
        string id,
        XmppAddress proxy,
        string streamId,
        XmppAddress target)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(proxy);
        ArgumentException.ThrowIfNullOrWhiteSpace(streamId);
        ArgumentNullException.ThrowIfNull(target);

        var query = new XElement(XName.Get("query", NamespaceName),
            new XAttribute("sid", streamId),
            new XElement(XName.Get("activate", NamespaceName), target.Full));
        return new XmppIq(XmppIqType.Set, id, query, To: proxy);
    }

    public static bool TryParseActivationRequest(
        XmppIq iq,
        out XmppSocks5ActivationRequest? request)
    {
        request = null;
        if (iq.Type != XmppIqType.Set || iq.Payload?.Name != XName.Get("query", NamespaceName))
        {
            return false;
        }

        var streamId = (string?)iq.Payload.Attribute("sid");
        var activate = iq.Payload.Element(XName.Get("activate", NamespaceName));
        if (string.IsNullOrWhiteSpace(streamId)
            || activate is null
            || !XmppAddress.TryParse(activate.Value, out var target)
            || target is null)
        {
            return false;
        }

        request = new XmppSocks5ActivationRequest(streamId, target);
        return true;
    }

    internal static bool TryParseInt(string? value, out int result)
    {
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }

    internal static bool TryParseLong(string? value, out long result)
    {
        return long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }
}

public sealed record XmppSocks5StreamHost(
    XmppAddress Jid,
    string Host,
    int? Port = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("streamhost", XmppSocks5Bytestreams.NamespaceName),
            new XAttribute("jid", Jid.Full),
            new XAttribute("host", Host));
        if (Port is not null)
        {
            element.SetAttributeValue("port", Port.Value);
        }

        return element;
    }

    public static bool TryParse(XElement element, out XmppSocks5StreamHost? streamHost)
    {
        streamHost = null;
        if (element.Name != XName.Get("streamhost", XmppSocks5Bytestreams.NamespaceName)
            || !XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid)
            || jid is null)
        {
            return false;
        }

        var host = (string?)element.Attribute("host");
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        var port = XmppSocks5Bytestreams.TryParseInt((string?)element.Attribute("port"), out var parsedPort)
            ? parsedPort
            : (int?)null;
        streamHost = new XmppSocks5StreamHost(jid, host, port);
        return true;
    }
}

public sealed record XmppSocks5BytestreamRequest(
    string StreamId,
    string Mode,
    IReadOnlyList<XmppSocks5StreamHost> StreamHosts);

public sealed record XmppSocks5ActivationRequest(
    string StreamId,
    XmppAddress Target);
