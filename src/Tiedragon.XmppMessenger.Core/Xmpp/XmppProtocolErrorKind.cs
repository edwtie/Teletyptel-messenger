namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppProtocolErrorKind
{
    Connection,
    StreamClosed,
    StreamError,
    StartTlsFailure,
    AuthenticationFailure,
    ResourceBindingFailure,
    IqError,
    Timeout,
    MalformedXml
}
