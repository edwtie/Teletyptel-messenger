using Tiedragon.XmppMessenger.Core.Xmpp;

namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed record CaptionRttPublishResult(
    LiveCaptionSegment Caption,
    CaptionShareMode ShareMode,
    XmppRealTimeTextMessage? RttMessage,
    string? FinalBody,
    AgentMessageMarker Marker)
{
    public bool WasShared => RttMessage is not null || FinalBody is not null;
}
