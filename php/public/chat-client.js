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
    relayModeButton: byId("relayModeButton"),
    xmppModeButton: byId("xmppModeButton"),
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
    el.relayModeButton.addEventListener("click", () => setMode("relay"));
    el.xmppModeButton.addEventListener("click", () => setMode("xmpp"));
    el.closeTabPanelButton.addEventListener("click", () => activateTab("chat"));
    el.resetRttButton.addEventListener("click", sendRttReset);
    el.composerForm.addEventListener("submit", sendComposerMessage);
    el.messageInput.addEventListener("input", sendRttEdit);
    el.messageInput.addEventListener("keydown", handleComposerKeydown);
    el.saveAccountButton.addEventListener("click", saveAccountProfile);
    el.resetAccountButton.addEventListener("click", resetAccountProfile);
    el.peerInput.addEventListener("change", updateRelayConversationMeta);
    el.displayNameInput.addEventListener("change", renderActiveConversation);
    el.jidInput.addEventListener("change", renderActiveConversation);
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
    if (!envelope || (envelope.type !== "rtt" && envelope.type !== "message")) {
      return;
    }

    appendDebug("relay-in", envelope.type === "rtt" ? envelope.xml : JSON.stringify(envelope));

    if (envelope.clientId && envelope.clientId === state.clientInstance.id) {
      appendDebug("relay-skip", "Ignored own echoed envelope");
      return;
    }

    if (envelope.type === "message") {
      state.remoteText = "";
      state.remoteFrom = envelopeFrom(envelope);
      state.remoteDraftUpdatedAt = null;
      addMessage("peer", envelope.text ?? "", "received", state.remoteFrom);
      return;
    }

    state.remoteText = envelope.text ?? "";
    state.remoteFrom = envelopeFrom(envelope);
    state.remoteDraftUpdatedAt = new Date();
    renderActiveConversation();
  }

  function addMessage(direction, text, status, from = null) {
    const conversation = activeConversation();
    conversation.messages.push({
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now() + Math.random()),
      direction,
      from,
      text,
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

  function createMessageElement(message) {
    const item = document.createElement("article");
    item.className = "message " + message.direction + (message.draft ? " draft" : "");
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const sender = message.direction === "self"
      ? currentSenderName()
      : displayNameForJid(message.from);
    meta.textContent = `${sender} - ${message.status} - ${formatTime(message.timestamp)}`;
    const body = document.createElement("div");
    body.className = "message-body";
    renderRichText(body, message.text);
    item.append(meta, body);
    return item;
  }

  function renderRichText(container, text) {
    container.replaceChildren();
    if (!el.smileyToggle.checked) {
      container.textContent = text;
      return;
    }

    for (const token of tokenizeSmilies(text)) {
      if (token.kind === "text") {
        container.appendChild(document.createTextNode(token.text));
      } else {
        container.appendChild(createSmileyImage(token));
      }
    }
  }

  function createSmileyImage(token) {
    const fallback = document.createElement("span");
    fallback.className = "smiley";
    fallback.title = `${token.smiley.name} (${token.smiley.fileName})`;
    fallback.textContent = token.text;

    const image = document.createElement("img");
    image.className = "smiley-image";
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
