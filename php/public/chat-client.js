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
  const accountStorageKeyBase = "teletyptel.serverAccountSession";
  const clientInstanceStorageKeyBase = "teletyptel.clientInstance";
  const sessionProfileStorageKey = "teletyptel.sessionProfile";
  const mediaSettingsStorageKey = "teletyptel.mediaSettings";
  const blockedJidsStorageKeyBase = "teletyptel.blockedJids";
  const locationSettingsStorageKeyBase = "teletyptel.locationSettings";
  const accountApiPath = "api/account.php";
  const uploadApiPath = "api/upload.php";
  const languageBasePath = "lang/";
  const avatarMaxBytes = 256 * 1024;
  const geolocNamespace = "http://jabber.org/protocol/geoloc";
  const jingleRttSyncNamespace = "urn:xmpp:jingle:apps:rtt-sync:0";
  const jingleRttSyncDataChannelLabel = "rtt";
  const jingleRttSyncMaxSkewMs = 700;
  const t140Backspace = "\b";
  const t140Delete = "\u007f";
  const locationStaleAfterMs = 5 * 60 * 1000;
  const sessionProfile = loadSessionProfile();
  const hasInitialAccountProfile = Boolean(loadSavedAccountProfile(sessionProfile));
  const developerMode = new URLSearchParams(location.search).has("dev")
    || localStorage.getItem("teletyptel.developerMode") === "1";

  const state = {
    mode: "relay",
    theme: loadTheme(),
    relaySocket: null,
    xmppSocket: null,
    account: null,
    developerMode,
    provider: null,
    translations: new Map(),
    languageCode: "eng",
    sessionProfile,
    clientInstance: loadClientInstance(sessionProfile),
    clientLifecycle: {
      current: "active",
      relayLastSent: null,
      xmppLastSent: null,
      nativeLastPosted: null,
      blurTimer: null
    },
    activeTabId: "chat",
    sequence: 0,
    previousText: "",
    editingMessage: null,
    call: null,
    mediaSettings: loadMediaSettings(),
    mediaDevices: [],
    mediaPreviewStream: null,
    blockedJids: new Set(loadBlockedJids(sessionProfile)),
    accountReady: false,
    location: {
      current: null,
      permission: "unknown",
      error: "",
      live: false,
      watchId: null,
      sharedConversationId: null,
      lastSharedAt: null,
      lastLiveSentAt: 0,
      settings: loadLocationSettings(sessionProfile)
    },
    contextConversationId: null,
    accountGateRequired: !hasInitialAccountProfile,
    conversations: [
      {
        id: "relay",
        name: "Relay room",
        nameKey: "conversation.relay_room",
        peer: "relay@localhost",
        kind: "contact",
        avatarColor: "#0f766e",
        presence: "offline",
        meta: "Offline",
        clientState: null,
        clientStateUpdatedAt: null,
        messages: [],
        remoteText: "",
        remoteFrom: "",
        remoteDraftUpdatedAt: null
      },
      {
        id: "tester",
        name: "Tester",
        nameKey: "conversation.tester",
        peer: "tester@localhost",
        kind: "contact",
        avatarColor: "#2563eb",
        presence: "offline",
        meta: "Offline",
        clientState: null,
        clientStateUpdatedAt: null,
        messages: [],
        remoteText: "",
        remoteFrom: "",
        remoteDraftUpdatedAt: null
      },
      {
        id: "support-group",
        name: "Support group",
        nameKey: "conversation.support_group",
        peer: "support@conference.localhost",
        kind: "group",
        avatarColor: "#7c3aed",
        presence: "group",
        meta: "Group",
        clientState: null,
        clientStateUpdatedAt: null,
        messages: [],
        remoteText: "",
        remoteFrom: "",
        remoteDraftUpdatedAt: null
      }
    ],
    activeConversationId: null
  };

  const el = {
    appTabs: byId("appTabs"),
    connectionSummary: byId("connectionSummary"),
    viewMenu: byId("viewMenu"),
    themeButton: byId("themeButton"),
    accountButton: byId("accountButton"),
    connectButton: byId("connectButton"),
    disconnectButton: byId("disconnectButton"),
    addConversationButton: byId("addConversationButton"),
    addGroupButton: byId("addGroupButton"),
    inviteConversationButton: byId("inviteConversationButton"),
    conversationContextMenu: byId("conversationContextMenu"),
    contextBlockButton: byId("contextBlockButton"),
    conversationItems: byId("conversationItems"),
    activeConversationAvatar: byId("activeConversationAvatar"),
    activeConversationName: byId("activeConversationName"),
    activeConversationMeta: byId("activeConversationMeta"),
    startCallButton: byId("startCallButton"),
    startCallMenu: byId("startCallMenu"),
    startAudioCallOption: byId("startAudioCallOption"),
    startVideoCallOption: byId("startVideoCallOption"),
    composerCallButton: byId("composerCallButton"),
    composerCallMenu: byId("composerCallMenu"),
    composerAudioCallOption: byId("composerAudioCallOption"),
    composerVideoCallOption: byId("composerVideoCallOption"),
    answerCallButton: byId("answerCallButton"),
    rejectCallButton: byId("rejectCallButton"),
    hangupCallButton: byId("hangupCallButton"),
    callStatus: byId("callStatus"),
    incomingCallBanner: byId("incomingCallBanner"),
    incomingCallTitle: byId("incomingCallTitle"),
    incomingCallText: byId("incomingCallText"),
    incomingAnswerButton: byId("incomingAnswerButton"),
    incomingRejectButton: byId("incomingRejectButton"),
    incomingCallDialog: byId("incomingCallDialog"),
    incomingCallDialogTitle: byId("incomingCallDialogTitle"),
    incomingCallDialogText: byId("incomingCallDialogText"),
    dialogAnswerButton: byId("dialogAnswerButton"),
    dialogRejectButton: byId("dialogRejectButton"),
    callPanel: byId("callPanel"),
    remoteVideo: byId("remoteVideo"),
    localVideo: byId("localVideo"),
    toggleCameraButton: byId("toggleCameraButton"),
    muteMicrophoneButton: byId("muteMicrophoneButton"),
    muteRemoteAudioButton: byId("muteRemoteAudioButton"),
    remoteVolumeInput: byId("remoteVolumeInput"),
    remoteVolumeValue: byId("remoteVolumeValue"),
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
    sessionProfileInput: byId("sessionProfileInput"),
    switchSessionButton: byId("switchSessionButton"),
    openSecondSessionButton: byId("openSecondSessionButton"),
    relayUrlInput: byId("relayUrlInput"),
    displayNameInput: byId("displayNameInput"),
    accountAvatarPreview: byId("accountAvatarPreview"),
    avatarFileInput: byId("avatarFileInput"),
    avatarColorInput: byId("avatarColorInput"),
    chooseAvatarButton: byId("chooseAvatarButton"),
    clearAvatarButton: byId("clearAvatarButton"),
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
    accountDialog: byId("accountDialog"),
    accountDialogTitle: byId("accountDialogTitle"),
    accountDialogSubtitle: byId("accountDialogSubtitle"),
    closeAccountDialogButton: byId("closeAccountDialogButton"),
    cancelAccountDialogButton: byId("cancelAccountDialogButton"),
    dialogRealAccountTitle: byId("dialogRealAccountTitle"),
    dialogAdvancedDetails: byId("dialogAdvancedDetails"),
    dialogSessionProfileInput: byId("dialogSessionProfileInput"),
    dialogDisplayNameInput: byId("dialogDisplayNameInput"),
    dialogJidInput: byId("dialogJidInput"),
    dialogPasswordInput: byId("dialogPasswordInput"),
    dialogRememberPasswordToggle: byId("dialogRememberPasswordToggle"),
    dialogXmppDomainInput: byId("dialogXmppDomainInput"),
    dialogXmppHostInput: byId("dialogXmppHostInput"),
    dialogXmppPortInput: byId("dialogXmppPortInput"),
    dialogXmppTlsModeInput: byId("dialogXmppTlsModeInput"),
    dialogRelayUrlInput: byId("dialogRelayUrlInput"),
    dialogXmppUrlInput: byId("dialogXmppUrlInput"),
    dialogProviderInput: byId("dialogProviderInput"),
    dialogLanguageInput: byId("dialogLanguageInput"),
    dialogPeerInput: byId("dialogPeerInput"),
    dialogPhoneInput: byId("dialogPhoneInput"),
    dialogAccountStatus: byId("dialogAccountStatus"),
    dialogCreateAccountButton: byId("dialogCreateAccountButton"),
    dialogSaveAccountButton: byId("dialogSaveAccountButton"),
    dialogConnectButton: byId("dialogConnectButton"),
    cameraInput: byId("cameraInput"),
    microphoneInput: byId("microphoneInput"),
    videoQualityInput: byId("videoQualityInput"),
    mediaStatus: byId("mediaStatus"),
    refreshMediaButton: byId("refreshMediaButton"),
    previewMediaButton: byId("previewMediaButton"),
    stopMediaPreviewButton: byId("stopMediaPreviewButton"),
    providerSummary: byId("providerSummary"),
    capabilityList: byId("capabilityList"),
    xmppUrlInput: byId("xmppUrlInput"),
    xmppOpenButton: byId("xmppOpenButton"),
    xmppCloseButton: byId("xmppCloseButton"),
    clearLogButton: byId("clearLogButton"),
    debugLog: byId("debugLog")
  };

  document.body.classList.toggle("account-gate", state.accountGateRequired);
  document.body.classList.toggle("developer-mode", state.developerMode);
  bindEvents();
  el.sessionProfileInput.value = state.sessionProfile;
  applyTheme(state.theme);
  renderTabs();
  renderConversations();
  renderActiveConversation();
  setConnectionStatus(t("status.disconnected", "Disconnected"), "warn");
  updateConnectButtonAvailability();
  loadPlatformConfig();
  applyMediaSettingsToControls();
  refreshMediaDevices(false);
  registerServiceWorker();
  setupMobileLifecycle();

  function bindEvents() {
    el.themeButton.addEventListener("click", toggleTheme);
    el.accountButton.addEventListener("click", () => openAccountDialog());
    el.connectButton.addEventListener("click", connectRelay);
    el.disconnectButton.addEventListener("click", disconnectAll);
    el.addConversationButton.addEventListener("click", addConversation);
    el.addGroupButton.addEventListener("click", addGroupConversation);
    el.inviteConversationButton.addEventListener("click", inviteContactToActiveGroup);
    el.contextBlockButton.addEventListener("click", toggleBlockContextConversation);
    el.conversationContextMenu.addEventListener("click", (event) => event.stopPropagation());
    el.startCallButton.addEventListener("click", () => toggleCallMenu(el.startCallMenu, el.startCallButton));
    el.composerCallButton.addEventListener("click", () => toggleCallMenu(el.composerCallMenu, el.composerCallButton));
    el.startAudioCallOption.addEventListener("click", () => startCallFromMenu("audio"));
    el.startVideoCallOption.addEventListener("click", () => startCallFromMenu("video"));
    el.composerAudioCallOption.addEventListener("click", () => startCallFromMenu("audio"));
    el.composerVideoCallOption.addEventListener("click", () => startCallFromMenu("video"));
    el.answerCallButton.addEventListener("click", answerIncomingCall);
    el.rejectCallButton.addEventListener("click", rejectIncomingCall);
    el.incomingAnswerButton.addEventListener("click", answerIncomingCall);
    el.incomingRejectButton.addEventListener("click", rejectIncomingCall);
    el.dialogAnswerButton.addEventListener("click", answerIncomingCall);
    el.dialogRejectButton.addEventListener("click", rejectIncomingCall);
    el.hangupCallButton.addEventListener("click", hangupCall);
    el.toggleCameraButton.addEventListener("click", toggleCameraVideo);
    el.muteMicrophoneButton.addEventListener("click", toggleMicrophoneMute);
    el.muteRemoteAudioButton.addEventListener("click", toggleRemoteAudioMute);
    el.remoteVolumeInput.addEventListener("input", saveRemoteVolumeFromControl);
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
    document.addEventListener("click", closeCallMenusOnOutsideClick);
    document.addEventListener("click", closeConversationContextMenuOnOutsideClick);
    document.addEventListener("keydown", closeCallMenusOnEscape);
    document.addEventListener("keydown", closeConversationContextMenuOnEscape);
    document.addEventListener("keydown", closeAccountDialogOnEscape);
    window.addEventListener("resize", closeConversationContextMenu);
    window.addEventListener("scroll", closeConversationContextMenu, true);
    document.addEventListener("visibilitychange", handleVisibilityLifecycleChange);
    window.addEventListener("focus", () => setClientLifecycleState("active", "focus"));
    window.addEventListener("blur", handleWindowLifecycleBlur);
    window.addEventListener("pageshow", () => setClientLifecycleState("active", "pageshow"));
    window.addEventListener("pagehide", () => setClientLifecycleState("inactive", "pagehide", { force: true }));
    document.addEventListener("freeze", () => setClientLifecycleState("inactive", "freeze", { force: true }));
    document.addEventListener("pause", () => setClientLifecycleState("inactive", "app-pause", { force: true }));
    document.addEventListener("resume", () => setClientLifecycleState("active", "app-resume"));
    window.addEventListener("teletyptel:lifecycle", handleNativeLifecycleEvent);
    el.composerForm.addEventListener("submit", sendComposerMessage);
    el.messageInput.addEventListener("input", sendRttEdit);
    el.messageInput.addEventListener("keydown", handleComposerKeydown);
    el.switchSessionButton.addEventListener("click", switchBrowserSession);
    el.openSecondSessionButton.addEventListener("click", openSecondBrowserSession);
    el.saveAccountButton.addEventListener("click", () => {
      saveAccountProfile().catch((error) => {
        updateAccountStatus(error.message);
        appendDebug("account-error", error.message);
      });
    });
    el.resetAccountButton.addEventListener("click", resetAccountProfile);
    el.accountDialog.addEventListener("click", closeAccountDialogOnBackdrop);
    el.closeAccountDialogButton.addEventListener("click", closeAccountDialog);
    el.cancelAccountDialogButton.addEventListener("click", closeAccountDialog);
    el.dialogCreateAccountButton.addEventListener("click", createAccountFromDialog);
    el.dialogSaveAccountButton.addEventListener("click", () => saveAccountDialogProfile(false));
    el.dialogConnectButton.addEventListener("click", () => saveAccountDialogProfile(true));
    el.cameraInput.addEventListener("change", () => handleMediaSettingsChange("video"));
    el.microphoneInput.addEventListener("change", () => handleMediaSettingsChange("audio"));
    el.videoQualityInput.addEventListener("change", () => handleMediaSettingsChange("video"));
    el.refreshMediaButton.addEventListener("click", () => refreshMediaDevices(true));
    el.previewMediaButton.addEventListener("click", previewMedia);
    el.stopMediaPreviewButton.addEventListener("click", stopMediaPreview);
    el.peerInput.addEventListener("change", updateRelayConversationMeta);
    el.displayNameInput.addEventListener("change", handleAccountIdentityChanged);
    el.jidInput.addEventListener("change", handleAccountIdentityChanged);
    el.avatarColorInput.addEventListener("input", handleAvatarColorChanged);
    el.chooseAvatarButton.addEventListener("click", () => el.avatarFileInput.click());
    el.avatarFileInput.addEventListener("change", handleAvatarFileSelected);
    el.clearAvatarButton.addEventListener("click", clearAccountAvatar);
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

  function setupMobileLifecycle() {
    globalThis.TeletyptelLifecycle = {
      setActive: (reason = "native-active") => setClientLifecycleState("active", reason, { force: true }),
      setInactive: (reason = "native-inactive") => setClientLifecycleState("inactive", reason, { force: true }),
      refresh: (reason = "native-refresh") => flushClientLifecycleState(reason, true),
      state: () => ({
        current: state.clientLifecycle.current,
        relayLastSent: state.clientLifecycle.relayLastSent,
        xmppLastSent: state.clientLifecycle.xmppLastSent
      })
    };

    if (globalThis.chrome?.webview?.addEventListener) {
      globalThis.chrome.webview.addEventListener("message", (event) => {
        handleNativeLifecyclePayload(event.data, "webview2");
      });
    }

    setClientLifecycleState(browserLifecycleState(), "startup", { force: true });
  }

  function handleVisibilityLifecycleChange() {
    setClientLifecycleState(browserLifecycleState(), "visibilitychange");
  }

  function handleWindowLifecycleBlur() {
    clearTimeout(state.clientLifecycle.blurTimer);
    state.clientLifecycle.blurTimer = setTimeout(() => {
      if (document.visibilityState === "hidden" || document.hasFocus?.() === false) {
        setClientLifecycleState("inactive", "blur");
      }
    }, 750);
  }

  function handleNativeLifecycleEvent(event) {
    handleNativeLifecyclePayload(event.detail ?? event.data, "custom-event");
  }

  function handleNativeLifecyclePayload(payload, source) {
    const value = typeof payload === "string"
      ? payload
      : payload?.state ?? payload?.clientState ?? payload?.visibility;
    if (value === "active" || value === "foreground" || value === "visible") {
      setClientLifecycleState("active", `${source}-active`, { force: payload?.force === true });
    } else if (value === "inactive" || value === "background" || value === "hidden") {
      setClientLifecycleState("inactive", `${source}-inactive`, { force: payload?.force === true });
    }
  }

  function browserLifecycleState() {
    return document.visibilityState === "hidden" ? "inactive" : "active";
  }

  function setClientLifecycleState(nextState, reason, options = {}) {
    const normalized = nextState === "inactive" ? "inactive" : "active";
    clearTimeout(state.clientLifecycle.blurTimer);
    const changed = state.clientLifecycle.current !== normalized;
    state.clientLifecycle.current = normalized;
    if (changed || options.force === true) {
      flushClientLifecycleState(reason, options.force === true);
    }
  }

  function flushClientLifecycleState(reason = "lifecycle", force = false) {
    sendClientStateToRelay(reason, force);
    sendClientStateToXmpp(reason, force);
    postClientLifecycleToNative(reason, force);
  }

  function sendClientStateToRelay(reason, force) {
    if (!isRelayConnected()) {
      return;
    }

    const clientState = state.clientLifecycle.current;
    if (!force && state.clientLifecycle.relayLastSent === clientState) {
      return;
    }

    const envelope = createRelayEnvelope(
      "client-state",
      "",
      createClientStateXml(clientState),
      "relay@localhost");
    envelope.clientState = clientState;
    envelope.reason = reason;
    envelope.sentAt = new Date().toISOString();
    state.relaySocket.send(JSON.stringify(envelope));
    state.clientLifecycle.relayLastSent = clientState;
    appendDebug("client-state-out", `${clientState} ${reason}`);
  }

  function sendClientStateToXmpp(reason, force) {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const clientState = state.clientLifecycle.current;
    if (!force && state.clientLifecycle.xmppLastSent === clientState) {
      return;
    }

    const xml = createClientStateXml(clientState);
    state.xmppSocket.send(xml);
    state.clientLifecycle.xmppLastSent = clientState;
    appendDebug("csi-out", `${xml} (${reason})`);
  }

  function postClientLifecycleToNative(reason, force) {
    const payload = {
      type: "teletyptel.lifecycle",
      state: state.clientLifecycle.current,
      reason,
      forced: force,
      at: new Date().toISOString()
    };
    const signature = `${payload.state}:${payload.reason}:${payload.forced}`;
    if (!force && state.clientLifecycle.nativeLastPosted === signature) {
      return;
    }

    state.clientLifecycle.nativeLastPosted = signature;

    try {
      globalThis.chrome?.webview?.postMessage?.(payload);
    } catch {
    }

    try {
      globalThis.webkit?.messageHandlers?.teletyptelLifecycle?.postMessage?.(payload);
    } catch {
    }
  }

  function createClientStateXml(clientState) {
    const element = clientState === "inactive" ? "inactive" : "active";
    return `<${element} xmlns="urn:xmpp:csi:0"/>`;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function loadSessionProfile() {
    const requested = new URL(location.href).searchParams.get("profile");
    const saved = sessionStorage.getItem(sessionProfileStorageKey);
    const profile = sanitizeSessionProfile(requested || saved || "default");
    sessionStorage.setItem(sessionProfileStorageKey, profile);
    return profile;
  }

  function sanitizeSessionProfile(value) {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    return normalized || "default";
  }

  function accountStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? accountStorageKeyBase : `${accountStorageKeyBase}.${normalized}`;
  }

  function clientInstanceStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? clientInstanceStorageKeyBase : `${clientInstanceStorageKeyBase}.${normalized}`;
  }

  function blockedJidsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? blockedJidsStorageKeyBase : `${blockedJidsStorageKeyBase}.${normalized}`;
  }

  function locationSettingsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? locationSettingsStorageKeyBase : `${locationSettingsStorageKeyBase}.${normalized}`;
  }

  function loadBlockedJids(profile) {
    const saved = localStorage.getItem(blockedJidsStorageKeyFor(profile));
    if (!saved) {
      return [];
    }

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.map(normalizeBlockJid).filter(Boolean)
        : [];
    } catch {
      localStorage.removeItem(blockedJidsStorageKeyFor(profile));
      return [];
    }
  }

  function saveBlockedJids() {
    localStorage.setItem(
      blockedJidsStorageKeyFor(state.sessionProfile),
      JSON.stringify(Array.from(state.blockedJids).sort()));
  }

  function loadLocationSettings(profile) {
    const saved = localStorage.getItem(locationSettingsStorageKeyFor(profile));
    if (!saved) {
      return defaultLocationSettings();
    }

    try {
      return {
        ...defaultLocationSettings(),
        ...JSON.parse(saved)
      };
    } catch {
      localStorage.removeItem(locationSettingsStorageKeyFor(profile));
      return defaultLocationSettings();
    }
  }

  function defaultLocationSettings() {
    return {
      highAccuracy: true,
      timeoutMs: 10000,
      maximumAgeMs: 15000,
      liveIntervalMs: 15000
    };
  }

  function loadTheme() {
    const saved = localStorage.getItem("teletyptel.theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }

    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function loadMediaSettings() {
    const saved = localStorage.getItem(mediaSettingsStorageKey);
    if (!saved) {
      return defaultMediaSettings();
    }

    try {
      return {
        ...defaultMediaSettings(),
        ...JSON.parse(saved)
      };
    } catch {
      localStorage.removeItem(mediaSettingsStorageKey);
      return defaultMediaSettings();
    }
  }

  function defaultMediaSettings() {
    return {
      cameraDeviceId: "",
      microphoneDeviceId: "",
      videoQuality: "default",
      remoteVolume: 1,
      remoteSoundMuted: false
    };
  }

  function loadClientInstance(profile) {
    const key = clientInstanceStorageKeyFor(profile);
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
    el.viewMenu.removeAttribute("open");
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = state.theme;
    localStorage.setItem("teletyptel.theme", state.theme);
    el.themeButton.textContent = state.theme === "dark"
      ? t("button.theme_white", "Mode: White")
      : t("button.theme_black", "Mode: Black");
    el.themeButton.setAttribute(
      "aria-label",
      state.theme === "dark"
        ? t("aria.theme_white", "Switch to white mode")
        : t("aria.theme_black", "Switch to black mode"));
    el.themeButton.title = el.themeButton.getAttribute("aria-label");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      state.theme === "dark" ? "#111827" : "#eef2f7");
  }

  function setMode(mode) {
    state.mode = mode;
    el.relayModeButton.classList.toggle("selected", mode === "relay");
    el.xmppModeButton.classList.toggle("selected", mode === "xmpp");
    setDefaultComposerState();
    updateComposerAvailability();
  }

  async function loadPlatformConfig() {
    let savedAccount = null;
    let databaseLoaded = false;
    try {
      savedAccount = loadSavedAccountProfile();
      const account = mergeAccountProfiles(
        applySessionAccountDefaults(await fetchJson("config/account-profile.json"), savedAccount),
        savedAccount);
      state.account = account;
      applyAccountProfile(account);
      databaseLoaded = await loadDatabaseAccount(account.accountId);
      await loadLanguage(state.account.preferredLanguage ?? "eng");
      const provider = await fetchJson(`config/providers/${encodeURIComponent(state.account.providerId)}.json`);
      state.provider = provider;
      renderProvider();
      renderTabs();
      showAccountStartIfRequired(!databaseLoaded);
      setAccountReady(databaseLoaded);
      autoConnectIfReady();
      appendDebug("config", `Loaded provider ${provider.providerId}`);
    } catch (error) {
      el.providerSummary.textContent = t("provider.unavailable", "Provider manifest unavailable.");
      appendDebug("config-error", error.message);
      await loadLanguage(state.account?.preferredLanguage ?? "eng");
      renderTabs();
      showAccountStartIfRequired(!databaseLoaded);
      setAccountReady(databaseLoaded);
      autoConnectIfReady();
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

    for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel, node.getAttribute("aria-label") ?? ""));
    }

    applyTheme(state.theme);
    setMode(state.mode);
    if (state.provider) {
      renderProvider();
    }

    renderMediaDeviceSelects();
    renderTabs();
    renderConversations();
    renderActiveConversation();
    if (!el.accountDialog.hidden) {
      updateAccountDialogMode();
    }

    if (state.account) {
      updateAccountStatus(accountStatusPrefix());
    }
    updateCallUi();
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
        appendDebug("account-db", "No server account yet");
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
        return true;
      }
      return false;
    } catch (error) {
      appendDebug("account-db-error", error.message);
      return false;
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
    state.account = {
      ...state.account,
      avatarDataUrl: account.avatarDataUrl ?? state.account?.avatarDataUrl ?? "",
      avatarColor: account.avatarColor || state.account?.avatarColor || avatarColorFor(account.displayName ?? account.jid ?? state.sessionProfile)
    };
    el.avatarColorInput.value = normalizeAvatarColor(state.account.avatarColor);
    el.passwordInput.value = account.rememberPassword ? account.password ?? "" : "";
    el.rememberPasswordToggle.checked = account.rememberPassword === true;
    el.peerInput.value = account.peer ?? el.peerInput.value;
    el.phoneInput.value = account.phoneNumber ?? "";
    el.languageInput.value = normalizeLanguageCode(account.preferredLanguage ?? "eng");
    el.providerInput.value = account.providerId ?? "";
    el.relayUrlInput.value = account.relayWebSocket ?? el.relayUrlInput.value;
    el.xmppUrlInput.value = account.xmppWebSocket ?? el.xmppUrlInput.value;
    state.account.xmppHost = account.xmppHost ?? state.account.xmppHost ?? domainFromJid(account.jid ?? "");
    state.account.xmppPort = account.xmppPort ?? state.account.xmppPort ?? 5222;
    state.account.xmppDomain = account.xmppDomain ?? state.account.xmppDomain ?? domainFromJid(account.jid ?? "");
    state.account.xmppTlsMode = account.xmppTlsMode ?? state.account.xmppTlsMode ?? "starttls";
    updateAccountStatus(account.savedInDatabase === true ? t("account.database_loaded", "Server account loaded") : t("account.default_profile", "Default account profile"));
    updateAccountAvatarPreview();
    updateRelayConversationMeta();
    reconcileContactsForCurrentAccount();
    syncAccountDialogFromControls();
  }

  function showAccountStartIfRequired(required) {
    setAccountGateRequired(required);
    if (required) {
      openAccountDialog({ required: true });
    }
  }

  function setAccountGateRequired(required) {
    state.accountGateRequired = required === true;
    document.body.classList.toggle("account-gate", state.accountGateRequired);
    el.closeAccountDialogButton.hidden = state.accountGateRequired;
    el.cancelAccountDialogButton.hidden = state.accountGateRequired;
    updateAccountDialogMode();
    updateConnectButtonAvailability();
  }

  function openAccountDialog(options = {}) {
    if (options.required === true) {
      setAccountGateRequired(true);
    } else {
      setAccountGateRequired(state.accountGateRequired);
    }
    syncAccountDialogFromControls();
    el.dialogAccountStatus.textContent = state.accountGateRequired
      ? t("account.start_required", "Sign in or create an account before Teletyptel opens.")
      : accountDialogStatusText("account.ready", "Enter or create an account profile, then connect.");
    el.accountDialog.hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      (state.accountGateRequired ? el.dialogJidInput : (el.dialogJidInput.value ? el.dialogPasswordInput : el.dialogJidInput)).focus();
    }, 0);
  }

  function updateAccountDialogMode() {
    const startMode = state.accountGateRequired === true;
    el.accountDialog.classList.toggle("account-start-dialog", startMode);
    el.accountDialogTitle.textContent = startMode
      ? t("account.start_title", "Sign in")
      : t("account.dialog_title", "Account and password");
    el.accountDialogSubtitle.textContent = startMode
      ? t("account.start_subtitle", "Use your XMPP account. New users can create an account.")
      : t("account.dialog_subtitle", "Use a real XMPP JID, password and server settings.");
    el.dialogRealAccountTitle.textContent = startMode
      ? t("section.sign_in", "Sign in")
      : t("section.real_account", "Real account");
    el.dialogAdvancedDetails.open = !startMode;
    el.dialogSaveAccountButton.hidden = startMode;
    el.dialogConnectButton.hidden = !startMode && !state.developerMode;
    el.dialogConnectButton.textContent = startMode
      ? t("button.sign_in", "Sign in")
      : t("button.save_connect", "Save and connect");
    el.dialogCreateAccountButton.textContent = startMode
      ? t("button.sign_up", "New account")
      : t("button.create_account", "Create account");
  }

  function closeAccountDialog() {
    if (state.accountGateRequired) {
      return;
    }

    el.accountDialog.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function closeAccountDialogOnBackdrop(event) {
    if (event.target === el.accountDialog) {
      closeAccountDialog();
    }
  }

  function closeAccountDialogOnEscape(event) {
    if (event.key === "Escape" && !el.accountDialog.hidden) {
      closeAccountDialog();
    }
  }

  function syncAccountDialogFromControls() {
    if (!el.accountDialog) {
      return;
    }

    el.dialogSessionProfileInput.value = el.sessionProfileInput.value;
    el.dialogDisplayNameInput.value = state.accountGateRequired ? "" : el.displayNameInput.value;
    el.dialogJidInput.value = stripGeneratedResourceSuffix(el.jidInput.value.trim());
    el.dialogPasswordInput.value = el.passwordInput.value;
    el.dialogRememberPasswordToggle.checked = el.rememberPasswordToggle.checked || state.accountGateRequired;
    el.dialogXmppDomainInput.value = state.account?.xmppDomain || domainFromJid(el.dialogJidInput.value);
    el.dialogXmppHostInput.value = state.account?.xmppHost || el.dialogXmppDomainInput.value || "localhost";
    el.dialogXmppPortInput.value = String(state.account?.xmppPort || 5222);
    el.dialogXmppTlsModeInput.value = normalizeTlsMode(state.account?.xmppTlsMode || "starttls");
    el.dialogRelayUrlInput.value = el.relayUrlInput.value;
    el.dialogXmppUrlInput.value = el.xmppUrlInput.value;
    el.dialogProviderInput.value = el.providerInput.value;
    el.dialogLanguageInput.value = el.languageInput.value;
    el.dialogPeerInput.value = el.peerInput.value;
    el.dialogPhoneInput.value = el.phoneInput.value;
  }

  function applyAccountDialogToControls(options = {}) {
    const jid = stripGeneratedResourceSuffix(el.dialogJidInput.value.trim());
    const displayName = el.dialogDisplayNameInput.value.trim();

    if (!isLikelyJid(jid)) {
      throw accountDialogError("dialogJidInput", t("account.invalid_jid", "Enter a valid JID, for example edward@localhost."));
    }

    if (options.requirePassword === true && !el.dialogPasswordInput.value) {
      throw accountDialogError("dialogPasswordInput", t("account.password_required", "Enter a password for a real server account."));
    }

    const xmppPort = normalizeXmppPort(el.dialogXmppPortInput.value);
    const xmppDomain = el.dialogXmppDomainInput.value.trim() || domainFromJid(jid);
    const xmppHost = el.dialogXmppHostInput.value.trim() || xmppDomain;

    el.sessionProfileInput.value = sanitizeSessionProfile(el.dialogSessionProfileInput.value);
    el.displayNameInput.value = displayName || jid.split("@")[0] || "Teletyptel";
    el.jidInput.value = jid;
    el.passwordInput.value = el.dialogPasswordInput.value;
    el.rememberPasswordToggle.checked = el.dialogRememberPasswordToggle.checked;
    el.relayUrlInput.value = el.dialogRelayUrlInput.value.trim() || el.relayUrlInput.value;
    el.xmppUrlInput.value = el.dialogXmppUrlInput.value.trim() || el.xmppUrlInput.value;
    el.providerInput.value = el.dialogProviderInput.value.trim() || "example-provider";
    el.languageInput.value = normalizeLanguageCode(el.dialogLanguageInput.value);
    el.peerInput.value = el.dialogPeerInput.value.trim() || el.peerInput.value;
    el.phoneInput.value = el.dialogPhoneInput.value.trim();

    if (!state.account) {
      state.account = currentAccountProfile();
    }

    state.account = {
      ...state.account,
      accountId: state.accountGateRequired ? accountIdFromJid(jid) : state.account.accountId || accountIdFromJid(jid),
      displayName: el.displayNameInput.value,
      jid,
      xmppDomain,
      xmppHost,
      xmppPort,
      xmppTlsMode: normalizeTlsMode(el.dialogXmppTlsModeInput.value)
    };

    handleAccountIdentityChanged();
    updateAccountPasswordStatus();
  }

  async function createAccountFromDialog() {
    setAccountDialogBusy(true, t("account.creating", "Creating account profile..."));
    try {
      applyAccountDialogToControls({ requirePassword: true });
      const wasGateRequired = state.accountGateRequired;
      const bareJid = stripGeneratedResourceSuffix(el.jidInput.value.trim());
      state.account = {
        ...state.account,
        accountId: accountIdFromJid(bareJid),
        jid: bareJid
      };
      const result = await saveAccountProfile();
      el.dialogAccountStatus.textContent = accountDialogStatusText("account.created_database", "Account profile created and saved on the server.");
      syncAccountDialogFromControls();
      setAccountGateRequired(false);
      if (wasGateRequired) {
        closeAccountDialog();
        autoConnectIfReady();
      }
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  async function saveAccountDialogProfile(connectAfterSave) {
    setAccountDialogBusy(true, connectAfterSave
      ? t("account.saving_connecting", "Saving account and connecting...")
      : t("account.saving", "Saving account settings..."));
    try {
      const wasGateRequired = state.accountGateRequired;
      applyAccountDialogToControls({ requirePassword: wasGateRequired });
      const result = await saveAccountProfile();
      await loadLanguage(el.languageInput.value);
      el.dialogAccountStatus.textContent = accountDialogStatusText("account.database_saved", "Server account saved");
      syncAccountDialogFromControls();
      setAccountGateRequired(false);
      if (connectAfterSave || wasGateRequired) {
        closeAccountDialog();
      }

      if (connectAfterSave || wasGateRequired) {
        autoConnectIfReady();
      }
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  function setAccountDialogBusy(busy, text = "") {
    el.dialogCreateAccountButton.disabled = busy;
    el.dialogSaveAccountButton.disabled = busy;
    el.dialogConnectButton.disabled = busy;
    if (text) {
      el.dialogAccountStatus.textContent = text;
      el.dialogAccountStatus.scrollIntoView({ block: "nearest" });
    }
  }

  function accountDialogError(fieldId, message) {
    const error = new Error(message);
    error.fieldId = fieldId;
    return error;
  }

  function showAccountDialogError(error) {
    el.dialogAccountStatus.textContent = error.message;
    el.dialogAccountStatus.scrollIntoView({ block: "nearest" });
    const field = error.fieldId ? byId(error.fieldId) : el.dialogJidInput;
    field.focus();
  }

  function accountDialogStatusText(key, fallback) {
    if (state.accountGateRequired) {
      return t(key, fallback);
    }

    const password = el.dialogPasswordInput.value
      ? (el.dialogRememberPasswordToggle.checked ? t("account.password_saved", "account kept for this browser session") : t("account.password_session", "password only this session"))
      : t("account.no_password", "no password");
    return `${t(key, fallback)} - ${el.dialogJidInput.value || t("account.no_jid", "no JID")} - ${password}`;
  }

  function accountIdFromJid(jid) {
    const bare = stripGeneratedResourceSuffix(jid).toLowerCase();
    const normalized = bare.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized ? `xmpp-${normalized}` : `local-${state.sessionProfile}`;
  }

  function isLikelyJid(jid) {
    const bare = stripGeneratedResourceSuffix(jid);
    return /^[^@\s]+@[^@\s]+$/u.test(bare);
  }

  function reconcileContactsForCurrentAccount() {
    const activeId = state.activeConversationId;
    state.conversations = state.conversations.filter((conversation) => !isOwnContact(conversation));
    ensureDefaultCounterpartContact();

    if (activeId && !state.conversations.some((conversation) => conversation.id === activeId)) {
      state.activeConversationId = null;
      state.previousText = "";
      el.messageInput.value = "";
    }

    renderConversations();
    renderActiveConversation();
  }

  function ensureDefaultCounterpartContact() {
    const counterpart = defaultCounterpartForCurrentAccount();
    if (!counterpart || isOwnPeer(counterpart.peer)) {
      return;
    }

    const existing = state.conversations.find((conversation) => addressMatches(conversation.peer, counterpart.peer));
    if (existing) {
      existing.name = counterpart.name;
      existing.nameKey = counterpart.nameKey;
      existing.kind = "contact";
      existing.avatarColor = counterpart.avatarColor || existing.avatarColor;
      existing.avatarDataUrl = counterpart.avatarDataUrl || existing.avatarDataUrl;
      return;
    }

    const conversation = {
      ...counterpart,
      kind: "contact",
      presence: "offline",
      meta: "Offline",
      messages: [],
      remoteText: "",
      remoteFrom: "",
      remoteDraftUpdatedAt: null
    };
    const firstGroupIndex = state.conversations.findIndex((item) => item.kind === "group");
    if (firstGroupIndex === -1) {
      state.conversations.push(conversation);
      return;
    }

    state.conversations.splice(firstGroupIndex, 0, conversation);
  }

  function defaultCounterpartForCurrentAccount() {
    const self = currentBareJid();
    if (!self) {
      return null;
    }

    const local = self.split("@")[0];
    if (local === "tester") {
      return {
        id: "edward",
        name: "Edward",
        nameKey: "conversation.edward",
        peer: "edward@localhost",
        avatarColor: "#0f766e"
      };
    }

    if (local === "edward") {
      return {
        id: "tester",
        name: "Tester",
        nameKey: "conversation.tester",
        peer: "tester@localhost",
        avatarColor: "#2563eb"
      };
    }

    return null;
  }

  function applySessionAccountDefaults(defaultAccount, savedAccount) {
    if (savedAccount || state.sessionProfile === "default") {
      return defaultAccount;
    }

    const localPart = sessionProfileToJidLocalPart(state.sessionProfile);
    return {
      ...defaultAccount,
      accountId: `local-${state.sessionProfile}`,
      displayName: sessionProfileToDisplayName(state.sessionProfile),
      jid: `${localPart}@localhost/web`,
      peer: defaultAccount.peer ?? "relay@localhost"
    };
  }

  function sessionProfileToJidLocalPart(profile) {
    const localPart = sanitizeSessionProfile(profile).replace(/_/g, "-");
    return localPart === "default" ? "edward" : localPart;
  }

  function sessionProfileToDisplayName(profile) {
    const normalized = sanitizeSessionProfile(profile);
    if (normalized === "default") {
      return "Edward";
    }

    return normalized
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Teletyptel";
  }

  function mergeAccountProfiles(defaultAccount, savedAccount) {
    if (!savedAccount) {
      return defaultAccount;
    }

    return {
      ...defaultAccount,
      ...savedAccount,
      providerId: savedAccount.providerId || defaultAccount.providerId,
      savedInSession: true
    };
  }

  function loadSavedAccountProfile(profile = state.sessionProfile) {
    const key = accountStorageKeyFor(profile);
    const saved = sessionStorage.getItem(key);
    if (!saved) {
      return null;
    }

    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  }

  function currentAccountProfile() {
    return {
      accountId: state.account?.accountId ?? `local-${state.sessionProfile}`,
      sessionProfile: state.sessionProfile,
      jid: stripGeneratedResourceSuffix(el.jidInput.value.trim()),
      displayName: el.displayNameInput.value.trim() || "Me",
      avatarDataUrl: currentAvatarDataUrl(),
      avatarColor: currentAvatarColor(),
      rememberPassword: el.rememberPasswordToggle.checked,
      password: el.passwordInput.value,
      phoneNumber: el.phoneInput.value.trim(),
      providerId: el.providerInput.value.trim() || state.account?.providerId || "example-provider",
      accessibilityProfileId: state.account?.accessibilityProfileId ?? "default-live-text",
      preferredLanguage: el.languageInput.value,
      relayWebSocket: el.relayUrlInput.value.trim(),
      xmppWebSocket: el.xmppUrlInput.value.trim(),
      xmppHost: state.account?.xmppHost || domainFromJid(el.jidInput.value.trim()),
      xmppPort: state.account?.xmppPort || 5222,
      xmppDomain: state.account?.xmppDomain || domainFromJid(el.jidInput.value.trim()),
      xmppTlsMode: normalizeTlsMode(state.account?.xmppTlsMode || "starttls"),
      peer: el.peerInput.value.trim()
    };
  }

  async function saveAccountProfile() {
    const profile = currentAccountProfile();
    const account = await saveDatabaseAccount(profile);
    state.account = { ...state.account, ...profile, ...account, savedInDatabase: true };
    storeServerAccountSession(state.account, profile.rememberPassword);
    el.jidInput.value = createUniqueJid(state.account.jid);
    updateAccountAvatarPreview();
    updateRelayConversationMeta();
    reconcileContactsForCurrentAccount();
    updateAccountStatus(t("account.database_saved", "Server account saved"));
    appendDebug("account", `Server saved ${el.jidInput.value}`);
    setAccountReady(true);
    return { profile: state.account, databaseSaved: true };
  }

  async function saveDatabaseAccount(profile) {
    const response = await fetch(accountApiPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...profile, action: "save" })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`));
    }

    appendDebug("account-db", `Saved ${payload.account.jid}`);
    return payload.account;
  }

  function storeServerAccountSession(account, keepForBrowserSession) {
    const key = accountStorageKeyFor(state.sessionProfile);
    if (keepForBrowserSession !== true) {
      sessionStorage.removeItem(key);
      return;
    }

    sessionStorage.setItem(key, JSON.stringify({
      accountId: account.accountId,
      jid: account.jid,
      sessionProfile: state.sessionProfile
    }));
  }

  function accountApiErrorText(error) {
    if (error === "invalid_credentials") {
      return t("account.invalid_credentials", "The server rejected this JID or password.");
    }

    if (error === "not_authenticated") {
      return t("account.not_authenticated", "Sign in again before loading this server account.");
    }

    if (error === "password_required") {
      return t("account.password_required", "Enter a password for a real server account.");
    }

    if (error === "missing_jid") {
      return t("account.invalid_jid", "Enter a valid JID, for example edward@localhost.");
    }

    return `${t("account.server_save_failed", "Server account could not be saved")}: ${error}`;
  }

  function resetAccountProfile() {
    sessionStorage.removeItem(accountStorageKeyFor(state.sessionProfile));
    sessionStorage.removeItem(clientInstanceStorageKeyFor(state.sessionProfile));
    updateAccountStatus(t("account.reset_reload", "Account reset; reload to restore defaults"));
    appendDebug("account", "Server account session cleared");
    location.reload();
  }

  function handleAccountIdentityChanged() {
    if (!state.account) {
      return;
    }

    state.account.displayName = el.displayNameInput.value.trim() || "Me";
    state.account.jid = stripGeneratedResourceSuffix(el.jidInput.value.trim());
    if (!state.account.avatarColor) {
      state.account.avatarColor = avatarColorFor(`${state.account.displayName}:${state.account.jid}`);
      el.avatarColorInput.value = state.account.avatarColor;
    }

    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function handleAvatarColorChanged() {
    if (!state.account) {
      state.account = currentAccountProfile();
    }

    state.account.avatarColor = normalizeAvatarColor(el.avatarColorInput.value);
    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function handleAvatarFileSelected() {
    const file = el.avatarFileInput.files?.[0] ?? null;
    el.avatarFileInput.value = "";
    if (!file) {
      return;
    }

    if (!isSupportedAvatarFile(file)) {
      updateAccountStatus(t("avatar.unsupported", "Choose a PNG, JPEG, GIF, WebP or SVG avatar."));
      return;
    }

    if (file.size > avatarMaxBytes) {
      updateAccountStatus(t("avatar.file_too_large", "Avatar file is too large. Choose an image up to 256 KB."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = String(reader.result ?? "");
      if (!isValidAvatarDataUrl(dataUrl)) {
        updateAccountStatus(t("avatar.read_failed", "Avatar could not be read."));
        return;
      }

      if (!state.account) {
        state.account = currentAccountProfile();
      }

      state.account.avatarDataUrl = dataUrl;
      updateAccountAvatarPreview();
      renderConversations();
      renderActiveConversation();
      updateAccountStatus(t("avatar.changed_save", "Avatar changed; save the account to keep it."));
      if (isRelayConnected()) {
        sendPresence("online");
      }
    });
    reader.addEventListener("error", () => updateAccountStatus(t("avatar.read_failed", "Avatar could not be read.")));
    reader.readAsDataURL(file);
  }

  function clearAccountAvatar() {
    if (!state.account) {
      state.account = currentAccountProfile();
    }

    state.account.avatarDataUrl = "";
    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    updateAccountStatus(t("avatar.changed_save", "Avatar changed; save the account to keep it."));
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function isSupportedAvatarFile(file) {
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return type.startsWith("image/")
      || [".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"].some((extension) => name.endsWith(extension));
  }

  function switchBrowserSession() {
    const profile = sanitizeSessionProfile(el.sessionProfileInput.value);
    navigateToSessionProfile(profile);
  }

  function openSecondBrowserSession() {
    const profile = state.sessionProfile === "session-2" ? "session-1" : "session-2";
    const url = sessionProfileUrl(profile);
    window.open(url.toString(), "_blank", "noopener");
  }

  function navigateToSessionProfile(profile) {
    const normalized = sanitizeSessionProfile(profile);
    sessionStorage.setItem(sessionProfileStorageKey, normalized);
    location.href = sessionProfileUrl(normalized).toString();
  }

  function sessionProfileUrl(profile) {
    const url = new URL(location.href);
    url.searchParams.set("profile", sanitizeSessionProfile(profile));
    return url;
  }

  function updateAccountStatus(text) {
    const passwordState = passwordStatusText();
    el.accountStatus.textContent = `${text} - ${t("account.session", "session")}: ${state.sessionProfile} - ${el.jidInput.value || t("account.no_jid", "no JID")} - ${passwordState}`;
  }

  function updateAccountPasswordStatus() {
    updateAccountStatus(accountStatusPrefix());
  }

  function passwordStatusText() {
    if (!el.passwordInput.value) {
      return t("account.no_password", "no password");
    }

    return el.rememberPasswordToggle.checked
      ? t("account.password_saved", "account kept for this browser session")
      : t("account.password_session", "password only this session");
  }

  function updateRelayConversationMeta() {
    const conversation = activeConversation();
    if (conversation && el.peerInput.value.trim()) {
      conversation.peer = el.peerInput.value.trim();
      conversation.meta = conversationMeta(conversation);
      renderConversations();
      renderActiveConversation();
    }

    updateAccountStatus(accountStatusPrefix());
  }

  function accountStatusPrefix() {
    if (state.account?.savedInDatabase) {
      return t("account.database_loaded", "Server account loaded");
    }

    return sessionStorage.getItem(accountStorageKeyFor(state.sessionProfile))
      ? t("account.server_session", "Server account session")
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
      ...(state.provider?.announcements ? [{ id: "news", title: t("tab.news", "News"), type: "builtin" }] : []),
      { id: "checklist", title: t("tab.checklist", "Checklist"), type: "builtin" },
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
      renderContactsTab(card);
    } else if (tab.id === "accessibility") {
      renderAccessibilityTab(card);
    } else if (tab.id === "news") {
      renderNewsTab(card);
    } else if (tab.id === "checklist") {
      renderChecklistTab(card);
    } else {
      card.appendChild(createTextBlock(tab.title, t("tab.builtin_text", "Built-in Teletyptel tab.")));
    }

    el.tabPanelBody.appendChild(card);
  }

  function renderContactsTab(card) {
    card.appendChild(createTextBlock(t("tab.contacts", "Contacts"), t("tab.contacts_text", "Contacts will use XMPP roster and provider address book adapters.")));

    const section = document.createElement("div");
    section.className = "blocked-contact-list";
    const title = document.createElement("strong");
    title.textContent = t("contacts.blocked_title", "Blocked contacts");
    section.appendChild(title);

    const blockedContacts = blockedContactEntries();
    if (!blockedContacts.length) {
      const empty = document.createElement("p");
      empty.className = "blocked-contact-empty";
      empty.textContent = t("contacts.blocked_empty", "No blocked contacts.");
      section.appendChild(empty);
      card.appendChild(section);
      return;
    }

    for (const conversation of blockedContacts) {
      const row = document.createElement("div");
      row.className = "blocked-contact-row";

      const text = document.createElement("div");
      text.className = "blocked-contact-text";
      const name = document.createElement("strong");
      name.textContent = conversationDisplayName(conversation);
      const peer = document.createElement("span");
      peer.textContent = conversation.peer;
      text.append(name, peer);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = t("button.unblock_contact", "Unblock");
      button.addEventListener("click", () => toggleBlockConversation(conversation));

      row.append(createAvatarElement(conversation, "avatar-list"), text, button);
      section.appendChild(row);
    }

    card.appendChild(section);
  }

  function renderAccessibilityTab(card) {
    card.appendChild(createTextBlock(
      t("tab.accessibility", "Accessibility"),
      t("tab.accessibility_text", "Live RTT, captions, speech, location and provider bridges stay opt-in and visible.")));
    renderCapabilities(card, ["rtt:publish", "caption:local", "caption:share", "xep-0080:geoloc"]);

    const locationPanel = document.createElement("section");
    locationPanel.className = "location-panel";

    const header = document.createElement("div");
    header.className = "location-header";
    const title = document.createElement("strong");
    title.textContent = t("location.title", "Location sharing");
    const status = document.createElement("span");
    status.textContent = locationStatusText();
    header.append(title, status);

    const actions = document.createElement("div");
    actions.className = "button-row location-actions";
    const requestButton = createActionButton(t("button.location_request", "Get browser location"), requestBrowserLocation);
    const shareButton = createActionButton(t("button.location_share_once", "Share once"), shareLocationOnce);
    const liveButton = createActionButton(
      state.location.live
        ? t("button.location_live_on", "Live sharing on")
        : t("button.location_start_live", "Start live sharing"),
      () => state.location.live ? stopLocationSharing() : startLiveLocationSharing());
    liveButton.classList.toggle("selected", state.location.live);
    const stopButton = createActionButton(t("button.location_stop", "Stop sharing"), stopLocationSharing);
    const exportButton = createActionButton(t("button.location_export_pidf", "Export PIDF-LO"), exportPidfLoLocation);
    shareButton.disabled = !state.location.current || !hasActiveConversation();
    liveButton.disabled = !hasActiveConversation();
    stopButton.disabled = !state.location.live && !state.location.current;
    exportButton.disabled = state.location.current?.lat == null || state.location.current?.lon == null;
    actions.append(requestButton, shareButton, liveButton, stopButton, exportButton);

    const warningList = document.createElement("div");
    warningList.className = "location-warnings";
    for (const warning of locationWarnings()) {
      const item = document.createElement("span");
      item.textContent = warning;
      warningList.appendChild(item);
    }

    const rows = createDefinitionList(locationDefinitionRows());
    rows.classList.add("location-details");

    locationPanel.append(header, actions, warningList, rows);
    card.appendChild(locationPanel);
  }

  function renderNewsTab(card) {
    const announcements = state.provider?.announcements;
    const items = Array.isArray(announcements?.items) ? announcements.items : [];
    card.appendChild(createTextBlock(
      t("tab.news", "News"),
      t("tab.news_text", "Provider announcements through XEP-0060 PubSub.")));
    card.appendChild(createDefinitionList([
      [t("news.node", "Node"), announcements?.node ?? "urn:tiedragon:teletyptel:announcements"],
      [t("news.items", "Items"), String(items.length)]
    ]));

    const list = document.createElement("div");
    list.className = "announcement-list";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "announcement-empty";
      empty.textContent = t("news.empty", "No announcements.");
      list.appendChild(empty);
      card.appendChild(list);
      return;
    }

    for (const announcement of items) {
      const item = document.createElement("article");
      item.className = "announcement-item";

      const title = document.createElement("strong");
      title.textContent = announcement.title ?? announcement.id ?? t("tab.news", "News");

      const meta = document.createElement("span");
      meta.className = "announcement-meta";
      meta.textContent = [
        announcement.category,
        announcement.priority,
        announcement.published ? new Date(announcement.published).toLocaleString() : null
      ].filter(Boolean).join(" - ");

      const summary = document.createElement("p");
      summary.textContent = announcement.summary ?? "";
      item.append(title);
      if (meta.textContent) {
        item.appendChild(meta);
      }

      item.appendChild(summary);
      if (announcement.link) {
        const link = document.createElement("a");
        link.href = announcement.link;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = t("news.link", "Open");
        item.appendChild(link);
      }

      list.appendChild(item);
    }

    card.appendChild(list);
  }

  function createActionButton(text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => {
      Promise.resolve(handler()).catch((error) => {
        state.location.error = error.message;
        setConnectionStatus(`${t("location.failed", "Location failed")}: ${error.message}`, "danger");
        refreshOpenTabPanel();
      });
    });
    return button;
  }

  function renderChecklistTab(card) {
    card.appendChild(createTextBlock(
      t("tab.checklist", "Checklist"),
      t("tab.checklist_text", "Visible progress for the current Teletyptel alpha. The full checklist is in docs/IMPLEMENTATION_CHECKLIST.md.")));

    const items = [
      [true, "RFC 6120/6121", t("checklist.xmpp_core", "XMPP core, TLS, SASL, roster, presence and chat models")],
      [true, "XEP-0301", t("checklist.rtt", "Real-time text sending, receiving and per-contact state")],
      [true, "Web UI", t("checklist.web_ui", "Browser chat UI with light/dark mode, contacts, groups and smileys")],
      [true, "Accounts", t("checklist.accounts", "Server account profile, MySQL account API and language preference")],
      [true, "XEP-0363", t("checklist.file_upload", "Local file upload plus XMPP HTTP upload slot helpers")],
      [true, "Jingle", t("checklist.calls", "Audio/video calls with camera, microphone, sound, volume and live device switching")],
      [true, "XEP-0084", t("checklist.avatars", "Account avatar, contact avatar cache and avatar presence")],
      [true, "XEP-0191", t("checklist.blocking", "Block and unblock contacts, with blocked chat, RTT and calls filtered")],
      [true, "XEP-0080", t("checklist.location", "Opt-in browser location sharing with XEP-0080 and PIDF-LO export")],
      [true, "XEP-0060", t("checklist.pubsub_news", "Provider news and announcements through PubSub")],
      [true, "ProtoXEP RTT Sync", t("checklist.jingle_rtt_sync", "Jingle co-session real-time text datachannel with XEP-0301 fallback")],
      [false, "Roster", t("checklist.roster", "Replace demo contact list with real XMPP roster-backed contacts")],
      [false, "OMEMO", t("checklist.omemo", "Finish encryption sessions, trust model and interoperability smoke")],
      [false, "Mobile", t("checklist.mobile", "Android and iOS WebView packaging smoke tests")]
    ];

    const list = document.createElement("ul");
    list.className = "checklist";
    for (const [done, label, text] of items) {
      const item = document.createElement("li");
      item.className = done ? "done" : "open";

      const mark = document.createElement("span");
      mark.className = "checklist-mark";
      mark.textContent = done ? "✓" : "□";

      const content = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = label;
      content.append(strong, ` ${text}`);
      item.append(mark, content);
      list.appendChild(item);
    }

    card.appendChild(list);
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

  async function requestBrowserLocation() {
    if (!navigator.geolocation?.getCurrentPosition) {
      state.location.error = t("location.unsupported", "Browser location is not available.");
      refreshOpenTabPanel();
      throw new Error(state.location.error);
    }

    state.location.error = "";
    setConnectionStatus(t("location.requesting", "Requesting browser location..."), "warn");
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, geolocationOptions());
    });
    state.location.current = positionToLocation(position, "browser-geolocation");
    state.location.permission = "granted";
    setConnectionStatus(t("location.ready", "Location ready; share only when you choose it."), "good");
    refreshOpenTabPanel();
    return state.location.current;
  }

  async function shareLocationOnce() {
    const location = state.location.current ?? await requestBrowserLocation();
    sendLocationToActiveConversation(location, "share");
  }

  async function startLiveLocationSharing() {
    if (!navigator.geolocation?.watchPosition) {
      state.location.error = t("location.unsupported", "Browser location is not available.");
      refreshOpenTabPanel();
      throw new Error(state.location.error);
    }

    const firstLocation = state.location.current ?? await requestBrowserLocation();
    sendLocationToActiveConversation(firstLocation, "live");
    stopLocationWatchOnly();
    state.location.live = true;
    state.location.watchId = navigator.geolocation.watchPosition(
      (position) => {
        state.location.current = positionToLocation(position, "browser-geolocation");
        const now = Date.now();
        if (now - state.location.lastLiveSentAt >= state.location.settings.liveIntervalMs) {
          sendLocationToActiveConversation(state.location.current, "live");
        }

        refreshOpenTabPanel();
      },
      (error) => {
        state.location.error = geolocationErrorText(error);
        setConnectionStatus(state.location.error, "warn");
        refreshOpenTabPanel();
      },
      geolocationOptions());
    setConnectionStatus(t("location.live_started", "Live location sharing started."), "good");
    refreshOpenTabPanel();
  }

  function stopLocationSharing() {
    stopLocationWatchOnly();
    state.location.live = false;
    sendLocationStopped();
    setConnectionStatus(t("location.stopped", "Location sharing stopped."), "warn");
    refreshOpenTabPanel();
  }

  function stopLocationWatchOnly() {
    if (state.location.watchId !== null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(state.location.watchId);
    }

    state.location.watchId = null;
  }

  function sendLocationToActiveConversation(location, action) {
    const conversation = activeConversation();
    if (!location || !conversation) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (isBlockedConversation(conversation)) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    const text = locationMessageText(location);
    const xml = createGeolocXml(location);
    if (isRelayConnected()) {
      const envelope = createRelayEnvelope("location", text, xml, conversation.peer);
      envelope.locationAction = action;
      envelope.location = publicLocationPayload(location);
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("location-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const iq = createGeolocPublishIq(location);
      state.xmppSocket.send(iq);
      appendDebug("C", "geoloc publish redacted");
    }

    if (action === "live") {
      state.location.sharedConversationId = conversation.id;
    }

    state.location.lastSharedAt = new Date();
    state.location.lastLiveSentAt = Date.now();
    addMessage("self", text, action === "live" ? "location live" : "location", null, null, conversation.id, location);
    refreshOpenTabPanel();
  }

  function sendLocationStopped() {
    const conversation = state.location.sharedConversationId
      ? state.conversations.find((item) => item.id === state.location.sharedConversationId)
      : activeConversation();

    if (isRelayConnected() && conversation && !isBlockedConversation(conversation)) {
      const envelope = createRelayEnvelope("location", t("location.stopped_message", "Location sharing stopped."), createEmptyGeolocXml(), conversation.peer);
      envelope.locationAction = "stop";
      envelope.location = null;
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("location-out", JSON.stringify(redactEnvelopeForLog(envelope)));
      addMessage("self", t("location.stopped_message", "Location sharing stopped."), "location", null, null, conversation.id);
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const iq = createGeolocClearIq();
      state.xmppSocket.send(iq);
      appendDebug("C", iq);
    }

    state.location.sharedConversationId = null;
  }

  function exportPidfLoLocation() {
    const location = state.location.current;
    if (location?.lat == null || location?.lon == null) {
      setConnectionStatus(t("location.no_coordinates", "No coordinates available."), "warn");
      return;
    }

    const xml = createPidfLoXml(location);
    appendDebug("pidf-lo", xml);
    navigator.clipboard?.writeText(xml).then(
      () => setConnectionStatus(t("location.pidf_copied", "PIDF-LO copied to clipboard."), "good"),
      () => setConnectionStatus(t("location.pidf_logged", "PIDF-LO written to Debug XML."), "good"));
  }

  function geolocationOptions() {
    return {
      enableHighAccuracy: state.location.settings.highAccuracy !== false,
      timeout: state.location.settings.timeoutMs,
      maximumAge: state.location.settings.maximumAgeMs
    };
  }

  function positionToLocation(position, source) {
    const coords = position.coords;
    return {
      lat: roundLocationNumber(coords.latitude, 7),
      lon: roundLocationNumber(coords.longitude, 7),
      accuracy: roundLocationNumber(coords.accuracy, 1),
      alt: Number.isFinite(coords.altitude) ? roundLocationNumber(coords.altitude, 1) : null,
      altaccuracy: Number.isFinite(coords.altitudeAccuracy) ? roundLocationNumber(coords.altitudeAccuracy, 1) : null,
      bearing: Number.isFinite(coords.heading) ? roundLocationNumber(coords.heading, 1) : null,
      speed: Number.isFinite(coords.speed) ? roundLocationNumber(coords.speed, 1) : null,
      timestamp: new Date(position.timestamp || Date.now()).toISOString(),
      text: t("location.browser_text", "Browser location shared by explicit consent."),
      source
    };
  }

  function publicLocationPayload(location) {
    return {
      lat: location.lat,
      lon: location.lon,
      accuracy: location.accuracy,
      alt: location.alt,
      altaccuracy: location.altaccuracy,
      bearing: location.bearing,
      speed: location.speed,
      timestamp: location.timestamp,
      text: location.text
    };
  }

  function roundLocationNumber(value, digits) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
  }

  function locationStatusText() {
    if (state.location.live) {
      return t("location.status_live", "Live sharing is on");
    }

    if (state.location.error) {
      return state.location.error;
    }

    if (state.location.current) {
      return t("location.status_ready", "Location is ready, not shared automatically");
    }

    return t("location.status_idle", "Not requested");
  }

  function locationDefinitionRows() {
    const location = state.location.current;
    if (!location) {
      return [
        [t("location.field_permission", "Permission"), state.location.permission],
        [t("location.field_policy", "Policy"), t("location.policy", "Only share after a visible button press.")]
      ];
    }

    return [
      [t("location.field_latitude", "Latitude"), formatCoordinate(location.lat)],
      [t("location.field_longitude", "Longitude"), formatCoordinate(location.lon)],
      [t("location.field_accuracy", "Accuracy"), location.accuracy === null ? "-" : `${location.accuracy} m`],
      [t("location.field_timestamp", "Timestamp"), formatLocationTimestamp(location.timestamp)],
      [t("location.field_source", "Source"), location.source || "browser-geolocation"],
      [t("location.field_last_shared", "Last shared"), state.location.lastSharedAt ? formatTime(state.location.lastSharedAt) : "-"]
    ];
  }

  function locationWarnings() {
    const warnings = [];
    const location = state.location.current;
    if (!navigator.geolocation) {
      warnings.push(t("location.warn_no_browser_api", "This browser has no geolocation API."));
      return warnings;
    }

    if (state.mode === "xmpp") {
      warnings.push(t("location.warn_xmpp_support", "XMPP location depends on server PEP/XEP-0080 support; use service discovery before relying on it."));
    }

    if (!location) {
      warnings.push(t("location.warn_not_shared", "No location is sent until you press Share once or Start live sharing."));
      return warnings;
    }

    const age = Date.now() - Date.parse(location.timestamp);
    if (!Number.isFinite(age) || age > locationStaleAfterMs) {
      warnings.push(t("location.warn_stale", "Location may be stale; request a fresh position before emergency use."));
    }

    if (Number(location.accuracy) > 100) {
      warnings.push(t("location.warn_accuracy", "Accuracy is wider than 100 m."));
    }

    return warnings;
  }

  function geolocationErrorText(error) {
    if (error?.code === 1) {
      return t("location.denied", "Location permission was denied.");
    }

    if (error?.code === 2) {
      return t("location.unavailable", "Location is currently unavailable.");
    }

    if (error?.code === 3) {
      return t("location.timeout", "Location request timed out.");
    }

    return error?.message || t("location.failed", "Location failed");
  }

  function locationMessageText(location) {
    return `${t("location.shared_message", "Location shared")}: ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon)} (${location.accuracy ?? "?"} m)`;
  }

  function formatCoordinate(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "-";
  }

  function formatLocationTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : `${date.toLocaleString()} (${relativeAgeText(date)})`;
  }

  function relativeAgeText(date) {
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  }

  function createGeolocXml(location) {
    return `<geoloc xmlns="${geolocNamespace}">`
      + `<lat>${escapeXml(location.lat)}</lat>`
      + `<lon>${escapeXml(location.lon)}</lon>`
      + (location.accuracy !== null ? `<accuracy>${escapeXml(location.accuracy)}</accuracy>` : "")
      + (location.alt !== null ? `<alt>${escapeXml(location.alt)}</alt>` : "")
      + (location.altaccuracy !== null ? `<altaccuracy>${escapeXml(location.altaccuracy)}</altaccuracy>` : "")
      + (location.bearing !== null ? `<bearing>${escapeXml(location.bearing)}</bearing>` : "")
      + (location.speed !== null ? `<speed>${escapeXml(location.speed)}</speed>` : "")
      + `<timestamp>${escapeXml(location.timestamp)}</timestamp>`
      + `<text>${escapeXml(location.text || t("location.browser_text", "Browser location shared by explicit consent."))}</text>`
      + `</geoloc>`;
  }

  function createEmptyGeolocXml() {
    return `<geoloc xmlns="${geolocNamespace}"/>`;
  }

  function createGeolocPublishIq(location) {
    const id = `geoloc-${Date.now().toString(36)}`;
    return `<iq xmlns="jabber:client" type="set" id="${id}"><pubsub xmlns="http://jabber.org/protocol/pubsub"><publish node="${geolocNamespace}"><item id="current">${createGeolocXml(location)}</item></publish></pubsub></iq>`;
  }

  function createGeolocClearIq() {
    const id = `geoloc-clear-${Date.now().toString(36)}`;
    return `<iq xmlns="jabber:client" type="set" id="${id}"><pubsub xmlns="http://jabber.org/protocol/pubsub"><publish node="${geolocNamespace}"><item id="current">${createEmptyGeolocXml()}</item></publish></pubsub></iq>`;
  }

  function createPidfLoXml(location) {
    const entity = currentBareJid() ? `pres:${currentBareJid()}` : "pres:unknown@localhost";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return `<presence xmlns="urn:ietf:params:xml:ns:pidf" xmlns:gp="urn:ietf:params:xml:ns:pidf:geopriv10" xmlns:bp="urn:ietf:params:xml:ns:pidf:geopriv10:basicPolicy" xmlns:gml="http://www.opengis.net/gml" entity="${escapeXml(entity)}"><tuple id="teletyptel-location"><status><basic>open</basic></status><gp:geopriv><gp:location-info><gml:Point srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>${escapeXml(location.lat)} ${escapeXml(location.lon)}</gml:pos></gml:Point>${location.accuracy !== null ? `<gp:accuracy uom="urn:ogc:def:uom:EPSG::9001">${escapeXml(location.accuracy)}</gp:accuracy>` : ""}</gp:location-info><gp:usage-rules><bp:retransmission-allowed>no</bp:retransmission-allowed><bp:retention-expiry>${escapeXml(expiry)}</bp:retention-expiry></gp:usage-rules><gp:method>GPS</gp:method></gp:geopriv><note>${escapeXml(location.text || "Teletyptel location")}</note><timestamp>${escapeXml(location.timestamp)}</timestamp></tuple></presence>`;
  }

  function connectRelay() {
    if (!state.accountReady || state.accountGateRequired) {
      openAccountDialog({ required: true });
      return;
    }

    if (state.relaySocket && (state.relaySocket.readyState === WebSocket.CONNECTING || state.relaySocket.readyState === WebSocket.OPEN)) {
      return;
    }

    const socket = new WebSocket(el.relayUrlInput.value.trim());
    state.relaySocket = socket;
    updateConnectButtonAvailability();
    setConnectionStatus(t("status.connecting_relay", "Connecting relay"), "warn");
    appendDebug("relay", "Connecting " + el.relayUrlInput.value.trim());

    socket.addEventListener("open", () => {
      setConnectionStatus(t("status.relay_connected", "Relay connected"), "good");
      setDefaultComposerState();
      el.connectButton.disabled = true;
      el.disconnectButton.disabled = false;
      setInfrastructurePresence("online");
      sendPresence("online", { probe: true });
      flushClientLifecycleState("relay-open", true);
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
      state.clientLifecycle.relayLastSent = null;
      setAllContactPresence("offline");
      renderConversations();
      updateConnectButtonAvailability();
      updateComposerAvailability();
    });

    socket.addEventListener("error", () => {
      setConnectionStatus(t("status.relay_error", "Relay error"), "danger");
    });
  }

  function disconnectAll() {
    cleanupCall(true);

    if (state.relaySocket) {
      sendPresence("offline");
      state.relaySocket.close();
    }

    closeXmppWebSocket();
  }

  function toggleCallMenu(menu, trigger) {
    if (trigger.disabled) {
      return;
    }

    const shouldOpen = menu.hidden;
    closeCallMenus();
    menu.hidden = !shouldOpen;
    trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function startCallFromMenu(mediaKind) {
    closeCallMenus();
    startCall(mediaKind);
  }

  function closeCallMenusOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest(".call-menu")) {
      return;
    }

    closeCallMenus();
  }

  function closeCallMenusOnEscape(event) {
    if (event.key === "Escape") {
      closeCallMenus();
    }
  }

  function showConversationContextMenu(event, conversation, anchor = null) {
    if (!canBlockConversation(conversation)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.contextConversationId = conversation.id;
    updateConversationContextMenu();

    const anchorRect = anchor?.getBoundingClientRect();
    const fallbackX = anchorRect ? anchorRect.left + 18 : 12;
    const fallbackY = anchorRect ? anchorRect.top + 18 : 12;
    const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : fallbackX;
    const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : fallbackY;

    const menu = el.conversationContextMenu;
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    el.contextBlockButton.focus();
  }

  function closeConversationContextMenuOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest("#conversationContextMenu")) {
      return;
    }

    closeConversationContextMenu();
  }

  function closeConversationContextMenuOnEscape(event) {
    if (event.key === "Escape") {
      closeConversationContextMenu();
    }
  }

  function closeConversationContextMenu() {
    state.contextConversationId = null;
    el.conversationContextMenu.hidden = true;
  }

  function closeCallMenus() {
    el.startCallMenu.hidden = true;
    el.composerCallMenu.hidden = true;
    el.startCallButton.setAttribute("aria-expanded", "false");
    el.composerCallButton.setAttribute("aria-expanded", "false");
  }

  function setCallButtonsDisabled(disabled) {
    el.startCallButton.disabled = disabled;
    el.composerCallButton.disabled = disabled;
    el.startAudioCallOption.disabled = disabled;
    el.startVideoCallOption.disabled = disabled;
    el.composerAudioCallOption.disabled = disabled;
    el.composerVideoCallOption.disabled = disabled;
    if (disabled) {
      closeCallMenus();
    }
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
      setDefaultComposerState();
      updateComposerAvailability();
      const open = `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${escapeXml(domainFromJid(el.jidInput.value))}" version="1.0"/>`;
      socket.send(open);
      appendDebug("C", open);
      flushClientLifecycleState("xmpp-open", true);
    });

    socket.addEventListener("message", (event) => {
      appendDebug("S", event.data);
      if (String(event.data).includes("urn:xmpp:csi:0")) {
        flushClientLifecycleState("xmpp-csi-feature", true);
      }
      handleXmppIncomingFrame(event.data);
    });

    socket.addEventListener("close", () => {
      el.xmppOpenButton.disabled = false;
      el.xmppCloseButton.disabled = true;
      state.xmppSocket = null;
      state.clientLifecycle.xmppLastSent = null;
      appendDebug("xmpp", "Closed");
      updateComposerAvailability();
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

  function handleXmppIncomingFrame(xmlText) {
    const text = String(xmlText ?? "");
    if (!text.includes("<message")) {
      return;
    }

    let doc;
    try {
      doc = new DOMParser().parseFromString(`<wrapper xmlns="jabber:client">${text}</wrapper>`, "application/xml");
    } catch {
      return;
    }

    if (doc.querySelector("parsererror")) {
      return;
    }

    const messages = Array.from(doc.getElementsByTagNameNS("jabber:client", "message"));
    for (const message of messages) {
      const from = message.getAttribute("from") || "";
      if (!from || isOwnPeer(from)) {
        continue;
      }

      const bodyElement = message.getElementsByTagNameNS("jabber:client", "body")[0];
      if (!bodyElement) {
        continue;
      }

      const conversation = ensureConversationForPeer(from, "contact", displayNameForJid(from));
      if (!conversation) {
        continue;
      }

      conversation.presence = "online";
      const replaceElement = message.getElementsByTagNameNS("urn:xmpp:message-correct:0", "replace")[0];
      const replaceId = replaceElement?.getAttribute("id") || "";
      const messageId = message.getAttribute("id") || null;
      if (replaceId) {
        applyMessageCorrection(conversation, replaceId, bodyElement.textContent || "", "peer", messageId, from);
      } else {
        addMessage("peer", bodyElement.textContent || "", "received", from, null, conversation.id, null, messageId);
      }
    }
  }

  function sendComposerMessage(event) {
    event.preventDefault();
    if (!hasActiveConversation()) {
      return;
    }

    if (isActiveConversationBlocked()) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    const text = el.messageInput.value;
    if (!text.trim()) {
      return;
    }

    const edit = activeEditTarget();
    const outgoingId = createMessageId(edit ? "edit" : "msg");
    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const xml = createMessageStanza(text, outgoingId, edit?.replaceId ?? null);
      state.xmppSocket.send(xml);
      appendDebug("C", xml);
      if (edit) {
        applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
        clearMessageEdit();
      } else {
        addMessage("self", text, "RFC 7395", null, null, null, null, outgoingId);
      }
      el.messageInput.value = "";
      state.previousText = "";
      return;
    }

    sendRelayFinalMessage(text, edit, outgoingId);
  }

  function handleComposerKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      el.composerForm.requestSubmit();
    }
  }

  function sendRelayFinalMessage(text, edit = null, outgoingId = createMessageId("msg")) {
    if (!hasActiveConversation()) {
      return;
    }

    if (isActiveConversationBlocked()) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    if (sendJingleRttSyncPacket("message", text, {
      messageId: outgoingId,
      replaceId: edit?.replaceId ?? null
    })) {
      if (edit) {
        applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
        clearMessageEdit();
      } else {
        addMessage("self", text, "jingle-rtt", null, null, null, null, outgoingId);
      }
      el.messageInput.value = "";
      state.previousText = "";
      state.sequence = 0;
      return;
    }

    if (!state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN) {
      showNotConnectedStatus();
      return;
    }

    const envelope = createRelayEnvelope("message", text, "");
    envelope.messageId = outgoingId;
    if (edit) {
      envelope.replaceId = edit.replaceId;
    }
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    if (edit) {
      applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
      clearMessageEdit();
    } else {
      addMessage("self", text, "sent", null, null, null, null, outgoingId);
    }
    el.messageInput.value = "";
    state.previousText = "";
    state.sequence = 0;
  }

  function sendRttReset() {
    if (!hasActiveConversation()) {
      return;
    }

    if (!activeJingleRttSyncCall() && !isRelayConnected()) {
      showNotConnectedStatus();
      return;
    }

    state.sequence = 0;
    state.previousText = el.messageInput.value;
    if (sendJingleRttSyncPacket("reset", el.messageInput.value)) {
      return;
    }
    sendRttPacket("reset", el.messageInput.value);
  }

  function sendRttEdit() {
    if (!hasActiveConversation() || !el.rttToggle.checked || state.mode !== "relay") {
      return;
    }

    const text = el.messageInput.value;
    const previousText = state.previousText;
    const actions = createDeltaActions(previousText, text);
    state.previousText = text;
    if (sendJingleRttSyncPacket("edit", text, { actions, previousText })) {
      return;
    }
    sendRttPacket("edit", text, actions);
  }

  function sendRttPacket(eventName, text, actions = null) {
    if (!hasActiveConversation() || !state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN || !el.rttToggle.checked) {
      return;
    }

    if (isActiveConversationBlocked()) {
      return;
    }

    const xml = eventName === "edit"
      ? `<rtt xmlns="urn:xmpp:rtt:0" seq="${state.sequence++}">${actions ?? `<t p="0">${escapeXml(text)}</t>`}</rtt>`
      : `<rtt xmlns="urn:xmpp:rtt:0" event="${eventName}" seq="${state.sequence++}"><t p="0">${escapeXml(text)}</t></rtt>`;
    const envelope = createRelayEnvelope("rtt", text, xml);
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("rtt-out", xml);
  }

  function createRelayEnvelope(type, text, xml, to = null) {
    return {
      type,
      text,
      xml,
      clientId: state.clientInstance.id,
      from: currentFromJid(),
      to: to || currentToJid(),
      ...currentAvatarEnvelope(type !== "rtt" && type !== "client-state")
    };
  }

  function sendPresence(presence, options = {}) {
    if (!isRelayConnected()) {
      return;
    }

    const envelope = createRelayEnvelope("presence", "", "", "relay@localhost");
    envelope.presence = presence === "offline" ? "offline" : "online";
    envelope.probe = options.probe === true;
    envelope.responseTo = options.responseTo || null;
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("presence-out", `${envelope.presence} ${envelope.probe ? "probe" : "announce"}`);
  }

  function currentSenderName() {
    return el.displayNameInput.value.trim() || "Me";
  }

  function currentAvatarDataUrl() {
    return isValidAvatarDataUrl(state.account?.avatarDataUrl) ? state.account.avatarDataUrl : "";
  }

  function currentAvatarColor() {
    return normalizeAvatarColor(el.avatarColorInput.value || state.account?.avatarColor || avatarColorFor(currentSenderName()));
  }

  function currentAvatarEnvelope(includeDataUrl = false) {
    const avatar = {
      displayName: currentSenderName(),
      avatarColor: currentAvatarColor()
    };
    const dataUrl = currentAvatarDataUrl();
    if (includeDataUrl && dataUrl) {
      avatar.avatarDataUrl = dataUrl;
    }

    return avatar;
  }

  function updateAccountAvatarPreview() {
    renderAvatarInto(el.accountAvatarPreview, {
      displayName: currentSenderName(),
      avatarDataUrl: currentAvatarDataUrl(),
      avatarColor: currentAvatarColor()
    });
  }

  function renderAvatarInto(container, source) {
    if (!container) {
      return;
    }

    container.replaceChildren();
    const { dataUrl, color, initials } = avatarVisual(source);
    container.style.setProperty("--avatar-bg", color);
    container.title = source?.displayName || source?.name || source?.peer || initials;
    if (dataUrl) {
      const image = document.createElement("img");
      image.src = dataUrl;
      image.alt = "";
      image.decoding = "async";
      container.appendChild(image);
      return;
    }

    container.textContent = initials;
  }

  function createAvatarElement(source, className = "") {
    const avatar = document.createElement("span");
    avatar.className = ["avatar", className].filter(Boolean).join(" ");
    avatar.setAttribute("aria-hidden", "true");
    renderAvatarInto(avatar, source);
    return avatar;
  }

  function avatarVisual(source) {
    const name = source?.displayName || (source ? conversationDisplayName(source) : "") || source?.name || source?.peer || "TX";
    const dataUrl = isValidAvatarDataUrl(source?.avatarDataUrl) ? source.avatarDataUrl : "";
    const color = normalizeAvatarColor(source?.avatarColor || avatarColorFor(`${name}:${source?.peer ?? ""}`));
    return {
      dataUrl,
      color,
      initials: avatarInitials(name)
    };
  }

  function avatarInitials(value) {
    const parts = String(value || "TX")
      .replace(/@.*/, "")
      .split(/[\s._-]+/g)
      .filter(Boolean);
    const letters = parts.length > 1
      ? parts.slice(0, 2).map((part) => part[0]).join("")
      : (parts[0] || "TX").slice(0, 2);
    return letters.toUpperCase();
  }

  function avatarColorFor(value) {
    const colors = ["#2563eb", "#0f766e", "#7c3aed", "#b45309", "#be123c", "#047857", "#1d4ed8", "#9333ea"];
    const text = String(value || "teletyptel");
    let hash = 0;
    for (let index = 0; index < text.length; index++) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }

    return colors[hash % colors.length];
  }

  function normalizeAvatarColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2563eb";
  }

  function isValidAvatarDataUrl(value) {
    const text = String(value || "");
    return text.length <= avatarMaxBytes * 2 && /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(text);
  }

  function currentFromJid() {
    return el.jidInput.value.trim() || currentSenderName();
  }

  function currentToJid() {
    const conversation = activeConversation();
    if (conversation?.peer) {
      return conversation.peer;
    }

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
    if (!envelope) {
      return;
    }

    if (envelope.type === "error") {
      appendDebug("relay-error", envelope.message || JSON.stringify(envelope));
      setConnectionStatus(envelope.message || t("status.relay_error", "Relay error"), "danger");
      return;
    }

    if (envelope.type !== "rtt" && envelope.type !== "message" && envelope.type !== "jingle" && envelope.type !== "presence" && envelope.type !== "client-state" && envelope.type !== "location") {
      appendDebug("relay-skip", `Unsupported envelope type ${envelope.type || "unknown"}`);
      return;
    }

    appendDebug("relay-in", envelope.type === "rtt" || envelope.type === "jingle" || envelope.type === "client-state"
      ? envelope.xml || JSON.stringify(redactJingleForLog(envelope))
      : JSON.stringify(redactEnvelopeForLog(envelope)));

    if (envelope.clientId && envelope.clientId === state.clientInstance.id) {
      appendDebug("relay-skip", "Ignored own echoed envelope");
      return;
    }

    if (isBlockedEnvelope(envelope)) {
      appendDebug("block", `Ignored ${envelope.type} from ${envelopeFrom(envelope) || "unknown"}`);
      return;
    }

    if (envelope.type === "jingle") {
      handleJingleEnvelope(envelope);
      return;
    }

    if (envelope.type === "presence") {
      handlePresenceEnvelope(envelope);
      return;
    }

    if (envelope.type === "client-state") {
      handleClientStateEnvelope(envelope);
      return;
    }

    if (envelope.type === "location") {
      handleLocationEnvelope(envelope);
      return;
    }

    if (envelope.type === "message") {
      const conversation = conversationForEnvelope(envelope);
      if (!conversation) {
        return;
      }

      applyEnvelopeIdentity(conversation, envelope);
      conversation.remoteText = "";
      conversation.remoteFrom = envelopeFrom(envelope);
      conversation.remoteDraftUpdatedAt = null;
      conversation.clientState = "active";
      conversation.clientStateUpdatedAt = new Date();
      setPeerPresence(conversation.peer, "online");
      if (envelope.replaceId) {
        applyMessageCorrection(
          conversation,
          String(envelope.replaceId),
          envelope.text ?? "",
          "peer",
          typeof envelope.messageId === "string" ? envelope.messageId : null,
          conversation.remoteFrom);
      } else {
        addMessage(
          "peer",
          envelope.text ?? "",
          "received",
          conversation.remoteFrom,
          envelope.attachment ?? null,
          conversation.id,
          null,
          typeof envelope.messageId === "string" ? envelope.messageId : null);
      }
      return;
    }

    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.remoteText = envelope.text ?? "";
    conversation.remoteFrom = envelopeFrom(envelope);
    conversation.remoteDraftUpdatedAt = new Date();
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    updateRemoteDraftMessage(conversation.id);
  }

  function handlePresenceEnvelope(envelope) {
    const from = envelopeFrom(envelope);
    if (!from || isOwnPeer(from)) {
      return;
    }

    const presence = envelope.presence === "offline" ? "offline" : "online";
    const conversation = ensureConversationForPeer(from, "contact", envelope.displayName || displayNameForJid(from));
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);

    conversation.presence = presence;
    if (presence === "offline") {
      conversation.clientState = null;
      conversation.clientStateUpdatedAt = null;
    }
    renderConversations();
    renderActiveConversation();

    if (presence === "online" && envelope.probe) {
      sendPresence("online", { responseTo: from });
    }
  }

  function handleClientStateEnvelope(envelope) {
    const from = envelopeFrom(envelope);
    if (!from || isOwnPeer(from)) {
      return;
    }

    const clientState = envelope.clientState === "inactive" ? "inactive" : "active";
    const conversation = ensureConversationForPeer(from, "contact", envelope.displayName || displayNameForJid(from));
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.presence = "online";
    conversation.clientState = clientState;
    conversation.clientStateUpdatedAt = new Date();
    renderConversations();
    renderActiveConversation();
  }

  function handleLocationEnvelope(envelope) {
    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.presence = "online";
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    if (envelope.locationAction === "stop") {
      addMessage(
        "peer",
        envelope.text || t("location.stopped_message", "Location sharing stopped."),
        "location",
        envelopeFrom(envelope),
        null,
        conversation.id);
      return;
    }

    const location = normalizeIncomingLocation(envelope.location);
    addMessage(
      "peer",
      envelope.text || (location ? locationMessageText(location) : t("location.shared_message", "Location shared")),
      envelope.locationAction === "live" ? "location live" : "location",
      envelopeFrom(envelope),
      null,
      conversation.id,
      location);
  }

  function normalizeIncomingLocation(location) {
    if (!location || typeof location !== "object") {
      return null;
    }

    const lat = Number(location.lat);
    const lon = Number(location.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      lat,
      lon,
      accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
      alt: Number.isFinite(Number(location.alt)) ? Number(location.alt) : null,
      altaccuracy: Number.isFinite(Number(location.altaccuracy)) ? Number(location.altaccuracy) : null,
      bearing: Number.isFinite(Number(location.bearing)) ? Number(location.bearing) : null,
      speed: Number.isFinite(Number(location.speed)) ? Number(location.speed) : null,
      timestamp: typeof location.timestamp === "string" ? location.timestamp : new Date().toISOString(),
      text: typeof location.text === "string" ? location.text : "",
      source: "xep-0080"
    };
  }

  function applyEnvelopeIdentity(conversation, envelope) {
    if (!conversation || conversation.kind === "group") {
      return;
    }

    if (typeof envelope.displayName === "string" && envelope.displayName.trim()) {
      conversation.name = envelope.displayName.trim();
      delete conversation.nameKey;
    }

    if (typeof envelope.avatarColor === "string" && envelope.avatarColor.trim()) {
      conversation.avatarColor = normalizeAvatarColor(envelope.avatarColor);
    }

    if (isValidAvatarDataUrl(envelope.avatarDataUrl)) {
      conversation.avatarDataUrl = envelope.avatarDataUrl;
    } else if (envelope.avatarDataUrl === "") {
      conversation.avatarDataUrl = "";
    }
  }

  function applyMediaSettingsToControls() {
    el.videoQualityInput.value = state.mediaSettings.videoQuality || "default";
    renderMediaDeviceSelects();
    applyRemoteVolume();
  }

  async function refreshMediaDevices(requestPermission) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMediaStatus(t("media.unsupported", "Media device selection is not available in this browser."));
      return;
    }

    if (requestPermission) {
      await unlockMediaDeviceLabels();
    }

    try {
      state.mediaDevices = await navigator.mediaDevices.enumerateDevices();
      renderMediaDeviceSelects();
      const cameras = state.mediaDevices.filter((device) => device.kind === "videoinput").length;
      const microphones = state.mediaDevices.filter((device) => device.kind === "audioinput").length;
      setMediaStatus(`${t("media.devices_loaded", "Devices loaded")}: ${cameras} ${t("media.cameras", "cameras")}, ${microphones} ${t("media.microphones", "microphones")}`);
    } catch (error) {
      setMediaStatus(`${t("media.load_failed", "Could not load media devices")}: ${error.message}`);
    }
  }

  async function unlockMediaDeviceLabels() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stopStream(stream);
    } catch (error) {
      appendDebug("media-permission", error.message);
      for (const constraints of [{ audio: true, video: false }, { audio: false, video: true }]) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          stopStream(stream);
        } catch {
          // Best effort: labels remain hidden until the browser grants access.
        }
      }
    }
  }

  function renderMediaDeviceSelects() {
    renderDeviceSelect(
      el.cameraInput,
      state.mediaDevices.filter((device) => device.kind === "videoinput"),
      state.mediaSettings.cameraDeviceId,
      t("media.default_camera", "Default camera"),
      t("media.camera", "Camera"));
    renderDeviceSelect(
      el.microphoneInput,
      state.mediaDevices.filter((device) => device.kind === "audioinput"),
      state.mediaSettings.microphoneDeviceId,
      t("media.default_microphone", "Default microphone"),
      t("media.microphone", "Microphone"));
    el.videoQualityInput.value = state.mediaSettings.videoQuality || "default";
  }

  function renderDeviceSelect(select, devices, selectedValue, defaultLabel, fallbackLabel) {
    select.replaceChildren(new Option(defaultLabel, ""));
    devices.forEach((device, index) => {
      select.appendChild(new Option(device.label || `${fallbackLabel} ${index + 1}`, device.deviceId));
    });

    select.value = devices.some((device) => device.deviceId === selectedValue)
      ? selectedValue
      : "";
  }

  function saveMediaSettingsFromControls(announce = true) {
    state.mediaSettings = {
      cameraDeviceId: el.cameraInput.value,
      microphoneDeviceId: el.microphoneInput.value,
      videoQuality: el.videoQualityInput.value || "default",
      remoteVolume: Number.isFinite(Number(state.mediaSettings.remoteVolume))
        ? state.mediaSettings.remoteVolume
        : 1,
      remoteSoundMuted: Boolean(state.mediaSettings.remoteSoundMuted)
    };
    localStorage.setItem(mediaSettingsStorageKey, JSON.stringify(state.mediaSettings));
    if (announce) {
      setMediaStatus(t("media.saved", "Media settings saved. They are used for the next call or preview."));
    }
  }

  async function handleMediaSettingsChange(kind) {
    saveMediaSettingsFromControls(false);
    const call = state.call;
    if (!call?.localStream || !call.pc) {
      setMediaStatus(t("media.saved", "Media settings saved. They are used for the next call or preview."));
      return;
    }

    if (kind === "video" && call.mediaKind !== "video") {
      setMediaStatus(t("media.video_next_call", "Camera settings apply to the next video call."));
      return;
    }

    try {
      setMediaStatus(kind === "audio"
        ? t("media.switching_microphone", "Switching microphone...")
        : t("media.switching_camera", "Switching camera..."));
      await replaceLocalMediaTrack(kind);
      setMediaStatus(kind === "audio"
        ? t("media.microphone_switched", "Microphone switched for this call.")
        : t("media.camera_switched", "Camera switched for this call."));
    } catch (error) {
      setMediaStatus(`${kind === "audio"
        ? t("media.microphone_switch_failed", "Microphone switch failed")
        : t("media.camera_switch_failed", "Camera switch failed")}: ${error.message}`);
    }
  }

  function saveRemoteVolumeFromControl() {
    const value = Number(el.remoteVolumeInput.value);
    state.mediaSettings.remoteVolume = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value / 100))
      : 1;
    state.mediaSettings.remoteSoundMuted = state.mediaSettings.remoteVolume === 0;
    localStorage.setItem(mediaSettingsStorageKey, JSON.stringify(state.mediaSettings));
    applyRemoteVolume();
  }

  function applyRemoteVolume() {
    const rawVolume = Number(state.mediaSettings.remoteVolume ?? 1);
    const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : 1;
    const percent = Math.round(volume * 100);
    const muted = Boolean(state.mediaSettings.remoteSoundMuted) || volume === 0;
    el.remoteVideo.volume = volume;
    el.remoteVideo.muted = muted;
    el.remoteVolumeInput.value = String(percent);
    el.remoteVolumeValue.textContent = `${percent}%`;
    el.muteRemoteAudioButton.textContent = muted
      ? t("button.unmute_sound", "Unmute sound")
      : t("button.mute_sound", "Mute sound");
    el.muteRemoteAudioButton.classList.toggle("selected", muted);
  }

  async function previewMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaStatus(t("call.media_unavailable", "Camera/microphone access is not available."));
      return;
    }

    stopMediaPreview();
    saveMediaSettingsFromControls();

    try {
      const stream = await navigator.mediaDevices.getUserMedia(createMediaConstraints("video"));
      state.mediaPreviewStream = stream;
      el.localVideo.srcObject = stream;
      el.callPanel.hidden = false;
      await refreshMediaDevices(false);
      setMediaStatus(t("media.previewing", "Previewing selected camera and microphone."));
    } catch (error) {
      setMediaStatus(`${t("media.preview_failed", "Preview failed")}: ${error.message}`);
    }
  }

  function stopMediaPreview() {
    if (!state.mediaPreviewStream) {
      return;
    }

    stopStream(state.mediaPreviewStream);
    state.mediaPreviewStream = null;
    if (!state.call?.localStream) {
      el.localVideo.srcObject = null;
    }

    if (!state.call?.localStream && !state.call?.remoteStream) {
      el.callPanel.hidden = true;
    }

    setMediaStatus(t("media.preview_stopped", "Preview stopped."));
  }

  async function startCall(mediaKind) {
    if (!hasActiveConversation()) {
      setCallStatus(t("call.select_contact_first", "Select a contact first."));
      return;
    }

    if (isActiveConversationBlocked()) {
      setCallStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."));
      return;
    }

    if (!isRelayConnected()) {
      showNotConnectedStatus();
      setCallStatus(t("status.not_connected", "Not connected."));
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
        descriptionType: offer.type,
        rttSync: call.rttSync
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
        descriptionType: answer.type,
        rttSync: call.rttSync
      });
      call.incomingOffer = null;
      setCallStatus(jingleRttSyncStatusText(call));
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

  function toggleMicrophoneMute() {
    const tracks = state.call?.localStream?.getAudioTracks() ?? [];
    if (!tracks.length) {
      return;
    }

    const shouldMute = tracks.some((track) => track.enabled);
    for (const track of tracks) {
      track.enabled = !shouldMute;
    }

    updateCallUi();
  }

  function toggleCameraVideo() {
    const call = state.call;
    const tracks = call?.localStream?.getVideoTracks() ?? [];
    if (!call || !tracks.length) {
      return;
    }

    const shouldTurnOff = tracks.some((track) => track.enabled);
    for (const track of tracks) {
      track.enabled = !shouldTurnOff;
    }

    sendJingleEnvelope("session-info", {
      sid: call.sid,
      mediaKind: "video",
      info: shouldTurnOff ? "mute" : "unmute"
    });
    setCallStatus(shouldTurnOff
      ? t("call.camera_off_local", "Camera off")
      : t("call.camera_on_local", "Camera on"));
    updateCallUi();
  }

  function toggleRemoteAudioMute() {
    const rawVolume = Number(state.mediaSettings.remoteVolume ?? 1);
    const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : 1;
    const currentlyMuted = Boolean(state.mediaSettings.remoteSoundMuted) || volume === 0;
    state.mediaSettings.remoteSoundMuted = !currentlyMuted;
    if (currentlyMuted && volume === 0) {
      state.mediaSettings.remoteVolume = 1;
    }

    localStorage.setItem(mediaSettingsStorageKey, JSON.stringify(state.mediaSettings));
    applyRemoteVolume();
  }

  function handleJingleEnvelope(envelope) {
    if (!isAddressedToMe(envelope)) {
      appendDebug("jingle-skip", `Ignored ${envelope.action || "jingle"} for ${envelope.to || "unknown"}; this client is ${currentFromJid()}`);
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
      setCallStatus(jingleInfoText(envelope.info, envelope.mediaKind));
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
    call.rttSync = normalizeJingleRttSyncDescriptor(envelope.rttSync, call.sid, "offered");
    call.incomingOffer = envelope.sdp;
    state.call = call;
    updateCallUi();
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (conversation) {
      applyEnvelopeIdentity(conversation, envelope);
      state.activeConversationId = conversation.id;
      el.peerInput.value = conversation.peer;
    }

    sendJingleEnvelope("session-info", {
      sid: call.sid,
      to: call.peer,
      info: "ringing"
    });
    setCallStatus(`${t("call.incoming", "Incoming call from")} ${displayNameForJid(call.peer)}`);
    addMessage("peer", call.mediaKind === "video"
      ? t("call.video_incoming", "Incoming video call")
      : t("call.audio_incoming", "Incoming audio call"), "jingle", call.peer, null, conversation?.id ?? null);
    renderConversations();
    renderActiveConversation();
    updateCallUi();
  }

  async function handleIncomingSessionAccept(envelope) {
    const call = state.call;
    if (!call || call.sid !== envelope.sid || !envelope.sdp || !call.pc) {
      return;
    }

    try {
      call.rttSync = normalizeJingleRttSyncDescriptor(envelope.rttSync || call.rttSync, call.sid, "accepted");
      await call.pc.setRemoteDescription({ type: "answer", sdp: envelope.sdp });
      call.remoteDescriptionSet = true;
      await flushPendingIceCandidates(call);
      setCallStatus(jingleRttSyncStatusText(call));
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
      rttChannel: null,
      rttSync: createJingleRttSyncDescriptor(sid, "offered"),
      incomingOffer: null,
      pendingCandidates: [],
      remoteDescriptionSet: false
    };
  }

  function createJingleRttSyncDescriptor(sid, stateName = "offered") {
    return {
      namespace: jingleRttSyncNamespace,
      profile: "datachannel-t140",
      label: jingleRttSyncDataChannelLabel,
      role: "conversation",
      source: "human",
      lang: jingleRttSyncLanguage(),
      syncGroup: jingleRttSyncGroup(sid),
      syncReference: "audio",
      syncMode: "co-session",
      maxSkewMs: jingleRttSyncMaxSkewMs,
      finality: "mixed",
      state: stateName,
      sequence: 0
    };
  }

  function normalizeJingleRttSyncDescriptor(value, sid, stateName = "offered") {
    const fallback = createJingleRttSyncDescriptor(sid, stateName);
    if (!value || typeof value !== "object") {
      return fallback;
    }

    return {
      ...fallback,
      ...value,
      namespace: value.namespace || jingleRttSyncNamespace,
      label: value.label || jingleRttSyncDataChannelLabel,
      lang: value.lang || fallback.lang,
      syncGroup: value.syncGroup || fallback.syncGroup,
      state: value.state || stateName,
      sequence: Number.isInteger(value.sequence) ? value.sequence : 0
    };
  }

  function jingleRttSyncLanguage() {
    return normalizeLanguageCode(state.languageCode || el.languageInput.value) === "ned"
      ? "nl-NL"
      : "en";
  }

  function jingleRttSyncGroup(sid) {
    return `tc-${String(sid || "call").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  }

  function createPeerConnection(call) {
    if (call.pc) {
      return call.pc;
    }

    const pc = new RTCPeerConnection({ iceServers: [] });
    call.pc = pc;

    pc.addEventListener("datachannel", (event) => {
      if (event.channel?.label === jingleRttSyncDataChannelLabel) {
        configureJingleRttSyncChannel(call, event.channel);
      }
    });

    if (call.role === "caller" && typeof pc.createDataChannel === "function") {
      configureJingleRttSyncChannel(
        call,
        pc.createDataChannel(jingleRttSyncDataChannelLabel, {
          ordered: true,
          protocol: "t140"
        }));
    }

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
        setCallStatus(jingleRttSyncStatusText(call));
      } else if (pc.connectionState === "failed") {
        setCallStatus(t("call.failed", "Call failed"));
      } else if (pc.connectionState === "disconnected") {
        setCallStatus(t("call.disconnected", "Call disconnected"));
      }
    });

    return pc;
  }

  function configureJingleRttSyncChannel(call, channel) {
    if (!call || !channel) {
      return;
    }

    if (channel.teletyptelRttConfigured) {
      call.rttChannel = channel;
      return;
    }

    channel.teletyptelRttConfigured = true;
    channel.binaryType = "arraybuffer";
    call.rttChannel = channel;
    call.rttSync = normalizeJingleRttSyncDescriptor(call.rttSync, call.sid, "negotiating");
    call.rttSync.label = channel.label || jingleRttSyncDataChannelLabel;
    call.rttSync.state = channel.readyState === "open" ? "connected" : "negotiating";

    channel.addEventListener("open", () => {
      if (!state.call || state.call.sid !== call.sid) {
        return;
      }

      call.rttSync.state = "connected";
      setCallStatus(t("call.connected_rtt_sync", "Call connected - live text synchronized"));
      appendDebug("jingle-rtt", `Datachannel open sid=${call.sid}`);
      updateCallUi();
    });

    channel.addEventListener("close", () => {
      if (!state.call || state.call.sid !== call.sid) {
        return;
      }

      call.rttSync.state = "fallback";
      setCallStatus(t("call.rtt_sync_fallback", "Call connected - live text fallback uses XEP-0301"));
      appendDebug("jingle-rtt", `Datachannel closed sid=${call.sid}`);
      updateCallUi();
    });

    channel.addEventListener("error", () => {
      call.rttSync.state = "fallback";
      appendDebug("jingle-rtt-error", `Datachannel error sid=${call.sid}`);
    });

    channel.addEventListener("message", (event) => {
      void handleJingleRttSyncPacket(call, event.data);
    });
  }

  function activeJingleRttSyncCall() {
    const call = state.call;
    const conversation = activeConversation();
    if (!call || !conversation || !addressMatches(conversation.peer, call.peer)) {
      return null;
    }

    return call.rttChannel?.readyState === "open" ? call : null;
  }

  function sendJingleRttSyncPacket(eventName, text, options = {}) {
    const call = activeJingleRttSyncCall();
    if (!call || isActiveConversationBlocked()) {
      return false;
    }

    call.rttSync = normalizeJingleRttSyncDescriptor(call.rttSync, call.sid, "connected");
    if (eventName === "edit") {
      const t140Delta = createT140LinearDelta(options.previousText ?? "", String(text ?? ""));
      if (t140Delta !== null) {
        if (t140Delta !== "") {
          call.rttChannel.send(t140Delta);
          appendDebug("jingle-rtt-t140-out", `<t140 sid="${escapeXml(call.sid)}">${escapeXml(t140Delta)}</t140>`);
        }

        return true;
      }
    }

    const packet = {
      type: "jingle-rtt-sync",
      namespace: jingleRttSyncNamespace,
      profile: call.rttSync.profile,
      event: eventName,
      sid: call.sid,
      from: currentFromJid(),
      to: call.peer,
      lang: call.rttSync.lang || jingleRttSyncLanguage(),
      role: call.rttSync.role,
      source: call.rttSync.source,
      syncGroup: call.rttSync.syncGroup || jingleRttSyncGroup(call.sid),
      syncReference: call.rttSync.syncReference,
      syncMode: call.rttSync.syncMode,
      maxSkewMs: call.rttSync.maxSkewMs,
      seq: call.rttSync.sequence++,
      text: String(text ?? ""),
      actions: options.actions || null,
      messageId: options.messageId || null,
      replaceId: options.replaceId || null,
      timestamp: new Date().toISOString()
    };

    try {
      call.rttChannel.send(JSON.stringify(packet));
      appendDebug("jingle-rtt-out", createJingleRttPacketDebugXml(packet));
      return true;
    } catch (error) {
      call.rttSync.state = "fallback";
      appendDebug("jingle-rtt-error", error.message);
      return false;
    }
  }

  async function handleJingleRttSyncPacket(call, data) {
    const text = await decodeRttDataChannelText(data);
    if (text === null || text === "") {
      appendDebug("jingle-rtt-skip", "Ignored empty RTT datachannel packet");
      return;
    }

    let packet;
    try {
      packet = JSON.parse(text);
    } catch {
      applyT140DataChannelText(call, text);
      return;
    }

    if (packet?.type !== "jingle-rtt-sync" || packet.namespace !== jingleRttSyncNamespace) {
      appendDebug("jingle-rtt-skip", "Ignored unknown datachannel packet");
      return;
    }

    if (packet.sid && packet.sid !== call.sid) {
      appendDebug("jingle-rtt-skip", `Ignored packet for sid=${packet.sid}`);
      return;
    }

    appendDebug("jingle-rtt-in", createJingleRttPacketDebugXml(packet));
    if (packet.event === "message") {
      applyJingleRttSyncFinal(call, packet);
      return;
    }

    applyJingleRttSyncDraft(call, packet);
  }

  async function decodeRttDataChannelText(data) {
    if (typeof data === "string") {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return new TextDecoder("utf-8", { fatal: false }).decode(data);
    }

    if (ArrayBuffer.isView(data)) {
      return new TextDecoder("utf-8", { fatal: false }).decode(data);
    }

    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return await data.text();
    }

    return data == null ? null : String(data);
  }

  function applyT140DataChannelText(call, payload) {
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return;
    }

    conversation.remoteText = applyT140Delta(conversation.remoteText || "", payload);
    conversation.remoteFrom = call.peer;
    conversation.remoteDraftUpdatedAt = new Date();
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    appendDebug("jingle-rtt-t140-in", `<t140 sid="${escapeXml(call.sid)}">${escapeXml(payload)}</t140>`);
    updateRemoteDraftMessage(conversation.id);
  }

  function createT140LinearDelta(previous, next) {
    const previousText = String(previous ?? "");
    const nextText = String(next ?? "");
    if (nextText.startsWith(previousText)) {
      return nextText.slice(previousText.length);
    }

    if (previousText.startsWith(nextText)) {
      return t140Backspace.repeat(Array.from(previousText.slice(nextText.length)).length);
    }

    return null;
  }

  function applyT140Delta(previous, payload) {
    let result = String(previous ?? "");
    let previousWasCarriageReturn = false;

    for (const char of Array.from(String(payload ?? ""))) {
      if (char === t140Backspace || char === t140Delete) {
        result = Array.from(result).slice(0, -1).join("");
        previousWasCarriageReturn = false;
        continue;
      }

      if (char === "\r") {
        result += "\n";
        previousWasCarriageReturn = true;
        continue;
      }

      if (char === "\n") {
        if (!previousWasCarriageReturn) {
          result += "\n";
        }
        previousWasCarriageReturn = false;
        continue;
      }

      previousWasCarriageReturn = false;
      if (isIgnoredT140Control(char)) {
        continue;
      }

      result += char;
    }

    return result;
  }

  function isIgnoredT140Control(char) {
    if (char === "\t") {
      return false;
    }

    const code = char.codePointAt(0);
    return code < 0x20 || (code >= 0x80 && code <= 0x9f);
  }

  function applyJingleRttSyncDraft(call, packet) {
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return;
    }

    const text = String(packet.text ?? "");
    conversation.remoteText = packet.event === "reset" ? text : text;
    conversation.remoteFrom = packet.from || call.peer;
    conversation.remoteDraftUpdatedAt = new Date(packet.timestamp || Date.now());
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    updateRemoteDraftMessage(conversation.id);
  }

  function applyJingleRttSyncFinal(call, packet) {
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return;
    }

    conversation.remoteText = "";
    conversation.remoteFrom = packet.from || call.peer;
    conversation.remoteDraftUpdatedAt = null;
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");

    if (packet.replaceId) {
      applyMessageCorrection(
        conversation,
        String(packet.replaceId),
        String(packet.text ?? ""),
        "peer",
        typeof packet.messageId === "string" ? packet.messageId : null,
        conversation.remoteFrom);
      return;
    }

    addMessage(
      "peer",
      String(packet.text ?? ""),
      "jingle-rtt",
      conversation.remoteFrom,
      null,
      conversation.id,
      null,
      typeof packet.messageId === "string" ? packet.messageId : null);
  }

  async function openLocalMedia(call) {
    if (call.localStream) {
      return call.localStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t("call.media_unavailable", "Camera/microphone access is not available."));
    }

    const wantsVideo = call.mediaKind === "video";
    stopMediaPreview();
    saveMediaSettingsFromControls();
    try {
      call.localStream = await navigator.mediaDevices.getUserMedia(createMediaConstraints(call.mediaKind));
      await refreshMediaDevices(false);
    } catch (error) {
      if (!wantsVideo) {
        throw error;
      }

      if (state.mediaSettings.cameraDeviceId || state.mediaSettings.microphoneDeviceId) {
        try {
          appendDebug("media", `Selected device unavailable, trying defaults: ${error.message}`);
          call.localStream = await navigator.mediaDevices.getUserMedia(createDefaultMediaConstraints("video"));
          setMediaStatus(t("media.default_fallback", "Selected device was unavailable; using browser defaults."));
          await refreshMediaDevices(false);
        } catch (fallbackError) {
          appendDebug("media", `Default video fallback failed: ${fallbackError.message}`);
        }
      }

      if (call.localStream) {
        el.localVideo.srcObject = call.localStream;
        el.callPanel.hidden = false;
        updateCallUi();
        return call.localStream;
      }

      appendDebug("media", `Video unavailable, falling back to audio: ${error.message}`);
      call.mediaKind = "audio";
      call.localStream = await navigator.mediaDevices.getUserMedia(createMediaConstraints("audio"));
    }

    el.localVideo.srcObject = call.localStream;
    el.callPanel.hidden = false;
    updateCallUi();
    return call.localStream;
  }

  function createMediaConstraints(mediaKind) {
    if (mediaKind !== "video") {
      return createAudioOnlyConstraints();
    }

    const { audio } = createAudioOnlyConstraints();
    const { video } = createVideoOnlyConstraints();
    return { audio, video };
  }

  function createAudioOnlyConstraints() {
    const audio = state.mediaSettings.microphoneDeviceId
      ? { deviceId: { exact: state.mediaSettings.microphoneDeviceId } }
      : true;
    return { audio, video: false };
  }

  function createVideoOnlyConstraints() {
    const video = videoConstraintsForQuality(state.mediaSettings.videoQuality);
    if (state.mediaSettings.cameraDeviceId) {
      video.deviceId = { exact: state.mediaSettings.cameraDeviceId };
    }

    return { audio: false, video };
  }

  function createDefaultMediaConstraints(mediaKind) {
    if (mediaKind !== "video") {
      return { audio: true, video: false };
    }

    return {
      audio: true,
      video: videoConstraintsForQuality(state.mediaSettings.videoQuality)
    };
  }

  function videoConstraintsForQuality(quality) {
    if (quality === "qvga") {
      return { width: { ideal: 320 }, height: { ideal: 240 } };
    }

    if (quality === "vga") {
      return { width: { ideal: 640 }, height: { ideal: 480 } };
    }

    if (quality === "hd") {
      return { width: { ideal: 1280 }, height: { ideal: 720 } };
    }

    if (quality === "fullhd") {
      return { width: { ideal: 1920 }, height: { ideal: 1080 } };
    }

    return { width: { ideal: 640 }, height: { ideal: 360 } };
  }

  function setMediaStatus(text) {
    el.mediaStatus.removeAttribute("data-i18n");
    el.mediaStatus.textContent = text;
  }

  function stopStream(stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  async function replaceLocalMediaTrack(kind) {
    const call = state.call;
    if (!call?.localStream || !call.pc) {
      return;
    }

    const constraints = kind === "audio"
      ? createAudioOnlyConstraints()
      : createVideoOnlyConstraints();
    const replacementStream = await navigator.mediaDevices.getUserMedia(constraints);
    const replacementTrack = replacementStream.getTracks().find((track) => track.kind === kind);
    if (!replacementTrack) {
      stopStream(replacementStream);
      throw new Error(kind === "audio"
        ? t("media.no_microphone_track", "No microphone track was returned.")
        : t("media.no_camera_track", "No camera track was returned."));
    }

    const oldTracks = kind === "audio"
      ? call.localStream.getAudioTracks()
      : call.localStream.getVideoTracks();
    const wasEnabled = oldTracks.length === 0 || oldTracks.some((track) => track.enabled);
    replacementTrack.enabled = wasEnabled;

    const sender = call.pc.getSenders().find((item) => item.track?.kind === kind);
    if (!sender) {
      stopStream(replacementStream);
      throw new Error(kind === "audio"
        ? t("media.no_microphone_sender", "No active microphone sender was found.")
        : t("media.no_camera_sender", "No active camera sender was found."));
    }

    await sender.replaceTrack(replacementTrack);
    for (const oldTrack of oldTracks) {
      call.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }

    call.localStream.addTrack(replacementTrack);
    for (const extraTrack of replacementStream.getTracks()) {
      if (extraTrack !== replacementTrack) {
        extraTrack.stop();
      }
    }

    el.localVideo.srcObject = call.localStream;
    el.callPanel.hidden = false;
    await refreshMediaDevices(false);
    updateCallUi();
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

    call.rttChannel?.close();
    call.rttChannel = null;
    call.pc?.close();
    if (call.localStream) {
      stopStream(call.localStream);
    }

    if (call.remoteStream) {
      stopStream(call.remoteStream);
    }
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
      candidate: payload.candidate || null,
      rttSync: payload.rttSync || state.call?.rttSync || null
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
        + (envelope.mediaKind === "video" ? createJingleContentXml("video", "video") : "")
        + createJingleRttSyncContentXml(envelope);
    } else if (action === "transport-info") {
      payload = `<content creator="initiator" name="${escapeXml(envelope.mediaKind || "audio")}"><transport xmlns="urn:xmpp:jingle:transports:ice-udp:1">${createJingleCandidateXml(envelope.candidate)}</transport></content>`;
    } else if (action === "session-info") {
      const info = escapeXml(envelope.info || "ringing");
      const media = escapeXml(envelope.mediaKind || "audio");
      const creator = state.call?.role === "receiver" ? "responder" : "initiator";
      const mediaAttrs = envelope.info === "mute" || envelope.info === "unmute"
        ? ` creator="${creator}" name="${media}"`
        : "";
      payload = `<${info} xmlns="urn:xmpp:jingle:apps:rtp:info:1"${mediaAttrs}/>`;
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

  function createJingleRttSyncContentXml(envelope) {
    const rttSync = normalizeJingleRttSyncDescriptor(envelope.rttSync, envelope.sid, "offered");
    const attrs = [
      `profile="${escapeXml(rttSync.profile)}"`,
      `label="${escapeXml(rttSync.label)}"`,
      `role="${escapeXml(rttSync.role)}"`,
      `source="${escapeXml(rttSync.source)}"`,
      `lang="${escapeXml(rttSync.lang)}"`,
      `sync-group="${escapeXml(rttSync.syncGroup)}"`,
      `sync-reference="${escapeXml(rttSync.syncReference)}"`,
      `sync-mode="${escapeXml(rttSync.syncMode)}"`,
      `max-skew="${escapeXml(rttSync.maxSkewMs)}"`,
      `finality="${escapeXml(rttSync.finality)}"`
    ].join(" ");

    return `<content creator="initiator" name="text" senders="both"><description xmlns="${jingleRttSyncNamespace}"><rtt-sync ${attrs}/></description><transport xmlns="urn:xmpp:jingle:transports:dtls-sctp:1"/></content>`;
  }

  function createJingleRttPacketDebugXml(packet) {
    const attrs = [
      `xmlns="${jingleRttSyncNamespace}"`,
      `event="${escapeXml(packet.event || "edit")}"`,
      `sid="${escapeXml(packet.sid || "")}"`,
      `seq="${escapeXml(packet.seq ?? "")}"`,
      `sync-group="${escapeXml(packet.syncGroup || "")}"`,
      `sync-mode="${escapeXml(packet.syncMode || "co-session")}"`
    ].join(" ");
    const actions = packet.actions ? `<actions>${packet.actions}</actions>` : "";
    const messageId = packet.messageId ? `<message-id>${escapeXml(packet.messageId)}</message-id>` : "";
    const replaceId = packet.replaceId ? `<replace-id>${escapeXml(packet.replaceId)}</replace-id>` : "";
    return `<rtt-sync ${attrs}><t>${escapeXml(packet.text || "")}</t>${actions}${messageId}${replaceId}</rtt-sync>`;
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
    el.incomingCallBanner.hidden = !incoming;
    el.incomingCallDialog.hidden = !incoming;
    if (incoming) {
      const caller = displayNameForJid(call.peer);
      const title = call.mediaKind === "video"
        ? t("call.video_incoming", "Incoming video call")
        : t("call.audio_incoming", "Incoming audio call");
      const text = `${t("call.incoming", "Incoming call from")} ${caller}`;
      el.incomingCallTitle.textContent = title;
      el.incomingCallDialogTitle.textContent = title;
      el.incomingCallText.textContent = text;
      el.incomingCallDialogText.textContent = text;
      el.incomingCallBanner.scrollIntoView({ block: "nearest" });
      el.dialogAnswerButton.focus();
    }

    el.answerCallButton.hidden = !incoming;
    el.rejectCallButton.hidden = !incoming;
    setCallButtonsDisabled(Boolean(call));
    el.hangupCallButton.disabled = !call;
    el.callPanel.hidden = !(call?.localStream || call?.remoteStream);
    updateCameraToggleUi();
    updateMicrophoneMuteUi();
    applyRemoteVolume();
  }

  function updateCameraToggleUi() {
    const tracks = state.call?.localStream?.getVideoTracks() ?? [];
    const hasVideo = tracks.length > 0;
    const cameraOff = hasVideo && tracks.every((track) => !track.enabled);
    el.toggleCameraButton.disabled = !hasVideo;
    el.toggleCameraButton.textContent = cameraOff
      ? t("button.turn_camera_on", "Turn camera on")
      : t("button.turn_camera_off", "Turn camera off");
    el.toggleCameraButton.classList.toggle("selected", cameraOff);
    el.localVideo.classList.toggle("camera-off", cameraOff);
  }

  function updateMicrophoneMuteUi() {
    const tracks = state.call?.localStream?.getAudioTracks() ?? [];
    const hasAudio = tracks.length > 0;
    const muted = hasAudio && tracks.every((track) => !track.enabled);
    el.muteMicrophoneButton.disabled = !hasAudio;
    el.muteMicrophoneButton.textContent = muted
      ? t("button.unmute_microphone", "Unmute microphone")
      : t("button.mute_microphone", "Mute microphone");
    el.muteMicrophoneButton.classList.toggle("selected", muted);
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

  function hasActiveMessageTransport() {
    if (activeJingleRttSyncCall()) {
      return true;
    }

    return state.mode === "xmpp"
      ? state.xmppSocket?.readyState === WebSocket.OPEN
      : isRelayConnected();
  }

  function showNotConnectedStatus() {
    const text = t("status.not_connected", "Not connected.");
    setConnectionStatus(text, "danger");
    el.composerState.textContent = text;
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

  function jingleInfoText(info, mediaKind = "") {
    if (info === "ringing") {
      return t("call.ringing", "Ringing...");
    }

    if (info === "mute" && mediaKind === "video") {
      return t("call.remote_camera_off", "Other side turned camera off");
    }

    if (info === "unmute" && mediaKind === "video") {
      return t("call.remote_camera_on", "Other side turned camera on");
    }

    if (info === "hold") {
      return t("call.hold", "Call on hold");
    }

    if (info === "unhold" || info === "active") {
      return t("call.connected", "Call connected");
    }

    return t("call.session_info", "Call status updated");
  }

  function jingleRttSyncStatusText(call = state.call) {
    if (call?.rttChannel?.readyState === "open" || call?.rttSync?.state === "connected") {
      return t("call.connected_rtt_sync", "Call connected - live text synchronized");
    }

    if (call?.rttSync?.state === "fallback") {
      return t("call.rtt_sync_fallback", "Call connected - live text fallback uses XEP-0301");
    }

    return t("call.connected", "Call connected");
  }

  function redactJingleForLog(envelope) {
    return {
      ...envelope,
      avatarDataUrl: envelope.avatarDataUrl ? `${envelope.avatarDataUrl.length} chars` : undefined,
      sdp: envelope.sdp ? `${envelope.sdp.length} bytes` : null
    };
  }

  function redactEnvelopeForLog(envelope) {
    if (!envelope) {
      return envelope;
    }

    const redacted = { ...envelope };
    if (redacted.avatarDataUrl) {
      redacted.avatarDataUrl = `${redacted.avatarDataUrl.length} chars`;
    }

    if (redacted.location) {
      redacted.location = {
        accuracy: redacted.location.accuracy ?? null,
        timestamp: redacted.location.timestamp ?? null,
        redacted: true
      };
      redacted.xml = redacted.xml ? "geoloc redacted" : redacted.xml;
    }

    return redacted;
  }

  function activeEditTarget() {
    if (!state.editingMessage) {
      return null;
    }

    const conversation = activeConversation();
    if (!conversation || conversation.id !== state.editingMessage.conversationId) {
      clearMessageEdit();
      return null;
    }

    const message = conversation.messages.find((item) => item.id === state.editingMessage.messageId);
    if (!message || message.direction !== "self") {
      clearMessageEdit();
      return null;
    }

    return {
      conversation,
      message,
      replaceId: state.editingMessage.replaceId || message.xmppId || message.id
    };
  }

  function startMessageEdit(messageId) {
    const conversation = activeConversation();
    if (!conversation) {
      return;
    }

    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message || message.direction !== "self" || message.attachment || message.location) {
      return;
    }

    state.editingMessage = {
      conversationId: conversation.id,
      messageId: message.id,
      replaceId: message.xmppId || message.id
    };
    el.messageInput.value = message.text;
    el.messageInput.focus();
    el.composerState.textContent = t("composer.editing", "Editing message; sending will replace it.");
  }

  function clearMessageEdit() {
    state.editingMessage = null;
    setDefaultComposerState();
  }

  function setDefaultComposerState() {
    el.composerState.textContent = state.mode === "relay"
      ? t("composer.relay_state", "Enter sends, Shift+Enter inserts a line")
      : t("composer.xmpp_state", "RFC 7395 mode sends XML message stanzas");
  }

  function applyMessageCorrection(conversation, replaceId, text, direction, newId = null, from = null) {
    const message = conversation.messages.find((item) =>
      (item.xmppId && item.xmppId === replaceId) || item.id === replaceId);
    if (!message) {
      addMessage(direction, text, "edited", from, null, conversation.id, null, newId);
      return;
    }

    message.text = text;
    message.edited = true;
    message.status = "edited";
    if (newId) {
      message.xmppId = newId;
    }
    if (from) {
      message.from = from;
    }

    if (conversation.id === state.activeConversationId) {
      renderTimeline(conversation);
    }

    renderConversations();
  }

  function createMessageId(prefix) {
    const token = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : String(Date.now()) + String(Math.random()).slice(2);
    return `${prefix}-${token}`;
  }

  function addMessage(direction, text, status, from = null, attachment = null, conversationId = null, location = null, xmppId = null) {
    const conversation = conversationId
      ? state.conversations.find((item) => item.id === conversationId)
      : activeConversation();
    if (!conversation) {
      return;
    }

    const message = {
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now() + Math.random()),
      direction,
      from,
      text,
      attachment,
      location,
      status,
      xmppId,
      edited: false,
      timestamp: new Date()
    };

    conversation.messages.push(message);
    if (conversation.id === state.activeConversationId) {
      appendMessageToTimeline(message);
    }

    renderConversations();
  }

  function appendMessageToTimeline(message) {
    const existingDraft = message.direction === "peer"
      ? el.messageTimeline.querySelector('[data-remote-draft="true"]')
      : null;

    if (existingDraft) {
      updateMessageElement(existingDraft, message);
      el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
      return;
    }

    el.messageTimeline.appendChild(createMessageElement(message));
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
  }

  function addConversation() {
    const name = prompt(t("prompt.contact_name", "Contact name"), "Tester");
    if (!name) {
      return;
    }

    const peer = prompt(t("prompt.contact_jid", "Contact JID"), `${name.trim().toLowerCase()}@localhost`);
    if (!peer) {
      return;
    }

    const conversation = ensureConversationForPeer(peer, "contact", name.trim());
    if (!conversation) {
      return;
    }

    state.activeConversationId = conversation.id;
    el.peerInput.value = conversation.peer;
    renderConversations();
    renderActiveConversation();
  }

  function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeConversationId) ?? null;
  }

  function renderConversations() {
    el.conversationItems.replaceChildren();
    for (const conversation of state.conversations) {
      if (isOwnContact(conversation) || isBlockedConversation(conversation)) {
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item"
        + (conversation.id === state.activeConversationId ? " selected" : "");
      const avatar = createAvatarElement(conversation, "avatar-list");
      const text = document.createElement("span");
      text.className = "conversation-text";
      const name = document.createElement("strong");
      const meta = document.createElement("span");
      name.textContent = conversationDisplayName(conversation);
      meta.textContent = conversationMeta(conversation);
      text.append(name, meta);
      const presence = document.createElement("span");
      presence.className = `presence-dot presence-${conversationPresence(conversation)}`;
      button.append(avatar, text, presence);
      button.addEventListener("click", () => {
        state.activeConversationId = conversation.id;
        el.peerInput.value = conversation.peer;
        state.previousText = "";
        el.messageInput.value = "";
        closeConversationContextMenu();
        renderConversations();
        renderActiveConversation();
      });
      button.addEventListener("contextmenu", (event) => showConversationContextMenu(event, conversation, button));
      button.addEventListener("keydown", (event) => {
        if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
          showConversationContextMenu(event, conversation, button);
        }
      });
      el.conversationItems.appendChild(button);
    }

    updateComposerAvailability();
  }

  function renderActiveConversation() {
    const conversation = activeConversation();
    if (!conversation) {
      renderAvatarInto(el.activeConversationAvatar, {
        displayName: "TX",
        avatarColor: "#2563eb"
      });
      el.activeConversationName.textContent = t("conversation.none_title", "Select a contact");
      el.activeConversationMeta.textContent = t("conversation.none_meta", "Click a contact to open the chat room.");
      el.messageTimeline.replaceChildren(createNoConversationElement());
      el.messageInput.value = "";
      updateComposerAvailability();
      return;
    }

    el.activeConversationName.textContent = conversationDisplayName(conversation);
    el.activeConversationMeta.textContent = conversationMeta(conversation);
    renderAvatarInto(el.activeConversationAvatar, conversation);
    el.messageTimeline.replaceChildren();

    for (const message of conversation.messages) {
      el.messageTimeline.appendChild(createMessageElement(message));
    }

    if (conversation.remoteText) {
      el.messageTimeline.appendChild(createMessageElement({
        direction: "peer",
        from: conversation.remoteFrom,
        text: conversation.remoteText,
        status: "typing",
        timestamp: conversation.remoteDraftUpdatedAt ?? new Date(),
        draft: true
      }));
    }

    updateComposerAvailability();
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
  }

  function updateRemoteDraftMessage(conversationId = state.activeConversationId) {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    if (conversation.id !== state.activeConversationId) {
      renderConversations();
      return;
    }

    const existing = el.messageTimeline.querySelector('[data-remote-draft="true"]');
    if (!conversation.remoteText) {
      existing?.remove();
      return;
    }

    el.activeConversationName.textContent = conversationDisplayName(conversation);
    el.activeConversationMeta.textContent = conversationMeta(conversation);
    renderAvatarInto(el.activeConversationAvatar, conversation);

    const message = {
      direction: "peer",
      from: conversation.remoteFrom,
      text: conversation.remoteText,
      status: "typing",
      timestamp: conversation.remoteDraftUpdatedAt ?? new Date(),
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

  function addGroupConversation() {
    const groupNumber = state.conversations.filter((conversation) => conversation.kind === "group").length + 1;
    const defaultName = t("conversation.group_default", "Group {0}").replace("{0}", groupNumber);
    const name = prompt(t("prompt.group_name", "Group name"), defaultName);
    if (!name) {
      return;
    }

    const peer = prompt(t("prompt.group_jid", "Room JID"), `group${groupNumber}@conference.localhost`);
    if (!peer) {
      return;
    }

    const conversation = ensureConversationForPeer(peer, "group", name.trim());
    state.activeConversationId = conversation.id;
    el.peerInput.value = conversation.peer;
    renderConversations();
    renderActiveConversation();
  }

  function inviteContactToActiveGroup() {
    const group = activeConversation();
    if (!group || group.kind !== "group") {
      setConnectionStatus(t("status.select_group_first", "Select a group first"), "warn");
      return;
    }

    const contacts = state.conversations.filter((conversation) =>
      conversation.kind === "contact"
      && !isOwnContact(conversation)
      && !isBlockedConversation(conversation));
    if (!contacts.length) {
      setConnectionStatus(t("status.no_contacts", "No contacts available"), "warn");
      return;
    }

    const contactText = contacts.map((conversation) => conversation.peer).join(", ");
    const peer = prompt(t("prompt.invite_contact", "Invite contact JID"), contacts[0].peer);
    if (!peer) {
      return;
    }

    const contact = ensureConversationForPeer(peer, "contact", displayNameForJid(peer));
    if (!contact) {
      return;
    }

    if (isBlockedConversation(contact)) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    const inviteText = t("message.group_invite", "{0} invited you to {1} ({2}).")
      .replace("{0}", currentSenderName())
      .replace("{1}", conversationDisplayName(group))
      .replace("{2}", group.peer);
    const statusText = t("message.group_invite_sent", "Invitation sent to {0}.").replace("{0}", conversationDisplayName(contact));

    addMessage("peer", statusText, t("sender.system", "System"), t("sender.system", "System"), null, group.id);
    addMessage("peer", inviteText, t("sender.system", "System"), t("sender.system", "System"), null, contact.id);
    if (state.relaySocket?.readyState === WebSocket.OPEN) {
      const envelope = createRelayEnvelope("message", inviteText, "", contact.peer);
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    }

    setConnectionStatus(statusText, "good");
    appendDebug("invite", `${statusText} (${contactText})`);
  }

  function toggleBlockContextConversation() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? activeConversation();
    closeConversationContextMenu();
    toggleBlockConversation(conversation);
  }

  function toggleBlockConversation(conversation) {
    if (!canBlockConversation(conversation)) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    const peer = conversation.peer;
    const shouldBlock = !isBlockedConversation(conversation);
    const wasActive = state.activeConversationId === conversation.id;
    setBlockedPeer(peer, shouldBlock);
    if (shouldBlock) {
      conversation.remoteText = "";
      conversation.remoteFrom = "";
      conversation.remoteDraftUpdatedAt = null;
      if (wasActive) {
        state.activeConversationId = null;
        state.previousText = "";
        el.messageInput.value = "";
        el.peerInput.value = "";
      }
      if (state.call && addressMatches(state.call.peer, peer)) {
        cleanupCall(true);
      }
    }

    sendXmppBlockingCommand(shouldBlock ? "block" : "unblock", peer);
    const statusText = shouldBlock
      ? t("status.contact_blocked", "Contact blocked: {0}")
      : t("status.contact_unblocked", "Contact unblocked: {0}");
    setConnectionStatus(statusText.replace("{0}", conversationDisplayName(conversation)), shouldBlock ? "warn" : "good");
    renderConversations();
    renderActiveConversation();
    refreshOpenTabPanel();
  }

  function setBlockedPeer(peer, blocked) {
    const key = normalizeBlockJid(peer);
    if (!key) {
      return;
    }

    if (blocked) {
      state.blockedJids.add(key);
    } else {
      state.blockedJids.delete(key);
    }

    saveBlockedJids();
  }

  function updateConversationContextMenu() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? null;
    const canBlock = canBlockConversation(conversation);
    const blocked = isBlockedConversation(conversation);
    el.contextBlockButton.disabled = !canBlock;
    el.contextBlockButton.textContent = blocked
      ? t("button.unblock_contact", "Unblock")
      : t("button.block_contact", "Block");
    el.contextBlockButton.classList.toggle("selected", blocked);
    el.contextBlockButton.classList.toggle("danger-action", !blocked);
  }

  function canBlockConversation(conversation) {
    return Boolean(conversation)
      && conversation.kind === "contact"
      && !isOwnPeer(conversation.peer)
      && !isInfrastructurePeer(conversation.peer);
  }

  function refreshOpenTabPanel() {
    if (state.activeTabId === "chat" || el.tabPanel.hidden) {
      return;
    }

    const tab = allTabs().find((item) => item.id === state.activeTabId);
    if (tab) {
      renderTabPanel(tab);
    }
  }

  function blockedContactEntries() {
    const conversationsByPeer = new Map();
    for (const conversation of state.conversations) {
      const key = normalizeBlockJid(conversation.peer);
      if (key && state.blockedJids.has(key)) {
        conversationsByPeer.set(key, conversation);
      }
    }

    return Array.from(state.blockedJids)
      .filter((jid) => !isOwnPeer(jid))
      .map((jid) => conversationsByPeer.get(jid) ?? createBlockedContactEntry(jid))
      .sort((left, right) => conversationDisplayName(left).localeCompare(conversationDisplayName(right)));
  }

  function createBlockedContactEntry(jid) {
    return {
      id: `blocked-${jid}`,
      name: displayNameForJid(jid),
      peer: jid,
      kind: "contact",
      avatarColor: avatarColorFor(jid),
      presence: "blocked",
      meta: "",
      messages: [],
      remoteText: "",
      remoteFrom: "",
      remoteDraftUpdatedAt: null
    };
  }

  function isActiveConversationBlocked() {
    return isBlockedConversation(activeConversation());
  }

  function isBlockedConversation(conversation) {
    return Boolean(conversation) && isBlockedPeer(conversation.peer);
  }

  function isBlockedEnvelope(envelope) {
    const from = envelopeFrom(envelope);
    return Boolean(from) && isBlockedPeer(from);
  }

  function isBlockedPeer(peer) {
    const key = normalizeBlockJid(peer);
    return Boolean(key) && state.blockedJids.has(key);
  }

  function normalizeBlockJid(peer) {
    const bare = bareJid(peer).trim().toLowerCase();
    return bare && !isInfrastructurePeer(bare) ? bare : "";
  }

  function sendXmppBlockingCommand(action, peer) {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const jid = escapeXml(bareJid(peer));
    const id = `${action}-${Date.now().toString(36)}`;
    const child = action === "block"
      ? `<block xmlns="urn:xmpp:blocking"><item jid="${jid}"/></block>`
      : `<unblock xmlns="urn:xmpp:blocking"><item jid="${jid}"/></unblock>`;
    const xml = `<iq xmlns="jabber:client" type="set" id="${id}">${child}</iq>`;
    state.xmppSocket.send(xml);
    appendDebug("C", xml);
  }

  function createNoConversationElement() {
    const item = document.createElement("div");
    item.className = "no-conversation";
    const title = document.createElement("strong");
    const text = document.createElement("span");
    title.textContent = t("conversation.none_title", "Select a contact");
    text.textContent = t("conversation.none_meta", "Click a contact to open the chat room.");
    item.append(title, text);
    return item;
  }

  function updateComposerAvailability() {
    const hasConversation = Boolean(activeConversation());
    const blocked = isActiveConversationBlocked();
    const selectedGroup = activeConversation()?.kind === "group";

    el.composerForm.classList.toggle("composer-disabled", !hasConversation || blocked);
    el.messageInput.disabled = !hasConversation || blocked;
    el.sendButton.disabled = !hasConversation || blocked;
    el.resetRttButton.disabled = !hasConversation || blocked;
    el.uploadFileButton.disabled = !hasConversation || blocked;
    setCallButtonsDisabled(!hasConversation || Boolean(state.call) || blocked);
    el.inviteConversationButton.disabled = !selectedGroup;
  }

  function setAccountReady(ready) {
    state.accountReady = ready === true;
    updateConnectButtonAvailability();
    updateComposerAvailability();
  }

  function autoConnectIfReady() {
    if (!state.accountReady || state.accountGateRequired) {
      return;
    }

    if (state.relaySocket?.readyState === WebSocket.CONNECTING
      || state.relaySocket?.readyState === WebSocket.OPEN
      || state.xmppSocket?.readyState === WebSocket.CONNECTING
      || state.xmppSocket?.readyState === WebSocket.OPEN) {
      return;
    }

    window.setTimeout(() => {
      if (!state.accountReady || state.accountGateRequired) {
        return;
      }

      if (state.mode === "xmpp") {
        connectXmppWebSocket();
      } else {
        connectRelay();
      }
    }, 0);
  }

  function updateConnectButtonAvailability() {
    if (!el.connectButton || !el.disconnectButton) {
      return;
    }

    const relayBusy = state.relaySocket?.readyState === WebSocket.CONNECTING
      || state.relaySocket?.readyState === WebSocket.OPEN;
    const relayOpen = state.relaySocket?.readyState === WebSocket.OPEN;
    const xmppOpen = state.xmppSocket?.readyState === WebSocket.OPEN;
    el.connectButton.disabled = !state.accountReady || state.accountGateRequired || relayBusy;
    el.disconnectButton.disabled = !relayOpen && !xmppOpen;
  }

  function hasActiveConversation() {
    return Boolean(activeConversation());
  }

  function conversationMeta(conversation) {
    if (isBlockedConversation(conversation)) {
      return t("presence.blocked", "Blocked");
    }

    if (conversation.kind === "group") {
      return t("presence.group", "Group");
    }

    return conversation.presence === "online"
      ? conversation.clientState === "inactive"
        ? t("presence.online_inactive", "Online - inactive")
        : t("presence.online", "Online")
      : t("presence.offline", "Offline");
  }

  function conversationDisplayName(conversation) {
    return conversation?.nameKey
      ? t(conversation.nameKey, conversation.name)
      : conversation?.name ?? "";
  }

  function conversationPresence(conversation) {
    if (isBlockedConversation(conversation)) {
      return "blocked";
    }

    return conversation.kind === "group" ? "group" : conversation.presence || "offline";
  }

  function ensureConversationForPeer(peer, kind = "contact", name = null) {
    const normalizedPeer = bareJid(peer || "relay@localhost");
    if (kind === "contact" && isOwnPeer(normalizedPeer)) {
      setConnectionStatus(t("status.cannot_add_self", "You cannot add your own account as a contact."), "warn");
      return null;
    }

    const existing = state.conversations.find((conversation) => addressMatches(conversation.peer, normalizedPeer));
    if (existing) {
      if (name && existing.name === existing.peer) {
        existing.name = name;
      }

      return existing;
    }

    const conversation = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name || displayNameForJid(normalizedPeer),
      peer: normalizedPeer,
      kind,
      avatarColor: avatarColorFor(`${name || normalizedPeer}:${normalizedPeer}`),
      presence: kind === "group" ? "group" : "offline",
      clientState: null,
      clientStateUpdatedAt: null,
      meta: "",
      messages: [],
      remoteText: "",
      remoteFrom: "",
      remoteDraftUpdatedAt: null
    };
    state.conversations.push(conversation);
    return conversation;
  }

  function conversationForEnvelope(envelope) {
    const to = typeof envelope.to === "string" ? envelope.to.trim() : "";
    const from = envelopeFrom(envelope);
    const knownGroup = to
      ? state.conversations.find((conversation) => conversation.kind === "group" && addressMatches(conversation.peer, to))
      : null;
    if (knownGroup) {
      return knownGroup;
    }

    const peer = from || to || "relay@localhost";
    if (isOwnPeer(peer)) {
      return null;
    }

    return ensureConversationForPeer(peer, "contact", displayNameForJid(peer));
  }

  function setPeerPresence(peer, presence) {
    if (isOwnPeer(peer) || isBlockedPeer(peer)) {
      return;
    }

    const conversation = state.conversations.find((item) => addressMatches(item.peer, peer));
    if (!conversation || conversation.kind === "group") {
      return;
    }

    conversation.presence = presence;
    if (presence === "offline") {
      conversation.clientState = null;
      conversation.clientStateUpdatedAt = null;
    }
    renderConversations();
  }

  function setInfrastructurePresence(presence) {
    for (const conversation of state.conversations) {
      if (conversation.kind === "group" || addressMatches(conversation.peer, "relay@localhost")) {
        conversation.presence = presence;
      }
    }

    renderConversations();
  }

  function setAllContactPresence(presence) {
    for (const conversation of state.conversations) {
      if (conversation.kind === "contact" && !isOwnContact(conversation)) {
        conversation.presence = presence;
        if (presence === "offline") {
          conversation.clientState = null;
          conversation.clientStateUpdatedAt = null;
        }
      }
    }
  }

  function isOwnContact(conversation) {
    return conversation?.kind === "contact"
      && !isInfrastructurePeer(conversation.peer)
      && isOwnPeer(conversation.peer);
  }

  function isOwnPeer(peer) {
    const self = currentBareJid();
    return Boolean(self) && !isInfrastructurePeer(peer) && addressMatches(peer, self);
  }

  function isInfrastructurePeer(peer) {
    return addressMatches(peer, "relay@localhost");
  }

  function currentBareJid() {
    return bareJid(currentFromJid()).toLowerCase();
  }

  function addressMatches(left, right) {
    if (!left || !right) {
      return false;
    }

    return String(left).trim().toLowerCase() === String(right).trim().toLowerCase()
      || bareJid(left).toLowerCase() === bareJid(right).toLowerCase();
  }

  function bareJid(jid) {
    return String(jid ?? "").trim().split("/")[0];
  }

  function createMessageElement(message) {
    const item = document.createElement("article");
    item.className = "message " + message.direction + (message.draft ? " draft" : "");
    if (message.draft) {
      item.dataset.remoteDraft = "true";
    } else {
      delete item.dataset.remoteDraft;
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
    if (message.location) {
      body.appendChild(createLocationElement(message.location));
    }
    item.append(meta, body);
    if (message.direction === "self" && !message.draft && !message.attachment && !message.location) {
      item.append(createMessageActions(message));
    }
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
      if (message.attachment) {
        body.appendChild(createAttachmentElement(message.attachment));
      }
      if (message.location) {
        body.appendChild(createLocationElement(message.location));
      }
    }
  }

  function messageMetaText(message) {
    const sender = message.direction === "self"
      ? currentSenderName()
      : displayNameForJid(message.from);
    const status = message.edited
      ? `${message.status} (${t("message.edited", "edited")})`
      : message.status;
    return `${sender} - ${status} - ${formatTime(message.timestamp)}`;
  }

  function createMessageActions(message) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = t("button.edit_message", "Edit");
    editButton.addEventListener("click", () => startMessageEdit(message.id));
    actions.append(editButton);
    return actions;
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

  function createLocationElement(location) {
    const wrapper = document.createElement("div");
    wrapper.className = "location-card";

    const title = document.createElement("strong");
    title.textContent = t("location.card_title", "Shared location");

    const meta = document.createElement("span");
    meta.textContent = [
      `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon)}`,
      location.accuracy === null ? null : `${location.accuracy} m`,
      formatLocationTimestamp(location.timestamp)
    ].filter(Boolean).join(" - ");

    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.lat)}&mlon=${encodeURIComponent(location.lon)}#map=18/${encodeURIComponent(location.lat)}/${encodeURIComponent(location.lon)}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = t("location.open_map", "Open map");

    wrapper.append(title, meta, link);
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
    if (!hasActiveConversation()) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (!hasActiveMessageTransport()) {
      showNotConnectedStatus();
      return;
    }

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
    if (!hasActiveConversation()) {
      return;
    }

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
      showNotConnectedStatus();
      return;
    }

    const envelope = createRelayEnvelope("message", text, "");
    envelope.attachment = attachment;
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("upload-out", JSON.stringify(redactEnvelopeForLog(envelope)));
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

  function createMessageStanza(text, id = createMessageId("msg"), replaceId = null) {
    const replace = replaceId
      ? `<replace xmlns="urn:xmpp:message-correct:0" id="${escapeXml(replaceId)}"/>`
      : "";
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(el.jidInput.value)}" to="${escapeXml(el.peerInput.value)}" id="${escapeXml(id)}"><body>${escapeXml(text)}</body>${replace}</message>`;
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

  function normalizeXmppPort(value) {
    const port = Number.parseInt(String(value ?? ""), 10);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 5222;
  }

  function normalizeTlsMode(value) {
    const mode = String(value ?? "").trim().toLowerCase();
    return ["starttls", "direct-tls", "websocket"].includes(mode) ? mode : "starttls";
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
    if (!state.developerMode) {
      return;
    }

    const line = `[${new Date().toLocaleTimeString()}] ${prefix}: ${message}`;
    el.debugLog.textContent = el.debugLog.textContent
      ? el.debugLog.textContent + "\n" + line
      : line;
    el.debugLog.scrollTop = el.debugLog.scrollHeight;
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      let reloadedForServiceWorker = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadedForServiceWorker) {
          return;
        }

        reloadedForServiceWorker = true;
        location.reload();
      });

      navigator.serviceWorker.register("service-worker.js")
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }
})();
