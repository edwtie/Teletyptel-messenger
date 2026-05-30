using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppMucSelfPingStatus
{
    Joined,
    NotJoined,
    NicknameChanged,
    TemporaryFailure,
    Error
}

public static class XmppMucSelfPing
{
    public const string PingNamespaceName = "urn:xmpp:ping";

    public const string OptimizationFeature = "urn:xmpp:features:0045-self-ping";

    public static bool SupportsSelfPingOptimization(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(OptimizationFeature);
    }

    public static XmppIq CreatePingRequest(
        string id,
        XmppAddress room,
        string nickname,
        XmppAddress? from = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(room);
        ArgumentException.ThrowIfNullOrWhiteSpace(nickname);

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(XName.Get("ping", PingNamespaceName)),
            To: XmppMultiUserChat.ToOccupantJid(room, nickname),
            From: from);
    }

    public static bool TryParsePingResponse(
        XmppIq iq,
        out XmppMucSelfPingStatus status,
        out XmppStanzaError? error)
    {
        ArgumentNullException.ThrowIfNull(iq);
        error = null;

        if (iq.Type == XmppIqType.Result)
        {
            status = XmppMucSelfPingStatus.Joined;
            return true;
        }

        if (iq.Type != XmppIqType.Error || iq.Payload is null)
        {
            status = XmppMucSelfPingStatus.Error;
            return false;
        }

        XmppStanzaError.TryParse(iq.ToXml(), out error);
        status = error?.Condition switch
        {
            "item-not-found" => XmppMucSelfPingStatus.NotJoined,
            "recipient-unavailable" => XmppMucSelfPingStatus.NotJoined,
            "conflict" => XmppMucSelfPingStatus.NicknameChanged,
            "remote-server-timeout" => XmppMucSelfPingStatus.TemporaryFailure,
            "service-unavailable" => XmppMucSelfPingStatus.TemporaryFailure,
            _ => XmppMucSelfPingStatus.Error
        };
        return true;
    }
}
