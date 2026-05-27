using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppSaslScram
{
    public const string MechanismSha1 = "SCRAM-SHA-1";

    public const string MechanismSha256 = "SCRAM-SHA-256";

    private readonly HashAlgorithmName _hashAlgorithm;
    private readonly string _username;
    private readonly string _password;
    private readonly string _clientNonce;
    private string? _clientFirstBare;
    private string? _serverFirstMessage;
    private byte[]? _serverSignature;

    public XmppSaslScram(string mechanism, string username, string password, string? clientNonce = null)
    {
        if (mechanism != MechanismSha1 && mechanism != MechanismSha256)
        {
            throw new ArgumentException("Unsupported SCRAM mechanism.", nameof(mechanism));
        }

        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.", nameof(username));
        }

        ArgumentNullException.ThrowIfNull(password);

        Mechanism = mechanism;
        _hashAlgorithm = mechanism == MechanismSha256 ? HashAlgorithmName.SHA256 : HashAlgorithmName.SHA1;
        _username = username;
        _password = password;
        _clientNonce = clientNonce ?? CreateNonce();
    }

    public string Mechanism { get; }

    public XElement CreateInitialAuthElement()
    {
        var initial = CreateClientFirstMessage();
        return new XElement(
            XName.Get("auth", XmppXmlNames.SaslNamespace),
            new XAttribute("mechanism", Mechanism),
            Convert.ToBase64String(Encoding.UTF8.GetBytes(initial)));
    }

    public XElement CreateResponseElement(string base64Challenge)
    {
        var challenge = Encoding.UTF8.GetString(Convert.FromBase64String(base64Challenge));
        var response = CreateClientFinalMessage(challenge);

        return new XElement(
            XName.Get("response", XmppXmlNames.SaslNamespace),
            Convert.ToBase64String(Encoding.UTF8.GetBytes(response)));
    }

    public static bool IsChallenge(XElement element)
    {
        ArgumentNullException.ThrowIfNull(element);
        return element.Name == XName.Get("challenge", XmppXmlNames.SaslNamespace);
    }

    public bool VerifyServerFinal(string base64ServerFinal)
    {
        if (_serverSignature is null)
        {
            throw new InvalidOperationException("SCRAM server signature is not available before client-final is created.");
        }

        var serverFinal = ParseAttributes(Encoding.UTF8.GetString(Convert.FromBase64String(base64ServerFinal)));
        return serverFinal.TryGetValue("v", out var verifier)
            && CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(verifier), _serverSignature);
    }

    public string CreateClientFirstMessage()
    {
        _clientFirstBare = $"n={EscapeUsername(_username)},r={_clientNonce}";
        return $"n,,{_clientFirstBare}";
    }

    public string CreateClientFinalMessage(string serverFirstMessage)
    {
        if (_clientFirstBare is null)
        {
            CreateClientFirstMessage();
        }

        var attributes = ParseAttributes(serverFirstMessage);
        var nonce = Required(attributes, "r");
        if (!nonce.StartsWith(_clientNonce, StringComparison.Ordinal))
        {
            throw new FormatException("SCRAM server nonce does not extend the client nonce.");
        }

        var salt = Convert.FromBase64String(Required(attributes, "s"));
        var iterations = int.Parse(Required(attributes, "i"), System.Globalization.CultureInfo.InvariantCulture);
        if (iterations <= 0)
        {
            throw new FormatException("SCRAM iteration count must be positive.");
        }

        _serverFirstMessage = serverFirstMessage;
        var clientFinalWithoutProof = $"c=biws,r={nonce}";
        var authMessage = $"{_clientFirstBare},{_serverFirstMessage},{clientFinalWithoutProof}";

        var saltedPassword = Hi(_password, salt, iterations);
        var clientKey = Hmac(saltedPassword, "Client Key");
        var storedKey = Hash(clientKey);
        var clientSignature = Hmac(storedKey, authMessage);
        var clientProof = Xor(clientKey, clientSignature);
        var serverKey = Hmac(saltedPassword, "Server Key");
        _serverSignature = Hmac(serverKey, authMessage);

        return $"{clientFinalWithoutProof},p={Convert.ToBase64String(clientProof)}";
    }

    private static string CreateNonce()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)).TrimEnd('=');
    }

    private static string EscapeUsername(string username)
    {
        return username.Replace("=", "=3D", StringComparison.Ordinal)
            .Replace(",", "=2C", StringComparison.Ordinal);
    }

    private static string Required(IReadOnlyDictionary<string, string> attributes, string name)
    {
        return attributes.TryGetValue(name, out var value) && value.Length > 0
            ? value
            : throw new FormatException($"SCRAM attribute '{name}' is required.");
    }

    private static Dictionary<string, string> ParseAttributes(string message)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var part in message.Split(',', StringSplitOptions.None))
        {
            var index = part.IndexOf('=');
            if (index <= 0)
            {
                throw new FormatException("SCRAM attribute is malformed.");
            }

            result[part[..index]] = part[(index + 1)..];
        }

        return result;
    }

    private byte[] Hi(string password, byte[] salt, int iterations)
    {
        return Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            _hashAlgorithm,
            _hashAlgorithm == HashAlgorithmName.SHA256 ? 32 : 20);
    }

    private byte[] Hash(byte[] value)
    {
        return _hashAlgorithm == HashAlgorithmName.SHA256
            ? SHA256.HashData(value)
            : SHA1.HashData(value);
    }

    private byte[] Hmac(byte[] key, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        return _hashAlgorithm == HashAlgorithmName.SHA256
            ? HMACSHA256.HashData(key, bytes)
            : HMACSHA1.HashData(key, bytes);
    }

    private static byte[] Xor(byte[] left, byte[] right)
    {
        if (left.Length != right.Length)
        {
            throw new ArgumentException("SCRAM buffers must have equal length.");
        }

        var result = new byte[left.Length];
        for (var index = 0; index < left.Length; index++)
        {
            result[index] = (byte)(left[index] ^ right[index]);
        }

        return result;
    }
}
