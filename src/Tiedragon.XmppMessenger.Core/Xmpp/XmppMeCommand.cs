namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppMeCommand(string ActionText)
{
    public const string Prefix = "/me ";

    public string ToBody()
    {
        return Prefix + ActionText;
    }

    public string ToDisplayText(string senderDisplayName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(senderDisplayName);
        return "* " + senderDisplayName + " " + ActionText;
    }

    public static XmppMeCommand Create(string actionText)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(actionText);
        return new XmppMeCommand(actionText);
    }

    public static bool TryParse(string? body, out XmppMeCommand? command)
    {
        command = null;
        if (body is null || !body.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return false;
        }

        var actionText = body[Prefix.Length..];
        if (actionText.Length == 0)
        {
            return false;
        }

        command = new XmppMeCommand(actionText);
        return true;
    }
}

