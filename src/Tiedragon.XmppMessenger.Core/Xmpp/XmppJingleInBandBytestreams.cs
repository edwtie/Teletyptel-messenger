using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppJingleInBandBytestreams
{
    public const string NamespaceName = "urn:xmpp:jingle:transports:ibb:1";

    public static bool SupportsJingleInBandBytestreams(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppJingleContent CreateTransportContent(
        string name,
        XmppJingleInBandBytestreamTransport transport,
        string creator = "initiator",
        string senders = "initiator")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(transport);
        return new XmppJingleContent(name, creator, senders, null, transport.ToXml());
    }

    public static bool TryParseTransport(
        XmppJingleContent content,
        out XmppJingleInBandBytestreamTransport? transport)
    {
        ArgumentNullException.ThrowIfNull(content);
        return XmppJingleInBandBytestreamTransport.TryParse(content.Transport, out transport);
    }

    public static XmppIq CreateOpenRequestFromTransport(
        string id,
        XmppAddress target,
        XmppJingleInBandBytestreamTransport transport)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(transport);

        return XmppInBandBytestreams.CreateOpenRequest(
            id,
            target,
            transport.SessionId,
            transport.BlockSize,
            transport.Stanza);
    }
}

public sealed record XmppJingleInBandBytestreamTransport(
    string SessionId,
    int BlockSize,
    string Stanza = "iq")
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(SessionId);
        XmppInBandBytestreams.ValidateBlockSize(BlockSize);
        XmppInBandBytestreams.ValidateStanza(Stanza);

        var element = new XElement(XName.Get("transport", XmppJingleInBandBytestreams.NamespaceName),
            new XAttribute("block-size", BlockSize),
            new XAttribute("sid", SessionId));
        if (!string.Equals(Stanza, "iq", StringComparison.Ordinal))
        {
            element.SetAttributeValue("stanza", Stanza);
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppJingleInBandBytestreamTransport? transport)
    {
        transport = null;
        if (element?.Name != XName.Get("transport", XmppJingleInBandBytestreams.NamespaceName))
        {
            return false;
        }

        var sessionId = (string?)element.Attribute("sid");
        if (string.IsNullOrWhiteSpace(sessionId)
            || !XmppInBandBytestreams.TryParseUshort((string?)element.Attribute("block-size"), out var blockSize))
        {
            return false;
        }

        var stanza = (string?)element.Attribute("stanza") ?? "iq";
        if (stanza is not ("iq" or "message"))
        {
            return false;
        }

        transport = new XmppJingleInBandBytestreamTransport(sessionId, blockSize, stanza);
        return true;
    }
}
