using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppStreamReader
{
    private readonly StringBuilder _buffer = new();
    private bool _streamOpened;

    public void Append(ReadOnlySpan<char> text)
    {
        _buffer.Append(text);
    }

    public IReadOnlyList<XmppStreamNode> ReadAvailable()
    {
        var nodes = new List<XmppStreamNode>();

        while (true)
        {
            TrimLeadingWhitespace();

            if (_buffer.Length == 0)
            {
                break;
            }

            if (!_streamOpened)
            {
                if (!TryReadOpenStream(out var openStream))
                {
                    break;
                }

                _streamOpened = true;
                nodes.Add(XmppStreamNode.StreamOpened(openStream));
                continue;
            }

            if (StartsWith("</stream:stream>"))
            {
                _buffer.Remove(0, "</stream:stream>".Length);
                _streamOpened = false;
                nodes.Add(XmppStreamNode.StreamClosed());
                continue;
            }

            if (!TryReadCompleteElement(out var xml))
            {
                break;
            }

            nodes.Add(XmppStreamNode.FromElement(ParseStreamElement(xml)));
        }

        return nodes;
    }

    private static XElement ParseStreamElement(string xml)
    {
        var wrapped = "<wrapper"
            + $" xmlns=\"{XmppXmlNames.ClientNamespace}\""
            + $" xmlns:stream=\"{XmppXmlNames.StreamNamespace}\""
            + ">"
            + xml
            + "</wrapper>";

        return XElement.Parse(wrapped, LoadOptions.PreserveWhitespace).Elements().Single();
    }

    private bool TryReadOpenStream(out string openStream)
    {
        openStream = string.Empty;

        if (!StartsWith("<stream:stream"))
        {
            throw new FormatException("Expected an opening XMPP stream.");
        }

        var end = FindTagEnd(0);
        if (end < 0)
        {
            return false;
        }

        openStream = _buffer.ToString(0, end + 1);
        _buffer.Remove(0, end + 1);
        return true;
    }

    private bool TryReadCompleteElement(out string xml)
    {
        xml = string.Empty;

        if (_buffer[0] != '<')
        {
            throw new FormatException("Expected an XML element.");
        }

        var depth = 0;
        var index = 0;

        while (index < _buffer.Length)
        {
            if (_buffer[index] != '<')
            {
                index++;
                continue;
            }

            if (StartsWithAt("<!--", index))
            {
                var endComment = IndexOf("-->", index + 4);
                if (endComment < 0)
                {
                    return false;
                }

                index = endComment + 3;
                continue;
            }

            if (StartsWithAt("<![CDATA[", index))
            {
                var endCData = IndexOf("]]>", index + 9);
                if (endCData < 0)
                {
                    return false;
                }

                index = endCData + 3;
                continue;
            }

            if (StartsWithAt("<?", index))
            {
                var endInstruction = IndexOf("?>", index + 2);
                if (endInstruction < 0)
                {
                    return false;
                }

                index = endInstruction + 2;
                continue;
            }

            var tagEnd = FindTagEnd(index);
            if (tagEnd < 0)
            {
                return false;
            }

            if (index + 1 < _buffer.Length && _buffer[index + 1] == '/')
            {
                depth--;
                if (depth == 0)
                {
                    xml = _buffer.ToString(0, tagEnd + 1);
                    _buffer.Remove(0, tagEnd + 1);
                    return true;
                }
            }
            else if (IsSelfClosingTag(index, tagEnd))
            {
                if (depth == 0)
                {
                    xml = _buffer.ToString(0, tagEnd + 1);
                    _buffer.Remove(0, tagEnd + 1);
                    return true;
                }
            }
            else
            {
                depth++;
            }

            index = tagEnd + 1;
        }

        return false;
    }

    private int FindTagEnd(int start)
    {
        var quote = '\0';

        for (var index = start; index < _buffer.Length; index++)
        {
            var ch = _buffer[index];
            if (quote != '\0')
            {
                if (ch == quote)
                {
                    quote = '\0';
                }

                continue;
            }

            if (ch is '"' or '\'')
            {
                quote = ch;
                continue;
            }

            if (ch == '>')
            {
                return index;
            }
        }

        return -1;
    }

    private bool IsSelfClosingTag(int start, int end)
    {
        for (var index = end - 1; index > start; index--)
        {
            if (char.IsWhiteSpace(_buffer[index]))
            {
                continue;
            }

            return _buffer[index] == '/';
        }

        return false;
    }

    private void TrimLeadingWhitespace()
    {
        var count = 0;
        while (count < _buffer.Length && char.IsWhiteSpace(_buffer[count]))
        {
            count++;
        }

        if (count > 0)
        {
            _buffer.Remove(0, count);
        }
    }

    private bool StartsWith(string value)
    {
        return StartsWithAt(value, 0);
    }

    private bool StartsWithAt(string value, int start)
    {
        if (start + value.Length > _buffer.Length)
        {
            return false;
        }

        for (var index = 0; index < value.Length; index++)
        {
            if (_buffer[start + index] != value[index])
            {
                return false;
            }
        }

        return true;
    }

    private int IndexOf(string value, int start)
    {
        for (var index = start; index <= _buffer.Length - value.Length; index++)
        {
            if (StartsWithAt(value, index))
            {
                return index;
            }
        }

        return -1;
    }
}
