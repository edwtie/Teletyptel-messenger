using System.Globalization;
using System.Xml;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppUserLocation
{
    public const string NamespaceName = "http://jabber.org/protocol/geoloc";

    public const string NotificationFeature = NamespaceName + "+notify";

    public const string CurrentItemId = "current";

    public static XmppUserLocationSupport EvaluateSupport(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return new XmppUserLocationSupport(
            PersonalEventing: XmppPersonalEventing.SupportsPersonalEventing(info),
            Publish: info.Supports(XmppPersonalEventing.PublishFeature),
            AutoCreate: info.Supports(XmppPersonalEventing.AutoCreateFeature),
            RetrieveItems: info.Supports(XmppPersonalEventing.RetrieveItemsFeature),
            Notifications: info.Supports(NotificationFeature));
    }

    public static bool SupportsPublishing(XmppServiceDiscoveryInfo info)
    {
        return EvaluateSupport(info).CanPublish;
    }

    public static bool SupportsRetrieval(XmppServiceDiscoveryInfo info)
    {
        return EvaluateSupport(info).CanRetrieve;
    }

    public static bool SupportsNotifications(XmppServiceDiscoveryInfo info)
    {
        return EvaluateSupport(info).CanNotify;
    }

    public static XmppIq CreatePublishRequest(
        string id,
        XmppUserLocationData location,
        string itemId = CurrentItemId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(location);
        ArgumentException.ThrowIfNullOrWhiteSpace(itemId);

        return XmppPersonalEventing.CreatePublishRequest(
            id,
            NamespaceName,
            itemId,
            CreateElement(location));
    }

    public static XmppIq CreateClearPublishRequest(
        string id,
        string itemId = CurrentItemId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(itemId);

        return XmppPersonalEventing.CreatePublishRequest(
            id,
            NamespaceName,
            itemId,
            CreateEmptyElement());
    }

    public static XmppIq CreateRetractRequest(
        string id,
        string itemId = CurrentItemId,
        bool notify = true)
    {
        return XmppPersonalEventing.CreateRetractRequest(id, NamespaceName, itemId, notify);
    }

    public static XmppIq CreateRequest(
        string id,
        XmppAddress owner,
        string? itemId = null,
        int? maxItems = 1)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(owner);

        return XmppPersonalEventing.CreateItemsRequest(id, NamespaceName, owner, itemId, maxItems);
    }

    public static XElement CreateElement(XmppUserLocationData location)
    {
        ArgumentNullException.ThrowIfNull(location);
        Validate(location);

        var element = new XElement(XName.Get("geoloc", NamespaceName));
        SetLanguage(element, location.Language);
        AddDecimal(element, "accuracy", location.Accuracy);
        AddDecimal(element, "alt", location.Altitude);
        AddDecimal(element, "altaccuracy", location.AltitudeAccuracy);
        AddString(element, "area", location.Area);
        AddDecimal(element, "bearing", location.Bearing);
        AddString(element, "building", location.Building);
        AddString(element, "country", location.Country);
        AddString(element, "countrycode", location.CountryCode);
        AddString(element, "datum", location.Datum);
        AddString(element, "description", location.Description);
        AddDecimal(element, "error", location.DeprecatedError);
        AddString(element, "floor", location.Floor);
        AddDecimal(element, "lat", location.Latitude);
        AddString(element, "locality", location.Locality);
        AddDecimal(element, "lon", location.Longitude);
        AddString(element, "postalcode", location.PostalCode);
        AddString(element, "region", location.Region);
        AddString(element, "regioncode", location.RegionCode);
        AddString(element, "room", location.Room);
        AddDecimal(element, "speed", location.Speed);
        AddString(element, "street", location.Street);
        AddString(element, "text", location.Text);
        if (location.Timestamp is not null)
        {
            element.Add(new XElement(
                XName.Get("timestamp", NamespaceName),
                XmlConvert.ToString(location.Timestamp.Value.UtcDateTime, XmlDateTimeSerializationMode.Utc)));
        }

        AddString(element, "tzo", location.TimeZoneOffset);
        if (location.Uri is not null)
        {
            element.Add(new XElement(XName.Get("uri", NamespaceName), location.Uri.OriginalString));
        }

        return element;
    }

    public static XElement CreateEmptyElement()
    {
        return new XElement(XName.Get("geoloc", NamespaceName));
    }

    public static bool TryParseItemsResult(XmppIq iq, out XmppUserLocationData? location)
    {
        location = null;
        if (!XmppPersonalEventing.TryParseItemsResult(iq, out var items) || items is null)
        {
            return false;
        }

        return TryParseNodeItems(items, out location);
    }

    public static bool TryParseNodeItems(
        XmppPersonalEventNodeItems items,
        out XmppUserLocationData? location)
    {
        ArgumentNullException.ThrowIfNull(items);
        location = null;
        if (!string.Equals(items.Node, NamespaceName, StringComparison.Ordinal))
        {
            return false;
        }

        var element = items.Items
            .SelectMany(item => item.Payloads)
            .FirstOrDefault(payload => payload.Name == XName.Get("geoloc", NamespaceName));
        return element is not null && TryParseElement(element, out location);
    }

    public static bool TryParseNotification(
        XElement message,
        out XmppUserLocationNotification? notification)
    {
        notification = null;
        if (!XmppPersonalEventing.TryParseNotification(message, out var personalEvent)
            || personalEvent is null)
        {
            return false;
        }

        foreach (var nodeEvent in personalEvent.ForNode(NamespaceName))
        {
            var item = nodeEvent.Items.FirstOrDefault(entry =>
                entry.Payloads.Any(payload => payload.Name == XName.Get("geoloc", NamespaceName)));
            var element = item?.Payloads.FirstOrDefault(payload => payload.Name == XName.Get("geoloc", NamespaceName));
            if (element is not null && TryParseElement(element, out var location) && location is not null)
            {
                notification = new XmppUserLocationNotification(
                    personalEvent.From,
                    personalEvent.To,
                    item?.Id,
                    location,
                    IsRetracted: false);
                return true;
            }

            if (nodeEvent.RetractedItemIds.Count > 0 || nodeEvent.IsPurge || nodeEvent.IsDelete)
            {
                notification = new XmppUserLocationNotification(
                    personalEvent.From,
                    personalEvent.To,
                    nodeEvent.RetractedItemIds.FirstOrDefault(),
                    Location: null,
                    IsRetracted: true);
                return true;
            }
        }

        return false;
    }

    public static bool TryParseElement(XElement element, out XmppUserLocationData? location)
    {
        location = null;
        if (element.Name != XName.Get("geoloc", NamespaceName))
        {
            return false;
        }

        if (!TryGetDecimal(element, "accuracy", out var accuracy)
            || !TryGetDecimal(element, "alt", out var altitude)
            || !TryGetDecimal(element, "altaccuracy", out var altitudeAccuracy)
            || !TryGetDecimal(element, "bearing", out var bearing)
            || !TryGetDecimal(element, "error", out var deprecatedError)
            || !TryGetDecimal(element, "lat", out var latitude)
            || !TryGetDecimal(element, "lon", out var longitude)
            || !TryGetDecimal(element, "speed", out var speed)
            || !TryGetTimestamp(element, out var timestamp)
            || !TryGetUri(element, out var uri))
        {
            return false;
        }

        location = new XmppUserLocationData(
            Accuracy: accuracy,
            Altitude: altitude,
            AltitudeAccuracy: altitudeAccuracy,
            Area: GetString(element, "area"),
            Bearing: bearing,
            Building: GetString(element, "building"),
            Country: GetString(element, "country"),
            CountryCode: GetString(element, "countrycode"),
            Datum: GetString(element, "datum"),
            Description: GetString(element, "description"),
            DeprecatedError: deprecatedError,
            Floor: GetString(element, "floor"),
            Latitude: latitude,
            Locality: GetString(element, "locality"),
            Longitude: longitude,
            PostalCode: GetString(element, "postalcode"),
            Region: GetString(element, "region"),
            RegionCode: GetString(element, "regioncode"),
            Room: GetString(element, "room"),
            Speed: speed,
            Street: GetString(element, "street"),
            Text: GetString(element, "text"),
            Timestamp: timestamp,
            TimeZoneOffset: GetString(element, "tzo"),
            Uri: uri,
            Language: (string?)element.Attribute(XNamespace.Xml + "lang"));
        return Validate(location, throwOnInvalid: false);
    }

    public static void Validate(XmppUserLocationData location)
    {
        if (!Validate(location, throwOnInvalid: true))
        {
            throw new InvalidOperationException("The XEP-0080 user location payload is not valid.");
        }
    }

    private static bool Validate(XmppUserLocationData location, bool throwOnInvalid)
    {
        ArgumentNullException.ThrowIfNull(location);
        return Check(location.Latitude is null or >= -90m and <= 90m, "Latitude must be between -90 and 90.")
            && Check(location.Longitude is null or >= -180m and <= 180m, "Longitude must be between -180 and 180.")
            && Check(location.Accuracy is null or >= 0m, "Accuracy must be zero or greater.")
            && Check(location.AltitudeAccuracy is null or >= 0m, "Altitude accuracy must be zero or greater.")
            && Check(location.DeprecatedError is null or >= 0m, "Deprecated error must be zero or greater.")
            && Check(location.Speed is null or >= 0m, "Speed must be zero or greater.")
            && Check(location.Bearing is null or >= 0m and < 360m, "Bearing must be between 0 inclusive and 360 exclusive.")
            && Check(location.Uri is null || location.Uri.IsAbsoluteUri, "Location URI must be absolute.")
            && Check(IsValidTimeZoneOffset(location.TimeZoneOffset), "Time zone offset must use XEP-0082 form such as +01:00 or Z.");

        bool Check(bool condition, string message)
        {
            if (condition)
            {
                return true;
            }

            if (throwOnInvalid)
            {
                throw new ArgumentOutOfRangeException(nameof(location), message);
            }

            return false;
        }
    }

    private static void AddDecimal(XElement parent, string name, decimal? value)
    {
        if (value is not null)
        {
            parent.Add(new XElement(
                XName.Get(name, NamespaceName),
                value.Value.ToString("G29", CultureInfo.InvariantCulture)));
        }
    }

    private static void AddString(XElement parent, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            parent.Add(new XElement(XName.Get(name, NamespaceName), value));
        }
    }

    private static void SetLanguage(XElement element, string? language)
    {
        if (!string.IsNullOrWhiteSpace(language))
        {
            element.SetAttributeValue(XNamespace.Xml + "lang", language);
        }
    }

    private static bool TryGetDecimal(XElement element, string name, out decimal? value)
    {
        value = null;
        var raw = GetString(element, name);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        if (!decimal.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
        {
            return false;
        }

        value = parsed;
        return true;
    }

    private static bool TryGetTimestamp(XElement element, out DateTimeOffset? timestamp)
    {
        timestamp = null;
        var raw = GetString(element, "timestamp");
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        if (!DateTimeOffset.TryParse(
            raw,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed))
        {
            return false;
        }

        timestamp = parsed;
        return true;
    }

    private static bool TryGetUri(XElement element, out Uri? uri)
    {
        uri = null;
        var raw = GetString(element, "uri");
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        return Uri.TryCreate(raw, UriKind.Absolute, out uri);
    }

    private static string? GetString(XElement element, string name)
    {
        return element.Element(XName.Get(name, NamespaceName))?.Value;
    }

    private static bool IsValidTimeZoneOffset(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (string.Equals(value, "Z", StringComparison.Ordinal))
        {
            return true;
        }

        return value.Length == 6
            && (value[0] == '+' || value[0] == '-')
            && value[3] == ':'
            && char.IsDigit(value[1])
            && char.IsDigit(value[2])
            && char.IsDigit(value[4])
            && char.IsDigit(value[5]);
    }
}

