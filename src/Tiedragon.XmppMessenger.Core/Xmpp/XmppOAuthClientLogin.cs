using System.Text;
using System.Text.Json;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppOAuthBearerError(
    string? Status,
    string? Scope,
    Uri? OpenIdConfiguration);

public static class XmppOAuthClientLogin
{
    public const string Mechanism = "OAUTHBEARER";

    public const string ScopeClientNormal = "xmpp:client:normal";

    public const string ScopeAccountRead = "xmpp:account:read";

    public const string ScopeAccountWrite = "xmpp:account:write";

    public static XElement CreateAuthElement(string bearerToken, string? authorizationIdentity = null)
    {
        return new XElement(
            XName.Get("auth", XmppXmlNames.SaslNamespace),
            new XAttribute("mechanism", Mechanism),
            CreateInitialResponse(bearerToken, authorizationIdentity));
    }

    public static string CreateInitialResponse(string bearerToken, string? authorizationIdentity = null)
    {
        ArgumentNullException.ThrowIfNull(bearerToken);

        var authzid = string.IsNullOrWhiteSpace(authorizationIdentity)
            ? string.Empty
            : $"a={authorizationIdentity}";
        var response = $"n,{authzid},\u0001auth=Bearer {bearerToken}\u0001\u0001";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(response));
    }

    public static string DecodeInitialResponse(string base64)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(base64);
        return Encoding.UTF8.GetString(Convert.FromBase64String(base64));
    }

    public static bool TryParseBearerError(XElement challenge, out XmppOAuthBearerError? error)
    {
        error = null;

        if (challenge.Name != XName.Get("challenge", XmppXmlNames.SaslNamespace)
            || string.IsNullOrWhiteSpace(challenge.Value))
        {
            return false;
        }

        string json;
        try
        {
            json = Encoding.UTF8.GetString(Convert.FromBase64String(challenge.Value.Trim()));
        }
        catch (FormatException)
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var status = TryGetString(root, "status");
            var scope = TryGetString(root, "scope");
            var openIdConfigurationText = TryGetString(root, "openid-configuration");
            Uri.TryCreate(openIdConfigurationText, UriKind.Absolute, out var openIdConfiguration);

            error = new XmppOAuthBearerError(status, scope, openIdConfiguration);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string? TryGetString(JsonElement element, string name)
    {
        return element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }
}
