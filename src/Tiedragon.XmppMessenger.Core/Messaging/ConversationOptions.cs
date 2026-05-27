namespace Tiedragon.XmppMessenger.Core.Messaging;

public sealed record ConversationOptions(
    bool RealTimeTextEnabled,
    bool SendMessageSnapshotOnEnter)
{
    public static ConversationOptions Default { get; } = new(
        RealTimeTextEnabled: true,
        SendMessageSnapshotOnEnter: true);

    public ConversationOptions WithRealTimeText(bool enabled)
    {
        return this with { RealTimeTextEnabled = enabled };
    }
}
