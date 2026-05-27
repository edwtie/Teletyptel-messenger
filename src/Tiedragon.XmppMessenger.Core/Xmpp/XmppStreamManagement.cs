using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppStreamManagement
{
    public const string NamespaceName = XmppXmlNames.StreamManagementNamespace;

    public static XElement CreateEnable(bool resume = true)
    {
        var element = new XElement(XName.Get("enable", NamespaceName));
        if (resume)
        {
            element.SetAttributeValue("resume", "true");
        }

        return element;
    }

    public static XElement CreateAck(ulong handled)
    {
        return new XElement(XName.Get("a", NamespaceName), new XAttribute("h", handled));
    }

    public static XElement CreateAckRequest()
    {
        return new XElement(XName.Get("r", NamespaceName));
    }

    public static XElement CreateResume(string previousId, ulong handled)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(previousId);

        return new XElement(
            XName.Get("resume", NamespaceName),
            new XAttribute("previd", previousId),
            new XAttribute("h", handled));
    }

    public static bool IsStreamManagementElement(XElement element)
    {
        return element.Name.NamespaceName == NamespaceName;
    }

    public static bool TryParseEnabled(XElement element, out string? id, out bool resume)
    {
        id = null;
        resume = false;

        if (element.Name != XName.Get("enabled", NamespaceName))
        {
            return false;
        }

        id = (string?)element.Attribute("id");
        resume = IsTrue((string?)element.Attribute("resume"));
        return true;
    }

    public static bool TryParseAck(XElement element, out ulong handled)
    {
        handled = 0;
        return element.Name == XName.Get("a", NamespaceName)
            && ulong.TryParse((string?)element.Attribute("h"), out handled);
    }

    public static bool IsAckRequest(XElement element)
    {
        return element.Name == XName.Get("r", NamespaceName);
    }

    public static bool TryParseResumed(XElement element, out string? previousId, out ulong handled)
    {
        previousId = null;
        handled = 0;

        if (element.Name != XName.Get("resumed", NamespaceName))
        {
            return false;
        }

        previousId = (string?)element.Attribute("previd");
        return ulong.TryParse((string?)element.Attribute("h"), out handled);
    }

    public static bool IsFailed(XElement element)
    {
        return element.Name == XName.Get("failed", NamespaceName);
    }

    private static bool IsTrue(string? value)
    {
        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, "1", StringComparison.Ordinal);
    }
}
