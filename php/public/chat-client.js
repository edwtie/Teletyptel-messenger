(function () {
  "use strict";

  const smiles = [
    ["biggrin", "biggrin.gif", [":D"]],
    ["bonk", "bonk.gif", ["8)7"]],
    ["bonk3", "bonk3.gif", ["7(8)7"]],
    ["bye", "bye.gif", [":w"]],
    ["clown", "clown.gif", [":+"]],
    ["confused", "confused.gif", [":?"]],
    ["coool", "coool.gif", ["8)"]],
    ["cry", "cry.gif", [":'("]],
    ["devil", "devil.gif", [">:)"]],
    ["devilish", "devilish.gif", ["})"]],
    ["frown", "frown.gif", [":("]],
    ["frusty", "frusty.gif", ["|:("]],
    ["heart", "heart.gif", ["O+"]],
    ["hypocrite", "hypocrite.gif", ["O-)"]],
    ["kwijl", "kwijl.gif", [":9~"]],
    ["loveit", "loveit.gif", [":7"]],
    ["loveys", "loveys.gif", ["*;"]],
    ["marrysmile", "marrysmile.gif", ["^)"]],
    ["michel", "michel.gif", ["(8>"]],
    ["nerd", "nerd.gif", ["B)"]],
    ["nosmile", "nosmile.gif", [":/"]],
    ["nosmile2", "nosmile2.gif", [":|"]],
    ["puh", "puh.gif", [":>", ":*"]],
    ["puh2", "puh2.gif", [":P"]],
    ["pukey", "pukey.gif", [":r"]],
    ["rc5", "rc5.gif", ["}:O"]],
    ["redface", "redface.gif", [":o"]],
    ["sadley", "sadley.gif", [";("]],
    ["shadey", "shadey.gif", ["B-)" ]],
    ["shiny", "shiny.gif", [":*)"]],
    ["shutup", "shutup.gif", [":X"]],
    ["sintsmiley", "sintsmiley.gif", ["<+:)"]],
    ["sleepey", "sleepey.gif", [":Z"]],
    ["sleephappy", "sleephappy.gif", [":z"]],
    ["smile", "smile.gif", [":)"]],
    ["thumbsup", "thumbsup.gif", ["d:)b"]],
    ["vork", "vork.gif", [":Y)"]],
    ["wink", "wink.gif", [";)"]],
    ["worshippy", "worshippy.gif", ["_/-\\o_", "_o_"]],
    ["yawnee", "yawnee.gif", [":O"]],
    ["yummie", "yummie.gif", [":9"]]
  ].map(([name, fileName, codes]) => ({ name, fileName, codes }));

  const smileIndex = smiles
    .flatMap((smiley) => smiley.codes.map((code) => ({ code, smiley })))
    .sort((a, b) => b.code.length - a.code.length || a.code.localeCompare(b.code));
  const smileyBasePath = "smileys/";
  const accountStorageKey = "teletyptel.accountProfile";
  const accountApiPath = "api/account.php";
  const uploadApiPath = "api/upload.php";
  const languageBasePath = "lang/";

  const state = {
    mode: "relay",
    theme: loadTheme(),
    relaySocket: null,
    xmppSocket: null,
    account: null,
    provider: null,
    translations: new Map(),
    languageCode: "eng",
    clientInstance: loadClientInstance(),
    activeTabId: "chat",
    sequence: 0,
    previousText: "",
    remoteText: "",
    remoteFrom: "",
    remoteDraftUpdatedAt: null,
    call: null,
    conversations: [
      {
        id: "relay",
        name: "Relay room",
        meta: "Local PHP relay",
        messages: []
      }
    ],
    activeConversationId: "relay"
  };

  const el = {
    appTabs: byId("appTabs"),
    connectionSummary: byId("connectionSummary"),
    themeButton: byId("themeButton"),
    connectButton: byId("connectButton"),
    disconnectButton: byId("disconnectButton"),
    addConversationButton: byId("addConversationButton"),
    conversationItems: byId("conversationItems"),
    activeConversationName: byId("activeConversationName"),
    activeConversationMeta: byId("activeConversationMeta"),
    startAudioCallButton: byId("startAudioCallButton"),
    startVideoCallButton: byId("startVideoCallButton"),
    answerCallButton: byId("answerCallButton"),
    rejectCallButton: byId("rejectCallButton"),
    hangupCallButton: byId("hangupCallButton"),
    callStatus: byId("callStatus"),
    callPanel: byId("callPanel"),
    remoteVideo: byId("remoteVideo"),
    localVideo: byId("localVideo"),
    relayModeButton: byId("relayModeButton"),
    xmppModeButton: byId("xmppModeButton"),
    dropOverlay: byId("dropOverlay"),
    messageTimeline: byId("messageTimeline"),
    tabPanel: byId("tabPanel"),
    tabPanelTitle: byId("tabPanelTitle"),
    tabPanelMeta: byId("tabPanelMeta"),
    tabPanelBody: byId("tabPanelBody"),
    closeTabPanelButton: byId("closeTabPanelButton"),
    remoteDraft: byId("remoteDraft"),
    remoteDraftName: byId("remoteDraftName"),
    remoteDraftText: byId("remoteDraftText"),
    composerForm: byId("composerForm"),
    resetRttButton: byId("resetRttButton"),
    uploadFileButton: byId("uploadFileButton"),
    fileInput: byId("fileInput"),
    rttToggle: byId("rttToggle"),
    smileyToggle: byId("smileyToggle"),
    messageInput: byId("messageInput"),
    sendButton: byId("sendButton"),
    composerState: byId("composerState"),
    relayUrlInput: byId("relayUrlInput"),
    displayNameInput: byId("displayNameInput"),
    jidInput: byId("jidInput"),
    passwordInput: byId("passwordInput"),
    rememberPasswordToggle: byId("rememberPasswordToggle"),
    peerInput: byId("peerInput"),
    phoneInput: byId("phoneInput"),
    languageInput: byId("languageInput"),
    providerInput: byId("providerInput"),
    accountStatus: byId("accountStatus"),
    saveAccountButton: byId("saveAccountButton"),
    resetAccountButton: byId("resetAccountButton"),
    providerSummary: byId("providerSummary"),
    capabilityList: byId("capabilityList"),
    xmppUrlInput: byId("xmppUrlInput"),
    xmppOpenButton: byId("xmppOpenButton"),
    xmppCloseButton: byId("xmppCloseButton"),
    clearLogButton: byId("clearLogButton"),
    debugLog: byId("debugLog")
  };

  bindEvents();
  applyTheme(state.theme);
  renderTabs();
  renderConversations();
  renderActiveConversation();
  setConnectionStatus(t("status.disconnected", "Disconnected"), "warn");
  loadPlatformConfig();
  registerServiceWorker();

  function bindEvents() {
    el.themeButton.addEventListener("click", toggleTheme);
    el.connectButton.addEventListener("click", connectRelay);
    el.disconnectButton.addEventListener("click", disconnectAll);
    el.addConversationButton.addEventListener("click", addConversation);
    el.startAudioCallButton.addEventListener("click", () => startCall("audio"));
    el.startVideoCallButton.addEventListener("click", () => startCall("video"));
    el.answerCallButton.addEventListener("click", answerIncomingCall);
    el.rejectCallButton.addEventListener("click", rejectIncomingCall);
    el.hangupCallButton.addEventListener("click", hangupCall);
    el.relayModeButton.addEventListener("click", () => setMode("relay"));
    el.xmppModeButton.addEventListener("click", () => setMode("xmpp"));
    el.closeTabPanelButton.addEventListener("click", () => activateTab("chat"));
    el.resetRttButton.addEventListener("click", sendRttReset);
    el.uploadFileButton.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", uploadSelectedFiles);
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    el.composerForm.addEventListener("submit", sendComposerMessage);
    el.messageInput.addEventListener("input", sendRttEdit);
    el.messageInput.addEventListener("keydown", handleComposerKeydown);
    el.saveAccountButton.addEventListener("click", saveAccountProfile);
    el.resetAccountButton.addEventListener("click", resetAccountProfile);
    el.peerInput.addEventListener("change", updateRelayConversationMeta);
    el.displayNameInput.addEventListener("change", renderActiveConversation);
    el.jidInput.addEventListener("change", renderActiveConversation);
    el.smileyToggle.addEventListener("change", renderActiveConversation);
    el.passwordInput.addEventListener("input", updateAccountPasswordStatus);
    el.rememberPasswordToggle.addEventListener("change", updateAccountPasswordStatus);
    el.languageInput.addEventListener("change", () => loadLanguage(el.languageInput.value));
    el.xmppOpenButton.addEventListener("click", connectXmppWebSocket);
    el.xmppCloseButton.addEventListener("click", closeXmppWebSocket);
    el.clearLogButton.addEventListener("click", () => {
      el.debugLog.textContent = "";
    });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function loadTheme() {
    const saved = localStorage.getItem("teletyptel.theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }

    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function loadClientInstance() {
    const key = "teletyptel.clientInstance";
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.id === "string" && parsed.id) {
          return parsed;
        }
      } catch {
        sessionStorage.removeItem(key);
      }
    }

    const id = createShortId();
    const instance = {
      id,
      resourceSuffix: id.slice(0, 6)
    };
    sessionStorage.setItem(key, JSON.stringify(instance));
    return instance;
  }

  function createShortId() {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = state.theme;
    localStorage.setItem("teletyptel.theme", state.theme);
    el.themeButton.textContent = state.theme === "dark" ? "Theme: Light" : "Theme: Dark";
    el.themeButton.setAttribute(
      "aria-label",
      state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      state.theme === "dark" ? "#111827" : "#eef2f7");
  }

  function setMode(mode) {
    state.mode = mode;
    el.relayModeButton.classList.toggle("selected", mode === "relay");
    el.xmppModeButton.classList.toggle("selected", mode === "xmpp");
    el.composerState.textContent = mode === "relay"
      ? t("composer.relay_state", "Enter sends, Shift+Enter inserts a line")
      : t("composer.xmpp_state", "RFC 7395 mode sends XML message stanzas");
  }

  async function loadPlatformConfig() {
    try {
      const account = mergeAccountProfiles(
        await fetchJson("config/account-profile.json"),
        loadSavedAccountProfile());
      state.account = account;
      applyAccountProfile(account);
      await loadDatabaseAccount(account.accountId);
      await loadLanguage(state.account.preferredLanguage ?? "eng");
      const provider = await fetchJson(`config/providers/${encodeURIComponent(state.account.providerId)}.json`);
      state.provider = provider;
      renderProvider();
      renderTabs();
      appendDebug("config", `Loaded provider ${provider.providerId}`);
    } catch (error) {
      el.providerSummary.textContent = t("provider.unavailable", "Provider manifest unavailable.");
      appendDebug("config-error", error.message);
      await loadLanguage(state.account?.preferredLanguage ?? "eng");
      renderTabs();
    }
  }

  async function loadLanguage(code) {
    const normalized = normalizeLanguageCode(code);
    state.languageCode = normalized;
    el.languageInput.value = normalized;

    try {
      const text = await fetchText(`${languageBasePath}${encodeURIComponent(normalized)}.lng`);
      state.translations = parseLng(text);
      applyTranslations();
      appendDebug("lng", `Loaded ${normalized}`);
    } catch (error) {
      if (normalized !== "eng") {
        appendDebug("lng-error", `${normalized}: ${error.message}`);
        await loadLanguage("eng");
        return;
      }

      appendDebug("lng-error", error.message);
    }
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return response.text();
  }

  function parseLng(text) {
    const map = new Map();
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const equals = line.indexOf("=");
      if (equals <= 0) {
        continue;
      }

      map.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
    }

    return map;
  }

  function t(key, fallback = key) {
    return state.translations.get(key) ?? fallback;
  }

  function applyTranslations() {
    document.title = t("app.title", document.title);
    for (const node of document.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n, node.textContent);
    }

    for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder, node.getAttribute("placeholder") ?? ""));
    }

    applyTheme(state.theme);
    setMode(state.mode);
    if (state.provider) {
      renderProvider();
    }

    renderTabs();
    renderConversations();
    renderActiveConversation();
    if (state.account) {
      updateAccountStatus(accountStatusPrefix());
    }
  }

  function normalizeLanguageCode(code) {
    const value = String(code ?? "").toLowerCase();
    if (value === "nl" || value === "nld" || value === "ned") {
      return "ned";
    }

    return "eng";
  }

  async function loadDatabaseAccount(accountId) {
    try {
      const response = await fetch(`${accountApiPath}?accountId=${encodeURIComponent(accountId)}`, {
        cache: "no-store"
      });
      if (response.status === 404) {
        appendDebug("account-db", "No database account yet");
        return;
      }

      if (!response.ok) {
        throw new Error(`account API returned ${response.status}`);
      }

      const payload = await response.json();
      if (payload.ok && payload.account) {
        state.account = {
          ...state.account,
          ...payload.account,
          savedInDatabase: true
        };
        applyAccountProfile(state.account);
        appendDebug("account-db", `Loaded ${state.account.jid}`);
      }
    } catch (error) {
      appendDebug("account-db-error", error.message);
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return response.json();
  }

  function applyAccountProfile(account) {
    el.displayNameInput.value = account.displayName ?? el.displayNameInput.value;
    el.jidInput.value = createUniqueJid(account.jid ?? el.jidInput.value);
    el.passwordInput.value = account.rememberPassword ? account.password ?? "" : "";
    el.rememberPasswordToggle.checked = account.rememberPassword === true;
    el.peerInput.value = account.peer ?? el.peerInput.value;
    el.phoneInput.value = account.phoneNumber ?? "";
    el.languageInput.value = normalizeLanguageCode(account.preferredLanguage ?? "eng");
    el.providerInput.value = account.providerId ?? "";
    el.relayUrlInput.value = account.relayWebSocket ?? el.relayUrlInput.value;
    el.xmppUrlInput.value = account.xmppWebSocket ?? el.xmppUrlInput.value;
    updateAccountStatus(account.savedLocally === true ? "Local account saved" : "Default account profile");
    updateRelayConversationMeta();
  }

  function mergeAccountProfiles(defaultAccount, savedAccount) {
    if (!savedAccount) {
      return defaultAccount;
    }

    return {
      ...defaultAccount,
      ...savedAccount,
      providerId: savedAccount.providerId || defaultAccount.providerId,
      savedLocally: true
    };
  }

  function loadSavedAccountProfile() {
    const saved = localStorage.getItem(accountStorageKey);
    if (!saved) {
      return null;
    }

    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      localStorage.removeItem(accountStorageKey);
      return null;
    }
  }

  function currentAccountProfile() {
    return {
      accountId: state.account?.accountId ?? "local-account",
      jid: stripGeneratedResourceSuffix(el.jidInput.value.trim()),
      displayName: el.displayNameInput.value.trim() || "Me",
      rememberPassword: el.rememberPasswordToggle.checked,
      password: el.rememberPasswordToggle.checked ? el.passwordInput.value : "",
      phoneNumber: el.phoneInput.value.trim(),
      providerId: el.providerInput.value.trim() || state.account?.providerId || "example-provider",
      accessibilityProfileId: state.account?.accessibilityProfileId ?? "default-live-text",
      preferredLanguage: el.languageInput.value,
      relayWebSocket: el.relayUrlInput.value.trim(),
      xmppWebSocket: el.xmppUrlInput.value.trim(),
      peer: el.peerInput.value.trim()
    };
  }

  function saveAccountProfile() {
    const profile = currentAccountProfile();
    localStorage.setItem(accountStorageKey, JSON.stringify(profile));
    state.account = { ...state.account, ...profile, savedLocally: true };
    el.jidInput.value = createUniqueJid(profile.jid);
    updateRelayConversationMeta();
    updateAccountStatus(t("account.local_saved", "Local account saved"));
    appendDebug("account", `Saved ${el.jidInput.value}`);
    saveDatabaseAccount(profile);
  }

  async function saveDatabaseAccount(profile) {
    try {
      const response = await fetch(accountApiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profile)
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `account API returned ${response.status}`);
      }

      state.account = {
        ...state.account,
        ...payload.account,
        savedInDatabase: true
      };
      updateAccountStatus(t("account.database_saved", "Database account saved"));
      appendDebug("account-db", `Saved ${payload.account.jid}`);
    } catch (error) {
      updateAccountStatus(t("account.local_database_unavailable", "Local account saved; database unavailable"));
      appendDebug("account-db-error", error.message);
    }
  }

  function resetAccountProfile() {
    localStorage.removeItem(accountStorageKey);
    sessionStorage.removeItem("teletyptel.clientInstance");
    updateAccountStatus(t("account.reset_reload", "Account reset; reload to restore defaults"));
    appendDebug("account", "Local account profile cleared");
    location.reload();
  }

  function updateAccountStatus(text) {
    const passwordState = passwordStatusText();
    el.accountStatus.textContent = `${text} - ${el.jidInput.value || t("account.no_jid", "no JID")} - ${passwordState}`;
  }

  function updateAccountPasswordStatus() {
    updateAccountStatus(accountStatusPrefix());
  }

  function passwordStatusText() {
    if (!el.passwordInput.value) {
      return t("account.no_password", "no password");
    }

    return el.rememberPasswordToggle.checked
      ? t("account.password_saved", "password saved locally")
      : t("account.password_session", "password only this session");
  }

  function updateRelayConversationMeta() {
    const relay = state.conversations.find((conversation) => conversation.id === "relay");
    if (relay) {
      relay.meta = `Peer: ${currentToJid()}`;
      renderConversations();
      renderActiveConversation();
    }

    updateAccountStatus(accountStatusPrefix());
  }

  function accountStatusPrefix() {
    if (state.account?.savedInDatabase) {
      return t("account.database_loaded", "Database account loaded");
    }

    return localStorage.getItem(accountStorageKey)
      ? t("account.local_saved", "Local account saved")
      : t("account.default_profile", "Default account profile");
  }

  function renderProvider() {
    const provider = state.provider;
    if (!provider) {
      el.providerSummary.textContent = t("provider.none", "No provider manifest loaded.");
      el.capabilityList.replaceChildren();
      return;
    }

    el.providerSummary.textContent = `${provider.name} ${provider.version} - ${provider.providerId}`;
    renderCapabilities(el.capabilityList, provider.capabilities ?? []);
  }

  function renderTabs() {
    const tabs = allTabs();
    el.appTabs.replaceChildren();
    for (const tab of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tab.id === state.activeTabId ? "selected" : "";
      button.textContent = tab.title;
      button.addEventListener("click", () => activateTab(tab.id));
      el.appTabs.appendChild(button);
    }
  }

  function allTabs() {
    const providerTabs = state.provider?.tabs?.map((tab) => ({
      ...tab,
      providerName: state.provider.name
    })) ?? [];
    return [
      { id: "chat", title: t("tab.chat", "Chat"), type: "builtin" },
      { id: "contacts", title: t("tab.contacts", "Contacts"), type: "builtin" },
      { id: "accessibility", title: t("tab.accessibility", "Accessibility"), type: "builtin" },
      ...providerTabs
    ];
  }

  function activateTab(tabId) {
    state.activeTabId = tabId;
    renderTabs();

    if (tabId === "chat") {
      el.messageTimeline.hidden = false;
      el.tabPanel.hidden = true;
      return;
    }

    const tab = allTabs().find((item) => item.id === tabId);
    if (!tab) {
      activateTab("chat");
      return;
    }

    el.messageTimeline.hidden = true;
    el.tabPanel.hidden = false;
    renderTabPanel(tab);
  }

  function renderTabPanel(tab) {
    el.tabPanelTitle.textContent = tab.title;
    el.tabPanelMeta.textContent = tab.type === "builtin"
      ? "Teletyptel"
      : `${tab.providerName ?? "Provider"} - ${tab.type}`;
    el.tabPanelBody.replaceChildren();

    if (tab.type === "web") {
      renderWebTab(tab);
      return;
    }

    if (tab.type === "provider-service") {
      renderProviderServiceTab(tab);
      return;
    }

    renderBuiltinTab(tab);
  }

  function renderBuiltinTab(tab) {
    const card = createProviderCard();
    if (tab.id === "contacts") {
      card.appendChild(createTextBlock(t("tab.contacts", "Contacts"), t("tab.contacts_text", "Contacts will use XMPP roster and provider address book adapters.")));
    } else if (tab.id === "accessibility") {
      card.appendChild(createTextBlock(t("tab.accessibility", "Accessibility"), t("tab.accessibility_text", "Live RTT, captions, speech and provider bridges stay opt-in and visible.")));
      renderCapabilities(card, ["rtt:publish", "caption:local", "caption:share"]);
    } else {
      card.appendChild(createTextBlock(tab.title, t("tab.builtin_text", "Built-in Teletyptel tab.")));
    }

    el.tabPanelBody.appendChild(card);
  }

  function renderWebTab(tab) {
    const card = createProviderCard();
    card.appendChild(createTextBlock("Sandboxed website tab", "This provider tab is separated from chat content by default."));
    card.appendChild(createDefinitionList([
      ["URL", tab.url ?? ""],
      ["Sandbox", tab.sandbox ? "yes" : "no"]
    ]));
    renderCapabilities(card, tab.capabilities ?? []);
    el.tabPanelBody.appendChild(card);
  }

  function renderProviderServiceTab(tab) {
    const card = createProviderCard();
    card.appendChild(createTextBlock("Provider service", `Service: ${tab.service ?? "unknown"}`));
    renderCapabilities(card, tab.capabilities ?? []);
    el.tabPanelBody.appendChild(card);
  }

  function createProviderCard() {
    const card = document.createElement("div");
    card.className = "provider-card";
    return card;
  }

  function createTextBlock(title, text) {
    const wrapper = document.createElement("div");
    const heading = document.createElement("strong");
    const paragraph = document.createElement("p");
    heading.textContent = title;
    paragraph.textContent = text;
    wrapper.append(heading, paragraph);
    return wrapper;
  }

  function createDefinitionList(rows) {
    const list = document.createElement("dl");
    for (const [term, value] of rows) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      list.append(dt, dd);
    }

    return list;
  }

  function renderCapabilities(container, capabilities) {
    const list = document.createElement("div");
    list.className = "capability-list";
    for (const capability of capabilities) {
      const item = document.createElement("span");
      item.className = "capability";
      item.textContent = capability;
      list.appendChild(item);
    }

    if (container.classList?.contains("capability-list")) {
      container.replaceChildren(...Array.from(list.childNodes));
    } else {
      container.appendChild(list);
    }
  }

  function connectRelay() {
    if (state.relaySocket && state.relaySocket.readyState === WebSocket.OPEN) {
      return;
    }

    const socket = new WebSocket(el.relayUrlInput.value.trim());
    state.relaySocket = socket;
    setConnectionStatus(t("status.connecting_relay", "Connecting relay"), "warn");
    appendDebug("relay", "Connecting " + el.relayUrlInput.value.trim());

    socket.addEventListener("open", () => {
      setConnectionStatus(t("status.relay_connected", "Relay connected"), "good");
      el.connectButton.disabled = true;
      el.disconnectButton.disabled = false;
      sendRttReset();
    });

    socket.addEventListener("message", (event) => {
      try {
        applyRelayEnvelope(JSON.parse(event.data));
      } catch (error) {
        appendDebug("relay-error", error.message);
      }
    });

    socket.addEventListener("close", () => {
      setConnectionStatus(t("status.relay_disconnected", "Relay disconnected"), "warn");
      el.connectButton.disabled = false;
      el.disconnectButton.disabled = true;
      state.relaySocket = null;
    });

    socket.addEventListener("error", () => {
      setConnectionStatus(t("status.relay_error", "Relay error"), "danger");
    });
  }

  function disconnectAll() {
    cleanupCall(true);

    if (state.relaySocket) {
      state.relaySocket.close();
    }

    closeXmppWebSocket();
  }

  function connectXmppWebSocket() {
    if (state.xmppSocket && state.xmppSocket.readyState === WebSocket.OPEN) {
      return;
    }

    const socket = new WebSocket(el.xmppUrlInput.value.trim(), "xmpp");
    state.xmppSocket = socket;
    setMode("xmpp");
    appendDebug("xmpp", "Connecting " + el.xmppUrlInput.value.trim());

    socket.addEventListener("open", () => {
      el.xmppOpenButton.disabled = true;
      el.xmppCloseButton.disabled = false;
      const open = `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${escapeXml(domainFromJid(el.jidInput.value))}" version="1.0"/>`;
      socket.send(open);
      appendDebug("C", open);
    });

    socket.addEventListener("message", (event) => {
      appendDebug("S", event.data);
    });

    socket.addEventListener("close", () => {
      el.xmppOpenButton.disabled = false;
      el.xmppCloseButton.disabled = true;
      state.xmppSocket = null;
      appendDebug("xmpp", "Closed");
    });

    socket.addEventListener("error", () => appendDebug("xmpp-error", "WebSocket error"));
  }

  function closeXmppWebSocket() {
    if (!state.xmppSocket) {
      return;
    }

    if (state.xmppSocket.readyState === WebSocket.OPEN) {
      const close = '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>';
      state.xmppSocket.send(close);
      appendDebug("C", close);
    }

    state.xmppSocket.close();
  }

  function sendComposerMessage(event) {
    event.preventDefault();
    const text = el.messageInput.value;
    if (!text.trim()) {
      return;
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const xml = createMessageStanza(text);
      state.xmppSocket.send(xml);
      appendDebug("C", xml);
      addMessage("self", text, "RFC 7395");
      el.messageInput.value = "";
      state.previousText = "";
      return;
    }

    sendRelayFinalMessage(text);
  }

  function handleComposerKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      el.composerForm.requestSubmit();
    }
  }

  function sendRelayFinalMessage(text) {
    if (!state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN) {
      addMessage("self", text, "offline");
      el.messageInput.value = "";
      return;
    }

    const envelope = createRelayEnvelope("message", text, "");
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("relay-out", JSON.stringify(envelope));
    addMessage("self", text, "sent");
    el.messageInput.value = "";
    state.previousText = "";
    state.sequence = 0;
  }

  function sendRttReset() {
    state.sequence = 0;
    state.previousText = el.messageInput.value;
    sendRttPacket("reset", el.messageInput.value);
  }

  function sendRttEdit() {
    if (!el.rttToggle.checked || state.mode !== "relay") {
      return;
    }

    const text = el.messageInput.value;
    const actions = createDeltaActions(state.previousText, text);
    state.previousText = text;
    sendRttPacket("edit", text, actions);
  }

  function sendRttPacket(eventName, text, actions = null) {
    if (!state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN || !el.rttToggle.checked) {
      return;
    }

    const xml = eventName === "edit"
      ? `<rtt xmlns="urn:xmpp:rtt:0" seq="${state.sequence++}">${actions ?? `<t p="0">${escapeXml(text)}</t>`}</rtt>`
      : `<rtt xmlns="urn:xmpp:rtt:0" event="${eventName}" seq="${state.sequence++}"><t p="0">${escapeXml(text)}</t></rtt>`;
    const envelope = createRelayEnvelope("rtt", text, xml);
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("rtt-out", xml);
  }

  function createRelayEnvelope(type, text, xml) {
    return {
      type,
      text,
      xml,
      clientId: state.clientInstance.id,
      from: currentFromJid(),
      to: currentToJid()
    };
  }

  function currentSenderName() {
    return el.displayNameInput.value.trim() || "Me";
  }

  function currentFromJid() {
    return el.jidInput.value.trim() || currentSenderName();
  }

  function currentToJid() {
    return el.peerInput.value.trim() || "relay@localhost";
  }

  function envelopeFrom(envelope) {
    return typeof envelope.from === "string" && envelope.from.trim()
      ? envelope.from.trim()
      : "";
  }

  function displayNameForJid(jid) {
    if (!jid) {
      return "Remote";
    }

    const bare = jid.split("/")[0];
    if (jid === currentFromJid()) {
      return currentSenderName();
    }

    if (jid.startsWith("ai@") || bare === "ai@localhost") {
      return "AI agent";
    }

    const local = bare.split("@")[0] || jid;
    const resource = jid.includes("/") ? jid.split("/").slice(1).join("/") : "";
    return resource ? `${local}/${resource}` : local;
  }

  function applyRelayEnvelope(envelope) {
    if (!envelope || (envelope.type !== "rtt" && envelope.type !== "message" && envelope.type !== "jingle")) {
      return;
    }

    appendDebug("relay-in", envelope.type === "rtt" || envelope.type === "jingle"
      ? envelope.xml || JSON.stringify(redactJingleForLog(envelope))
      : JSON.stringify(envelope));

    if (envelope.clientId && envelope.clientId === state.clientInstance.id) {
      appendDebug("relay-skip", "Ignored own echoed envelope");
      return;
    }

    if (envelope.type === "jingle") {
      handleJingleEnvelope(envelope);
      return;
    }

    if (envelope.type === "message") {
      state.remoteText = "";
      state.remoteFrom = envelopeFrom(envelope);
      state.remoteDraftUpdatedAt = null;
      addMessage("peer", envelope.text ?? "", "received", state.remoteFrom, envelope.attachment ?? null);
      return;
    }

    state.remoteText = envelope.text ?? "";
    state.remoteFrom = envelopeFrom(envelope);
    state.remoteDraftUpdatedAt = new Date();
    updateRemoteDraftMessage();
  }

  async function startCall(mediaKind) {
    if (!isRelayConnected()) {
      setCallStatus(t("call.connect_first", "Connect the relay first."));
      return;
    }

    if (!supportsWebRtc()) {
      setCallStatus(t("call.unsupported", "WebRTC is not available in this browser."));
      return;
    }

    if (state.call) {
      setCallStatus(t("call.already_active", "A call is already active."));
      return;
    }

    const sid = "td-" + createShortId();
    const call = createCallState(sid, currentToJid(), "caller", mediaKind);
    state.call = call;
    updateCallUi();
    setCallStatus(t("call.starting", "Starting call..."));

    try {
      await openLocalMedia(call);
      createPeerConnection(call);
      const offer = await call.pc.createOffer();
      await call.pc.setLocalDescription(offer);
      sendJingleEnvelope("session-initiate", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        sdp: offer.sdp,
        descriptionType: offer.type
      });
      setCallStatus(t("call.ringing", "Ringing..."));
      addMessage("self", call.mediaKind === "video"
        ? t("call.video_started", "Video call started")
        : t("call.audio_started", "Audio call started"), "jingle");
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
      cleanupCall(false);
    }
  }

  async function answerIncomingCall() {
    const call = state.call;
    if (!call?.incomingOffer) {
      return;
    }

    setCallStatus(t("call.answering", "Answering..."));
    try {
      await openLocalMedia(call);
      createPeerConnection(call);
      await call.pc.setRemoteDescription({ type: "offer", sdp: call.incomingOffer });
      call.remoteDescriptionSet = true;
      await flushPendingIceCandidates(call);
      const answer = await call.pc.createAnswer();
      await call.pc.setLocalDescription(answer);
      sendJingleEnvelope("session-accept", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        sdp: answer.sdp,
        descriptionType: answer.type
      });
      call.incomingOffer = null;
      setCallStatus(t("call.connected", "Call connected"));
      updateCallUi();
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
      sendJingleEnvelope("session-terminate", {
        sid: call.sid,
        reason: "failed-application",
        reasonText: error.message
      });
      cleanupCall(false);
    }
  }

  function rejectIncomingCall() {
    const call = state.call;
    if (!call) {
      return;
    }

    sendJingleEnvelope("session-terminate", {
      sid: call.sid,
      reason: "decline",
      reasonText: t("call.rejected", "Call rejected")
    });
    cleanupCall(false);
    setCallStatus(t("call.rejected", "Call rejected"));
  }

  function hangupCall() {
    const call = state.call;
    if (!call) {
      return;
    }

    sendJingleEnvelope("session-terminate", {
      sid: call.sid,
      reason: "success",
      reasonText: t("call.ended", "Call ended")
    });
    cleanupCall(false);
    setCallStatus(t("call.ended", "Call ended"));
  }

  function handleJingleEnvelope(envelope) {
    if (!isAddressedToMe(envelope)) {
      return;
    }

    const action = String(envelope.action ?? "");
    if (action === "session-initiate") {
      handleIncomingSessionInitiate(envelope);
    } else if (action === "session-accept") {
      handleIncomingSessionAccept(envelope);
    } else if (action === "transport-info") {
      handleIncomingTransportInfo(envelope);
    } else if (action === "session-info") {
      setCallStatus(jingleInfoText(envelope.info));
    } else if (action === "session-terminate") {
      cleanupCall(false);
      setCallStatus(envelope.reasonText || t("call.remote_ended", "Remote ended the call"));
    }
  }

  function handleIncomingSessionInitiate(envelope) {
    if (!envelope.sdp || typeof envelope.sdp !== "string") {
      appendDebug("jingle-error", "session-initiate without SDP");
      return;
    }

    if (state.call) {
      sendJingleEnvelope("session-terminate", {
        sid: envelope.sid,
        to: envelope.from,
        reason: "busy",
        reasonText: t("call.busy", "Busy")
      });
      return;
    }

    const call = createCallState(
      String(envelope.sid || "td-" + createShortId()),
      envelopeFrom(envelope),
      "receiver",
      envelope.mediaKind === "video" ? "video" : "audio");
    call.incomingOffer = envelope.sdp;
    state.call = call;
    sendJingleEnvelope("session-info", {
      sid: call.sid,
      to: call.peer,
      info: "ringing"
    });
    setCallStatus(`${t("call.incoming", "Incoming call from")} ${displayNameForJid(call.peer)}`);
    addMessage("peer", call.mediaKind === "video"
      ? t("call.video_incoming", "Incoming video call")
      : t("call.audio_incoming", "Incoming audio call"), "jingle", call.peer);
    updateCallUi();
  }

  async function handleIncomingSessionAccept(envelope) {
    const call = state.call;
    if (!call || call.sid !== envelope.sid || !envelope.sdp || !call.pc) {
      return;
    }

    try {
      await call.pc.setRemoteDescription({ type: "answer", sdp: envelope.sdp });
      call.remoteDescriptionSet = true;
      await flushPendingIceCandidates(call);
      setCallStatus(t("call.connected", "Call connected"));
      updateCallUi();
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
    }
  }

  async function handleIncomingTransportInfo(envelope) {
    const call = state.call;
    if (!call || call.sid !== envelope.sid || !envelope.candidate) {
      return;
    }

    if (!call.pc || !call.remoteDescriptionSet) {
      call.pendingCandidates.push(envelope.candidate);
      return;
    }

    try {
      await call.pc.addIceCandidate(new RTCIceCandidate(envelope.candidate));
    } catch (error) {
      appendDebug("jingle-ice-error", error.message);
    }
  }

  async function flushPendingIceCandidates(call) {
    while (call.pendingCandidates.length > 0 && call.pc && call.remoteDescriptionSet) {
      const candidate = call.pendingCandidates.shift();
      await call.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  function createCallState(sid, peer, role, mediaKind) {
    return {
      sid,
      peer,
      role,
      mediaKind,
      pc: null,
      localStream: null,
      remoteStream: null,
      incomingOffer: null,
      pendingCandidates: [],
      remoteDescriptionSet: false
    };
  }

  function createPeerConnection(call) {
    if (call.pc) {
      return call.pc;
    }

    const pc = new RTCPeerConnection({ iceServers: [] });
    call.pc = pc;

    if (call.localStream) {
      for (const track of call.localStream.getTracks()) {
        pc.addTrack(track, call.localStream);
      }
    }

    pc.addEventListener("icecandidate", (event) => {
      if (!event.candidate || !state.call || state.call.sid !== call.sid) {
        return;
      }

      sendJingleEnvelope("transport-info", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        candidate: event.candidate.toJSON()
      });
    });

    pc.addEventListener("track", (event) => {
      if (!call.remoteStream) {
        call.remoteStream = new MediaStream();
      }

      call.remoteStream.addTrack(event.track);
      el.remoteVideo.srcObject = call.remoteStream;
      el.callPanel.hidden = false;
      updateCallUi();
    });

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        setCallStatus(t("call.connected", "Call connected"));
      } else if (pc.connectionState === "failed") {
        setCallStatus(t("call.failed", "Call failed"));
      } else if (pc.connectionState === "disconnected") {
        setCallStatus(t("call.disconnected", "Call disconnected"));
      }
    });

    return pc;
  }

  async function openLocalMedia(call) {
    if (call.localStream) {
      return call.localStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t("call.media_unavailable", "Camera/microphone access is not available."));
    }

    const wantsVideo = call.mediaKind === "video";
    try {
      call.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantsVideo ? { width: { ideal: 640 }, height: { ideal: 360 } } : false
      });
    } catch (error) {
      if (!wantsVideo) {
        throw error;
      }

      appendDebug("media", `Video unavailable, falling back to audio: ${error.message}`);
      call.mediaKind = "audio";
      call.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    el.localVideo.srcObject = call.localStream;
    el.callPanel.hidden = false;
    updateCallUi();
    return call.localStream;
  }

  function cleanupCall(notifyRemote) {
    const call = state.call;
    if (!call) {
      updateCallUi();
      return;
    }

    if (notifyRemote) {
      sendJingleEnvelope("session-terminate", {
        sid: call.sid,
        reason: "success",
        reasonText: t("call.ended", "Call ended")
      });
    }

    call.pc?.close();
    call.localStream?.getTracks().forEach((track) => track.stop());
    call.remoteStream?.getTracks().forEach((track) => track.stop());
    el.localVideo.srcObject = null;
    el.remoteVideo.srcObject = null;
    el.callPanel.hidden = true;
    state.call = null;
    updateCallUi();
  }

  function sendJingleEnvelope(action, payload = {}) {
    if (!isRelayConnected()) {
      appendDebug("jingle-error", "Relay is not connected");
      return;
    }

    const envelope = {
      ...createRelayEnvelope("jingle", "", ""),
      action,
      sid: payload.sid || state.call?.sid || "td-" + createShortId(),
      to: payload.to || state.call?.peer || currentToJid(),
      mediaKind: payload.mediaKind || state.call?.mediaKind || "audio",
      info: payload.info || null,
      reason: payload.reason || null,
      reasonText: payload.reasonText || null,
      sdp: payload.sdp || null,
      descriptionType: payload.descriptionType || null,
      candidate: payload.candidate || null
    };
    envelope.xml = createJingleDebugXml(action, envelope);
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("jingle-out", envelope.xml);
  }

  function createJingleDebugXml(action, envelope) {
    const sid = escapeXml(envelope.sid);
    const to = escapeXml(envelope.to || currentToJid());
    const from = escapeXml(currentFromJid());
    const initiator = state.call?.role === "caller" ? from : escapeXml(envelope.from || currentFromJid());
    const responder = state.call?.role === "receiver" ? from : to;
    const attrs = `xmlns="urn:xmpp:jingle:1" action="${escapeXml(action)}" sid="${sid}" initiator="${initiator}" responder="${responder}"`;
    let payload = "";

    if (action === "session-initiate" || action === "session-accept") {
      payload = createJingleContentXml("audio", "audio")
        + (envelope.mediaKind === "video" ? createJingleContentXml("video", "video") : "");
    } else if (action === "transport-info") {
      payload = `<content creator="initiator" name="${escapeXml(envelope.mediaKind || "audio")}"><transport xmlns="urn:xmpp:jingle:transports:ice-udp:1">${createJingleCandidateXml(envelope.candidate)}</transport></content>`;
    } else if (action === "session-info") {
      payload = `<${escapeXml(envelope.info || "ringing")} xmlns="urn:xmpp:jingle:apps:rtp:info:1"/>`;
    } else if (action === "session-terminate") {
      const reason = escapeXml(envelope.reason || "success");
      payload = `<reason><${reason}/>${envelope.reasonText ? `<text>${escapeXml(envelope.reasonText)}</text>` : ""}</reason>`;
    }

    return `<iq xmlns="jabber:client" type="set" from="${from}" to="${to}" id="call-${sid}"><jingle ${attrs}>${payload}</jingle></iq>`;
  }

  function createJingleContentXml(name, media) {
    const payload = media === "video"
      ? '<payload-type id="96" name="VP8" clockrate="90000"/>'
      : '<payload-type id="111" name="opus" clockrate="48000" channels="2"><parameter name="minptime" value="10"/><parameter name="useinbandfec" value="1"/></payload-type>';
    return `<content creator="initiator" name="${name}" senders="both"><description xmlns="urn:xmpp:jingle:apps:rtp:1" media="${media}">${payload}</description><transport xmlns="urn:xmpp:jingle:transports:ice-udp:1"><fingerprint xmlns="urn:xmpp:jingle:apps:dtls:0" hash="sha-256" setup="actpass">browser-managed</fingerprint></transport></content>`;
  }

  function createJingleCandidateXml(candidate) {
    if (!candidate?.candidate) {
      return "";
    }

    const parsed = parseIceCandidateLine(candidate.candidate);
    return `<candidate component="${parsed.component}" foundation="${escapeXml(parsed.foundation)}" generation="0" id="${escapeXml(createShortId())}" ip="${escapeXml(parsed.ip)}" network="0" port="${parsed.port}" priority="${parsed.priority}" protocol="${escapeXml(parsed.protocol)}" type="${escapeXml(parsed.type)}"/>`;
  }

  function parseIceCandidateLine(line) {
    const parts = String(line).replace(/^candidate:/, "").split(/\s+/);
    const typIndex = parts.indexOf("typ");
    return {
      foundation: parts[0] || "browser",
      component: Number(parts[1]) || 1,
      protocol: (parts[2] || "udp").toLowerCase(),
      priority: Number(parts[3]) || 1,
      ip: parts[4] || "0.0.0.0",
      port: Number(parts[5]) || 0,
      type: typIndex >= 0 ? parts[typIndex + 1] || "host" : "host"
    };
  }

  function updateCallUi() {
    const call = state.call;
    const incoming = Boolean(call?.incomingOffer);
    el.answerCallButton.hidden = !incoming;
    el.rejectCallButton.hidden = !incoming;
    el.startAudioCallButton.disabled = Boolean(call);
    el.startVideoCallButton.disabled = Boolean(call);
    el.hangupCallButton.disabled = !call;
    el.callPanel.hidden = !(call?.localStream || call?.remoteStream);
  }

  function setCallStatus(text) {
    el.callStatus.textContent = text;
  }

  function supportsWebRtc() {
    return typeof RTCPeerConnection === "function";
  }

  function isRelayConnected() {
    return state.relaySocket?.readyState === WebSocket.OPEN;
  }

  function isAddressedToMe(envelope) {
    if (!envelope.to || envelope.to === "relay@localhost") {
      return true;
    }

    return jidMatches(envelope.to, currentFromJid());
  }

  function jidMatches(left, right) {
    const a = String(left || "").trim().toLowerCase();
    const b = String(right || "").trim().toLowerCase();
    return a === b || a.split("/")[0] === b.split("/")[0];
  }

  function jingleInfoText(info) {
    if (info === "ringing") {
      return t("call.ringing", "Ringing...");
    }

    if (info === "hold") {
      return t("call.hold", "Call on hold");
    }

    if (info === "unhold" || info === "active") {
      return t("call.connected", "Call connected");
    }

    return t("call.session_info", "Call status updated");
  }

  function redactJingleForLog(envelope) {
    return {
      ...envelope,
      sdp: envelope.sdp ? `${envelope.sdp.length} bytes` : null
    };
  }

  function addMessage(direction, text, status, from = null, attachment = null) {
    const conversation = activeConversation();
    conversation.messages.push({
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now() + Math.random()),
      direction,
      from,
      text,
      attachment,
      status,
      timestamp: new Date()
    });

    renderActiveConversation();
  }

  function addConversation() {
    const name = prompt("Conversation name");
    if (!name) {
      return;
    }

    const id = "conversation-" + Date.now();
    state.conversations.push({
      id,
      name,
      meta: "Manual",
      messages: []
    });
    state.activeConversationId = id;
    renderConversations();
    renderActiveConversation();
  }

  function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeConversationId)
      ?? state.conversations[0];
  }

  function renderConversations() {
    el.conversationItems.replaceChildren();
    for (const conversation of state.conversations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item" + (conversation.id === state.activeConversationId ? " selected" : "");
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector("strong").textContent = conversation.name;
      button.querySelector("span").textContent = conversation.meta;
      button.addEventListener("click", () => {
        state.activeConversationId = conversation.id;
        renderConversations();
        renderActiveConversation();
      });
      el.conversationItems.appendChild(button);
    }
  }

  function renderActiveConversation() {
    const conversation = activeConversation();
    el.activeConversationName.textContent = conversation.name;
    el.activeConversationMeta.textContent = conversation.meta;
    el.messageTimeline.replaceChildren();

    for (const message of conversation.messages) {
      el.messageTimeline.appendChild(createMessageElement(message));
    }

    if (state.remoteText) {
      el.messageTimeline.appendChild(createMessageElement({
        direction: "peer",
        from: state.remoteFrom,
        text: state.remoteText,
        status: "typing",
        timestamp: state.remoteDraftUpdatedAt ?? new Date(),
        draft: true
      }));
    }

    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
  }

  function updateRemoteDraftMessage() {
    const existing = el.messageTimeline.querySelector('[data-remote-draft="true"]');
    if (!state.remoteText) {
      existing?.remove();
      return;
    }

    const conversation = activeConversation();
    el.activeConversationName.textContent = conversation.name;
    el.activeConversationMeta.textContent = conversation.meta;

    const message = {
      direction: "peer",
      from: state.remoteFrom,
      text: state.remoteText,
      status: "typing",
      timestamp: state.remoteDraftUpdatedAt ?? new Date(),
      draft: true
    };

    if (!existing) {
      el.messageTimeline.appendChild(createMessageElement(message));
      el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
      return;
    }

    updateMessageElement(existing, message);
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
  }

  function createMessageElement(message) {
    const item = document.createElement("article");
    item.className = "message " + message.direction + (message.draft ? " draft" : "");
    if (message.draft) {
      item.dataset.remoteDraft = "true";
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = messageMetaText(message);
    const body = document.createElement("div");
    body.className = "message-body";
    renderRichText(body, message.text);
    if (message.attachment) {
      body.appendChild(createAttachmentElement(message.attachment));
    }
    item.append(meta, body);
    return item;
  }

  function updateMessageElement(item, message) {
    item.className = "message " + message.direction + (message.draft ? " draft" : "");
    if (message.draft) {
      item.dataset.remoteDraft = "true";
    } else {
      delete item.dataset.remoteDraft;
    }

    const meta = item.querySelector(".message-meta");
    if (meta) {
      meta.textContent = messageMetaText(message);
    }

    const body = item.querySelector(".message-body");
    if (body) {
      renderRichText(body, message.text);
    }
  }

  function messageMetaText(message) {
    const sender = message.direction === "self"
      ? currentSenderName()
      : displayNameForJid(message.from);
    return `${sender} - ${message.status} - ${formatTime(message.timestamp)}`;
  }

  function createAttachmentElement(attachment) {
    const kind = attachment.kind || classifyAttachment(attachment);
    const wrapper = document.createElement("a");
    wrapper.className = `attachment-card ${kind}`;
    wrapper.href = attachment.url;
    wrapper.target = "_blank";
    wrapper.rel = "noopener";
    wrapper.download = attachment.name || "";

    const icon = document.createElement("span");
    icon.className = "attachment-icon";
    icon.textContent = attachmentKindLabel(kind);

    const text = document.createElement("span");
    text.className = "attachment-text";
    const name = document.createElement("strong");
    name.textContent = attachment.name || "download";
    const meta = document.createElement("small");
    meta.textContent = [attachmentKindText(kind), formatBytes(attachment.size), attachment.type]
      .filter(Boolean)
      .join(" - ");
    text.append(name, meta);

    if (kind === "photo") {
      const preview = document.createElement("img");
      preview.className = "attachment-preview";
      preview.src = attachment.url;
      preview.alt = attachment.name || t("upload.photo", "Photo");
      preview.loading = "lazy";
      wrapper.append(preview, text);
    } else {
      wrapper.append(icon, text);
    }

    return wrapper;
  }

  function classifyAttachment(attachment) {
    const type = String(attachment.type || "").toLowerCase();
    const name = String(attachment.name || "").toLowerCase();
    const extension = name.includes(".") ? name.split(".").pop() : "";

    if (type.startsWith("image/")) {
      return "photo";
    }

    if (
      type.startsWith("text/") ||
      type.includes("pdf") ||
      type.includes("word") ||
      type.includes("spreadsheet") ||
      type.includes("presentation") ||
      type.includes("opendocument") ||
      ["pdf", "txt", "md", "rtf", "csv", "doc", "docx", "odt", "xls", "xlsx", "ods", "ppt", "pptx", "odp"].includes(extension)
    ) {
      return "document";
    }

    if (
      type === "application/octet-stream" ||
      type.includes("zip") ||
      type.includes("compressed") ||
      ["bin", "exe", "dll", "msi", "zip", "7z", "rar", "tar", "gz", "tgz", "deb", "rpm", "apk", "jar"].includes(extension)
    ) {
      return "binary";
    }

    return "file";
  }

  function attachmentKindLabel(kind) {
    return kind === "photo" ? "PHOTO" : kind === "document" ? "DOC" : kind === "binary" ? "BIN" : "FILE";
  }

  function attachmentKindText(kind) {
    if (kind === "photo") {
      return t("upload.photo", "Photo");
    }

    if (kind === "document") {
      return t("upload.document", "Document");
    }

    if (kind === "binary") {
      return t("upload.binary", "Binary file");
    }

    return t("upload.file", "File");
  }

  async function uploadSelectedFiles() {
    const files = Array.from(el.fileInput.files ?? []);
    el.fileInput.value = "";
    await uploadFiles(files);
  }

  async function uploadFiles(files) {
    const uploadable = files.filter((file) => file instanceof File);
    if (uploadable.length === 0) {
      return;
    }

    el.uploadFileButton.disabled = true;
    el.uploadFileButton.textContent = t("button.uploading", "Uploading...");
    try {
      for (const file of uploadable) {
        await uploadOneFile(file);
      }
    } finally {
      el.uploadFileButton.disabled = false;
      el.uploadFileButton.textContent = t("button.upload_file", "Upload file");
    }
  }

  async function uploadOneFile(file) {
    appendDebug("upload", `${file.name} (${file.size} bytes)`);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(uploadApiPath, {
        method: "POST",
        body: data
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.file) {
        throw new Error(payload.error || `upload returned ${response.status}`);
      }

      sendFileMessage(payload.file);
    } catch (error) {
      appendDebug("upload-error", error.message);
      addMessage("self", `${t("upload.failed", "Upload failed")}: ${file.name}`, "error");
    }
  }

  function handleDragEnter(event) {
    if (!eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    showDropOverlay(true);
  }

  function handleDragOver(event) {
    if (!eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    showDropOverlay(true);
  }

  function handleDragLeave(event) {
    if (event.relatedTarget && document.body.contains(event.relatedTarget)) {
      return;
    }

    showDropOverlay(false);
  }

  function handleDrop(event) {
    if (!eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    showDropOverlay(false);
    activateTab("chat");
    uploadFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function eventHasFiles(event) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function showDropOverlay(show) {
    el.dropOverlay.hidden = !show;
    el.dropOverlay.classList.toggle("visible", show);
  }

  function sendFileMessage(file) {
    const text = `${t("upload.shared_file", "Shared file")}: ${file.name}`;
    const attachment = {
      name: file.name,
      url: file.url,
      size: file.size,
      type: file.type,
      kind: classifyAttachment(file)
    };

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const xml = createMessageStanza(`${text}\n${new URL(file.url, location.href).href}`);
      state.xmppSocket.send(xml);
      appendDebug("C", xml);
      addMessage("self", text, "RFC 7395", null, attachment);
      return;
    }

    if (!state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN) {
      addMessage("self", text, "offline", null, attachment);
      return;
    }

    const envelope = createRelayEnvelope("message", text, "");
    envelope.attachment = attachment;
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("upload-out", JSON.stringify(envelope));
    addMessage("self", text, "sent", null, attachment);
  }

  function renderRichText(container, text) {
    text = String(text ?? "");
    const mode = el.smileyToggle.checked ? "smiley" : "plain";
    if (container.dataset.richText === text && container.dataset.richTextMode === mode) {
      return;
    }

    container.dataset.richText = text;
    container.dataset.richTextMode = mode;
    if (!el.smileyToggle.checked) {
      container.textContent = text;
      return;
    }

    const existing = Array.from(container.childNodes);
    const nextNodes = [];
    let index = 0;
    for (const token of tokenizeSmilies(text)) {
      if (token.kind === "text") {
        nextNodes.push(reuseTextNode(existing[index], token.text));
      } else {
        nextNodes.push(reuseSmileyNode(existing[index], token));
      }

      index++;
    }

    patchChildren(container, nextNodes);
  }

  function patchChildren(container, nextNodes) {
    for (let index = 0; index < nextNodes.length; index++) {
      const nextNode = nextNodes[index];
      const currentNode = container.childNodes[index] ?? null;
      if (currentNode === nextNode) {
        continue;
      }

      container.insertBefore(nextNode, currentNode);
    }

    while (container.childNodes.length > nextNodes.length) {
      container.removeChild(container.lastChild);
    }
  }

  function reuseTextNode(node, text) {
    if (node?.nodeType === Node.TEXT_NODE) {
      if (node.textContent !== text) {
        node.textContent = text;
      }

      return node;
    }

    return document.createTextNode(text);
  }

  function reuseSmileyNode(node, token) {
    if (node instanceof HTMLElement
      && node.dataset.smileyCode === token.text
      && node.dataset.smileyName === token.smiley.name) {
      return node;
    }

    return createSmileyImage(token);
  }

  function createSmileyImage(token) {
    const fallback = document.createElement("span");
    fallback.className = "smiley";
    fallback.dataset.smileyCode = token.text;
    fallback.dataset.smileyName = token.smiley.name;
    fallback.title = `${token.smiley.name} (${token.smiley.fileName})`;
    fallback.textContent = token.text;

    const image = document.createElement("img");
    image.className = "smiley-image";
    image.dataset.smileyCode = token.text;
    image.dataset.smileyName = token.smiley.name;
    image.src = smileyBasePath + encodeURIComponent(token.smiley.fileName);
    image.alt = token.text;
    image.title = `${token.smiley.name} (${token.smiley.fileName})`;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      const fallbackFile = token.smiley.fileName.replace(/\.[^.]+$/, ".svg");
      if (fallbackFile !== token.smiley.fileName && !image.dataset.triedSvg) {
        image.dataset.triedSvg = "true";
        image.src = smileyBasePath + encodeURIComponent(fallbackFile);
        return;
      }

      image.replaceWith(fallback);
    });
    return image;
  }

  function tokenizeSmilies(text) {
    const tokens = [];
    let textStart = 0;
    let index = 0;

    while (index < text.length) {
      const match = smileIndex.find((item) => text.startsWith(item.code, index));
      if (!match) {
        index++;
        continue;
      }

      if (index > textStart) {
        tokens.push({ kind: "text", text: text.slice(textStart, index) });
      }

      tokens.push({ kind: "smiley", text: match.code, smiley: match.smiley });
      index += match.code.length;
      textStart = index;
    }

    if (textStart < text.length) {
      tokens.push({ kind: "text", text: text.slice(textStart) });
    }

    return tokens;
  }

  function createDeltaActions(oldText, newText) {
    if (oldText === newText) {
      return "";
    }

    const oldChars = Array.from(oldText);
    const newChars = Array.from(newText);
    let prefix = 0;
    while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) {
      prefix++;
    }

    let suffix = 0;
    while (
      oldChars.length - 1 - suffix >= prefix &&
      newChars.length - 1 - suffix >= prefix &&
      oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]
    ) {
      suffix++;
    }

    const removed = oldChars.length - prefix - suffix;
    const inserted = newChars.length - prefix - suffix;
    let xml = "";

    if (removed > 0) {
      xml += `<e p="${prefix + removed}" n="${removed}"/>`;
    }

    if (inserted > 0) {
      xml += `<t p="${prefix}">${escapeXml(newChars.slice(prefix, prefix + inserted).join(""))}</t>`;
    }

    return xml;
  }

  function createMessageStanza(text) {
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(el.jidInput.value)}" to="${escapeXml(el.peerInput.value)}"><body>${escapeXml(text)}</body></message>`;
  }

  function createUniqueJid(jid) {
    const value = String(jid ?? "").trim();
    if (!value) {
      return `guest@localhost/web-${state.clientInstance.resourceSuffix}`;
    }

    const slash = value.indexOf("/");
    if (slash < 0) {
      return `${value}/web-${state.clientInstance.resourceSuffix}`;
    }

    const bare = value.slice(0, slash);
    const resource = value.slice(slash + 1) || "web";
    if (resource.endsWith(`-${state.clientInstance.resourceSuffix}`)) {
      return value;
    }

    return `${bare}/${resource}-${state.clientInstance.resourceSuffix}`;
  }

  function stripGeneratedResourceSuffix(jid) {
    const value = String(jid ?? "").trim();
    const marker = `-${state.clientInstance.resourceSuffix}`;
    return value.endsWith(marker) ? value.slice(0, -marker.length) : value;
  }

  function domainFromJid(jid) {
    const bare = jid.split("/")[0];
    const parts = bare.split("@");
    return parts.length > 1 ? parts[1] : bare;
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return "";
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB"];
    let amount = bytes / 1024;
    for (const unit of units) {
      if (amount < 1024 || unit === "GB") {
        return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${unit}`;
      }
      amount /= 1024;
    }

    return `${bytes} B`;
  }

  function setConnectionStatus(text, level) {
    el.connectionSummary.textContent = text;
    el.connectionSummary.className = level === "good"
      ? "status-good"
      : level === "danger"
        ? "status-danger"
        : "status-warn";
  }

  function appendDebug(prefix, message) {
    const line = `[${new Date().toLocaleTimeString()}] ${prefix}: ${message}`;
    el.debugLog.textContent = el.debugLog.textContent
      ? el.debugLog.textContent + "\n" + line
      : line;
    el.debugLog.scrollTop = el.debugLog.scrollHeight;
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }
})();
