namespace Tiedragon.XmppMessenger.Core.Rtt;

public sealed class RttComposer
{
    private int _sequence;
    private string _currentText = string.Empty;

    public RttPacket Reset(string text)
    {
        _currentText = text ?? string.Empty;

        var actions = string.IsNullOrEmpty(text)
            ? Array.Empty<RttAction>()
            : [new RttInsert(0, text)];

        return new RttPacket(RttEvent.Reset, _sequence++, actions);
    }

    public RttPacket Replace(string text)
    {
        text ??= string.Empty;
        var actions = CreateDeltaActions(_currentText, text);
        _currentText = text;

        return new RttPacket(RttEvent.Edit, _sequence++, actions);
    }

    public RttPacket Cancel()
    {
        return new RttPacket(RttEvent.Cancel, _sequence++, Array.Empty<RttAction>());
    }

    private static IReadOnlyList<RttAction> CreateDeltaActions(string oldText, string newText)
    {
        if (oldText == newText)
        {
            return Array.Empty<RttAction>();
        }

        var oldRunes = oldText.EnumerateRunes().ToArray();
        var newRunes = newText.EnumerateRunes().ToArray();

        var prefixLength = CountCommonPrefix(oldRunes, newRunes);
        var suffixLength = CountCommonSuffix(oldRunes, newRunes, prefixLength);

        var removedCount = oldRunes.Length - prefixLength - suffixLength;
        var insertedCount = newRunes.Length - prefixLength - suffixLength;
        var actions = new List<RttAction>(2);

        if (removedCount > 0)
        {
            actions.Add(new RttErase(prefixLength + removedCount, removedCount));
        }

        if (insertedCount > 0)
        {
            actions.Add(new RttInsert(prefixLength, SliceRunes(newRunes, prefixLength, insertedCount)));
        }

        return actions;
    }

    private static int CountCommonPrefix(System.Text.Rune[] oldRunes, System.Text.Rune[] newRunes)
    {
        var length = Math.Min(oldRunes.Length, newRunes.Length);
        var index = 0;
        while (index < length && oldRunes[index] == newRunes[index])
        {
            index++;
        }

        return index;
    }

    private static int CountCommonSuffix(System.Text.Rune[] oldRunes, System.Text.Rune[] newRunes, int prefixLength)
    {
        var oldIndex = oldRunes.Length - 1;
        var newIndex = newRunes.Length - 1;
        var suffixLength = 0;

        while (oldIndex >= prefixLength
            && newIndex >= prefixLength
            && oldRunes[oldIndex] == newRunes[newIndex])
        {
            oldIndex--;
            newIndex--;
            suffixLength++;
        }

        return suffixLength;
    }

    private static string SliceRunes(System.Text.Rune[] runes, int start, int count)
    {
        return string.Concat(runes.Skip(start).Take(count));
    }
}
