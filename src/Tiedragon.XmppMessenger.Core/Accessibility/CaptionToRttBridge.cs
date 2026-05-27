using Tiedragon.XmppMessenger.Core.Rtt;
using Tiedragon.XmppMessenger.Core.Xmpp;

namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed class CaptionToRttBridge
{
    private readonly RttComposer _composer = new();
    private bool _started;

    public CaptionToRttBridge(XmppAddress remoteAddress, CaptionShareMode shareMode = CaptionShareMode.LocalOnly)
    {
        RemoteAddress = remoteAddress ?? throw new ArgumentNullException(nameof(remoteAddress));
        ShareMode = shareMode;
    }

    public XmppAddress RemoteAddress { get; }

    public CaptionShareMode ShareMode { get; set; }

    public CaptionRttPublishResult Publish(LiveCaptionSegment caption)
    {
        ArgumentNullException.ThrowIfNull(caption);

        var marker = AgentMessageMarker.Caption("speech-to-text", caption.Confidence, caption.IsUncertain);

        return ShareMode switch
        {
            CaptionShareMode.LocalOnly => new CaptionRttPublishResult(caption, ShareMode, null, null, marker),
            CaptionShareMode.RemoteFinalMessage when caption.State == CaptionState.Final =>
                new CaptionRttPublishResult(caption, ShareMode, null, caption.Text, marker),
            CaptionShareMode.RemoteFinalMessage =>
                new CaptionRttPublishResult(caption, ShareMode, null, null, marker),
            CaptionShareMode.RemoteRtt => PublishRtt(caption, marker),
            _ => throw new NotSupportedException($"Unsupported caption share mode {ShareMode}.")
        };
    }

    private CaptionRttPublishResult PublishRtt(LiveCaptionSegment caption, AgentMessageMarker marker)
    {
        var packet = _started
            ? _composer.Replace(caption.Text)
            : _composer.Reset(caption.Text);

        _started = true;

        var message = new XmppRealTimeTextMessage(
            RemoteAddress,
            packet,
            caption.State == CaptionState.Final ? caption.Text : string.Empty);

        return new CaptionRttPublishResult(
            caption,
            ShareMode,
            message,
            caption.State == CaptionState.Final ? caption.Text : null,
            marker);
    }
}
