using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public enum XmppClientState
{
    Active,
    Inactive
}

public static class XmppClientStateIndication
{
    public const string NamespaceName = XmppXmlNames.ClientStateIndicationNamespace;

    public static XElement CreateActive()
    {
        return Create(XmppClientState.Active);
    }

    public static XElement CreateInactive()
    {
        return Create(XmppClientState.Inactive);
    }

    public static XElement Create(XmppClientState state)
    {
        return state switch
        {
            XmppClientState.Active => new XElement(XName.Get("active", NamespaceName)),
            XmppClientState.Inactive => new XElement(XName.Get("inactive", NamespaceName)),
            _ => throw new ArgumentOutOfRangeException(nameof(state), state, "Unknown client state.")
        };
    }

    public static bool IsFeature(XElement element)
    {
        return element.Name == XName.Get("csi", NamespaceName);
    }

    public static bool IsClientStateElement(XElement element)
    {
        return element.Name.NamespaceName == NamespaceName
            && element.Name.LocalName is "active" or "inactive";
    }

    public static bool TryParse(XElement element, out XmppClientState state)
    {
        state = XmppClientState.Active;

        if (element.Name == XName.Get("active", NamespaceName))
        {
            state = XmppClientState.Active;
            return true;
        }

        if (element.Name == XName.Get("inactive", NamespaceName))
        {
            state = XmppClientState.Inactive;
            return true;
        }

        return false;
    }
}
