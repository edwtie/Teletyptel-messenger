using System.Globalization;
using System.Xml;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppEmergencyLocation
{
    public const string PidfNamespaceName = "urn:ietf:params:xml:ns:pidf";

    public const string GeoPrivNamespaceName = "urn:ietf:params:xml:ns:pidf:geopriv10";

    public const string BasicPolicyNamespaceName = "urn:ietf:params:xml:ns:pidf:geopriv10:basicPolicy";

    public const string GmlNamespaceName = "http://www.opengis.net/gml";

    public static XDocument CreatePidfLoDocument(
        string entity,
        XmppUserLocationData location,
        XmppEmergencyLocationOptions? options = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(entity);
        ArgumentNullException.ThrowIfNull(location);
        XmppUserLocation.Validate(location);

        if (!location.HasCoordinates)
        {
            throw new ArgumentException("Emergency location export requires latitude and longitude.", nameof(location));
        }

        options ??= new XmppEmergencyLocationOptions();

        XNamespace pidf = PidfNamespaceName;
        XNamespace gp = GeoPrivNamespaceName;
        XNamespace bp = BasicPolicyNamespaceName;
        XNamespace gml = GmlNamespaceName;

        var tuple = new XElement(
            pidf + "tuple",
            new XAttribute("id", options.TupleId),
            new XElement(
                pidf + "status",
                new XElement(pidf + "basic", "open")),
            new XElement(
                gp + "geopriv",
                new XElement(
                    gp + "location-info",
                    CreateGmlPoint(location, gml),
                    CreateAccuracyElement(location, gp)),
                new XElement(
                    gp + "usage-rules",
                    new XElement(bp + "retransmission-allowed", options.RetransmissionAllowed ? "yes" : "no"),
                    new XElement(bp + "retention-expiry", XmlConvert.ToString(options.RetentionExpiry.UtcDateTime, XmlDateTimeSerializationMode.Utc))),
                new XElement(gp + "method", options.Method)));

        if (!string.IsNullOrWhiteSpace(location.Text))
        {
            tuple.Add(new XElement(pidf + "note", location.Text));
        }

        tuple.Add(new XElement(
            pidf + "timestamp",
            XmlConvert.ToString((location.Timestamp ?? DateTimeOffset.UtcNow).UtcDateTime, XmlDateTimeSerializationMode.Utc)));

        return new XDocument(
            new XElement(
                pidf + "presence",
                new XAttribute("entity", entity),
                new XAttribute(XNamespace.Xmlns + "gp", GeoPrivNamespaceName),
                new XAttribute(XNamespace.Xmlns + "bp", BasicPolicyNamespaceName),
                new XAttribute(XNamespace.Xmlns + "gml", GmlNamespaceName),
                tuple));
    }

    public static string CreatePidfLoXml(
        string entity,
        XmppUserLocationData location,
        XmppEmergencyLocationOptions? options = null)
    {
        return CreatePidfLoDocument(entity, location, options).ToString(SaveOptions.DisableFormatting);
    }

    private static XElement CreateGmlPoint(XmppUserLocationData location, XNamespace gml)
    {
        var position = string.Create(
            CultureInfo.InvariantCulture,
            $"{location.Latitude!.Value:G29} {location.Longitude!.Value:G29}");
        return new XElement(
            gml + "Point",
            new XAttribute("srsName", "urn:ogc:def:crs:EPSG::4326"),
            new XElement(gml + "pos", position));
    }

    private static XElement? CreateAccuracyElement(XmppUserLocationData location, XNamespace gp)
    {
        if (location.Accuracy is null)
        {
            return null;
        }

        return new XElement(
            gp + "accuracy",
            new XAttribute("uom", "urn:ogc:def:uom:EPSG::9001"),
            location.Accuracy.Value.ToString("G29", CultureInfo.InvariantCulture));
    }
}

public sealed record XmppEmergencyLocationOptions
{
    public string TupleId { get; init; } = "teletyptel-location";

    public string Method { get; init; } = "GPS";

    public bool RetransmissionAllowed { get; init; }

    public DateTimeOffset RetentionExpiry { get; init; } = DateTimeOffset.UtcNow.AddHours(1);
}
