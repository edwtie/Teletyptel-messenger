using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStreamFeatureSet(
    bool StartTlsOffered,
    bool StartTlsRequired,
    IReadOnlyList<string> SaslMechanisms,
    bool ResourceBindingOffered,
    bool ResourceBindingRequired,
    bool SessionOffered,
    bool SessionRequired)
{
    public bool StreamManagementOffered { get; init; }

    public bool InBandRegistrationOffered { get; init; }

    public bool ClientStateIndicationOffered { get; init; }

    public bool SupportsSaslMechanism(string mechanism)
    {
        return SaslMechanisms.Any(value => string.Equals(value, mechanism, StringComparison.OrdinalIgnoreCase));
    }

    public static XmppStreamFeatureSet Empty { get; } = new(
        StartTlsOffered: false,
        StartTlsRequired: false,
        SaslMechanisms: Array.Empty<string>(),
        ResourceBindingOffered: false,
        ResourceBindingRequired: false,
        SessionOffered: false,
        SessionRequired: false);

    public static bool TryParse(string xml, out XmppStreamFeatureSet features)
    {
        features = Empty;

        try
        {
            return TryParse(XElement.Parse(xml), out features);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public static bool TryParse(XElement element, out XmppStreamFeatureSet features)
    {
        features = Empty;

        if (element.Name != XName.Get("features", XmppXmlNames.StreamNamespace))
        {
            return false;
        }

        XNamespace tls = XmppXmlNames.TlsNamespace;
        XNamespace sasl = XmppXmlNames.SaslNamespace;
        XNamespace bind = XmppXmlNames.BindNamespace;
        XNamespace session = XmppXmlNames.SessionNamespace;
        XNamespace streamManagement = XmppXmlNames.StreamManagementNamespace;
        XNamespace inBandRegistration = XmppXmlNames.InBandRegistrationFeatureNamespace;
        XNamespace clientStateIndication = XmppXmlNames.ClientStateIndicationNamespace;

        var startTls = element.Element(tls + "starttls");
        var mechanisms = element.Element(sasl + "mechanisms")
            ?.Elements(sasl + "mechanism")
            .Select(mechanism => mechanism.Value.Trim())
            .Where(mechanism => mechanism.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();

        var bindElement = element.Element(bind + "bind");
        var sessionElement = element.Element(session + "session");
        var streamManagementElement = element.Element(streamManagement + "sm");
        var inBandRegistrationElement = element.Element(inBandRegistration + "register");
        var clientStateIndicationElement = element.Element(clientStateIndication + "csi");

        features = new XmppStreamFeatureSet(
            StartTlsOffered: startTls is not null,
            StartTlsRequired: startTls?.Element(tls + "required") is not null,
            SaslMechanisms: mechanisms,
            ResourceBindingOffered: bindElement is not null,
            ResourceBindingRequired: bindElement?.Element(bind + "required") is not null,
            SessionOffered: sessionElement is not null,
            SessionRequired: sessionElement?.Element(session + "required") is not null)
        {
            StreamManagementOffered = streamManagementElement is not null,
            InBandRegistrationOffered = inBandRegistrationElement is not null,
            ClientStateIndicationOffered = clientStateIndicationElement is not null
        };
        return true;
    }
}
