using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppVCardTemp(
    string? FullName = null,
    string? Nickname = null,
    string? Url = null,
    string? Birthday = null,
    XmppVCardPhoto? Photo = null)
{
    public const string NamespaceName = "vcard-temp";

    public XElement ToXml()
    {
        var element = new XElement(XName.Get("vCard", NamespaceName));

        AddText(element, "FN", FullName);
        AddText(element, "NICKNAME", Nickname);
        AddText(element, "URL", Url);
        AddText(element, "BDAY", Birthday);

        if (Photo is not null)
        {
            element.Add(Photo.ToXml());
        }

        return element;
    }

    public static XmppIq CreateGetRequest(string id, XmppAddress? to = null)
    {
        return new XmppIq(XmppIqType.Get, id, new XElement(XName.Get("vCard", NamespaceName)), To: to);
    }

    public static XmppIq CreateSetRequest(string id, XmppVCardTemp vCard)
    {
        ArgumentNullException.ThrowIfNull(vCard);
        return new XmppIq(XmppIqType.Set, id, vCard.ToXml());
    }

    public static bool TryParse(XElement element, out XmppVCardTemp? vCard)
    {
        vCard = null;
        if (element.Name != XName.Get("vCard", NamespaceName))
        {
            return false;
        }

        XmppVCardPhoto.TryParse(element.Element(XName.Get("PHOTO", NamespaceName)), out var photo);
        vCard = new XmppVCardTemp(
            FullName: Text(element, "FN"),
            Nickname: Text(element, "NICKNAME"),
            Url: Text(element, "URL"),
            Birthday: Text(element, "BDAY"),
            Photo: photo);
        return true;
    }

    public static bool TryParseResult(XmppIq iq, out XmppVCardTemp? vCard)
    {
        vCard = null;
        return iq.Type == XmppIqType.Result
            && iq.Payload is not null
            && TryParse(iq.Payload, out vCard);
    }

    private static string? Text(XElement element, string name)
    {
        var value = element.Element(XName.Get(name, NamespaceName))?.Value;
        return string.IsNullOrEmpty(value) ? null : value;
    }

    private static void AddText(XElement element, string name, string? value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            element.Add(new XElement(XName.Get(name, NamespaceName), value));
        }
    }
}

public sealed record XmppVCardPhoto(
    string? ContentType = null,
    string? Base64Data = null,
    string? ExternalValue = null)
{
    public XElement ToXml()
    {
        var element = new XElement(XName.Get("PHOTO", XmppVCardTemp.NamespaceName));
        if (!string.IsNullOrEmpty(ExternalValue))
        {
            element.Add(new XElement(XName.Get("EXTVAL", XmppVCardTemp.NamespaceName), ExternalValue));
            return element;
        }

        if (!string.IsNullOrEmpty(ContentType))
        {
            element.Add(new XElement(XName.Get("TYPE", XmppVCardTemp.NamespaceName), ContentType));
        }

        if (!string.IsNullOrEmpty(Base64Data))
        {
            element.Add(new XElement(XName.Get("BINVAL", XmppVCardTemp.NamespaceName), Base64Data));
        }

        return element;
    }

    public static bool TryParse(XElement? element, out XmppVCardPhoto? photo)
    {
        photo = null;
        if (element is null || element.Name != XName.Get("PHOTO", XmppVCardTemp.NamespaceName))
        {
            return false;
        }

        photo = new XmppVCardPhoto(
            ContentType: Text(element, "TYPE"),
            Base64Data: Text(element, "BINVAL"),
            ExternalValue: Text(element, "EXTVAL"));
        return true;
    }

    private static string? Text(XElement element, string name)
    {
        var value = element.Element(XName.Get(name, XmppVCardTemp.NamespaceName))?.Value;
        return string.IsNullOrEmpty(value) ? null : value;
    }
}

