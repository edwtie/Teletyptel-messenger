using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppRosterItem(
    XmppAddress Jid,
    string? Name = null,
    XmppRosterSubscription Subscription = XmppRosterSubscription.None,
    IReadOnlyList<string>? Groups = null)
{
    public static bool TryParse(XElement element, out XmppRosterItem? item)
    {
        item = null;

        if (element.Name != XName.Get("item", XmppXmlNames.RosterNamespace)
            || !XmppAddress.TryParse((string?)element.Attribute("jid"), out var jid)
            || jid is null
            || !XmppXmlValue.TryParseRosterSubscription((string?)element.Attribute("subscription"), out var subscription))
        {
            return false;
        }

        item = new XmppRosterItem(
            Jid: jid,
            Name: (string?)element.Attribute("name"),
            Subscription: subscription,
            Groups: element.Elements(XName.Get("group", XmppXmlNames.RosterNamespace))
                .Select(group => group.Value)
                .Where(group => !string.IsNullOrWhiteSpace(group))
                .ToArray());
        return true;
    }

    public XElement ToXml()
    {
        ArgumentNullException.ThrowIfNull(Jid);

        var element = new XElement(XName.Get("item", XmppXmlNames.RosterNamespace),
            new XAttribute("jid", Jid.Bare),
            new XAttribute("subscription", XmppXmlValue.RosterSubscription(Subscription)));

        if (!string.IsNullOrWhiteSpace(Name))
        {
            element.SetAttributeValue("name", Name);
        }

        foreach (var group in Groups ?? Array.Empty<string>())
        {
            if (!string.IsNullOrWhiteSpace(group))
            {
                element.Add(new XElement(XName.Get("group", XmppXmlNames.RosterNamespace), group));
            }
        }

        return element;
    }
}
