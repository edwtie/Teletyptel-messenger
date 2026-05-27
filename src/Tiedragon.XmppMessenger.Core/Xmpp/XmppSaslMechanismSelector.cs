namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppSaslMechanismSelector
{
    public static string? SelectBest(XmppStreamFeatureSet features)
    {
        ArgumentNullException.ThrowIfNull(features);

        if (features.SupportsSaslMechanism(XmppSaslScram.MechanismSha256))
        {
            return XmppSaslScram.MechanismSha256;
        }

        if (features.SupportsSaslMechanism(XmppSaslScram.MechanismSha1))
        {
            return XmppSaslScram.MechanismSha1;
        }

        if (features.SupportsSaslMechanism(XmppSaslPlain.Mechanism))
        {
            return XmppSaslPlain.Mechanism;
        }

        return null;
    }
}
