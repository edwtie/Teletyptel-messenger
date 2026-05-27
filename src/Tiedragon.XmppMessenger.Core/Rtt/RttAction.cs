namespace Tiedragon.XmppMessenger.Core.Rtt;

public abstract record RttAction;

public sealed record RttInsert(int? Position, string Text) : RttAction;

public sealed record RttErase(int? Position, int Count) : RttAction;

public sealed record RttWait(int Milliseconds) : RttAction;