public sealed record XmppUserLocationData(
    decimal? Accuracy = null,
    decimal? Altitude = null,
    decimal? AltitudeAccuracy = null,
    string? Area = null,
    decimal? Bearing = null,
    string? Building = null,
    string? Country = null,
    string? CountryCode = null,
    string? Datum = null,
    string? Description = null,
    decimal? DeprecatedError = null,
    string? Floor = null,
    decimal? Latitude = null,
    string? Locality = null,
    decimal? Longitude = null,
    string? PostalCode = null,
    string? Region = null,
    string? RegionCode = null,
    string? Room = null,
    decimal? Speed = null,
    string? Street = null,
    string? Text = null,
    DateTimeOffset? Timestamp = null,
    string? TimeZoneOffset = null,
    Uri? Uri = null,
    string? Language = null,
    string? Source = null)
{
    public bool HasCoordinates => Latitude is not null && Longitude is not null;

    public bool IsEmpty => this == new XmppUserLocationData();

    public bool IsStale(TimeSpan maxAge, DateTimeOffset? now = null)
    {
        if (Timestamp is null)
        {
            return true;
        }

        return (now ?? DateTimeOffset.UtcNow) - Timestamp.Value > maxAge;
    }

    public XElement ToXml()
    {
        return XmppUserLocation.CreateElement(this);
    }
}

public sealed record XmppUserLocationSupport(
    bool PersonalEventing,
    bool Publish,
    bool AutoCreate,
    bool RetrieveItems,
    bool Notifications)
{
    public bool CanPublish => PersonalEventing && Publish && AutoCreate;

    public bool CanRetrieve => PersonalEventing && RetrieveItems;

    public bool CanNotify => Notifications;
}

public sealed record XmppUserLocationNotification(
    XmppAddress? From,
    XmppAddress? To,
    string? ItemId,
    XmppUserLocationData? Location,
    bool IsRetracted)
{
    public bool IsCleared => IsRetracted || Location is null || Location.IsEmpty;
}
