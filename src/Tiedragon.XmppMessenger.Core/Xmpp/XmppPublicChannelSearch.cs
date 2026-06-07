using System.Globalization;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPublicChannelSearch
{
    public const string NamespaceName = "urn:xmpp:channel-search:0:search";

    public const string SearchParamsFormType = "urn:xmpp:channel-search:0:search-params";

    public const string OrderNamespaceName = "urn:xmpp:channel-search:0:order";

    public const string AnonymityNamespaceName = "urn:xmpp:channel-search:0:anonymity";

    public const string ErrorNamespaceName = "urn:xmpp:channel-search:0:error";

    public const string ResultSetManagementNamespace = XmppMessageArchive.ResultSetManagementNamespace;

    public const string AddressSortKey = "{" + OrderNamespaceName + "}address";

    public const string UserCountSortKey = "{" + OrderNamespaceName + "}nusers";

    public const string MucServiceType = "xep-0045";

    public const string MixServiceType = "xep-0369";

    public static bool SupportsPublicChannelSearch(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppIq CreateSearchFormRequest(string id, XmppAddress searchService)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(searchService);
        return new XmppIq(XmppIqType.Get, id, new XElement(XName.Get("search", NamespaceName)), To: searchService);
    }

    public static XmppIq CreateSearchRequest(
        string id,
        XmppAddress searchService,
        XmppPublicChannelSearchQuery query,
        XmppResultSetRequest? paging = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(searchService);
        ArgumentNullException.ThrowIfNull(query);

        var search = new XElement(XName.Get("search", NamespaceName));
        if (paging is not null)
        {
            search.Add(paging.ToXml());
        }

        search.Add(query.ToDataForm());
        return new XmppIq(XmppIqType.Get, id, search, To: searchService);
    }

    public static bool TryParseSearchForm(XmppIq iq, out XmppDataForm? form)
    {
        form = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("search", NamespaceName))
        {
            return false;
        }

        var dataForm = iq.Payload.Element(XName.Get("x", XmppServiceDiscovery.DataFormNamespace));
        if (dataForm is null)
        {
            return false;
        }

        form = XmppServiceDiscovery.ParseDataForm(dataForm);
        return string.Equals(form.FormType, SearchParamsFormType, StringComparison.Ordinal);
    }

    public static bool TryParseSearchResult(XmppIq iq, out XmppPublicChannelSearchResult? result)
    {
        result = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("result", NamespaceName))
        {
            return false;
        }

        var items = iq.Payload.Elements(XName.Get("item", NamespaceName))
            .Select(ParseItem)
            .Where(item => item is not null)
            .Cast<XmppPublicChannel>()
            .ToArray();
        result = new XmppPublicChannelSearchResult(items, XmppResultSet.TryParse(iq.Payload, out var set) ? set : null);
        return true;
    }

    private static XmppPublicChannel? ParseItem(XElement item)
    {
        if (!XmppAddress.TryParse((string?)item.Attribute("address"), out var address) || address is null)
        {
            return null;
        }

        return new XmppPublicChannel(
            address,
            item.Element(XName.Get("name", NamespaceName))?.Value,
            item.Element(XName.Get("description", NamespaceName))?.Value,
            item.Element(XName.Get("language", NamespaceName))?.Value,
            TryParseNonNegativeInt(item.Element(XName.Get("nusers", NamespaceName))?.Value),
            item.Element(XName.Get("service-type", NamespaceName))?.Value,
            TryParseBooleanElement(item.Element(XName.Get("is-open", NamespaceName))),
            item.Element(XName.Get("anonymity-mode", NamespaceName))?.Value);
    }

    private static int? TryParseNonNegativeInt(string? value)
    {
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) && parsed >= 0
            ? parsed
            : null;
    }

    private static bool? TryParseBooleanElement(XElement? element)
    {
        if (element is null)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(element.Value))
        {
            return true;
        }

        if (string.Equals(element.Value, "1", StringComparison.Ordinal)
            || string.Equals(element.Value, "true", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(element.Value, "0", StringComparison.Ordinal)
            || string.Equals(element.Value, "false", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return null;
    }
}

public sealed record XmppPublicChannelSearchQuery(
    string? Text = null,
    bool? All = null,
    bool? SearchInAddress = null,
    bool? SearchInName = null,
    bool? SearchInDescription = null,
    IReadOnlyList<string>? ServiceTypes = null,
    string? SortKey = null)
{
    public XElement ToDataForm()
    {
        var fields = new List<XElement>
        {
            Field("FORM_TYPE", XmppPublicChannelSearch.SearchParamsFormType, "hidden")
        };

        if (!string.IsNullOrWhiteSpace(Text))
        {
            fields.Add(Field("q", Text, "text-single"));
        }

        if (All is not null)
        {
            fields.Add(Field("all", All.Value ? "true" : "false", "boolean"));
        }

        if (SearchInAddress is not null)
        {
            fields.Add(Field("sinaddress", SearchInAddress.Value ? "true" : "false", "boolean"));
        }

        if (SearchInName is not null)
        {
            fields.Add(Field("sinname", SearchInName.Value ? "true" : "false", "boolean"));
        }

        if (SearchInDescription is not null)
        {
            fields.Add(Field("sindescription", SearchInDescription.Value ? "true" : "false", "boolean"));
        }

        if (ServiceTypes is { Count: > 0 })
        {
            fields.Add(Field("types", ServiceTypes, "list-multi"));
        }

        if (!string.IsNullOrWhiteSpace(SortKey))
        {
            fields.Add(Field("key", SortKey, "list-single"));
        }

        return new XElement(
            XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("type", "submit"),
            fields);
    }

    private static XElement Field(string name, string value, string? type = null)
    {
        return Field(name, [value], type);
    }

    private static XElement Field(string name, IEnumerable<string> values, string? type = null)
    {
        var field = new XElement(
            XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("var", name),
            values.Select(value => new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), value)));
        if (!string.IsNullOrWhiteSpace(type))
        {
            field.SetAttributeValue("type", type);
        }

        return field;
    }
}

