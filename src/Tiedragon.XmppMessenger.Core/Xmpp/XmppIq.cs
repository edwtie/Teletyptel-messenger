using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppIq(
    XmppIqType Type,
    string Id,
    XElement? Payload = null,
    XmppAddress? To = null,
    XmppAddress? From = null)
{
    public static bool TryParse(XElement element, out XmppIq? iq)
    {
        iq = null;

        if (element.Name != XName.Get("iq", XmppXmlNames.ClientNamespace)
            || !XmppXmlValue.TryParseIqType((string?)element.Attribute("type"), out var type))
        {
            return false;
        }

        XmppAddress.TryParse((string?)element.Attribute("to"), out var to);
        XmppAddress.TryParse((string?)element.Attribute("from"), out var from);

        var children = element.Elements().ToArray();
        var payload = type == XmppIqType.Error
            ? children.FirstOrDefault(child => child.Name == XName.Get("error", XmppXmlNames.ClientNamespace))
                ?? children.FirstOrDefault()
            : children.SingleOrDefault();

        iq = new XmppIq(
            Type: type,
            Id: (string?)element.Attribute("id") ?? string.Empty,
            Payload: payload,
            To: to,
            From: from);
        return true;
    }

    public static bool TryParse(string xml, out XmppIq? iq)
    {
        iq = null;

        try
        {
            return TryParse(XElement.Parse(xml), out iq);
        }
        catch (System.Xml.XmlException)
        {
            return false;
        }
    }

    public IReadOnlyList<XmppRosterItem> GetRosterItems()
    {
        if (Payload?.Name != XName.Get("query", XmppXmlNames.RosterNamespace))
        {
            return Array.Empty<XmppRosterItem>();
        }

        return Payload.Elements(XName.Get("item", XmppXmlNames.RosterNamespace))
            .Select(element => XmppRosterItem.TryParse(element, out var item) ? item : null)
            .Where(item => item is not null)
            .Cast<XmppRosterItem>()
            .ToArray();
    }

    public XElement ToXml()
    {
        if (string.IsNullOrWhiteSpace(Id))
        {
            throw new InvalidOperationException("IQ id is required.");
        }

        var element = new XElement(XName.Get("iq", XmppXmlNames.ClientNamespace),
            new XAttribute("type", XmppXmlValue.IqType(Type)),
            new XAttribute("id", Id));

        if (To is not null)
        {
            element.SetAttributeValue("to", To.Full);
        }

        if (From is not null)
        {
            element.SetAttributeValue("from", From.Full);
        }

        if (Payload is not null)
        {
            element.Add(Payload);
        }

        return element;
    }

    public static XmppIq RosterGet(string id)
    {
        var query = new XElement(XName.Get("query", XmppXmlNames.RosterNamespace));
        return new XmppIq(XmppIqType.Get, id, query);
    }

    public static XmppIq RosterSet(string id, IEnumerable<XmppRosterItem> items)
    {
        ArgumentNullException.ThrowIfNull(items);
        var query = new XElement(XName.Get("query", XmppXmlNames.RosterNamespace), items.Select(item => item.ToXml()));
        return new XmppIq(XmppIqType.Set, id, query);
    }

    public static XmppIq RosterSet(string id, XmppRosterItem item)
    {
        ArgumentNullException.ThrowIfNull(item);
        return RosterSet(id, [item]);
    }

    public static XmppIq RosterRemove(string id, XmppAddress jid)
    {
        ArgumentNullException.ThrowIfNull(jid);
        return RosterSet(id, new XmppRosterItem(jid, Subscription: XmppRosterSubscription.Remove));
    }
}
