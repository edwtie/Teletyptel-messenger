  window.iosFixture = {
    packets: [],
    setup() {
      state.mode = "xmpp";
      state.activeTabId = "chat";
      state.clientLifecycle.current = "active";
      state.xmppSession = { authenticated: true, streamManagement: null };
      state.xmppSocket = { readyState: WebSocket.OPEN, send: (packet) => this.packets.push(packet) };
      state.conversations = [];
      state.activeConversationId = null;
      this.chat = ensureConversationForPeer("noor@example.test", "contact", "Noor · simulatortest");
      selectConversation(this.chat);
      renderActiveConversation();
    },
    incoming() {
      handleXmppIncomingFrame('<message xmlns="jabber:client" from="noor@example.test/device" type="chat" id="ios-incoming"><body>Hallo Sam, dit is een simulatortest.</body><request xmlns="urn:xmpp:receipts"/></message>');
    },
    async outgoing() {
      el.messageInput.value = "Hallo Noor, ik test de iPhone-app.";
      el.messageInput.dispatchEvent(new Event("input", { bubbles: true }));
      await sendComposerMessage({ preventDefault() {} });
    },
    draft() {
      handleXmppIncomingFrame('<message xmlns="jabber:client" from="noor@example.test/device" to="sam@example.test" type="chat"><rtt xmlns="urn:xmpp:rtt:0" event="new" seq="0"><t>Je ziet mijn tekst terwijl ik typ...</t></rtt></message>');
    },
    ownDraft() {
      el.messageInput.value = "En ik typ ook live terug";
      el.messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    },
    closeMenu() { closeMessageContextMenu(); },
    timeline() { return el.messageTimeline.textContent; },
    status() {
      const message = this.chat.messages.find((entry) => entry.direction === "self");
      return message && messageReceiptLabel(message).state;
    }
  };
