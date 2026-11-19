(function (root) {
  "use strict";

  const phases = new Set(["idle", "checking", "authenticating", "awaitingSecondFactor", "connecting", "connected", "failed", "signedOut", "suspended"]);
  const errors = new Set(["certificate", "timeout", "configuration", "offline", "serverResponse", "invalidCredentials", "secondFactorRequired", "accountRejected", "connectionLost", "invalidSecondFactor"]);
  const failures = new Set(["invalidRequest", "untrustedDocument", "replayedRequest", "sessionBusy", "invalidState", "unavailable"]);
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  function safeState(value) {
    const keys = ["version", "sequence", "phase", "errorCode", "chatAvailable", "callsAvailable", "socialLoginAvailable"];
    if (!value || typeof value !== "object" || Array.isArray(value)
        || Object.keys(value).some(key => !keys.includes(key)) || value.version !== 1
        || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !phases.has(value.phase)
        || (value.errorCode != null && !errors.has(value.errorCode))
        || (value.phase === "failed" && (value.errorCode == null || value.errorCode === "invalidSecondFactor"))
        || (value.phase !== "failed" && value.errorCode != null
          && !(value.phase === "awaitingSecondFactor" && value.errorCode === "invalidSecondFactor"))
        || value.chatAvailable !== false || value.callsAvailable !== false || value.socialLoginAvailable !== false) {
      throw new Error("invalidNativeReply");
    }
    return Object.freeze({ version: 1, sequence: value.sequence, phase: value.phase, errorCode: value.errorCode ?? null,
      chatAvailable: false, callsAvailable: false, socialLoginAvailable: false });
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

    function request(command, argumentsValue = {}) {
      if (disposed) return Promise.reject(new Error("bridgeClosed"));
      if (pendingCount >= 8) return Promise.reject(new Error("bridgeBusy"));
      const id = makeID();
      if (!uuidPattern.test(id)) return Promise.reject(new Error("invalidRequest"));
      const body = JSON.stringify({ version: 1, id, command, arguments: argumentsValue });
      if (new TextEncoder().encode(body).length > 8192) return Promise.reject(new Error("invalidRequest"));
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
    const client = createClient({ postMessage: body => handler.postMessage(body), makeID: () => windowValue.crypto.randomUUID() });
    const receive = event => { try { client.receive(event.detail); } catch { } };
    windowValue.addEventListener("teletyptel:native-state", receive);
    windowValue.addEventListener("pagehide", () => {
      windowValue.removeEventListener("teletyptel:native-state", receive);
      client.dispose();
    }, { once: true });
    Object.defineProperty(windowValue, "TeleTypTelNativeSession", { value: client, writable: false, configurable: false });
    return client;
  }

  if (typeof module === "object" && module.exports) module.exports = { createClient, safeState, install };
  else install(root);
})(typeof window === "undefined" ? globalThis : window);
