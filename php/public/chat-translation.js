"use strict";
window.TeleTypTelTranslation = {
  create({ translate: translateLabel, refreshMessage, refreshLive = () => {}, openSettings = () => {}, xmpp = null }) {
    const target = document.getElementById("translationTarget");
    const mode = document.getElementById("translationMode");
    const consent = document.getElementById("translationConsent");
    const manualConsentInput = document.getElementById("translationManualConsent");
    const liveConsent = document.getElementById("translationLiveConsent");
    const ownLiveConsent = document.getElementById("translationOwnLiveConsent");
    const reload = document.getElementById("translationReload");
    const status = document.getElementById("translationSettingsStatus");
    const consentLabel = document.getElementById("translationConsentLabel");
    const label = (key) => translateLabel("translation." + key, key);
    let accountId = "";
    let generation = 0;
    let csrf = "";
    let available = false;
    let loaded = false;
    const defaults = () => ({ targetLanguage: "nl", mode: "manual", automaticConsent: false, liveRttConsent: false, ownLiveRttConsent: false });
    let preferences = defaults();
    let statusKey = "sign_in";
    let results = new WeakMap();
    let requests = new Set();
    let queue = [];
    let working = false;
    let paused = false;
    const manualConsentKey = () => "teletyptel_translation_google_v1_" + encodeURIComponent(accountId);
    const hasManualConsent = () => {
      try { return Boolean(accountId) && document.cookie.split("; ").includes(manualConsentKey() + "=allowed"); }
      catch { return false; }
    };
    const rememberManualConsent = (allowed) => {
      if (!accountId) return false;
      try {
        document.cookie = manualConsentKey() + "=" + (allowed ? "allowed" : "")
          + "; Path=/; SameSite=Strict; Max-Age=" + (allowed ? 15552000 : 0)
          + (location.protocol === "https:" ? "; Secure" : "");
      } catch {}
      return hasManualConsent() === allowed;
    };
    const clearLegacyManualConsent = () => {
      try { localStorage.removeItem("teletyptel.translation.manualConsent.google.v1." + encodeURIComponent(accountId)); } catch {}
    };
    const liveDrafts = { peer: null, self: null };
    let liveTimer = null;
    let liveRequest = null;
    let liveDirection = "";
    let liveFailure = "";
    let lastLiveRequestAt = 0;

    const clearLive = (direction = null) => {
      clearTimeout(liveTimer);
      liveTimer = null;
      if (!direction || liveDirection === direction) {
        liveRequest?.abort();
        liveRequest = null;
        liveDirection = "";
      }
      for (const side of direction ? [direction] : Object.keys(liveDrafts)) delete liveDrafts[side];
      refreshLive();
    };

    const showStatus = (key) => {
      statusKey = key;
      status.textContent = label(key);
      refreshLive();
    };
    const syncConsent = () => {
      consentLabel.hidden = mode.value !== "automatic";
      liveConsent.disabled = !loaded || mode.value === "off";
      ownLiveConsent.disabled = liveConsent.disabled;
      manualConsentInput.disabled = liveConsent.disabled;
      if (mode.value === "off") liveConsent.checked = ownLiveConsent.checked = manualConsentInput.checked = false;
    };
    const resetRequests = () => {
      generation += 1;
      liveFailure = "";
      clearLive();
      requests.forEach((controller) => controller.abort());
      requests = new Set();
      queue = [];
      working = false;
      results = new WeakMap();
    };
    const updateControls = () => {
      target.value = preferences.targetLanguage;
      mode.value = preferences.mode;
      consent.checked = preferences.automaticConsent;
      manualConsentInput.checked = hasManualConsent();
      liveConsent.checked = preferences.liveRttConsent === true;
      ownLiveConsent.checked = preferences.ownLiveRttConsent === true;
      target.disabled = mode.disabled = consent.disabled = !loaded;
      syncConsent();
    };
    const request = async (body, controller = new AbortController()) => {
      requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        if (body?.action === "translate" && xmpp?.configured()) return await xmpp.translate(body, controller.signal);
        const response = await fetch("api/translation.php", { method: body ? "POST" : "GET", cache: "no-store",
          signal: controller.signal, headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {},
          body: body ? JSON.stringify(body) : undefined });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || (response.status === 401 || response.status === 403 ? "sign_in" : "failed"));
        return data;
      } finally {
        clearTimeout(timeout);
        requests.delete(controller);
      }
    };
    const errorKey = (error) => ["unavailable", "disabled", "consent_required", "cookie_blocked", "limit_reached", "text_too_long", "invalid_text", "sign_in", "session_expired", "preferences_changed"].includes(error.message)
      ? error.message : "failed";
    const setAccount = async (nextAccount, force = false) => {
      if (nextAccount === accountId && !force) return;
      resetRequests();
      accountId = nextAccount || "";
      csrf = "";
      xmpp?.configure("");
      loaded = available = false;
      paused = false;
      reload.disabled = false;
      preferences = defaults();
      updateControls();
      showStatus(accountId ? "loading" : "sign_in");
      refreshMessage();
      if (!accountId) return;
      const current = generation;
      try {
        const data = await request();
        if (current !== generation) return;
        if (data.accountId !== accountId) throw new Error("session_expired");
        csrf = data.csrfToken;
        xmpp?.configure(data.xmppServiceJid || "");
        available = data.available === true;
        preferences = data.preferences;
        if (preferences.mode === "off") rememberManualConsent(false);
        clearLegacyManualConsent();
        target.replaceChildren(...Object.entries(data.languages).map(([code, name]) => {
          const option = document.createElement("option");
          option.value = code;
          option.textContent = name;
          return option;
        }));
        loaded = true;
        updateControls();
        showStatus(available ? "ready" : "unavailable");
        refreshMessage();
      } catch (error) {
        if (current === generation) showStatus(errorKey(error));
      }
    };
    [mode, target, consent, manualConsentInput, liveConsent, ownLiveConsent].forEach((control) => control.addEventListener("change", () => {
      if (mode.value === "off" || (control === manualConsentInput && !manualConsentInput.checked)) rememberManualConsent(false);
      paused = true;
      resetRequests();
      syncConsent();
      showStatus("preferences_unsaved");
      refreshMessage();
    }));
    reload.addEventListener("click", () => setAccount(accountId, true));
    const preferencesError = (key, fieldId = "translationMode") => {
      const error = new Error(label(key));
      error.fieldId = fieldId;
      return error;
    };
    const validatePreferences = () => {
      if (!paused) return;
      if (!loaded) throw preferencesError(statusKey);
      if (mode.value === "automatic" && !consent.checked) {
        showStatus("consent_required");
        throw preferencesError("consent_required", "translationConsent");
      }
    };
    const savePreferences = async () => {
      validatePreferences();
      if (!paused) return;
      const next = { action: "preferences", targetLanguage: target.value, mode: mode.value, automaticConsent: consent.checked,
        liveRttConsent: liveConsent.checked, ownLiveRttConsent: ownLiveConsent.checked };
      const nextManualConsent = mode.value !== "off" && manualConsentInput.checked;
      resetRequests();
      const current = generation;
      loaded = false;
      target.disabled = mode.disabled = reload.disabled = true;
      consent.disabled = manualConsentInput.disabled = liveConsent.disabled = ownLiveConsent.disabled = true;
      showStatus("saving");
      refreshMessage();
      try {
        const data = await request(next);
        if (current !== generation) throw new Error("session_expired");
        preferences = data.preferences;
        if (!rememberManualConsent(nextManualConsent)) throw new Error("cookie_blocked");
        paused = false;
        updateControls();
        showStatus(available ? "saved" : "saved_unavailable");
      } catch (error) {
        if (current === generation) showStatus(errorKey(error));
        throw preferencesError(errorKey(error));
      } finally {
        if (current === generation) {
          loaded = true;
          target.disabled = mode.disabled = consent.disabled = reload.disabled = false;
          syncConsent();
          refreshMessage();
        }
      }
    };

    const liveAllowed = (direction = "peer") => loaded && !paused && available && preferences.mode !== "off"
      && preferences[direction === "self" ? "ownLiveRttConsent" : "liveRttConsent"] === true && !document.hidden;
    const renderOwnStatus = (container) => {
      if (liveAllowed("self") || document.hidden) return;
      const reason = !loaded ? statusKey : paused ? "preferences_unsaved" : !available ? "unavailable"
        : preferences.mode === "off" ? "disabled" : "own_live_disabled";
      const wrapper = document.createElement("div");
      wrapper.className = "translation-notice";
      const explanation = document.createElement("div");
      explanation.setAttribute("role", "status");
      explanation.textContent = label(reason);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label(["sign_in", "session_expired"].includes(reason) ? "sign_in_action" : "settings_action");
      button.disabled = ["loading", "saving"].includes(reason);
      button.addEventListener("click", () => openSettings(reason));
      wrapper.append(explanation, button);
      container.append(wrapper);
    };
    const scheduleLive = () => {
      clearTimeout(liveTimer);
      liveTimer = null;
      if (liveRequest || liveFailure) return;
      const candidates = Object.entries(liveDrafts).filter(([direction, draft]) => liveAllowed(direction) && draft?.text.trim()
        && draft.result?.original !== draft.text && draft.text.length <= 20000 && Array.from(draft.text).length <= 5000)
        .map(([direction, draft]) => ({ direction, due: Math.min(draft.changedAt + 800, draft.dirtySince + 4000) }))
        .sort((first, second) => first.due - second.due);
      if (!candidates.length) return;
      const next = candidates[0];
      const due = Math.max(lastLiveRequestAt + 3000, next.due);
      liveTimer = setTimeout(() => { void translateLive(next.direction); }, Math.max(0, due - Date.now()));
    };
    const translateLive = async (direction) => {
      liveTimer = null;
      const draft = liveDrafts[direction];
      if (!liveAllowed(direction) || !draft?.text.trim() || liveRequest || liveFailure) return;
      const original = draft.text;
      const current = generation;
      const controller = new AbortController();
      liveRequest = controller;
      liveDirection = direction;
      lastLiveRequestAt = Date.now();
      draft.dirtySince = 0;
      refreshLive();
      try {
        const data = await request({ action: "translate", text: original, targetLanguage: preferences.targetLanguage,
          consent: true, automatic: false, liveRtt: true, ...(direction === "self" ? { liveDirection: "self" } : {}) }, controller);
        if (current !== generation || draft !== liveDrafts[direction] || !draft.text.startsWith(original) || !liveAllowed(direction)) return;
        draft.result = { original, text: data.translation.text };
      } catch (error) {
        if (current === generation && draft === liveDrafts[direction]) liveFailure = errorKey(error);
      } finally {
        if (liveRequest === controller) {
          liveRequest = null;
          liveDirection = "";
          refreshLive();
          scheduleLive();
        }
      }
    };
    const setLiveDraft = (conversationId, text = "", sender = "", direction = "peer", draftKey = direction) => {
      if (!["peer", "self"].includes(direction)) return;
      let liveDraft = liveDrafts[draftKey];
      if (!liveAllowed(direction) || !conversationId || !text.trim()) {
        if (liveDraft) { clearLive(draftKey); scheduleLive(); }
        return;
      }
      if (liveDraft?.conversationId !== conversationId || liveDraft.sender !== sender) {
        clearLive(draftKey);
        liveDraft = liveDrafts[draftKey] = { conversationId, sender, text: "", dirtySince: 0, result: null };
      }
      if (text === liveDraft.text) return;
      liveDraft.text = text;
      liveDraft.changedAt = Date.now();
      liveDraft.dirtySince ||= liveDraft.changedAt;
      if (liveDraft.result && !text.startsWith(liveDraft.result.original)) liveDraft.result = null;
      refreshLive();
      scheduleLive();
    };
    const setPeerDrafts = (conversationId, drafts) => {
      const selected = drafts.slice(0, 50);
      const keys = new Set(selected.map((draft) => "peer:" + draft.sender));
      for (const key of Object.keys(liveDrafts)) {
        if (key !== "self" && !keys.has(key)) clearLive(key);
      }
      for (const draft of selected) setLiveDraft(conversationId, draft.text, draft.sender, "peer", "peer:" + draft.sender);
      scheduleLive();
    };
    const findLiveDraft = (direction, sender = "") => direction === "self" ? liveDrafts.self
      : liveDrafts["peer:" + sender] || liveDrafts.peer;
    const translationInfo = (info, targetLanguage, provisional = false) => {
      const details = document.createElement("details");
      details.className = "translation-info";
      details.open = info.detailsOpen === true;
      const summary = document.createElement("summary");
      summary.textContent = label("heading");
      const explanation = document.createElement("small");
      explanation.textContent = label("warning") + (provisional ? " " + label("live_provisional") + "." : "") + " · Google · " + targetLanguage;
      details.append(summary, explanation);
      details.addEventListener("toggle", () => { info.detailsOpen = details.open; });
      return details;
    };
    const renderLive = (container, direction = "peer", sender = "") => {
      const liveDraft = findLiveDraft(direction, sender);
      if (!liveAllowed(direction) || !liveDraft?.text) return;
      const wrapper = document.createElement("div");
      wrapper.className = "live-rtt-translation message-translation-result";
      wrapper.setAttribute("role", "status");
      const heading = translationInfo(liveDraft, preferences.targetLanguage, true);
      const text = document.createElement("div");
      text.className = "live-rtt-translation-text";
      const tooLong = liveDraft.text.length > 20000 || Array.from(liveDraft.text).length > 5000;
      const statusKey = liveFailure || (tooLong ? "text_too_long" : liveDraft.result?.original !== liveDraft.text ? "live_updating" : "");
      text.textContent = liveDraft.result?.text || label(liveFailure || (tooLong ? "text_too_long" : liveRequest && liveDrafts[liveDirection] === liveDraft ? "live_translating" : "live_waiting"));
      if (liveDraft.result) {
        text.lang = preferences.targetLanguage;
        text.dir = "auto";
      }
      wrapper.append(heading, text);
      if (liveDraft.result && statusKey) {
        const progress = document.createElement("small");
        progress.className = "live-rtt-translation-progress";
        progress.textContent = label(statusKey);
        wrapper.append(progress);
      }
      container.append(wrapper);
    };
    document.addEventListener("visibilitychange", () => { if (document.hidden) clearLive(); });

    const eligible = (message) => message && !message.draft && !message.retracted && !message.attachment && !message.location
      && !message.jingleHistory && !/^call(?:\s|$)/.test(message.status || "")
      && ["peer", "self"].includes(message.direction) && typeof message.text === "string" && message.text.trim() !== "";
    const currentResult = (message) => {
      const result = results.get(message);
      return result && result.original === message.text && result.target === preferences.targetLanguage ? result : null;
    };
    const translateMessage = async (message, automatic = false) => {
      if (!loaded || paused || !available || preferences.mode === "off" || !eligible(message)) return;
      if (automatic && (preferences.mode !== "automatic" || !preferences.automaticConsent)) return;
      const previous = currentResult(message);
      if (previous?.pending || previous?.text || (automatic && previous?.error)) return;
      if (!automatic && !hasManualConsent()) {
        showStatus("manual_consent_required");
        openSettings("manual_consent_required");
        return;
      }
      const current = generation;
      const result = { original: message.text, target: preferences.targetLanguage, pending: true };
      results.set(message, result);
      refreshMessage(message);
      try {
        const data = await request({ action: "translate", text: result.original, targetLanguage: result.target, consent: true, automatic });
        if (current !== generation || !eligible(message) || result.original !== message.text) return;
        result.text = data.translation.text;
      } catch (error) {
        if (current !== generation) return;
        result.error = errorKey(error);
      } finally {
        if (current === generation) {
          result.pending = false;
          refreshMessage(message);
        }
      }
    };
    const drain = async () => {
      if (working) return;
      working = true;
      const current = generation;
      while (queue.length && current === generation) await translateMessage(queue.shift(), true);
      if (current === generation) working = false;
    };
    const incoming = (message) => {
      if (loaded && !paused && available && preferences.mode === "automatic" && preferences.automaticConsent
          && message.direction === "peer" && eligible(message)) {
        if (queue.length >= 30) {
          results.set(message, { original: message.text, target: preferences.targetLanguage, error: "limit_reached" });
          return;
        }
        queue.push(message);
        void drain();
      }
    };
    const menuAction = (message) => {
      const result = currentResult(message);
      return {
        visible: loaded && !paused && available && preferences.mode !== "off" && Boolean(eligible(message)),
        disabled: result?.pending === true,
        label: label(result?.pending ? "translating" : result?.text ? (result.hidden ? "show" : "hide") : "translate")
      };
    };
    const activate = async (message) => {
      const action = menuAction(message);
      if (!action.visible || action.disabled) return;
      const result = currentResult(message);
      if (result?.text) {
        result.hidden = !result.hidden;
        refreshMessage(message);
      } else {
        await translateMessage(message);
      }
    };
    const render = (message, container) => {
      if (message?.draft && message.direction === "self" && message.text?.trim() && !message.retracted && !liveAllowed("self")) {
        renderOwnStatus(container);
        return;
      }
      const liveDraft = findLiveDraft(message?.direction, message?.from || "");
      if (message?.draft && ["peer", "self"].includes(message.direction) && !message.retracted
          && message.text === liveDraft?.text && (message.from || "") === liveDraft?.sender) {
        renderLive(container, message.direction, message.from || "");
        return;
      }
      if (!loaded || paused || !available || preferences.mode === "off" || !eligible(message)) return;
      const result = currentResult(message);
      if (!result || result.hidden) return;
      const wrapper = document.createElement("div");
      wrapper.className = "message-translation";
      if (result && !result.hidden) {
        const note = document.createElement("div");
        note.className = "message-translation-result";
        note.setAttribute("role", "status");
        const heading = result.text ? translationInfo(result, result.target) : document.createElement("small");
        if (!result.text) heading.textContent = result.pending ? label("translating") : label(result.error);
        note.append(heading);
        if (result.text) {
          const text = document.createElement("div");
          text.lang = result.target;
          text.dir = "auto";
          text.textContent = result.text;
          note.append(text);
        }
        wrapper.append(note);
      }
      container.append(wrapper);
    };
    updateControls();
    return { setAccount, validatePreferences, savePreferences, render, menuAction, activate, incoming, setLiveDraft, setPeerDrafts, renderLive, renderOwnStatus, clearLive,
      refreshLabels: () => { showStatus(statusKey); refreshLive(); } };
  }
};
