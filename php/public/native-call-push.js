(function (root) {
  "use strict";

  function create({ translate, signedIn, settingsButton, statusElement } = {}) {
    const bridge = root.Capacitor?.getPlatform?.() === "ios" && root.Capacitor?.Plugins?.TeleTypTelVoipCalls;
    const text = (key, fallback) => translate?.("call_push." + key, fallback) || fallback;
    const endpoint = "api/call-push.php";
    let accountId = "";
    let revision = 0;
    let sequence = Promise.resolve();
    let renewal;
    let recoveryTimer;
    let recoveryDelay = 2000;
    let lastToken = "";
    let expiresAt = 0;
    let consented = false;
    let refreshPending = false;
    let refreshAgain = false;
    let busy = false;

    const show = (key, fallback) => {
      if (statusElement) {
        statusElement.hidden = false;
        statusElement.textContent = text(key, fallback);
      }
    };
    const render = state => {
      consented = state?.consented === true && state.accountId === accountId;
      if (!settingsButton) return;
      settingsButton.hidden = state?.enabled !== true;
      settingsButton.disabled = busy;
      settingsButton.textContent = consented
        ? text("disable", "Disable call notifications") : text("enable", "Enable call notifications (test)");
      settingsButton.setAttribute("aria-pressed", String(consented));
    };
    const enqueue = work => {
      const result = sequence.then(work);
      sequence = result.catch(() => {});
      return result;
    };
    const context = () => ({ accountId, revision });
    const current = owner => owner.accountId && owner.accountId === accountId && owner.revision === revision && signedIn?.();
    const check = owner => { if (!current(owner)) throw new Error("STALE_SESSION"); };
    const request = async (owner, method, body, csrfToken) => {
      const controller = new AbortController();
      const timeout = root.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await root.fetch(endpoint, {
          method, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
          headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (!response.ok) throw new Error(response.status === 404 ? "UNAVAILABLE" : "REQUEST_FAILED");
        const result = await response.json();
        if (result.ok !== true || result.accountId !== owner.accountId) throw new Error("ACCOUNT_MISMATCH");
        return result;
      } finally { root.clearTimeout(timeout); }
    };
    const preflight = async owner => {
      const result = await request(owner, "GET");
      if (!/^[a-f0-9]{64}$/.test(result.csrfToken || "")) throw new Error("INVALID_SESSION");
      return result;
    };
    const revoke = async (owner, state) => {
      if (state.pendingAccountId && state.pendingAccountId !== owner.accountId) throw new Error("PREVIOUS_ACCOUNT");
      const { csrfToken: csrf } = await preflight(owner);
      const result = await request(owner, "POST", { action: "revoke-device", deviceId: state.deviceId }, csrf);
      if (result.revoked !== true) throw new Error("REQUEST_FAILED");
      if (state.pendingAccountId) await bridge.revocationConfirmed({ accountId: owner.accountId });
      lastToken = "";
      expiresAt = 0;
    };
    const failure = error => {
      if (error.message === "STALE_SESSION") return;
      if (error.message === "PREVIOUS_ACCOUNT") {
        show("previous_account", "Sign in to the previous account to finish disabling this device's call notifications.");
      } else if (["UNAVAILABLE", "NATIVE_CONTROL_UNAVAILABLE"].includes(error.message)) {
        show("unavailable", "Call notifications are not yet enabled on this server.");
      } else {
        show("failed", "Call notification changes could not be confirmed. Check your connection and try again.");
      }
    };
    const reconcile = async (owner, state) => {
      const calls = Array.isArray(state.calls)
        ? state.calls.filter(call => ["ringing", "answerRequested"].includes(call.phase)) : [];
      const ended = Array.isArray(state.ended) ? state.ended : [];
      if (!calls.length && !ended.length) return true;
      const pending = new Map();
      for (const call of calls) pending.set(call.callId, { callId: call.callId, sid: call.sid, end: false });
      for (const event of ended) pending.set(event.callId, { callId: event.callId, sid: event.sid, end: true });
      const { csrfToken: csrf, devices } = await preflight(owner);
      check(owner);
      if (!Array.isArray(devices)) throw new Error("INVALID_REGISTRATION");
      if (!devices.some(device => device.device_id === state.deviceId)) return false;
      const result = await request(owner, "POST", {
        action: "reconcile", deviceId: state.deviceId, calls: [...pending.values()]
      }, csrf);
      check(owner);
      const terminal = ["ended", "expired", "unavailable", "answered-elsewhere"];
      const seen = new Set();
      if (!Array.isArray(result.calls) || result.calls.length !== pending.size) throw new Error("INVALID_CALL_STATE");
      for (const call of result.calls) {
        const expected = pending.get(call.callId);
        if (!expected || seen.has(call.callId) || call.sid !== expected.sid
            || ![...terminal, "ringing", "accepted"].includes(call.state)
            || (expected.end && !terminal.includes(call.state))) throw new Error("INVALID_CALL_STATE");
        seen.add(call.callId);
      }
      for (const call of result.calls) {
        check(owner);
        if (!terminal.includes(call.state)) continue;
        if (pending.get(call.callId).end) {
          for (const event of ended.filter(event => event.callId === call.callId && event.sid === call.sid)) {
            check(owner);
            await bridge.acknowledge({ eventId: event.eventId });
          }
        } else {
          await bridge.end({ callId: call.callId, sid: call.sid });
        }
      }
      return true;
    };
    const scheduleRecovery = () => {
      root.clearTimeout(recoveryTimer);
      if (!root.document.hidden && root.navigator?.onLine !== false) {
        recoveryTimer = root.setTimeout(() => void refresh(), recoveryDelay);
      }
    };
    const sync = async owner => {
      check(owner);
      let state = await bridge.state();
      check(owner);
      render(state);
      if (!state.enabled) return;
      if (state.accountId && state.accountId !== owner.accountId) {
        await bridge.disable();
        state = await bridge.state();
        render(state);
      }
      if (state.pendingAccountId) {
        await revoke(owner, state);
        check(owner);
        render(await bridge.state());
        show("disabled", "Call notifications are disabled on this device.");
        return;
      }
      if (!consented) return;
      let restoreRegistration = false;
      if (state.calls?.some(call => ["ringing", "answerRequested"].includes(call.phase)) || state.ended?.length) {
        try { restoreRegistration = !await reconcile(owner, state); recoveryDelay = 2000; }
        catch (error) { recoveryDelay = Math.min(recoveryDelay * 2, 30000); throw error; }
        finally { if (current(owner)) scheduleRecovery(); }
        check(owner);
        if (state.calls?.length && !restoreRegistration) return;
      }
      if (!state.token) {
        await revoke(owner, state);
        check(owner);
        show("waiting", "Waiting for Apple's device registration…");
        return;
      }
      if (!restoreRegistration && lastToken === state.token && expiresAt - Date.now() / 1000 > 43200
          && state.nativeControlReady !== false) return;
      const { csrfToken: csrf } = await preflight(owner);
      check(owner);
      const latest = await bridge.state();
      check(owner);
      if (latest.accountId !== owner.accountId || !latest.consented || latest.token !== state.token
          || (!restoreRegistration && latest.calls?.some(call => ["ringing", "answerRequested"].includes(call.phase)))) {
        refreshAgain = true;
        return;
      }
      const result = await request(owner, "POST", {
        action: "register", consent: true, deviceId: state.deviceId, token: state.token
      }, csrf);
      if (!current(owner)) {
        await revoke(owner, state);
        return;
      }
      if (result.deviceId !== state.deviceId || !Number.isFinite(result.expiresAt)
          || result.expiresAt <= Date.now() / 1000 || result.expiresAt > Date.now() / 1000 + 86500) {
        throw new Error("INVALID_REGISTRATION");
      }
      if (typeof bridge.configureControl === "function") {
        if (typeof result.controlToken !== "string" || !/^[0-9a-f]{2,960}\.[0-9a-f]{64}$/.test(result.controlToken)) {
          throw new Error("NATIVE_CONTROL_UNAVAILABLE");
        }
        await bridge.configureControl({ accountId: owner.accountId, deviceId: state.deviceId,
          token: result.controlToken, expiresAt: result.expiresAt });
        if (!current(owner)) { await bridge.disable(); await revoke(owner, state); return; }
      }
      lastToken = state.token;
      expiresAt = result.expiresAt;
      if (restoreRegistration) refreshAgain = true;
      root.clearTimeout(renewal);
      renewal = root.setTimeout(() => { if (!root.document.hidden) void refresh(); }, 43200000);
      show("registered", "Device registered for testing. Background calls still require an end-to-end test.");
    };
    const refresh = () => {
      if (!bridge || !accountId || !signedIn?.()) return Promise.resolve();
      if (refreshPending) { refreshAgain = true; return Promise.resolve(); }
      refreshPending = true;
      const owner = context();
      return enqueue(() => sync(owner)).catch(failure).finally(() => {
        refreshPending = false;
        if (refreshAgain) { refreshAgain = false; void refresh(); }
      });
    };
    const ready = account => {
      if (!bridge || !signedIn?.() || !account?.accountId) return Promise.resolve();
      if (accountId !== account.accountId) {
        revision++;
        accountId = account.accountId;
        lastToken = "";
        expiresAt = 0;
        recoveryDelay = 2000;
        root.clearTimeout(renewal);
        root.clearTimeout(recoveryTimer);
      }
      return refresh();
    };
    const enable = () => {
      if (!bridge) return Promise.resolve();
      const owner = context();
      return enqueue(async () => {
        check(owner);
        let state = await bridge.state();
        check(owner);
        if (!state.enabled) throw new Error("UNAVAILABLE");
        if (state.accountId && state.accountId !== owner.accountId) throw new Error("PREVIOUS_ACCOUNT");
        if (state.pendingAccountId) {
          await revoke(owner, state);
          check(owner);
        }
        await preflight(owner);
        check(owner);
        if (!root.confirm(text("consent", "Allow this device to receive call notifications through Apple? Its device token will be stored securely on the TeleTypTel server. This test version does not yet provide working background calls."))) return;
        await bridge.register({ accountId: owner.accountId });
        if (!current(owner)) { await bridge.disable(); return; }
        await sync(owner);
      });
    };
    const disable = async ({ logout = false } = {}) => {
      const owner = context();
      revision++;
      if (logout) accountId = "";
      root.clearTimeout(renewal);
      root.clearTimeout(recoveryTimer);
      lastToken = "";
      expiresAt = 0;
      consented = false;
      recoveryDelay = 2000;
      if (!bridge) return;
      await bridge.disable();
      return enqueue(async () => {
        const state = await bridge.state();
        render(state);
        if (logout && !owner.accountId) owner.accountId = state.pendingAccountId;
        if (state.pendingAccountId) {
          if (!owner.accountId) throw new Error("PREVIOUS_ACCOUNT");
          await revoke(owner, state);
        }
        if (state.enabled) show("disabled", "Call notifications are disabled on this device.");
      });
    };
    settingsButton?.addEventListener("click", async () => {
      if (busy || !bridge) return;
      busy = true;
      settingsButton.disabled = true;
      try { if (consented) await disable(); else await enable(); }
      catch (error) { failure(error); }
      finally { busy = false; settingsButton.disabled = false; }
    });
    if (bridge) {
      Promise.resolve(bridge.addListener("changed", () => void refresh())).catch(() => {});
      root.document.addEventListener("visibilitychange", () => {
        root.clearTimeout(recoveryTimer);
        if (!root.document.hidden) void refresh();
      });
      root.addEventListener("online", () => void refresh());
    }
    return { ready, refresh, enable, disable, logout: () => disable({ logout: true }) };
  }

  root.TeleTypTelCallPush = { create };
})(window);
