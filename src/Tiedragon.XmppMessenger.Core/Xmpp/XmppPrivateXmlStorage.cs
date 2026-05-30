using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPrivateXmlStorage
{
    public const string NamespaceName = "jabber:iq:private";

    public static XmppIq CreateGetRequest(string id, XName payloadName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ValidatePayloadName(payloadName);

        return new XmppIq(
            XmppIqType.Get,
            id,
            new XElement(
                XName.Get("query", NamespaceName),
                new XElement(payloadName)));
    }

    public static XmppIq CreateGetRequest(string id, string elementName, string namespaceName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(elementName);
        ArgumentException.ThrowIfNullOrWhiteSpace(namespaceName);
        return CreateGetRequest(id, XName.Get(elementName, namespaceName));
    }

    public static XmppIq CreateSetRequest(string id, XElement payload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(payload);
        ValidatePayloadName(payload.Name);

        return new XmppIq(
            XmppIqType.Set,
            id,
            new XElement(
                XName.Get("query", NamespaceName),
                new XElement(payload)));
    }

    public static bool TryParseResult(
        XmppIq iq,
        XName payloadName,
        out XElement? payload)
    {
        payload = null;
        ValidatePayloadName(payloadName);

        if (!TryParseResult(iq, out var payloads) || payloads is null)
        {
            return false;
        }

        var match = payloads.FirstOrDefault(element => element.Name == payloadName);
        if (match is null)
        {
            return false;
        }

        payload = new XElement(match);
        return true;
    }

    public static bool TryParseResult(
        XmppIq iq,
        out IReadOnlyList<XElement>? payloads)
    {
        payloads = null;
        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("query", NamespaceName))
        {
            return false;
        }

        payloads = iq.Payload.Elements()
            .Select(element => new XElement(element))
            .ToArray();
        return true;
    }

    private static void ValidatePayloadName(XName payloadName)
    {
        ArgumentNullException.ThrowIfNull(payloadName);
        if (string.IsNullOrWhiteSpace(payloadName.NamespaceName))
        {
            throw new ArgumentException("Private XML storage payloads must have a namespace.", nameof(payloadName));
        }
    }
}
