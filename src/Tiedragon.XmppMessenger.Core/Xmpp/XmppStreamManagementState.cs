namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppStreamManagementState
{
    public bool Enabled { get; private set; }

    public bool ResumeSupported { get; private set; }

    public string? StreamId { get; private set; }

    public ulong OutboundStanzaCount { get; private set; }

    public ulong InboundStanzaCount { get; private set; }

    public ulong LastAcknowledgedOutboundCount { get; private set; }

    public ulong UnacknowledgedOutboundCount => OutboundStanzaCount - LastAcknowledgedOutboundCount;

    public void Enable(string? streamId, bool resumeSupported)
    {
        Enabled = true;
        StreamId = streamId;
        ResumeSupported = resumeSupported;
        OutboundStanzaCount = 0;
        InboundStanzaCount = 0;
        LastAcknowledgedOutboundCount = 0;
    }

    public void MarkResumed(ulong inboundHandledByServer, string? streamId = null)
    {
        Enabled = true;
        if (!string.IsNullOrWhiteSpace(streamId))
        {
            StreamId = streamId;
        }

        AcknowledgeOutbound(inboundHandledByServer);
    }

    public void CountOutboundStanza()
    {
        if (Enabled)
        {
            OutboundStanzaCount++;
        }
    }

    public void CountInboundStanza()
    {
        if (Enabled)
        {
            InboundStanzaCount++;
        }
    }

    public void AcknowledgeOutbound(ulong handled)
    {
        if (handled > OutboundStanzaCount)
        {
            LastAcknowledgedOutboundCount = OutboundStanzaCount;
            return;
        }

        LastAcknowledgedOutboundCount = Math.Max(LastAcknowledgedOutboundCount, handled);
    }

    public void Disable()
    {
        Enabled = false;
        ResumeSupported = false;
        StreamId = null;
    }
}
