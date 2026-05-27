using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppArchiveQueryOptions(
    DateTimeOffset? Start = null,
    DateTimeOffset? End = null,
    XmppAddress? With = null,
    int? Max = null,
    string? After = null,
    string? Before = null);

public sealed record XmppArchivedMessage(
    string Id,
    string? QueryId,
    DateTimeOffset? DelayStamp,
    XmppChatMessage Message);

public sealed record XmppArchiveResultSet(
    string? First,
    string? Last,
    int? Count,
    int? FirstIndex);

public static class XmppMessageArchive
{
    public const string NamespaceName = "urn:xmpp:mam:2";

    public const string ResultSetManagementNamespace = "http://jabber.org/protocol/rsm";

    public const string DataFormsNamespace = "jabber:x:data";

    public const string DelayNamespace = "urn:xmpp:delay";

    public static XmppIq CreateQuery(string id, XmppArchiveQueryOptions? options = null, string? queryId = null)
    {
        options ??= new XmppArchiveQueryOptions();
        var query = new XElement(XName.Get("query", NamespaceName));
        if (!string.IsNullOrWhiteSpace(queryId))
        {
            query.SetAttributeValue("queryid", queryId);
        }

        var fields = new List<XElement>();
        AddField(fields, "FORM_TYPE", NamespaceName, "hidden");
        if (options.Start.HasValue)
        {
            AddField(fields, "start", FormatDate(options.Start.Value));
        }

        if (options.End.HasValue)
        {
            AddField(fields, "end", FormatDate(options.End.Value));
        }

        if (options.With is not null)
        {
            AddField(fields, "with", options.With.Bare);
        }

        if (fields.Count > 1)
        {
            query.Add(new XElement(XName.Get("x", DataFormsNamespace),
                new XAttribute("type", "submit"),
                fields));
        }

        if (options.Max.HasValue || options.After is not null || options.Before is not null)
        {
            var set = new XElement(XName.Get("set", ResultSetManagementNamespace));
            if (options.Max.HasValue)
            {
                set.Add(new XElement(XName.Get("max", ResultSetManagementNamespace), options.Max.Value));
            }

            if (options.After is not null)
            {
                set.Add(new XElement(XName.Get("after", ResultSetManagementNamespace), options.After));
            }

            if (options.Before is not null)
            {
                set.Add(new XElement(XName.Get("before", ResultSetManagementNamespace), options.Before));
            }

            query.Add(set);
        }

        return new XmppIq(XmppIqType.Set, id, query);
    }

    public static bool TryParseResult(XElement messageStanza, out XmppArchivedMessage? archived)
    {
        archived = null;

        var result = messageStanza.Element(XName.Get("result", NamespaceName));
        if (result is null)
        {
            return false;
        }

        var forwarded = result.Element(XName.Get("forwarded", XmppMessageCarbons.ForwardedNamespace));
        var forwardedMessage = forwarded?.Element(XName.Get("message", XmppXmlNames.ClientNamespace));
        if (forwardedMessage is null || !XmppChatMessage.TryParse(forwardedMessage, out var message) || message is null)
        {
            return false;
        }

        archived = new XmppArchivedMessage(
            (string?)result.Attribute("id") ?? string.Empty,
            (string?)result.Attribute("queryid"),
            TryParseDate(forwarded?.Element(XName.Get("delay", DelayNamespace))?.Attribute("stamp")?.Value),
            message);
        return true;
    }

    public static bool TryParseFin(XmppIq iq, out XmppArchiveResultSet? resultSet, out bool complete)
    {
        resultSet = null;
        complete = false;

        var fin = iq.Payload;
        if (iq.Type != XmppIqType.Result || fin?.Name != XName.Get("fin", NamespaceName))
        {
            return false;
        }

        complete = IsTrue((string?)fin.Attribute("complete"));
        var set = fin.Element(XName.Get("set", ResultSetManagementNamespace));
        resultSet = new XmppArchiveResultSet(
            set?.Element(XName.Get("first", ResultSetManagementNamespace))?.Value,
            set?.Element(XName.Get("last", ResultSetManagementNamespace))?.Value,
            TryParseInt(set?.Element(XName.Get("count", ResultSetManagementNamespace))?.Value),
            TryParseInt(set?.Element(XName.Get("first", ResultSetManagementNamespace))?.Attribute("index")?.Value));
        return true;
    }

    private static void AddField(List<XElement> fields, string name, string value, string? type = null)
    {
        var field = new XElement(XName.Get("field", DataFormsNamespace),
            new XAttribute("var", name),
            new XElement(XName.Get("value", DataFormsNamespace), value));
        if (!string.IsNullOrWhiteSpace(type))
        {
            field.SetAttributeValue("type", type);
        }

        fields.Add(field);
    }

    private static string FormatDate(DateTimeOffset value)
    {
        return value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");
    }

    private static DateTimeOffset? TryParseDate(string? value)
    {
        return DateTimeOffset.TryParse(value, out var result) ? result : null;
    }

    private static int? TryParseInt(string? value)
    {
        return int.TryParse(value, out var result) ? result : null;
    }

    private static bool IsTrue(string? value)
    {
        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, "1", StringComparison.Ordinal);
    }
}
