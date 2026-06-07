using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppMessageStyling
{
    public const string NamespaceName = "urn:xmpp:styling:0";

    public static bool SupportsMessageStyling(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XElement CreateUnstyled()
    {
        return new XElement(XName.Get("unstyled", NamespaceName));
    }

    public static bool IsStylingDisabled(XElement message)
    {
        ArgumentNullException.ThrowIfNull(message);
        return message.Element(XName.Get("unstyled", NamespaceName)) is not null;
    }

    public static IReadOnlyList<XmppMessageStyleSpan> ParseLine(string text)
    {
        text ??= string.Empty;
        var spans = new List<XmppMessageStyleSpan>();
        var position = 0;
        while (position < text.Length)
        {
            var opener = text[position];
            if (!IsStyleMarker(opener)
                || !IsValidOpening(text, position)
                || !TryFindClosing(text, position, opener, out var closing))
            {
                var next = FindNextCandidate(text, position + 1);
                spans.Add(new XmppMessageStyleSpan(XmppMessageStyleKind.Plain, text[position..next]));
                position = next;
                continue;
            }

            if (position > 0 && spans.Count > 0 && spans[^1].Kind == XmppMessageStyleKind.Plain)
            {
                // Keep directives visible; only the enclosed text gets semantic style.
            }

            spans.Add(new XmppMessageStyleSpan(KindFor(opener), text[(position + 1)..closing]));
            position = closing + 1;
        }

        return MergeAdjacentPlainSpans(spans);
    }

    private static IReadOnlyList<XmppMessageStyleSpan> MergeAdjacentPlainSpans(IReadOnlyList<XmppMessageStyleSpan> spans)
    {
        var merged = new List<XmppMessageStyleSpan>();
        foreach (var span in spans)
        {
            if (span.Kind == XmppMessageStyleKind.Plain
                && merged.Count > 0
                && merged[^1].Kind == XmppMessageStyleKind.Plain)
            {
                merged[^1] = merged[^1] with { Text = merged[^1].Text + span.Text };
                continue;
            }

            merged.Add(span);
        }

        return merged;
    }

    private static int FindNextCandidate(string text, int start)
    {
        for (var index = start; index < text.Length; index++)
        {
            if (IsStyleMarker(text[index]))
            {
                return index;
            }
        }

        return text.Length;
    }

    private static bool TryFindClosing(string text, int opening, char marker, out int closing)
    {
        closing = -1;
        for (var index = opening + 1; index < text.Length; index++)
        {
            if (text[index] is '\r' or '\n')
            {
                return false;
            }

            if (text[index] != marker)
            {
                continue;
            }

            if (index == opening + 1 || char.IsWhiteSpace(text[index - 1]))
            {
                continue;
            }

            closing = index;
            return true;
        }

        return false;
    }

    private static bool IsValidOpening(string text, int position)
    {
        if (position + 1 >= text.Length || char.IsWhiteSpace(text[position + 1]))
        {
            return false;
        }

        return position == 0 || char.IsWhiteSpace(text[position - 1]) || IsStyleMarker(text[position - 1]);
    }

    private static bool IsStyleMarker(char value)
    {
        return value is '*' or '_' or '~' or '`';
    }

    private static XmppMessageStyleKind KindFor(char marker)
    {
        return marker switch
        {
            '*' => XmppMessageStyleKind.Strong,
            '_' => XmppMessageStyleKind.Emphasis,
            '~' => XmppMessageStyleKind.Strikethrough,
            '`' => XmppMessageStyleKind.Preformatted,
            _ => XmppMessageStyleKind.Plain
        };
    }
}

public sealed record XmppMessageStyleSpan(XmppMessageStyleKind Kind, string Text);

public enum XmppMessageStyleKind
{
    Plain,
    Emphasis,
    Strong,
    Strikethrough,
    Preformatted
}
