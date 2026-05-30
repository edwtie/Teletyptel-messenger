using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppRegistrationInfo(
    IReadOnlyList<string> Fields,
    string? Instructions = null,
    bool Registered = false,
    string? Key = null)
{
    public bool Requires(string field)
    {
        return Fields.Any(value => string.Equals(value, field, StringComparison.OrdinalIgnoreCase));
    }
}

public sealed record XmppRegistrationRequest(
    string? Username = null,
    string? Password = null,
    string? Email = null,
    string? Name = null,
    string? Nick = null,
    string? First = null,
    string? Last = null,
    string? Address = null,
    string? City = null,
    string? State = null,
    string? Zip = null,
    string? Phone = null,
    string? Url = null,
    string? Date = null,
    string? Misc = null,
    string? Text = null,
    string? Key = null);

public static class XmppInBandRegistration
{
    private static readonly string[] KnownFields =
    [
        "username",
        "nick",
        "password",
        "name",
        "first",
        "last",
        "email",
        "address",
        "city",
        "state",
        "zip",
        "phone",
        "url",
        "date",
        "misc",
        "text",
        "key"
    ];

    public static XmppIq CreateInfoRequest(string id, XmppAddress? to = null)
    {
        var query = new XElement(XName.Get("query", XmppXmlNames.InBandRegistrationNamespace));
        return new XmppIq(XmppIqType.Get, id, query, to);
    }

    public static XmppIq CreateRegistrationRequest(
        string id,
        XmppRegistrationRequest request,
        XmppAddress? to = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        return new XmppIq(XmppIqType.Set, id, CreateQuery(request), to);
    }

    public static XmppIq CreateDataFormRegistrationRequest(
        string id,
        XElement registrationInfoQuery,
        IReadOnlyDictionary<string, string> submittedValues,
        XmppAddress? to = null)
    {
        ArgumentNullException.ThrowIfNull(registrationInfoQuery);
        ArgumentNullException.ThrowIfNull(submittedValues);

        if (registrationInfoQuery.Name != XName.Get("query", XmppXmlNames.InBandRegistrationNamespace))
        {
            throw new ArgumentException("The element is not an in-band registration query.", nameof(registrationInfoQuery));
        }

        var form = registrationInfoQuery
            .Descendants(XName.Get("x", XmppServiceDiscovery.DataFormNamespace))
            .FirstOrDefault();
        if (form is null)
        {
            throw new ArgumentException("The registration query does not contain a jabber:x:data form.", nameof(registrationInfoQuery));
        }

        var query = new XElement(XName.Get("query", XmppXmlNames.InBandRegistrationNamespace));
        var submitForm = new XElement(
            XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("type", "submit"));
        foreach (var field in form.Elements(XName.Get("field", XmppServiceDiscovery.DataFormNamespace)))
        {
            var variable = field.Attribute("var")?.Value;
            if (string.IsNullOrWhiteSpace(variable))
            {
                continue;
            }

            var type = field.Attribute("type")?.Value;
            if (string.Equals(type, "fixed", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var submitField = new XElement(
                XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
                new XAttribute("var", variable));
            if (submittedValues.TryGetValue(variable, out var submittedValue))
            {
                submitField.Add(new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), submittedValue));
            }
            else
            {
                foreach (var value in field.Elements(XName.Get("value", XmppServiceDiscovery.DataFormNamespace)))
                {
                    submitField.Add(new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), value.Value));
                }
            }

            submitForm.Add(submitField);
        }

        query.Add(submitForm);
        return new XmppIq(XmppIqType.Set, id, query, to);
    }

    public static XmppIq CreateSimpleRegistrationRequest(
        string id,
        string username,
        string password,
        XmppAddress? to = null,
        string? key = null)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.", nameof(username));
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Password is required.", nameof(password));
        }

        return CreateRegistrationRequest(
            id,
            new XmppRegistrationRequest(Username: username, Password: password, Key: key),
            to);
    }

    public static XmppIq CreateRemoveRequest(string id, XmppAddress? to = null)
    {
        var query = new XElement(
            XName.Get("query", XmppXmlNames.InBandRegistrationNamespace),
            new XElement(XName.Get("remove", XmppXmlNames.InBandRegistrationNamespace)));
        return new XmppIq(XmppIqType.Set, id, query, to);
    }

    public static XmppIq CreatePasswordChangeRequest(
        string id,
        string username,
        string password,
        XmppAddress? to = null)
    {
        return CreateSimpleRegistrationRequest(id, username, password, to);
    }

    public static bool TryParseInfoResult(XmppIq iq, out XmppRegistrationInfo? info)
    {
        ArgumentNullException.ThrowIfNull(iq);
        info = null;

        if (iq.Type != XmppIqType.Result
            || iq.Payload?.Name != XName.Get("query", XmppXmlNames.InBandRegistrationNamespace))
        {
            return false;
        }

        var fields = new List<string>();
        foreach (var field in KnownFields)
        {
            if (iq.Payload.Element(XName.Get(field, XmppXmlNames.InBandRegistrationNamespace)) is not null)
            {
                fields.Add(field);
            }
        }

        info = new XmppRegistrationInfo(
            fields,
            Instructions: iq.Payload.Element(XName.Get("instructions", XmppXmlNames.InBandRegistrationNamespace))?.Value,
            Registered: iq.Payload.Element(XName.Get("registered", XmppXmlNames.InBandRegistrationNamespace)) is not null,
            Key: iq.Payload.Element(XName.Get("key", XmppXmlNames.InBandRegistrationNamespace))?.Value);
        return true;
    }

    public static bool IsRegistrationResult(XmppIq iq, string id)
    {
        ArgumentNullException.ThrowIfNull(iq);
        return iq.Type == XmppIqType.Result && string.Equals(iq.Id, id, StringComparison.Ordinal);
    }

    public static bool IsRegistrationFeature(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);
        return element.Name == XName.Get("register", XmppXmlNames.InBandRegistrationFeatureNamespace);
    }

    private static XElement CreateQuery(XmppRegistrationRequest request)
    {
        var query = new XElement(XName.Get("query", XmppXmlNames.InBandRegistrationNamespace));
        AddValue(query, "username", request.Username);
        AddValue(query, "nick", request.Nick);
        AddValue(query, "password", request.Password);
        AddValue(query, "name", request.Name);
        AddValue(query, "first", request.First);
        AddValue(query, "last", request.Last);
        AddValue(query, "email", request.Email);
        AddValue(query, "address", request.Address);
        AddValue(query, "city", request.City);
        AddValue(query, "state", request.State);
        AddValue(query, "zip", request.Zip);
        AddValue(query, "phone", request.Phone);
        AddValue(query, "url", request.Url);
        AddValue(query, "date", request.Date);
        AddValue(query, "misc", request.Misc);
        AddValue(query, "text", request.Text);
        AddValue(query, "key", request.Key);
        return query;
    }

    private static void AddValue(XElement parent, string name, string? value)
    {
        if (value is not null)
        {
            parent.Add(new XElement(XName.Get(name, XmppXmlNames.InBandRegistrationNamespace), value));
        }
    }
}
