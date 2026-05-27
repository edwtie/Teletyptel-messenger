using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppPushNotifications
{
    public const string NamespaceName = "urn:xmpp:push:0";
    public const string DataFormsNamespace = "jabber:x:data";

    public static XmppIq CreateEnableRequest(
        string id,
        XmppAddress service,
        string node,
        IReadOnlyDictionary<string, string>? publishOptions = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        var enable = new XElement(
            XName.Get("enable", NamespaceName),
            new XAttribute("jid", service.Bare),
            new XAttribute("node", node));

        if (publishOptions is { Count: > 0 })
        {
            enable.Add(CreatePublishOptionsForm(publishOptions));
        }

        return new XmppIq(XmppIqType.Set, id, enable);
    }

    public static XmppIq CreateDisableRequest(
        string id,
        XmppAddress service,
        string? node = null)
    {
        var disable = new XElement(
            XName.Get("disable", NamespaceName),
            new XAttribute("jid", service.Bare));

        if (!string.IsNullOrWhiteSpace(node))
        {
            disable.SetAttributeValue("node", node);
        }

        return new XmppIq(XmppIqType.Set, id, disable);
    }

    public static bool IsEnableResult(XmppIq iq, string id)
    {
        return iq.Type == XmppIqType.Result && iq.Id == id;
    }

    private static XElement CreatePublishOptionsForm(IReadOnlyDictionary<string, string> publishOptions)
    {
        var form = new XElement(
            XName.Get("x", DataFormsNamespace),
            new XAttribute("type", "submit"),
            new XElement(
                XName.Get("field", DataFormsNamespace),
                new XAttribute("var", "FORM_TYPE"),
                new XAttribute("type", "hidden"),
                new XElement(XName.Get("value", DataFormsNamespace), NamespaceName)));

        foreach (var option in publishOptions.OrderBy(item => item.Key, StringComparer.Ordinal))
        {
            form.Add(new XElement(
                XName.Get("field", DataFormsNamespace),
                new XAttribute("var", option.Key),
                new XElement(XName.Get("value", DataFormsNamespace), option.Value)));
        }

        return form;
    }
}

