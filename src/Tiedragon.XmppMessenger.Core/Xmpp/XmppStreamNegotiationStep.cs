namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppStreamNegotiationStep
{
    OpenStream,
    StartTls,
    Authenticate,
    BindResource,
    Ready
}
