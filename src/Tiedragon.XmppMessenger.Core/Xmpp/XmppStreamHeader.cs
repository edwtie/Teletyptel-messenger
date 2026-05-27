using System.Security;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppStreamHeader
{
    public static string CreateClientOpenStream(
        string toDomain,
        string preferredLanguage = "en",
        XmppAddress? from = null)
    {
        if (string.IsNullOrWhiteSpace(toDomain))
        {
            throw new ArgumentException("Target domain is required.", nameof(toDomain));
        }

        if (string.IsNullOrWhiteSpace(preferredLanguage))
        {
            throw new ArgumentException("Preferred language is required.", nameof(preferredLanguage));
        }

        var builder = new StringBuilder();
        builder.Append("<stream:stream");
        builder.Append(" from=\"").Append(SecurityElement.Escape(from?.Bare ?? string.Empty)).Append('"');
        builder.Append(" to=\"").Append(SecurityElement.Escape(toDomain)).Append('"');
        builder.Append(" version=\"1.0\"");
        builder.Append(" xml:lang=\"").Append(SecurityElement.Escape(preferredLanguage)).Append('"');
        builder.Append(" xmlns=\"").Append(XmppXmlNames.ClientNamespace).Append('"');
        builder.Append(" xmlns:stream=\"").Append(XmppXmlNames.StreamNamespace).Append("\">");
        return builder.ToString();
    }

    public static string CloseStream { get; } = "</stream:stream>";
}
