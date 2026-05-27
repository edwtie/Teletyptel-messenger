namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppFeatureSet(
    bool Roster,
    bool Presence,
    bool RealTimeText,
    bool ChatStateNotifications,
    bool DeliveryReceipts,
    bool StreamManagement)
{
    public static XmppFeatureSet Alpha1Default { get; } = new(
        Roster: true,
        Presence: true,
        RealTimeText: false,
        ChatStateNotifications: false,
        DeliveryReceipts: false,
        StreamManagement: true);

    public XmppFeatureSet WithRealTimeText(bool enabled)
    {
        return this with { RealTimeText = enabled };
    }
}
