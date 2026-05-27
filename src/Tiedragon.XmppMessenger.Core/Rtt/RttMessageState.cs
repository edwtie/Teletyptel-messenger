using System.Text;

namespace Tiedragon.XmppMessenger.Core.Rtt;

public sealed class RttMessageState
{
    public string Text { get; private set; } = string.Empty;

    public int? LastSequence { get; private set; }

    public bool IsSynchronized { get; private set; } = true;

    public bool Apply(RttPacket packet)
    {
        ArgumentNullException.ThrowIfNull(packet);

        if (packet.Event is RttEvent.Init or RttEvent.Cancel)
        {
            return true;
        }

        if (packet.Event is RttEvent.New or RttEvent.Reset)
        {
            Text = string.Empty;
            IsSynchronized = true;
            LastSequence = packet.Sequence;
            ApplyActions(packet.Actions);
            return true;
        }

        if (!IsSynchronized || !LastSequence.HasValue || packet.Sequence != LastSequence.Value + 1)
        {
            IsSynchronized = false;
            return false;
        }

        LastSequence = packet.Sequence;
        ApplyActions(packet.Actions);
        return true;
    }

    public void AcceptFinalBody(string body)
    {
        Text = body ?? string.Empty;
        IsSynchronized = true;
        LastSequence = null;
    }

    private void ApplyActions(IEnumerable<RttAction> actions)
    {
        foreach (var action in actions)
        {
            switch (action)
            {
                case RttInsert insert:
                    Text = InsertAtCodePoint(Text, insert.Position ?? CountCodePoints(Text), insert.Text);
                    break;
                case RttErase erase:
                    Text = EraseBeforeCodePoint(Text, erase.Position ?? CountCodePoints(Text), erase.Count);
                    break;
            }
        }
    }

    private static string InsertAtCodePoint(string value, int position, string insert)
    {
        var utf16Index = GetUtf16IndexForCodePoint(value, position);
        return value.Insert(utf16Index, insert);
    }

    private static string EraseBeforeCodePoint(string value, int position, int count)
    {
        var length = CountCodePoints(value);
        var end = Math.Clamp(position, 0, length);
        var start = Math.Max(0, end - Math.Max(0, count));

        var startIndex = GetUtf16IndexForCodePoint(value, start);
        var endIndex = GetUtf16IndexForCodePoint(value, end);
        return value.Remove(startIndex, endIndex - startIndex);
    }

    private static int CountCodePoints(string value)
    {
        var count = 0;
        foreach (var _ in value.EnumerateRunes())
        {
            count++;
        }

        return count;
    }

    private static int GetUtf16IndexForCodePoint(string value, int codePointIndex)
    {
        if (codePointIndex <= 0)
        {
            return 0;
        }

        var count = 0;
        var utf16Index = 0;
        foreach (var rune in value.EnumerateRunes())
        {
            if (count == codePointIndex)
            {
                return utf16Index;
            }

            utf16Index += rune.Utf16SequenceLength;
            count++;
        }

        return value.Length;
    }
}
