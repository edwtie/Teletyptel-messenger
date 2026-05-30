using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppServiceContactAddresses
{
    public const string FormType = "http://jabber.org/network/serverinfo";

    public const string AbuseField = "abuse-addresses";

    public const string AdminField = "admin-addresses";

    public const string FeedbackField = "feedback-addresses";

    public const string SalesField = "sales-addresses";

    public const string SecurityField = "security-addresses";

    public const string StatusField = "status-addresses";

    public const string SupportField = "support-addresses";

    private static readonly XmppServiceContactAddressKind[] OrderedKinds =
    [
        XmppServiceContactAddressKind.Abuse,
        XmppServiceContactAddressKind.Admin,
        XmppServiceContactAddressKind.Feedback,
        XmppServiceContactAddressKind.Sales,
        XmppServiceContactAddressKind.Security,
        XmppServiceContactAddressKind.Status,
        XmppServiceContactAddressKind.Support
    ];

    public static bool TryGetContactAddresses(
        XmppServiceDiscoveryInfo info,
        out IReadOnlyList<XmppServiceContactAddress> addresses)
    {
        ArgumentNullException.ThrowIfNull(info);

        var parsed = new List<XmppServiceContactAddress>();
        foreach (var form in info.DataForms)
        {
            if (!string.Equals(form.FormType, FormType, StringComparison.Ordinal))
            {
                continue;
            }

            foreach (var kind in OrderedKinds)
            {
                if (!form.Fields.TryGetValue(FieldName(kind), out var values))
                {
                    continue;
                }

                foreach (var value in values)
                {
                    if (Uri.TryCreate(value, UriKind.Absolute, out var uri))
                    {
                        parsed.Add(new XmppServiceContactAddress(kind, uri));
                    }
                }
            }
        }

        addresses = parsed
            .DistinctBy(address => (address.Kind, address.Uri.OriginalString), EqualityComparer<(XmppServiceContactAddressKind, string)>.Default)
            .ToArray();
        return addresses.Count > 0;
    }

    public static IReadOnlyList<Uri> GetAddresses(
        XmppServiceDiscoveryInfo info,
        XmppServiceContactAddressKind kind)
    {
        return TryGetContactAddresses(info, out var addresses)
            ? addresses.Where(address => address.Kind == kind).Select(address => address.Uri).ToArray()
            : [];
    }

    public static XElement CreateDataForm(IEnumerable<XmppServiceContactAddress> addresses)
    {
        ArgumentNullException.ThrowIfNull(addresses);

        var fields = addresses
            .GroupBy(address => address.Kind)
            .OrderBy(group => Array.IndexOf(OrderedKinds, group.Key))
            .Select(group => new XElement(
                XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
                new XAttribute("var", FieldName(group.Key)),
                group.Select(address => new XElement(
                    XName.Get("value", XmppServiceDiscovery.DataFormNamespace),
                    address.Uri.OriginalString))));

        return new XElement(
            XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("type", "result"),
            new XElement(
                XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
                new XAttribute("var", "FORM_TYPE"),
                new XAttribute("type", "hidden"),
                new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), FormType)),
            fields);
    }

    public static string FieldName(XmppServiceContactAddressKind kind)
    {
        return kind switch
        {
            XmppServiceContactAddressKind.Abuse => AbuseField,
            XmppServiceContactAddressKind.Admin => AdminField,
            XmppServiceContactAddressKind.Feedback => FeedbackField,
            XmppServiceContactAddressKind.Sales => SalesField,
            XmppServiceContactAddressKind.Security => SecurityField,
            XmppServiceContactAddressKind.Status => StatusField,
            XmppServiceContactAddressKind.Support => SupportField,
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
    }
}

public enum XmppServiceContactAddressKind
{
    Abuse,
    Admin,
    Feedback,
    Sales,
    Security,
    Status,
    Support
}

public sealed record XmppServiceContactAddress(
    XmppServiceContactAddressKind Kind,
    Uri Uri);
