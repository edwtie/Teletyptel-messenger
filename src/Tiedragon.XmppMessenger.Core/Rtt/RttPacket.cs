using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Rtt;

public sealed record RttPacket(RttEvent Event, int Sequence, IReadOnlyList<RttAction> Actions)
{
    public const string NamespaceName = "urn:xmpp:rtt:0";

    public static RttPacket Parse(string xml)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(xml);

        var element = XElement.Parse(xml, LoadOptions.PreserveWhitespace);
        if (element.Name != XName.Get("rtt", NamespaceName))
        {
            throw new FormatException("Expected an XEP-0301 rtt element.");
        }

        var sequenceText = (string?)element.Attribute("seq");
        if (!int.TryParse(sequenceText, out var sequence) || sequence < 0)
        {
            throw new FormatException("The rtt seq attribute must be a non-negative integer.");
        }

        var rttEvent = ParseEvent((string?)element.Attribute("event"));
        var actions = new List<RttAction>();

        foreach (var child in element.Elements())
        {
            if (child.Name.NamespaceName != NamespaceName)
            {
                continue;
            }

            switch (child.Name.LocalName)
            {
                case "t":
                    actions.Add(new RttInsert(ParseOptionalNonNegativeInt(child, "p"), child.Value));
                    break;
                case "e":
                    actions.Add(new RttErase(
                        ParseOptionalNonNegativeInt(child, "p"),
                        ParseOptionalNonNegativeInt(child, "n") ?? 1));
                    break;
                case "w":
                    actions.Add(new RttWait(ParseOptionalNonNegativeInt(child, "n") ?? 0));
                    break;
            }
        }

        return new RttPacket(rttEvent, sequence, actions);
    }

    public string ToXml()
    {
        XNamespace ns = NamespaceName;
        var element = new XElement(ns + "rtt", new XAttribute("seq", Sequence));

        if (Event != RttEvent.Edit)
        {
            element.Add(new XAttribute("event", FormatEvent(Event)));
        }

        foreach (var action in Actions)
        {
            element.Add(ToElement(ns, action));
        }

        return element.ToString(SaveOptions.DisableFormatting);
    }

    private static XElement ToElement(XNamespace ns, RttAction action)
    {
        return action switch
        {
            RttInsert insert => CreateInsert(ns, insert),
            RttErase erase => CreateErase(ns, erase),
            RttWait wait => new XElement(ns + "w", new XAttribute("n", wait.Milliseconds)),
            _ => throw new NotSupportedException($"Unsupported RTT action {action.GetType().Name}.")
        };
    }

    private static XElement CreateInsert(XNamespace ns, RttInsert insert)
    {
        var element = new XElement(ns + "t", insert.Text);
        if (insert.Position.HasValue)
        {
            element.Add(new XAttribute("p", insert.Position.Value));
        }

        return element;
    }

    private static XElement CreateErase(XNamespace ns, RttErase erase)
    {
        var element = new XElement(ns + "e", new XAttribute("n", erase.Count));
        if (erase.Position.HasValue)
        {
            element.Add(new XAttribute("p", erase.Position.Value));
        }

        return element;
    }

    private static int? ParseOptionalNonNegativeInt(XElement element, string name)
    {
        var text = (string?)element.Attribute(name);
        if (text is null)
        {
            return null;
        }

        if (!int.TryParse(text, out var value) || value < 0)
        {
            throw new FormatException($"The {name} attribute must be a non-negative integer.");
        }

        return value;
    }

    private static RttEvent ParseEvent(string? value)
    {
        return value switch
        {
            null or "" or "edit" => RttEvent.Edit,
            "new" => RttEvent.New,
            "reset" => RttEvent.Reset,
            "init" => RttEvent.Init,
            "cancel" => RttEvent.Cancel,
            _ => throw new FormatException($"Unknown RTT event '{value}'.")
        };
    }

    private static string FormatEvent(RttEvent rttEvent)
    {
        return rttEvent switch
        {
            RttEvent.Edit => "edit",
            RttEvent.New => "new",
            RttEvent.Reset => "reset",
            RttEvent.Init => "init",
            RttEvent.Cancel => "cancel",
            _ => throw new NotSupportedException($"Unsupported RTT event {rttEvent}.")
        };
    }
}