public sealed record XmppPublicChannelSearchResult(
    IReadOnlyList<XmppPublicChannel> Channels,
    XmppResultSet? ResultSet);

public sealed record XmppPublicChannel(
    XmppAddress Address,
    string? Name = null,
    string? Description = null,
    string? Language = null,
    int? UserCount = null,
    string? ServiceType = null,
    bool? IsOpen = null,
    string? AnonymityMode = null);

public sealed record XmppResultSetRequest(
    int? Max = null,
    string? After = null,
    string? Before = null)
{
    public XElement ToXml()
    {
        var set = new XElement(XName.Get("set", XmppPublicChannelSearch.ResultSetManagementNamespace));
        if (Max is not null)
        {
            set.Add(new XElement(XName.Get("max", XmppPublicChannelSearch.ResultSetManagementNamespace), Max.Value));
        }

        if (After is not null)
        {
            set.Add(new XElement(XName.Get("after", XmppPublicChannelSearch.ResultSetManagementNamespace), After));
        }

        if (Before is not null)
        {
            set.Add(new XElement(XName.Get("before", XmppPublicChannelSearch.ResultSetManagementNamespace), Before));
        }

        return set;
    }
}

public sealed record XmppResultSet(
    string? First,
    string? Last,
    int? Max,
    int? Count,
    int? FirstIndex)
{
    public static bool TryParse(XElement parent, out XmppResultSet? resultSet)
    {
        resultSet = null;
        var set = parent.Element(XName.Get("set", XmppPublicChannelSearch.ResultSetManagementNamespace));
        if (set is null)
        {
            return false;
        }

        resultSet = new XmppResultSet(
            set.Element(XName.Get("first", XmppPublicChannelSearch.ResultSetManagementNamespace))?.Value,
            set.Element(XName.Get("last", XmppPublicChannelSearch.ResultSetManagementNamespace))?.Value,
            TryParseInt(set.Element(XName.Get("max", XmppPublicChannelSearch.ResultSetManagementNamespace))?.Value),
            TryParseInt(set.Element(XName.Get("count", XmppPublicChannelSearch.ResultSetManagementNamespace))?.Value),
            TryParseInt(set.Element(XName.Get("first", XmppPublicChannelSearch.ResultSetManagementNamespace))?.Attribute("index")?.Value));
        return true;
    }

    private static int? TryParseInt(string? value)
    {
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) && parsed >= 0
            ? parsed
            : null;
    }
}
