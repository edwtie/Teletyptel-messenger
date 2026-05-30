using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppInBandBytestreams
{
    public const string NamespaceName = "http://jabber.org/protocol/ibb";

    public const int MaxBlockSize = 65535;

    public static bool SupportsInBandBytestreams(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppIq CreateOpenRequest(
        string id,
        XmppAddress target,
        string sessionId,
        int blockSize,
        string stanza = "iq")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(target);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XmppInBandBytestreamOpen(sessionId, blockSize, stanza).ToXml(),
            To: target);
    }

    public static bool TryParseOpenRequest(
        XmppIq iq,
        out XmppInBandBytestreamOpen? open)
    {
        open = null;
        if (iq.Type != XmppIqType.Set)
        {
            return false;
        }

        return XmppInBandBytestreamOpen.TryParse(iq.Payload, out open);
    }

    public static XmppIq CreateDataIq(
        string id,
        XmppAddress target,
        string sessionId,
        ushort sequence,
        byte[] data,
        int? blockSize = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(data);
        ValidateDataLength(data, blockSize);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XmppInBandBytestreamData(sessionId, sequence, data).ToXml(),
            To: target);
    }

    public static bool TryParseDataIq(
        XmppIq iq,
        out XmppInBandBytestreamData? data)
    {
        data = null;
        if (iq.Type != XmppIqType.Set)
        {
            return false;
        }

        return XmppInBandBytestreamData.TryParse(iq.Payload, out data);
    }

    public static XElement CreateDataMessage(
        XmppAddress target,
        string sessionId,
        ushort sequence,
        byte[] data,
        string? id = null,
        XmppAddress? from = null,
        int? blockSize = null)
    {
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(data);
        ValidateDataLength(data, blockSize);

        var message = new XElement(XName.Get("message", XmppXmlNames.ClientNamespace),
            new XAttribute("to", target.Full),
            new XAttribute("type", "chat"),
            new XmppInBandBytestreamData(sessionId, sequence, data).ToXml());
        if (!string.IsNullOrWhiteSpace(id))
        {
            message.SetAttributeValue("id", id);
        }

        if (from is not null)
        {
            message.SetAttributeValue("from", from.Full);
        }

        return message;
    }

    public static bool TryParseDataMessage(
        XElement message,
        out XmppInBandBytestreamData? data)
    {
        data = null;
        if (message.Name != XName.Get("message", XmppXmlNames.ClientNamespace))
        {
            return false;
        }

        return XmppInBandBytestreamData.TryParse(
            message.Element(XName.Get("data", NamespaceName)),
            out data);
    }

    public static XmppIq CreateCloseRequest(
        string id,
        XmppAddress target,
        string sessionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(target);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XmppInBandBytestreamClose(sessionId).ToXml(),
            To: target);
    }

    public static bool TryParseCloseRequest(
        XmppIq iq,
        out XmppInBandBytestreamClose? close)
    {
        close = null;
        if (iq.Type != XmppIqType.Set)
        {
            return false;
        }

        return XmppInBandBytestreamClose.TryParse(iq.Payload, out close);
    }

    public static void ValidateBlockSize(int blockSize)
    {
        if (blockSize is < 1 or > MaxBlockSize)
        {
            throw new ArgumentOutOfRangeException(nameof(blockSize), $"IBB block-size must be between 1 and {MaxBlockSize} bytes.");
        }
    }

    public static void ValidateStanza(string stanza)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(stanza);
        if (stanza is not ("iq" or "message"))
        {
            throw new ArgumentOutOfRangeException(nameof(stanza), "IBB stanza must be 'iq' or 'message'.");
        }
    }

    public static void ValidateDataLength(byte[] data, int? blockSize)
    {
        ArgumentNullException.ThrowIfNull(data);
        if (blockSize is null)
        {
            return;
        }

        ValidateBlockSize(blockSize.Value);
        if (data.Length > blockSize.Value)
        {
            throw new ArgumentOutOfRangeException(nameof(data), $"IBB data chunk is {data.Length} bytes, larger than negotiated block-size {blockSize.Value}.");
        }
    }

    internal static bool TryParseUshort(string? value, out ushort result)
    {
        return ushort.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }
}

public sealed record XmppInBandBytestreamOpen(
    string SessionId,
    int BlockSize,
    string Stanza = "iq")
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(SessionId);
        XmppInBandBytestreams.ValidateBlockSize(BlockSize);
        XmppInBandBytestreams.ValidateStanza(Stanza);

        var element = new XElement(XName.Get("open", XmppInBandBytestreams.NamespaceName),
            new XAttribute("block-size", BlockSize),
            new XAttribute("sid", SessionId));
        if (!string.Equals(Stanza, "iq", StringComparison.Ordinal))
        {
            element.SetAttributeValue("stanza", Stanza);
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppInBandBytestreamOpen? open)
    {
        open = null;
        if (element?.Name != XName.Get("open", XmppInBandBytestreams.NamespaceName))
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

        open = new XmppInBandBytestreamOpen(sessionId, blockSize, stanza);
        return true;
    }
}

public sealed record XmppInBandBytestreamData(
    string SessionId,
    ushort Sequence,
    byte[] Bytes)
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(SessionId);
        ArgumentNullException.ThrowIfNull(Bytes);

        return new XElement(XName.Get("data", XmppInBandBytestreams.NamespaceName),
            new XAttribute("seq", Sequence),
            new XAttribute("sid", SessionId),
            Convert.ToBase64String(Bytes));
    }

    public static bool TryParse(XElement? element, out XmppInBandBytestreamData? data)
    {
        data = null;
        if (element?.Name != XName.Get("data", XmppInBandBytestreams.NamespaceName)
            || !XmppInBandBytestreams.TryParseUshort((string?)element.Attribute("seq"), out var sequence))
        {
            return false;
        }

        var sessionId = (string?)element.Attribute("sid");
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        try
        {
            data = new XmppInBandBytestreamData(
                sessionId,
                sequence,
                Convert.FromBase64String(element.Value));
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed record XmppInBandBytestreamClose(string SessionId)
{
    public XElement ToXml()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(SessionId);
        return new XElement(XName.Get("close", XmppInBandBytestreams.NamespaceName),
            new XAttribute("sid", SessionId));
    }

    public static bool TryParse(XElement? element, out XmppInBandBytestreamClose? close)
    {
        close = null;
        if (element?.Name != XName.Get("close", XmppInBandBytestreams.NamespaceName))
        {
            return false;
        }

        var sessionId = (string?)element.Attribute("sid");
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        close = new XmppInBandBytestreamClose(sessionId);
        return true;
    }
}
