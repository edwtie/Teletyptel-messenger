using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppAdHocCommands
{
    public const string NamespaceName = "http://jabber.org/protocol/commands";

    public const string CommandsNode = "http://jabber.org/protocol/commands";

    public static XmppIq CreateExecuteRequest(string id, XmppAddress to, string node)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(to);
        ArgumentException.ThrowIfNullOrWhiteSpace(node);

        var command = new XElement(
            XName.Get("command", NamespaceName),
            new XAttribute("action", "execute"),
            new XAttribute("node", node));
        return new XmppIq(XmppIqType.Set, id, command, To: to);
    }

    public static bool TryParseCommandResult(XmppIq iq, out XmppAdHocCommandResult? result)
    {
        result = null;
        ArgumentNullException.ThrowIfNull(iq);

        if (iq.Type != XmppIqType.Result || iq.Payload?.Name != XName.Get("command", NamespaceName))
        {
            return false;
        }

        var node = (string?)iq.Payload.Attribute("node");
        var status = (string?)iq.Payload.Attribute("status");
        if (string.IsNullOrWhiteSpace(node) || string.IsNullOrWhiteSpace(status))
        {
            return false;
        }

        var form = iq.Payload.Element(XName.Get("x", XmppServiceDiscovery.DataFormNamespace));
        result = new XmppAdHocCommandResult(
            Node: node,
            SessionId: (string?)iq.Payload.Attribute("sessionid"),
            Status: status,
            Action: (string?)iq.Payload.Attribute("action"),
            DataForm: form is null ? null : XmppServiceDiscovery.ParseDataForm(form));
        return true;
    }
}

public sealed record XmppAdHocCommandResult(
    string Node,
    string? SessionId,
    string Status,
    string? Action,
    XmppDataForm? DataForm)
{
    public bool Completed => string.Equals(Status, "completed", StringComparison.Ordinal);
}
