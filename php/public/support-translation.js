"use strict";
window.TeleTypTelSupportTranslation = {
  mount({ container, request, staff = false, language = window.TeleTypTelSupportLanguage.create(staff ? "nl" : navigator.language) }) {
    const label = language.word;
    container.classList.add("support-translation-settings");
    container.innerHTML = `<details><summary></summary><div class="support-translation-body"><form>
      <label ${staff ? 'hidden' : ''}><span data-label="window"></span><select name="interfaceLanguage"></select></label>
      <label><span data-label="target"></span> <select name="language"></select></label>
      <label class="support-translation-check"><input name="consent" type="checkbox"><span data-label="consent"></span></label>
      <p data-label="explanation"></p>
      <button type="submit">${label("Opslaan", "Save")}</button></form><p class="support-translation-status" role="status"></p></div></details>`;
    const icons = window.TeleTypTelSupportIcons;
    icons.set(container.querySelector("summary"), "language", label("Taal", "Language"));
    icons.set(container.querySelector('button[type="submit"]'), "check", label("Opslaan", "Save"));
    const form = container.querySelector("form"), field = (name) => form.elements.namedItem(name);
    language.options(field("interfaceLanguage"));
    field("interfaceLanguage").addEventListener("change", () => language.set(field("interfaceLanguage").value));
    const status = container.querySelector(".support-translation-status");
    const entries = new Map(), lives = new Map(), results = new Map();
    let thread = "", settings = null, signature = "", generation = 0, working = false, queue = [], nextRequest = 0, visible = true;
    let statusFailure = null, targetDirty = false;
    field("language").addEventListener("change", () => { targetDirty = true; });
    const ready = () => visible && settings?.available && settings.preferences.consent && settings.preferences.mode !== "off" && settings.peerConsent;
    const invalidate = () => {
      generation++; queue = []; results.clear();
      for (const entry of entries.values()) { entry.result.replaceChildren(); entry.pending = false; entry.done = false; entry.attempted = false; entry.failure = null; }
      for (const live of lives.values()) { clearTimeout(live.timer); live.result.remove(); }
      lives.clear();
    };
    const resultNode = (parent) => { const result = document.createElement("div"); result.className = "support-translation-result"; parent.append(result); return result; };
    const show = (result, text, provisional = false, own = false) => {
      const open = result.querySelector("details")?.open || false;
      results.set(result, { text, provisional, own });
      const detail = document.createElement("details"), summary = document.createElement("summary"), warning = document.createElement("small"), content = document.createElement("div");
      icons.set(summary, "translate", provisional ? label("Voorlopige vertaling", "Provisional translation") : label("Vertaling", "Translation"));
      summary.title = label("Kan fouten bevatten · Google Cloud Translation", "May contain errors · Google Cloud Translation");
      warning.textContent = summary.title; detail.append(summary, warning); detail.open = open;
      content.textContent = (own ? label("Jij: ", "You: ") : "") + text; content.lang = settings.preferences.targetLanguage; content.dir = "auto";
      result.replaceChildren(detail, content);
    };
    const pump = async () => {
      if (working) return;
      working = true;
      try {
        while (queue.length) {
          const job = queue.shift();
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, nextRequest - Date.now())));
          if (job.generation !== generation || !ready() || !job.valid()) continue;
          nextRequest = Date.now() + 2200;
          try {
            const response = await request({ action: "translate", threadId: thread, targetLanguage: settings.preferences.targetLanguage, ...job.body });
            if (job.generation === generation && ready() && job.valid()) job.complete(response.translation.text);
          } catch (failure) {
            if (job.generation === generation && job.valid()) job.failed(failure);
          }
        }
      } finally { working = false; }
    };
    const translate = (entry, automatic = false) => {
      if (!ready() || entry.pending || entry.done) return;
      entry.attempted = true;
      entry.pending = true; entry.button.disabled = true;
      entry.result.textContent = label("Vertalen…", "Translating…");
      queue.push({ generation, body: { sequence: Number(entry.message.sequence), automatic }, valid: () => entry.result.isConnected,
        complete(text) { entry.pending = false; entry.done = true; entry.button.hidden = true; show(entry.result, text); },
        failed(failure) { entry.pending = false; entry.button.disabled = false; entry.failure = failure; entry.result.textContent = language.failure(failure, true); } });
      void pump();
    };
    const refreshEntries = () => {
      for (const entry of entries.values()) {
        entry.button.hidden = true;
        entry.button.disabled = entry.pending;
        if (ready() && settings.preferences.mode === "automatic" && entry.automatic && !entry.attempted && entry.message.kind !== (staff ? "staff" : "visitor")) translate(entry, true);
      }
    };
    const sync = (identifier, data) => {
      if (thread !== identifier) { invalidate(); entries.clear(); thread = identifier; signature = ""; settings = null; statusFailure = null; targetDirty = false; }
      container.hidden = !identifier || !data;
      if (!data) { invalidate(); settings = null; signature = ""; refreshEntries(); return; }
      const next = JSON.stringify(data);
      if (next !== signature) {
        const previous = settings?.preferences;
        invalidate(); settings = data; signature = next; statusFailure = null;
        if (JSON.stringify(previous) !== JSON.stringify(data.preferences) || !field("language").options.length) {
          field("language").replaceChildren(...Object.entries(data.languages).map(([value, name]) => { const option = document.createElement("option"); option.value = value; option.textContent = name; return option; }));
          field("language").value = data.preferences.targetLanguage || language.language; targetDirty = false;
          field("consent").checked = data.preferences.consent && data.preferences.liveConsent && data.preferences.mode === "automatic";
        }
        renderStatus();
      }
      refreshEntries();
    };
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!thread) return;
      invalidate(); const identifier = thread, ticket = generation;
      const save = form.querySelector('button[type="submit"]'); save.disabled = true;
      try {
        const consent = field("consent").checked;
        const response = await request({ action: "translation_settings", threadId: identifier, targetLanguage: field("language").value, mode: consent ? "automatic" : "off", consent, liveConsent: consent });
        if (thread === identifier && ticket === generation) { signature = ""; sync(identifier, response.translationSettings); container.querySelector("details").open = false; }
      } catch (failure) { if (thread === identifier && ticket === generation) { statusFailure = failure; status.textContent = language.failure(failure, true); } }
      finally { save.disabled = false; }
    });
    const renderStatus = () => {
      status.textContent = statusFailure ? language.failure(statusFailure, true)
        : !settings ? "" : !settings.available ? label("Vertaling niet beschikbaar. De originele chat blijft werken.", "Translation unavailable. The original chat still works.")
        : settings.preferences.mode === "off" ? label("Vertaling staat uit.", "Translation is off.")
        : !settings.peerConsent ? label("Wachten op toestemming van de andere deelnemer.", "Waiting for the other participant's consent.")
        : label("Vertaling ingeschakeld. Het origineel blijft staan.", "Translation enabled. Originals are preserved.");
    };
    const localize = () => {
      container.lang = language.language; field("interfaceLanguage").value = language.language;
      const text = (key, dutch, english) => { container.querySelector('[data-label="' + key + '"]').textContent = label(dutch, english); };
      icons.set(container.querySelector("summary"), "language", label("Taal", "Language"));
      icons.set(form.querySelector('button[type="submit"]'), "check", label("Opslaan", "Save"));
      text("window", "Taal van dit venster", "Window language"); text("target", "Vertalen naar", "Translate into");
      field("interfaceLanguage").setAttribute("aria-label", label("Taal van dit venster", "Window language")); field("language").setAttribute("aria-label", label("Vertalen naar", "Translate into"));
      text("consent", "Ik sta automatische vertaling van berichten en live RTT via Google Cloud Translation toe, ook vóór versturen.", "I allow automatic translation of messages and live RTT through Google Cloud Translation, including before sending.");
      text("explanation", "Beide deelnemers moeten instemmen. Vertalingen kunnen fouten bevatten. Geen audiovertaling. Vink uit en sla op om toestemming in te trekken; tekstchat en RTT blijven werken.", "Both participants must agree. Translations may contain errors. No audio translation. Uncheck and save to withdraw consent; text chat and RTT keep working.");
      if (settings && !settings.preferences.targetLanguage && !targetDirty) field("language").value = language.language;
      for (const entry of entries.values()) {
        icons.set(entry.button, "translate", label("Vertalen", "Translate"));
        if (entry.pending) entry.result.textContent = label("Vertalen…", "Translating…");
        else if (entry.failure) entry.result.textContent = language.failure(entry.failure, true);
      }
      for (const [result, value] of results) { if (result.isConnected) show(result, value.text, value.provisional, value.own); else results.delete(result); }
      for (const live of lives.values()) if (live.failure) live.result.textContent = language.failure(live.failure, true);
      renderStatus();
    };
    language.onChange(localize); localize();
    container.hidden = true;
    return {
      sync,
      attach(parent, message, automatic = true) {
        if (message.attachment && !message.text) return;
        const button = document.createElement("button"); button.type = "button"; button.className = "support-translate-action"; icons.set(button, "translate", label("Vertalen", "Translate")); parent.append(button);
        const entry = { message, button, result: resultNode(parent), pending: false, done: false, automatic };
        entries.set(Number(message.sequence), entry); button.addEventListener("click", () => translate(entry)); refreshEntries();
      },
      live(event) {
        if (event.reset) { for (const live of lives.values()) { clearTimeout(live.timer); results.delete(live.result); live.result.remove(); } lives.clear(); return; }
        if (!['visitor', 'staff'].includes(event.sourceRole)) return;
        const key = event.sourceRole;
        let live = lives.get(key);
        if (live) { clearTimeout(live.timer); live.version++; live.failure = null; results.delete(live.result); live.result.replaceChildren(); }
        if (!event.text || !ready() || !settings.preferences.liveConsent || !settings.peerLiveConsent || settings.preferences.mode !== "automatic") { live?.result.remove(); lives.delete(key); return; }
        if (!live) { live = { result: resultNode(event.target), version: 0, timer: null }; lives.set(key, live); }
        const version = live.version, ticket = generation;
        live.timer = setTimeout(() => {
          if (ticket !== generation || lives.get(key) !== live) return;
          queue = queue.filter((job) => job.liveKey !== key);
          queue.push({ generation, liveKey: key, body: { live: true, automatic: true, text: event.text, callId: event.callId, clientId: event.clientId, sourceRole: event.sourceRole },
            valid: () => lives.get(key) === live && live.version === version && live.result.isConnected,
            complete(text) { show(live.result, text, true, event.own); },
            failed(failure) { live.failure = failure; live.result.textContent = language.failure(failure, true); } });
          void pump();
        }, 1300);
      },
      setVisible(value) { if (visible !== value) { visible = value; invalidate(); refreshEntries(); } },
      clear() { invalidate(); entries.clear(); settings = null; signature = ""; thread = ""; container.hidden = true; }
    };
  }
};
