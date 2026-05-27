namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppLoginResult(
    XmppAddress BoundJid,
    string SaslMechanism,
    bool TlsActive);
