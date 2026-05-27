namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStreamConnectionResult(
    XmppStreamFeatureSet Features,
    XmppStreamNegotiationStep NextStep);
