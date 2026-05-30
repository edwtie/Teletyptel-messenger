using System.Security.Cryptography;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppOmemoX3DhCurve
{
    X25519,
    X448
}

public enum XmppOmemoX3DhHash
{
    Sha256,
    Sha512
}

public static class XmppOmemoX3Dh
{
    public static IReadOnlyList<XmppOmemoX3DhDhStep> CreateDhPlan(bool useOneTimePreKey)
    {
        var steps = new List<XmppOmemoX3DhDhStep>
        {
            new("DH1", "IK_A", "SPK_B", "Alice identity key with Bob signed pre-key"),
            new("DH2", "EK_A", "IK_B", "Alice ephemeral key with Bob identity key"),
            new("DH3", "EK_A", "SPK_B", "Alice ephemeral key with Bob signed pre-key")
        };

        if (useOneTimePreKey)
        {
            steps.Add(new("DH4", "EK_A", "OPK_B", "Alice ephemeral key with Bob one-time pre-key"));
        }

        return steps;
    }

    public static XmppOmemoX3DhBundleValidation ValidateBundle(XmppOmemoBundle bundle)
    {
        ArgumentNullException.ThrowIfNull(bundle);
        var issues = new List<string>();

        AddBase64Issue(issues, bundle.IdentityKey, "identityKey");
        AddBase64Issue(issues, bundle.SignedPreKeyPublic, "signedPreKeyPublic");
        AddBase64Issue(issues, bundle.SignedPreKeySignature, "signedPreKeySignature");

        var duplicatePreKeyIds = bundle.PreKeys
            .GroupBy(preKey => preKey.Id)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToArray();
        foreach (var id in duplicatePreKeyIds)
        {
            issues.Add($"duplicate preKeyId {id}");
        }

        foreach (var preKey in bundle.PreKeys)
        {
            AddBase64Issue(issues, preKey.PublicKey, $"preKeyPublic {preKey.Id}");
        }

        return new XmppOmemoX3DhBundleValidation(
            issues.Count == 0,
            bundle.PreKeys.Count > 0,
            issues);
    }

    public static byte[] CreateAssociatedData(
        string aliceIdentityKey,
        string bobIdentityKey,
        params string[] additionalIdentityText)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(aliceIdentityKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(bobIdentityKey);

        var alice = Convert.FromBase64String(aliceIdentityKey);
        var bob = Convert.FromBase64String(bobIdentityKey);
        var additional = additionalIdentityText.Length == 0
            ? []
            : Encoding.UTF8.GetBytes(string.Join("\n", additionalIdentityText));

        var result = new byte[alice.Length + bob.Length + additional.Length];
        alice.CopyTo(result, 0);
        bob.CopyTo(result, alice.Length);
        additional.CopyTo(result, alice.Length + bob.Length);
        return result;
    }

    public static byte[] DeriveSharedSecret(
        IEnumerable<byte[]> dhOutputs,
        XmppOmemoX3DhParameters? parameters = null)
    {
        ArgumentNullException.ThrowIfNull(dhOutputs);

        parameters ??= XmppOmemoX3DhParameters.Default;
        var dhMaterial = dhOutputs
            .Select(output =>
            {
                if (output.Length == 0)
                {
                    throw new ArgumentException("X3DH DH outputs must not be empty.", nameof(dhOutputs));
                }

                return output;
            })
            .ToArray();
        if (dhMaterial.Length is < 3 or > 4)
        {
            throw new ArgumentException("X3DH requires DH1-DH3, with optional DH4.", nameof(dhOutputs));
        }

        var km = Concatenate(dhMaterial);
        var domainSeparator = Enumerable.Repeat((byte)0xff, parameters.Curve == XmppOmemoX3DhCurve.X25519 ? 32 : 57)
            .ToArray();
        var ikm = Concatenate(domainSeparator, km);
        return Hkdf(
            ikm,
            new byte[parameters.Hash == XmppOmemoX3DhHash.Sha256 ? 32 : 64],
            Encoding.ASCII.GetBytes(parameters.Info),
            32,
            parameters.Hash);
    }

    private static void AddBase64Issue(List<string> issues, string value, string field)
    {
        if (!XmppOmemo.IsValidBase64(value))
        {
            issues.Add($"{field} is not valid base64");
        }
    }

    private static byte[] Hkdf(
        byte[] inputKeyMaterial,
        byte[] salt,
        byte[] info,
        int outputLength,
        XmppOmemoX3DhHash hash)
    {
        var pseudoRandomKey = Hmac(hash, salt, inputKeyMaterial);
        var output = new List<byte>(outputLength);
        var previous = Array.Empty<byte>();
        byte counter = 1;
        while (output.Count < outputLength)
        {
            previous = Hmac(hash, pseudoRandomKey, Concatenate(previous, info, [counter]));
            output.AddRange(previous);
            counter++;
        }

        return output.Take(outputLength).ToArray();
    }

    private static byte[] Hmac(XmppOmemoX3DhHash hash, byte[] key, byte[] data)
    {
        return hash == XmppOmemoX3DhHash.Sha256
            ? HMACSHA256.HashData(key, data)
            : HMACSHA512.HashData(key, data);
    }

    private static byte[] Concatenate(params byte[][] parts)
    {
        var result = new byte[parts.Sum(part => part.Length)];
        var offset = 0;
        foreach (var part in parts)
        {
            part.CopyTo(result, offset);
            offset += part.Length;
        }

        return result;
    }
}

public sealed record XmppOmemoX3DhParameters(
    XmppOmemoX3DhCurve Curve,
    XmppOmemoX3DhHash Hash,
    string Info)
{
    public static XmppOmemoX3DhParameters Default { get; } = new(
        XmppOmemoX3DhCurve.X25519,
        XmppOmemoX3DhHash.Sha256,
        "Tiedragon Teletyptel OMEMO X3DH v1");
}

public sealed record XmppOmemoX3DhBundleValidation(
    bool IsUsable,
    bool HasOneTimePreKeys,
    IReadOnlyList<string> Issues);

public sealed record XmppOmemoX3DhDhStep(
    string Name,
    string AliceKey,
    string BobKey,
    string Purpose);
