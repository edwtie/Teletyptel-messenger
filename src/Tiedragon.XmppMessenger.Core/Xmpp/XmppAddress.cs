using System.Globalization;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppAddress
{
    private XmppAddress(string? localPart, string domainPart, string? resourcePart)
    {
        LocalPart = localPart;
        DomainPart = domainPart;
        ResourcePart = resourcePart;
    }

    public string? LocalPart { get; }

    public string DomainPart { get; }

    public string? ResourcePart { get; }

    public string Bare => LocalPart is null ? DomainPart : $"{LocalPart}@{DomainPart}";

    public string Full => ResourcePart is null ? Bare : $"{Bare}/{ResourcePart}";

    public bool IsBare => ResourcePart is null;

    public static XmppAddress Parse(string value)
    {
        if (TryParse(value, out var address) && address is not null)
        {
            return address;
        }

        throw new FormatException("The value is not a valid XMPP address.");
    }

    public static bool TryParse(string? value, out XmppAddress? address)
    {
        address = null;

        if (string.IsNullOrWhiteSpace(value) || HasControlCharacters(value))
        {
            return false;
        }

        var slashIndex = value.IndexOf('/');
        var bare = slashIndex >= 0 ? value[..slashIndex] : value;
        var resource = slashIndex >= 0 ? value[(slashIndex + 1)..] : null;

        if (string.IsNullOrEmpty(bare)
            || resource is ""
            || resource is not null && !IsValidPart(resource, allowAtSign: true, allowSlash: true))
        {
            return false;
        }

        var atIndex = bare.IndexOf('@');
        if (atIndex != bare.LastIndexOf('@'))
        {
            return false;
        }

        string? local = null;
        var domain = bare;
        if (atIndex >= 0)
        {
            local = bare[..atIndex];
            domain = bare[(atIndex + 1)..];
        }

        if (string.IsNullOrEmpty(domain)
            || local is ""
            || local is not null && !IsValidPart(local, allowAtSign: false, allowSlash: false))
        {
            return false;
        }

        if (!TryNormalizeDomain(domain, out var normalizedDomain))
        {
            return false;
        }

        address = new XmppAddress(local, normalizedDomain, resource);
        return true;
    }

    public override string ToString()
    {
        return Full;
    }

    private static bool TryNormalizeDomain(string domain, out string normalized)
    {
        normalized = string.Empty;

        if (!IsValidPart(domain, allowAtSign: false, allowSlash: false))
        {
            return false;
        }

        try
        {
            normalized = new IdnMapping().GetAscii(domain).ToLowerInvariant();
            return normalized.Length > 0 && normalized.Length <= 255;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static bool IsValidPart(string value, bool allowAtSign, bool allowSlash)
    {
        foreach (var ch in value)
        {
            if (char.IsWhiteSpace(ch) || char.IsControl(ch))
            {
                return false;
            }

            if (!allowAtSign && ch == '@')
            {
                return false;
            }

            if (!allowSlash && ch == '/')
            {
                return false;
            }
        }

        return true;
    }

    private static bool HasControlCharacters(string value)
    {
        return value.Any(char.IsControl);
    }
}
