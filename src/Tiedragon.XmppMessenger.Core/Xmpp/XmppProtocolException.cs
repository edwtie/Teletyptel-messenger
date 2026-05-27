using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppProtocolException : Exception
{
    public XmppProtocolException(XmppProtocolErrorKind kind, string message, XElement? errorElement = null, Exception? innerException = null)
        : base(message, innerException)
    {
        Kind = kind;
        ErrorElement = errorElement;
    }

    public XmppProtocolErrorKind Kind { get; }

    public XElement? ErrorElement { get; }
}
