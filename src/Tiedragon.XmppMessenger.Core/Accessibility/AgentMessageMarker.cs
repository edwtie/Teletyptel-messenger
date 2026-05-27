namespace Tiedragon.XmppMessenger.Core.Accessibility;

public sealed record AgentMessageMarker(
    AgentOutputKind Kind,
    string Source,
    double? Confidence = null,
    bool IsUncertain = false)
{
    public static AgentMessageMarker Human(string source = "user")
    {
        return new AgentMessageMarker(AgentOutputKind.Human, source);
    }

    public static AgentMessageMarker Caption(string source, double? confidence = null, bool isUncertain = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(source);
        return new AgentMessageMarker(AgentOutputKind.Caption, source, confidence, isUncertain);
    }
}
