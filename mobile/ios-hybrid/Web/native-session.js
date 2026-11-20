(function (root) {
  "use strict";

  const phases = new Set(["idle", "checking", "authenticating", "awaitingSecondFactor", "connecting", "connected", "failed", "signedOut", "suspended"]);
  const errors = new Set(["certificate", "timeout", "configuration", "offline", "serverResponse", "invalidCredentials", "secondFactorRequired", "accountRejected", "connectionLost", "invalidSecondFactor"]);
  const failures = new Set(["invalidRequest", "untrustedDocument", "replayedRequest", "sessionBusy", "invalidState", "unavailable"]);
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  function secureID(cryptoValue) {
    if (typeof cryptoValue?.randomUUID === "function") return cryptoValue.randomUUID();
    if (typeof cryptoValue?.getRandomValues !== "function") throw new Error("nativeUnavailable");
    const bytes = cryptoValue.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  }

  function safeState(value) {
    const keys = ["version", "sequence", "epoch", "phase", "errorCode", "chatAvailable", "callsAvailable", "socialLoginAvailable", "settingsAvailable", "roster", "conversation", "call"];
    if (!value || typeof value !== "object" || Array.isArray(value)
        || Object.keys(value).some(key => !keys.includes(key)) || value.version !== 1
        || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !phases.has(value.phase)
        || (value.epoch !== undefined && (typeof value.epoch !== "string" || !uuidPattern.test(value.epoch)))
        || (value.errorCode != null && !errors.has(value.errorCode))
        || (value.phase === "failed" && (value.errorCode == null || value.errorCode === "invalidSecondFactor"))
        || (value.phase !== "failed" && value.errorCode != null
          && !(value.phase === "awaitingSecondFactor" && value.errorCode === "invalidSecondFactor"))
        || typeof value.chatAvailable !== "boolean" || typeof value.callsAvailable !== "boolean" || value.socialLoginAvailable !== false
        || (value.phase !== "connected" && (value.chatAvailable || value.callsAvailable))
        || (value.settingsAvailable !== undefined && typeof value.settingsAvailable !== "boolean")) {
      throw new Error("invalidNativeReply");
    }
    const roster = safeRoster(value.roster, value.phase);
    const call = safeCall(value.call);
    const conversation = safeConversation(value.conversation, roster);
    if ((value.phase !== "connected" && (conversation || call.phase !== "idle"))
        || (!value.chatAvailable && conversation) || (!value.callsAvailable && !["idle", "failed"].includes(call.phase))) throw new Error("invalidNativeReply");
    return Object.freeze({ version: 1, sequence: value.sequence, epoch: value.epoch ?? null, phase: value.phase, errorCode: value.errorCode ?? null,
      chatAvailable: value.chatAvailable, callsAvailable: value.callsAvailable, socialLoginAvailable: false,
      settingsAvailable: value.settingsAvailable === true, roster, conversation, call });
  }

  function safeRoster(value, phase) {
    if (value === undefined) return Object.freeze({ status: "hidden", contacts: Object.freeze([]) });
    if (!value || typeof value !== "object" || Array.isArray(value)
        || Object.keys(value).sort().join(",") !== "contacts,status"
        || !["hidden", "loading", "ready", "unavailable"].includes(value.status)
        || !Array.isArray(value.contacts) || value.contacts.length > 100
        || (value.status !== "ready" && value.contacts.length !== 0)
        || (phase !== "connected" && value.status !== "hidden")) throw new Error("invalidNativeReply");
    const identifiers = new Set();
    const contacts = value.contacts.map(contact => {
      if (!contact || typeof contact !== "object" || Array.isArray(contact)
          || Object.keys(contact).some(key => !["jid", "name", "presence", "canCall"].includes(key))
          || typeof contact.jid !== "string" || !contact.jid || new TextEncoder().encode(contact.jid).length > 1023
          || /[\s\u0000-\u001f\u007f-\u009f/]/u.test(contact.jid) || identifiers.has(contact.jid)
          || typeof contact.name !== "string" || !contact.name || new TextEncoder().encode(contact.name).length > 4096
          || /[\u0000-\u001f\u007f-\u009f]/u.test(contact.name)
          || (contact.canCall !== undefined && typeof contact.canCall !== "boolean")
          || !["unknown", "offline", "online", "away", "extendedAway", "busy"].includes(contact.presence)) throw new Error("invalidNativeReply");
      identifiers.add(contact.jid);
      return Object.freeze({ jid: contact.jid, name: contact.name, presence: contact.presence, canCall: contact.canCall === true });
    });
    return Object.freeze({ status: value.status, contacts: Object.freeze(contacts) });
  }

  function safeText(value) {
    return typeof value === "string" && new TextEncoder().encode(value).length <= 8192
      && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value);
  }

  function safeConversation(value, roster) {
    if (value == null) return null;
    const keys = ["peer", "draft", "messages", "history", "canSend", "canChange"];
    if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== keys.sort().join(",")
        || !roster.contacts.some(contact => contact.jid === value.peer) || !safeText(value.draft)
        || !Array.isArray(value.messages) || value.messages.length > 100 || typeof value.canSend !== "boolean" || typeof value.canChange !== "boolean"
        || !["idle", "loading", "ready", "unavailable", "failed"].includes(value.history)) throw new Error("invalidNativeReply");
    const identifiers = new Set();
    const messages = value.messages.map(message => {
      const fields = ["id", "body", "outgoing", "timestamp", "state", "delivery", "edited", "retracted", "reactions"];
      if (!message || typeof message !== "object" || Object.keys(message).sort().join(",") !== fields.sort().join(",")
          || !uuidPattern.test(message.id) || identifiers.has(message.id) || !safeText(message.body)
          || typeof message.outgoing !== "boolean" || !Number.isFinite(message.timestamp) || Math.abs(message.timestamp) > 8640000000000
          || !["incoming", "sending", "submitted", "uncertain", "rejected"].includes(message.state)
          || !["unconfirmed", "delivered", "displayed"].includes(message.delivery)
          || typeof message.edited !== "boolean" || typeof message.retracted !== "boolean"
          || !Array.isArray(message.reactions) || message.reactions.length > 16
          || (message.outgoing === (message.state === "incoming"))) throw new Error("invalidNativeReply");
      identifiers.add(message.id);
      const reactions = message.reactions.map(reaction => {
        if (!reaction || Object.keys(reaction).sort().join(",") !== "count,emoji" || typeof reaction.emoji !== "string"
            || !safeText(reaction.emoji) || new TextEncoder().encode(reaction.emoji).length > 32
            || !Number.isSafeInteger(reaction.count) || reaction.count < 1 || reaction.count > 10000) throw new Error("invalidNativeReply");
        return Object.freeze({ emoji: reaction.emoji, count: reaction.count });
      });
      return Object.freeze({ ...message, reactions: Object.freeze(reactions) });
    });
    return Object.freeze({ peer: value.peer, draft: value.draft, history: value.history,
      canSend: value.canSend, canChange: value.canChange, messages: Object.freeze(messages) });
  }

  function safeCall(value) {
    const empty = { phase: "idle", id: null, peer: null, mode: null, muted: false, cameraEnabled: false, remoteCamera: "unknown",
      rttReady: false, canSwitchCamera: false, canSendDtmf: false, ownText: "", remoteText: "", videoFit: "contain" };
    if (value === undefined) return Object.freeze(empty);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(empty, key))) throw new Error("invalidNativeReply");
    const result = { ...empty, ...value };
    if (!["idle", "calling", "ringing", "active", "failed"].includes(result.phase)
        || ["muted", "cameraEnabled", "rttReady", "canSwitchCamera", "canSendDtmf"].some(key => typeof result[key] !== "boolean")
        || !["unknown", "on", "off"].includes(result.remoteCamera) || !["contain", "cover"].includes(result.videoFit)
        || !safeText(result.ownText) || !safeText(result.remoteText)) throw new Error("invalidNativeReply");
    if (["idle", "failed"].includes(result.phase)) {
      if (result.id || result.peer || result.mode || result.ownText || result.remoteText) throw new Error("invalidNativeReply");
    } else if (!uuidPattern.test(result.id || "") || typeof result.peer !== "string" || !result.peer
        || new TextEncoder().encode(result.peer).length > 1023 || /[\s/\u0000-\u001f]/u.test(result.peer)
        || !["audio", "video", "audio-rtt", "total"].includes(result.mode)) throw new Error("invalidNativeReply");
    return Object.freeze(result);
  }

  function createClient(options) {
    const { postMessage, makeID, setTimer = setTimeout, clearTimer = clearTimeout, timeout = 10000 } = options;
    let latest = null;
    let disposed = false;
    let pendingCount = 0;
    const pending = new Set();
    const listeners = new Set();

    function receive(value) {
      if (disposed) return;
      const state = safeState(value);
      if (latest && state.sequence <= latest.sequence) return;
      latest = state;
      for (const listener of listeners) {
        try { listener(state); } catch { }
      }
    }

    function request(command, argumentsValue = {}, expectedEpoch = latest?.epoch) {
      if (disposed) return Promise.reject(new Error("bridgeClosed"));
      if (pendingCount >= 8) return Promise.reject(new Error("bridgeBusy"));
      const id = makeID();
      if (!uuidPattern.test(id)) return Promise.reject(new Error("invalidRequest"));
      const scoped = command.startsWith("chat.") || command.startsWith("calls.");
      if (scoped && (!expectedEpoch || expectedEpoch !== latest?.epoch)) return Promise.reject(new Error("invalidState"));
      const body = JSON.stringify({ version: 1, id, command, arguments: argumentsValue, ...(scoped ? { epoch: expectedEpoch } : {}) });
      if (new TextEncoder().encode(body).length > 65536) return Promise.reject(new Error("invalidRequest"));
      pendingCount += 1;
      return new Promise((resolve, reject) => {
        let finished = false;
        let timer;
        const finish = (error, result) => {
          if (finished) return;
          finished = true;
          pendingCount -= 1;
          pending.delete(cancel);
          clearTimer(timer);
          if (error) reject(error); else resolve(result);
        };
        const cancel = () => finish(new Error("bridgeClosed"));
        pending.add(cancel);
        timer = setTimer(() => finish(new Error("bridgeTimeout")), timeout);
        Promise.resolve().then(() => postMessage(body)).then(reply => {
          if (finished || disposed) return;
          try {
            if (!reply || typeof reply !== "object" || Array.isArray(reply)
                || Object.keys(reply).sort().join(",") !== "id,snapshot,version"
                || reply.version !== 1 || typeof reply.id !== "string" || reply.id.toLowerCase() !== id.toLowerCase()) {
              throw new Error("invalidNativeReply");
            }
            receive(reply.snapshot);
            finish(null, latest);
          } catch { finish(new Error("invalidNativeReply")); }
        }, error => {
          const message = typeof error === "string" ? error : error?.message;
          finish(new Error(failures.has(message) ? message : "nativeUnavailable"));
        });
      });
    }

    return Object.freeze({
      snapshot: () => request("session.snapshot"),
      login: (jid, password) => {
        if (typeof jid !== "string" || typeof password !== "string" || !jid || !password
            || new TextEncoder().encode(jid).length > 1023 || new TextEncoder().encode(password).length > 1024
            || /[\u0000-\u001f\u007f]/.test(jid) || password.includes("\u0000")) {
          return Promise.reject(new Error("invalidRequest"));
        }
        return request("session.login", { jid, password });
      },
      verifySecondFactor: code => typeof code === "string" && /^[0-9]{6}$/.test(code)
        ? request("session.verifySecondFactor", { code }) : Promise.reject(new Error("invalidRequest")),
      cancel: () => request("session.cancel"),
      logout: () => request("session.logout"),
      openSettings: () => request("app.openSettings"),
      openChat: (peer, epoch) => request("chat.open", { peer }, epoch),
      closeChat: epoch => request("chat.close", {}, epoch),
      setDraft: (peer, body, epoch) => safeText(body) ? request("chat.draft", { peer, body }, epoch) : Promise.reject(new Error("invalidRequest")),
      sendMessage: (peer, body, epoch) => safeText(body) && body.trim() ? request("chat.send", { peer, body }, epoch) : Promise.reject(new Error("invalidRequest")),
      displayed: (peer, ids) => request("chat.displayed", { peer, ids: ids.join(",") }),
      editMessage: (peer, id, body) => request("chat.edit", { peer, id, body }),
      hideMessage: (peer, id) => request("chat.hide", { peer, id }),
      retractMessage: (peer, id) => request("chat.retract", { peer, id }),
      forwardMessage: (peer, id, target) => request("chat.forward", { peer, id, target }),
      reactMessage: (peer, id, emoji) => request("chat.react", { peer, id, emoji }),
      startCall: (peer, mode, epoch) => request("calls.start", { peer, mode }, epoch),
      resetCallFailure: () => request("calls.reset"),
      controlCall: (id, action, value) => request("calls.control", { id, action, ...(value === undefined ? {} : { value }) }),
      placeVideo: (id, frame) => request("calls.layout", { id, ...Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, String(value)])) }),
      receive,
      subscribe: listener => {
        if (disposed || typeof listener !== "function") throw new Error("bridgeClosed");
        listeners.add(listener);
        if (latest) listener(latest);
        return () => listeners.delete(listener);
      },
      dispose: () => {
        disposed = true;
        for (const cancel of [...pending]) cancel();
        listeners.clear();
        latest = null;
      }
    });
  }

  function install(windowValue) {
    if (windowValue.top !== windowValue || windowValue.location.href !== "capacitor://localhost/chat.html"
        || typeof windowValue.webkit?.messageHandlers?.teletyptelNative?.postMessage !== "function") {
      throw new Error("untrustedDocument");
    }
    if (windowValue.TeleTypTelNativeSession) throw new Error("bridgeAlreadyInstalled");
    const blocked = function () { throw new Error("nativeEngineRequired"); };
    for (const name of ["WebSocket", "RTCPeerConnection", "webkitRTCPeerConnection", "XMLHttpRequest", "EventSource"]) {
      Object.defineProperty(windowValue, name, { value: blocked, writable: false, configurable: false });
    }
    const originalFetch = windowValue.fetch?.bind(windowValue);
    Object.defineProperty(windowValue, "fetch", { writable: false, configurable: false, value: function (input, options) {
      const address = new URL(typeof input === "string" ? input : input?.url, windowValue.location.href);
      if (!originalFetch || address.protocol !== "capacitor:" || address.hostname !== "localhost" || address.port
          || address.username || address.password || address.search || address.hash
          || !/^(?:\/lang\/[a-z]+\.lng|\/(?:assets\/(?:brand|backgrounds|icons)|smileys)\/[a-zA-Z0-9_@./-]+\.(?:png|svg|gif|jpg|webp))$/.test(address.pathname)
          || (options?.method && options.method.toUpperCase() !== "GET")
          || (typeof input !== "string" && input?.method && input.method.toUpperCase() !== "GET")) {
        return Promise.reject(new Error("nativeEngineRequired"));
      }
      return originalFetch(input, { ...options, redirect: "error", credentials: "omit" });
    } });
    if (windowValue.navigator.mediaDevices) {
      for (const name of ["getUserMedia", "getDisplayMedia"]) {
        Object.defineProperty(windowValue.navigator.mediaDevices, name, { value: blocked, writable: false, configurable: false });
      }
    }
    for (const name of ["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia", "sendBeacon"]) {
      Object.defineProperty(windowValue.navigator, name, { value: blocked, writable: false, configurable: false });
    }
    const handler = windowValue.webkit.messageHandlers.teletyptelNative;
    const client = createClient({ postMessage: body => handler.postMessage(body), makeID: () => secureID(windowValue.crypto) });
    const receive = event => { try { client.receive(event.detail); } catch { } };
    windowValue.addEventListener("teletyptel:native-state", receive);
    windowValue.addEventListener("pagehide", () => {
      windowValue.removeEventListener("teletyptel:native-state", receive);
      client.dispose();
    }, { once: true });
    Object.defineProperty(windowValue, "TeleTypTelNativeSession", { value: client, writable: false, configurable: false });
    return client;
  }

  if (typeof module === "object" && module.exports) module.exports = { createClient, safeState, install, secureID, safeRoster, safeCall, safeConversation, safeText };
  else install(root);
})(typeof window === "undefined" ? globalThis : window);
