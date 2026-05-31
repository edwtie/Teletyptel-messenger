using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppJingleUserLocation
{
    public const string NamespaceName = "urn:xmpp:jingle:apps:geoloc:0";

    public const string DefaultContentName = "location";

    public const string UpdateElementName = "location";

    public const string StopElementName = "location-stop";

    public static bool SupportsJingleUserLocation(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(NamespaceName);
    }

    public static XmppJingleContent CreateLocationContent(
        XmppUserLocationData? location = null,
        string contentName = DefaultContentName,
        string creator = "initiator",
        string senders = "both")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(contentName);
        ArgumentException.ThrowIfNullOrWhiteSpace(creator);

        return new XmppJingleContent(
            contentName,
            creator,
            senders,
            CreateDescription(location),
            null);
    }

    public static XElement CreateDescription(XmppUserLocationData? location = null)
    {
        var description = new XElement(XName.Get("description", NamespaceName));
        if (location is not null)
        {
            description.Add(XmppUserLocation.CreateElement(location));
        }

        return description;
    }

    public static bool TryParseLocation(
        XmppJingleContent content,
        out XmppUserLocationData? location)
    {
        ArgumentNullException.ThrowIfNull(content);
        return TryParseDescription(content.Description, out location);
    }

    public static bool TryParseDescription(
        XElement? element,
        out XmppUserLocationData? location)
    {
        location = null;
        if (element?.Name != XName.Get("description", NamespaceName))
        {
            return false;
        }

        var geoloc = element.Element(XName.Get("geoloc", XmppUserLocation.NamespaceName));
        if (geoloc is null)
        {
            return true;
        }

        return XmppUserLocation.TryParseElement(geoloc, out location);
    }

    public static XElement CreateLocationUpdateInfo(
        XmppUserLocationData location,
        string? creator = null,
        string? contentName = DefaultContentName)
    {
        ArgumentNullException.ThrowIfNull(location);

        var element = CreateSessionInfoElement(UpdateElementName, creator, contentName);
        element.Add(XmppUserLocation.CreateElement(location));
        return element;
    }

    public static XElement CreateLocationStopInfo(
        string? creator = null,
        string? contentName = DefaultContentName)
    {
        return CreateSessionInfoElement(StopElementName, creator, contentName);
    }

    public static XmppIq CreateLocationUpdate(
        string id,
        XmppAddress to,
        string sid,
        XmppUserLocationData location,
        string? creator = null,
        string? contentName = DefaultContentName,
        string? initiator = null,
        string? responder = null)
    {
        return XmppJingle.CreateSessionInfo(
            id,
            to,
            sid,
            CreateLocationUpdateInfo(location, creator, contentName),
            initiator,
            responder);
    }

    public static XmppIq CreateLocationStop(
        string id,
        XmppAddress to,
        string sid,
        string? creator = null,
        string? contentName = DefaultContentName,
        string? initiator = null,
        string? responder = null)
    {
        return XmppJingle.CreateSessionInfo(
            id,
            to,
            sid,
            CreateLocationStopInfo(creator, contentName),
            initiator,
            responder);
    }

    public static bool TryParseSessionInfo(
        XElement? element,
        out XmppJingleUserLocationUpdate? update)
    {
        update = null;
        if (element?.Name.NamespaceName != NamespaceName)
        {
            return false;
        }

        if (element.Name.LocalName == StopElementName)
        {
            update = new XmppJingleUserLocationUpdate(
                IsSharing: false,
                Creator: (string?)element.Attribute("creator"),
                ContentName: (string?)element.Attribute("name"),
                Location: null);
            return true;
        }

        if (element.Name.LocalName != UpdateElementName)
        {
            return false;
        }

        var geoloc = element.Element(XName.Get("geoloc", XmppUserLocation.NamespaceName));
        if (geoloc is null || !XmppUserLocation.TryParseElement(geoloc, out var location))
        {
            return false;
        }

        update = new XmppJingleUserLocationUpdate(
            IsSharing: true,
            Creator: (string?)element.Attribute("creator"),
            ContentName: (string?)element.Attribute("name"),
            Location: location);
        return true;
    }

    private static XElement CreateSessionInfoElement(string localName, string? creator, string? contentName)
    {
        var element = new XElement(XName.Get(localName, NamespaceName));
        if (!string.IsNullOrWhiteSpace(creator))
        {
            element.SetAttributeValue("creator", creator);
        }

        if (!string.IsNullOrWhiteSpace(contentName))
        {
            element.SetAttributeValue("name", contentName);
        }

        return element;
    }
}

public sealed record XmppJingleUserLocationUpdate(
    bool IsSharing,
    string? Creator,
    string? ContentName,
    XmppUserLocationData? Location);
