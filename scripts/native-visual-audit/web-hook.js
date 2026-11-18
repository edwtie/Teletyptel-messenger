window.nativeVisualFixture = {
  async setup(theme) {
    const fixture = window.teletyptelVisualFixtureData;
    await loadLanguage(fixture.account.preferredLanguage);
    applyTheme(theme);
    state.mode = "xmpp";
    state.account = { ...fixture.account };
    applyAccountProfile(state.account);
    state.clientLifecycle.current = "active";
    state.xmppSession = { authenticated: true, phase: "ready", streamManagement: null };
    state.xmppSocket = { readyState: WebSocket.OPEN, send() {} };
    xmppAvailability?.ready();
    setAccountReady(true);
    setAccountBooting(false);
    setAccountGateRequired(false);
    el.accountDialog.hidden = true;
    document.body.classList.remove("modal-open");
    state.conversations = [];
    state.activeConversationId = null;
    const contact = ensureConversationForPeer(fixture.contact.jid, "contact", fixture.contact.name);
    contact.presence = fixture.contact.presence;
    contact.avatarColor = fixture.contact.avatarColor;
    contact.phoneNumber = fixture.contact.phoneNumber;
    const group = ensureConversationForPeer(fixture.group.jid, "group", fixture.group.name);
    group.joined = true;
    selectConversation(contact);
    for (const message of fixture.messages) addMessage(message.direction, message.body, "message", message.direction === "peer" ? contact.peer : null, null, contact.id, null, message.id, false, false);
    renderConversations();
    renderActiveConversation();
    updateCallUi();
    document.body.classList.add("mobile-chat-open");
    setConnectionStatus("XMPP connected", "good");
    return { contact: contact.id, group: group.id };
  },
  login() {
    state.account = null;
    state.xmppSession = null;
    state.xmppSocket = null;
    openAccountDialog({ required: true });
  },
  twoFactorLogin() {
    this.login();
    showLoginTwoFactorChallenge({ accountId: "fixture-ui", method: "authenticator" }, { connectAfterSave: true });
  },
  contacts() {
    document.body.classList.remove("mobile-conversation-open");
    document.body.classList.remove("conversation-open");
    document.body.classList.remove("mobile-chat-open");
    const back = el.backToContactsButton;
    if (back) back.click();
  },
  profile() { openAccountDialog({ mode: "profile" }); },
  settings() { openAccountDialog(); },
  settingsPanel(panel) { openAccountDialog({ mode: panel === "security" ? "profile" : "settings" }); setAccountSettingsPanel(panel); },
  contactProfile() { openContactProfileDialog(activeConversation()); },
  group() {
    selectConversation(state.conversations.find(conversation => conversation.kind === "group"));
    renderActiveConversation();
  },
  groupManagement() { openGroupManagementDialog(activeConversation()); },
  call(mode, incoming = false) {
    const contact = state.conversations.find(conversation => conversation.kind === "contact");
    selectConversation(contact);
    state.call = createCallState("visual-call", contact.peer, "initiator", mode === "audio" ? "audio" : "video", mode === "total");
    state.call.cameraOff = true;
    state.call.remoteCameraOff = true;
    state.call.tcRemoteText = window.teletyptelVisualFixtureData.rtt.peer;
    state.call.tcLocalText = window.teletyptelVisualFixtureData.rtt.self;
    if (incoming) {
      state.doNotDisturb = true;
      state.call.incomingOffer = { type: "offer", sdp: "" };
    }
    updateCallUi();
  },
  messageMenu() {
    const message = [...el.messageTimeline.querySelectorAll("article[data-message-id]")].at(-1);
    if (!message) throw new Error("The real message renderer produced no own message");
    const bounds = message.getBoundingClientRect();
    message.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: bounds.right - 15, clientY: bounds.top + 10 }));
  },
  verifyMessageEdit() {
    const message = activeConversation()?.messages.find(item => item.id === state.editingMessage?.messageId);
    if (!message || message.direction !== "self" || el.messageInput.value !== message.text) throw new Error("The real message editor did not preserve the selected own message");
  },
  cleanup() {
    state.call = null;
    stopIncomingCallHaptics();
    updateCallUi();
    closeMessageContextMenu();
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  },
  captureGeometry() {
    const selectors = [".topbar", ".conversation-list", ".conversation-item.selected", ".chat-header", ".message-body", ".message-inline-meta", ".message-avatar", ".composer", "#messageInput", "#mobileActionsPanel", "#chatMorePanel", "#callControlsMenu", "#accountDialog", "#smileyPickerPanel", "#phoneDialerDialog"];
    return Object.fromEntries(selectors.map(selector => [selector, [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: style.font, color: style.color, background: style.backgroundColor, padding: style.padding, border: style.border, radius: style.borderRadius };
    })]));
  }
};
