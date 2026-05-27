namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed record XmppStreamNegotiationPlan(
    bool TlsActive,
    bool Authenticated,
    bool ResourceBound,
    string PreferredSaslMechanism = XmppSaslPlain.Mechanism)
{
    public XmppStreamNegotiationStep GetNextStep(XmppStreamFeatureSet features, XmppConnectionSettings settings)
    {
        ArgumentNullException.ThrowIfNull(features);
        ArgumentNullException.ThrowIfNull(settings);

        if (!TlsActive && (features.StartTlsOffered || settings.RequireTls))
        {
            if (!features.StartTlsOffered && settings.RequireTls)
            {
                throw new XmppProtocolException(
                    XmppProtocolErrorKind.StartTlsFailure,
                    "TLS is required, but the server did not offer STARTTLS.");
            }

            return XmppStreamNegotiationStep.StartTls;
        }

        if (!Authenticated && features.SupportsSaslMechanism(PreferredSaslMechanism))
        {
            return XmppStreamNegotiationStep.Authenticate;
        }

        if (Authenticated && !ResourceBound && features.ResourceBindingOffered)
        {
            return XmppStreamNegotiationStep.BindResource;
        }

        if (Authenticated && ResourceBound)
        {
            return XmppStreamNegotiationStep.Ready;
        }

        return XmppStreamNegotiationStep.OpenStream;
    }

    public XmppStreamNegotiationPlan WithTlsActive()
    {
        return this with { TlsActive = true };
    }

    public XmppStreamNegotiationPlan WithAuthenticated()
    {
        return this with { Authenticated = true };
    }

    public XmppStreamNegotiationPlan WithResourceBound()
    {
        return this with { ResourceBound = true };
    }
}
