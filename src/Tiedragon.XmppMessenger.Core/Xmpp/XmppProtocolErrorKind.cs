namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppProtocolErrorKind
{
    Connection,
    StreamClosed,
    StreamError,
    DirectTlsFailure,
    StartTlsFailure,
    AuthenticationFailure,
    ResourceBindingFailure,
    IqError,
    Timeout,
    MalformedXml
}
