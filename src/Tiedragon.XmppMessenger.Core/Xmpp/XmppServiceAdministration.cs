using System.Globalization;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppServiceAdministration
{
    public const string NamespaceName = "http://jabber.org/protocol/admin";

    public const string GetRegisteredUsersNumberNode = NamespaceName + "#get-registered-users-num";

    public const string GetOnlineUsersNumberNode = NamespaceName + "#get-online-users-num";

    public const string GetActiveUsersNumberNode = NamespaceName + "#get-active-users-num";

    public const string GetIdleUsersNumberNode = NamespaceName + "#get-idle-users-num";

    public const string GetRegisteredUsersListNode = NamespaceName + "#get-registered-users-list";

    public const string GetOnlineUsersListNode = NamespaceName + "#get-online-users-list";

    public const string GetActiveUsersNode = NamespaceName + "#get-active-users";

    public const string GetIdleUsersNode = NamespaceName + "#get-idle-users";

    public const string FormTypeField = "FORM_TYPE";

    public const string RegisteredUsersNumberField = "registeredusersnum";

    public const string OnlineUsersNumberField = "onlineusersnum";

    public const string ActiveUsersNumberField = "activeusersnum";

    public const string IdleUsersNumberField = "idleusersnum";

    public const string RegisteredUserJidsField = "registereduserjids";

    public const string OnlineUserJidsField = "onlineuserjids";

    public const string ActiveUserJidsField = "activeuserjids";

    // XEP-0133 reuses the activeuserjids field for the idle-users command.
    public const string IdleUserJidsField = ActiveUserJidsField;

    public static IReadOnlyList<XmppServiceAdministrationCommand> ReadOnlyCommands { get; } =
    [
        new(GetRegisteredUsersNumberNode, "Get Number of Registered Users", RegisteredUsersNumberField, false),
        new(GetOnlineUsersNumberNode, "Get Number of Online Users", OnlineUsersNumberField, false),
        new(GetActiveUsersNumberNode, "Get Number of Active Users", ActiveUsersNumberField, false),
        new(GetIdleUsersNumberNode, "Get Number of Idle Users", IdleUsersNumberField, false),
        new(GetRegisteredUsersListNode, "Get List of Registered Users", RegisteredUserJidsField, true),
        new(GetOnlineUsersListNode, "Get List of Online Users", OnlineUserJidsField, true),
        new(GetActiveUsersNode, "Get List of Active Users", ActiveUserJidsField, true),
        new(GetIdleUsersNode, "Get List of Idle Users", IdleUserJidsField, true)
    ];

    public static XmppIq CreateReadOnlyCommandRequest(string id, XmppAddress to, string node)
    {
        if (!IsReadOnlyCommandNode(node))
        {
            throw new ArgumentException("The command node is not a supported read-only XEP-0133 command.", nameof(node));
        }

        return XmppAdHocCommands.CreateExecuteRequest(id, to, node);
    }

    public static bool IsReadOnlyCommandNode(string? node)
    {
        return !string.IsNullOrWhiteSpace(node)
            && ReadOnlyCommands.Any(command => string.Equals(command.Node, node, StringComparison.Ordinal));
    }

    public static bool SupportsServiceAdministration(XmppServiceDiscoveryInfo info)
    {
        ArgumentNullException.ThrowIfNull(info);
        return info.Supports(XmppAdHocCommands.NamespaceName);
    }

    public static bool TryGetInteger(
        XmppAdHocCommandResult result,
        string fieldName,
        out int value)
    {
        ArgumentNullException.ThrowIfNull(result);
        ArgumentException.ThrowIfNullOrWhiteSpace(fieldName);

        value = 0;
        var raw = result.DataForm?.GetFirstValue(fieldName);
        return int.TryParse(raw, NumberStyles.None, CultureInfo.InvariantCulture, out value);
    }

    public static IReadOnlyList<XmppAddress> GetJids(XmppAdHocCommandResult result, string fieldName)
    {
        ArgumentNullException.ThrowIfNull(result);
        ArgumentException.ThrowIfNullOrWhiteSpace(fieldName);

        if (result.DataForm is null || !result.DataForm.Fields.TryGetValue(fieldName, out var values))
        {
            return [];
        }

        return values
            .Select(value => XmppAddress.TryParse(value, out var address) ? address : null)
            .Where(address => address is not null)
            .Cast<XmppAddress>()
            .ToArray();
    }
}

public sealed record XmppServiceAdministrationCommand(
    string Node,
    string Name,
    string ResultField,
    bool ReturnsJids);
