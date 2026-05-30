using System.Globalization;
using System.Xml;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppExternalServiceDiscovery
{
    public const string NamespaceName = XmppXmlNames.ExternalServiceDiscoveryNamespace;

    public const string StunServiceType = "stun";

    public const string TurnServiceType = "turn";

    public const string TransportUdp = "udp";

    public const string TransportTcp = "tcp";

    public static XmppIq CreateServicesRequest(string id, XmppAddress? to = null, string? type = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);

        var services = new XElement(XName.Get("services", NamespaceName));
        if (!string.IsNullOrWhiteSpace(type))
        {
            services.SetAttributeValue("type", type);
        }

        return new XmppIq(XmppIqType.Get, id, services, To: to);
    }

    public static XmppIq CreateCredentialsRequest(
        string id,
        XmppExternalServiceIdentity service,
        XmppAddress? to = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(service);

        var credentials = new XElement(
            XName.Get("credentials", NamespaceName),
            CreateServiceIdentityElement(service));
        return new XmppIq(XmppIqType.Get, id, credentials, To: to);
    }

    public static bool TryParseServicesResult(XmppIq iq, out XmppExternalServices? services)
    {
        return TryParseServices(iq, XmppIqType.Result, "services", out services);
    }

    public static bool TryParseCredentialsResult(XmppIq iq, out XmppExternalServices? credentials)
    {
        return TryParseServices(iq, XmppIqType.Result, "credentials", out credentials);
    }

    public static bool TryParseServicesPush(XmppIq iq, out XmppExternalServices? services)
    {
        return TryParseServices(iq, XmppIqType.Set, "services", out services);
    }

    public static XmppIq CreateServicesPushAcknowledgement(XmppIq push)
    {
        ArgumentNullException.ThrowIfNull(push);
        if (push.Type != XmppIqType.Set || push.Id.Length == 0)
        {
            throw new ArgumentException("Only IQ set pushes with an id can be acknowledged.", nameof(push));
        }

        return new XmppIq(XmppIqType.Result, push.Id, To: push.From, From: push.To);
    }

    public static bool SupportsExternalServiceDiscovery(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XElement CreateServiceIdentityElement(XmppExternalServiceIdentity service)
    {
        ArgumentNullException.ThrowIfNull(service);
        ArgumentException.ThrowIfNullOrWhiteSpace(service.Host);
        ArgumentException.ThrowIfNullOrWhiteSpace(service.Type);
        if (service.Port is < 0 or > 65535)
        {
            throw new ArgumentOutOfRangeException(nameof(service), "The external service port must fit in an unsigned short.");
        }

        var element = new XElement(
            XName.Get("service", NamespaceName),
            new XAttribute("host", service.Host),
            new XAttribute("type", service.Type));
        if (service.Port is not null)
        {
            element.SetAttributeValue("port", service.Port.Value.ToString(CultureInfo.InvariantCulture));
        }

        return element;
    }

    public static XElement CreateServiceElement(XmppExternalService service)
    {
        ArgumentNullException.ThrowIfNull(service);
        ArgumentException.ThrowIfNullOrWhiteSpace(service.Host);
        ArgumentException.ThrowIfNullOrWhiteSpace(service.Type);

        var element = CreateServiceIdentityElement(new XmppExternalServiceIdentity(
            service.Host,
            service.Type,
            service.Port));

        AddOptionalAttribute(element, "transport", service.Transport);
        AddOptionalAttribute(element, "name", service.Name);
        AddOptionalAttribute(element, "username", service.Username);
        AddOptionalAttribute(element, "password", service.Password);
        AddOptionalAttribute(element, "action", service.Action);

        if (service.Expires is not null)
        {
            element.SetAttributeValue(
                "expires",
                XmlConvert.ToString(service.Expires.Value.UtcDateTime, XmlDateTimeSerializationMode.Utc));
        }

        if (service.Restricted is not null)
        {
            element.SetAttributeValue(
                "restricted",
                XmlConvert.ToString(service.Restricted.Value));
        }

        foreach (var form in service.DataForms ?? [])
        {
            element.Add(CreateDataFormElement(form));
        }

        return element;
    }

    private static bool TryParseServices(
        XmppIq iq,
        XmppIqType expectedType,
        string payloadName,
        out XmppExternalServices? services)
    {
        services = null;
        ArgumentNullException.ThrowIfNull(iq);

        if (iq.Type != expectedType || iq.Payload?.Name != XName.Get(payloadName, NamespaceName))
        {
            return false;
        }

        var parsedServices = iq.Payload.Elements(XName.Get("service", NamespaceName))
            .Select(ParseService)
            .Where(service => service is not null)
            .Cast<XmppExternalService>()
            .ToArray();

        services = new XmppExternalServices(
            Type: (string?)iq.Payload.Attribute("type"),
            Services: parsedServices);
        return true;
    }

    private static XmppExternalService? ParseService(XElement element)
    {
        var type = (string?)element.Attribute("type");
        var host = (string?)element.Attribute("host");
        if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(host))
        {
            return null;
        }

        var port = ParsePort((string?)element.Attribute("port"));
        var expires = ParseDate((string?)element.Attribute("expires"));
        var restricted = ParseBoolean((string?)element.Attribute("restricted"));
        var dataForms = element.Elements(XName.Get("x", XmppServiceDiscovery.DataFormNamespace))
            .Select(XmppServiceDiscovery.ParseDataForm)
            .ToArray();

        return new XmppExternalService(
            Type: type,
            Host: host,
            Port: port,
            Transport: (string?)element.Attribute("transport"),
            Name: (string?)element.Attribute("name"),
            Username: (string?)element.Attribute("username"),
            Password: (string?)element.Attribute("password"),
            Expires: expires,
            Restricted: restricted,
            Action: (string?)element.Attribute("action") ?? XmppExternalServiceAction.Add,
            DataForms: dataForms);
    }

    private static int? ParsePort(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed)
            && parsed is >= 0 and <= 65535
            ? parsed
            : null;
    }

    private static DateTimeOffset? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed)
            ? parsed.ToUniversalTime()
            : null;
    }

    private static bool? ParseBoolean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (bool.TryParse(value, out var parsed))
        {
            return parsed;
        }

        return value switch
        {
            "1" => true,
            "0" => false,
            _ => null
        };
    }

    private static void AddOptionalAttribute(XElement element, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            element.SetAttributeValue(name, value);
        }
    }

    private static XElement CreateDataFormElement(XmppDataForm form)
    {
        var element = new XElement(XName.Get("x", XmppServiceDiscovery.DataFormNamespace));
        if (!string.IsNullOrWhiteSpace(form.Type))
        {
            element.SetAttributeValue("type", form.Type);
        }

        foreach (var field in form.Fields)
        {
            element.Add(new XElement(
                XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
                new XAttribute("var", field.Key),
                field.Value.Select(value => new XElement(
                    XName.Get("value", XmppServiceDiscovery.DataFormNamespace),
                    value))));
        }

        return element;
    }
}

public static class XmppExternalServiceAction
{
    public const string Add = "add";

    public const string Delete = "delete";

    public const string Remove = "remove";

    public const string Modify = "modify";
}

public sealed record XmppExternalServices(
    string? Type,
    IReadOnlyList<XmppExternalService> Services);

public sealed record XmppExternalServiceIdentity(
    string Host,
    string Type,
    int? Port = null);

public sealed record XmppExternalService(
    string Type,
    string Host,
    int? Port = null,
    string? Transport = null,
    string? Name = null,
    string? Username = null,
    string? Password = null,
    DateTimeOffset? Expires = null,
    bool? Restricted = null,
    string Action = XmppExternalServiceAction.Add,
    IReadOnlyList<XmppDataForm>? DataForms = null)
{
    public bool IsStun => string.Equals(Type, XmppExternalServiceDiscovery.StunServiceType, StringComparison.Ordinal);

    public bool IsTurn => string.Equals(Type, XmppExternalServiceDiscovery.TurnServiceType, StringComparison.Ordinal);

    public bool RequiresCredentials =>
        Restricted == true && (string.IsNullOrWhiteSpace(Username) || string.IsNullOrWhiteSpace(Password));
}
