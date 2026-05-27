using Tiedragon.XmppMessenger.Core.Xmpp;

namespace Tiedragon.XmppMessenger.Core.Rtt;

public sealed class RttConversationStateManager
{
    private readonly Dictionary<string, RttMessageState> _states = new(StringComparer.OrdinalIgnoreCase);

    public RttMessageState GetState(XmppAddress contact)
    {
        ArgumentNullException.ThrowIfNull(contact);

        if (!_states.TryGetValue(contact.Bare, out var state))
        {
            state = new RttMessageState();
            _states[contact.Bare] = state;
        }

        return state;
    }

    public RttMessageState Apply(XmppRealTimeTextMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);

        var contact = message.From ?? message.To;
        var state = GetState(contact);
        state.Apply(message.Packet);
        return state;
    }

    public bool TryGetText(XmppAddress contact, out string text)
    {
        ArgumentNullException.ThrowIfNull(contact);

        if (_states.TryGetValue(contact.Bare, out var state))
        {
            text = state.Text;
            return true;
        }

        text = string.Empty;
        return false;
    }

    public void Clear(XmppAddress contact)
    {
        ArgumentNullException.ThrowIfNull(contact);
        _states.Remove(contact.Bare);
    }
}
