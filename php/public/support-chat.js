"use strict";
(() => {
  const endpoint = new URL("api/support-chat.php", document.currentScript.src).href;
  const requiresSecureConnection = !window.isSecureContext;
  const language = window.TeleTypTelSupportLanguage.create(navigator.language, true);
  const wording = language.word;
  const root = document.createElement("div");
  root.className = "support-widget";
  root.innerHTML = `
    <button class="support-launcher" id="supportLauncher" type="button" aria-label="Klantenservice" title="Klantenservice" aria-haspopup="dialog" aria-controls="supportDialog" aria-expanded="false">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z"/><path d="M8 8h8M8 12h5"/></svg>
    </button>
    <dialog id="supportDialog" class="support-popup" aria-labelledby="supportTitle">
      <div class="support-heading"><div class="support-heading-title"><h2 id="supportTitle">Klantenservice</h2><span>Een vraag? Chat met ons.</span></div><div id="supportHeaderTools" class="support-header-tools"><button id="supportMinimize" type="button" title="Chat verbergen" aria-label="Chat verbergen">−</button><button id="supportClose" type="button" title="Alles afsluiten" aria-label="Alles afsluiten">×</button></div></div>
      <p class="support-status" id="supportStatus" role="status">Beschikbaarheid laden…</p>
      <div id="supportSecure" class="support-form" hidden><p></p><a></a></div>
      <div id="supportEndConfirm" class="support-confirm" role="group" aria-labelledby="supportEndQuestion" hidden><p id="supportEndQuestion"></p><button id="supportEndYes" type="button">Alles afsluiten</button><button id="supportEndNo" type="button">Terug</button></div>
      <form id="supportStart" class="support-form">
        <label for="supportName">Hoe mogen we je noemen?</label><input id="supportName" name="name" autocomplete="given-name" maxlength="80" required placeholder="Je voornaam of schuilnaam">
        <label for="supportLanguage">Taal</label><select id="supportLanguage" name="interfaceLanguage"></select>
        <details class="support-start-help"><summary></summary><p id="supportPrivacy">RTT deelt tekst tijdens het typen met de toegewezen medewerker, ook vóór versturen. Camera en microfoon staan uit totdat je die zelf toestaat. Deze chat gebruikt een noodzakelijke sessiecookie. Naam en berichten worden 30 dagen na afsluiten verwijderd bij de opruiming. Deel geen BSN, medische gegevens of wachtwoorden. Geen spoeddienst.</p></details>
        <label class="support-check"><input id="supportAcknowledged" type="checkbox" required aria-describedby="supportPrivacy"> Ik accepteer de chatvoorwaarden: live RTT delen en berichten en concepttekst automatisch laten vertalen door Google Cloud Translation, ook vóór versturen.</label>
        <button type="submit">Start chat</button>
      </form>
      <div id="supportConversation" class="support-conversation" hidden>
        <div id="supportTranslation"></div>
        <div id="supportCall"></div>
        <div id="supportMessages" class="support-messages" role="log" aria-label="Chatberichten" aria-live="polite" aria-relevant="additions"></div>
        <div id="supportLive" class="support-live"></div>
        <div id="supportFileExtras" class="support-file-extras"></div>
        <div id="supportEmojiPanel" class="support-emoji-panel" role="group" hidden></div>
        <form id="supportSend" class="support-send"><label class="support-input-label" for="supportText">Je bericht</label><div id="supportAttachments"></div><button id="supportEmoji" type="button" aria-expanded="false" aria-controls="supportEmojiPanel"></button><textarea id="supportText" rows="1" maxlength="2000" required placeholder="Typ een bericht"></textarea><button id="supportVideo" type="button" disabled></button><button id="supportMicrophone" type="button" disabled></button><button id="supportMessageSend" type="submit" hidden>Versturen</button></form>
        <div class="support-footer" hidden><button id="supportNew" type="button" hidden>Nieuwe chat</button></div>
      </div>
      <p id="supportError" class="support-error" role="alert" hidden></p>
    </dialog>`;
  document.body.append(root);
  const get = (id) => root.querySelector("#" + id);
  const icons = window.TeleTypTelSupportIcons;
  language.options(get("supportLanguage"));
  const dialog = get("supportDialog");
  if (requiresSecureConnection) {
    get("supportSecure").hidden = false;
    get("supportStart").hidden = true;
    const secureUrl = new URL(location.href); secureUrl.protocol = "https:";
    get("supportSecure").querySelector("a").href = secureUrl.href;
  }
  const attachments = window.TeleTypTelSupportAttachments.mount({ container: get("supportAttachments"), selectionHost: get("supportFileExtras"), symbol: "plus", request: (body) => request(body), endpoint, language, onSent: async () => render(await request()), onError: (failure) => error(failure) });
  const translations = window.TeleTypTelSupportTranslation.mount({ container: get("supportTranslation"), request: (body) => request(body), language });
  const messageMenu = window.TeleTypTelSupportMessageMenu.mount({ language, request: (body) => request(body), refresh: async () => render(await request()) });
  const supportCall = window.TeleTypTelSupportCall.mount({ container: get("supportCall"), toolbarHost: get("supportHeaderTools"), draftHost: get("supportLive"), composerCamera: get("supportVideo"), composerMicrophone: get("supportMicrophone"), input: get("supportText"), endpoint: new URL("support-call.php", endpoint).href, rtcEndpoint: new URL("rtc-config.php", endpoint).href, onLive: translations.live, language });
  get("supportHeaderTools").querySelector(".support-call-actions").prepend(get("supportTranslation"));
  const headerPanels = [...get("supportHeaderTools").querySelectorAll("details")];
  for (const panel of headerPanels) panel.addEventListener("toggle", () => {
    if (panel.open) for (const other of headerPanels) if (other !== panel) other.open = false;
  });
  const header = root.querySelector(".support-heading");
  const panelSize = new ResizeObserver(() => {
    get("supportDialog").style.setProperty("--support-panel-height", Math.max(0, get("supportDialog").clientHeight - header.offsetHeight - 16) + "px");
  });
  panelSize.observe(get("supportDialog")); panelSize.observe(header);
  let csrf = "", thread = null, renderedThread = "", pending = null;
  let busy = false, loading = false, newDraft = false, initialized = false, closing = false;
  let latestData = null, lastFailure = null, offline = false;
  const messageLabels = new Map();
  let activeRead = Promise.resolve();
  const error = (failure) => { lastFailure = failure; get("supportError").textContent = failure ? language.failure(failure) : ""; get("supportError").hidden = !failure; };
  const request = async (body) => {
    if (requiresSecureConnection) throw new Error("Open deze chat via HTTPS.");
    const multipart = body instanceof FormData;
    const response = await fetch(endpoint, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: body ? { ...(!multipart ? { "Content-Type": "application/json" } : {}), "X-CSRF-Token": csrf } : {},
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined, signal: AbortSignal.timeout(multipart ? 60000 : 10000) });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      if ([401, 403].includes(response.status)) csrf = "";
      const failure = new Error(data.message || "Verbinding mislukt. Je tekst blijft staan; probeer opnieuw."); failure.status = response.status; throw failure;
    }
    csrf = data.csrfToken;
    return data;
  };
  const renderStatus = (data) => {
    get("supportTitle").textContent = wording("Klantenservice", "Support");
    if (!data) { get("supportStatus").textContent = wording("Beschikbaarheid laden…", "Checking availability…"); return; }
    if (!thread) {
      get("supportStatus").textContent = data.available ? wording("Er is een medewerker beschikbaar. Een reactie kan even duren.", "An agent is available. A reply may take a moment.") : wording("Er is nu geen medewerker beschikbaar. Je kunt een bericht achterlaten; houd deze pagina open voor een antwoord.", "No agent is available now. Leave a message and keep this page open for a reply.");
      return;
    }
    get("supportStatus").textContent = thread.status === "closed" ? wording("Dit gesprek is afgesloten.", "This chat is closed.")
      : thread.status === "active" ? (thread.staffName || wording("Een medewerker", "An agent")) + (thread.staffOnline ? wording(" helpt je in deze chat.", " is helping you in this chat.") : wording(" heeft je gesprek opgepakt, maar is nu niet online. Je bericht blijft bewaard.", " has picked up your chat but is offline. Your message is saved."))
      : data.available ? wording("Je staat in de wachtrij. Een medewerker moet je gesprek nog oppakken.", "You are in the queue. Waiting for an agent to pick up your chat.") : wording("Nog geen medewerker beschikbaar. Je bericht staat in de wachtrij; houd deze pagina open voor een antwoord.", "No agent available yet. Your message is queued; keep this page open for a reply.");
  };
  const updateMessageLabel = ({ label, stamp, message }) => {
    label.textContent = message.kind === "visitor" ? wording("Jij", "You") : message.name + wording(" · medewerker", " · agent");
    stamp.textContent = new Date(message.created * 1000).toLocaleTimeString(language.language, { hour: "2-digit", minute: "2-digit" });
  };
  const render = (data) => {
    updateComposer();
    if (!initialized && data.thread?.status === "closed") newDraft = true;
    latestData = data; thread = newDraft ? null : data.thread;
    attachments.setThread(thread?.id || "", Boolean(thread && thread.status !== "closed" && !closing));
    translations.sync(thread?.id || "", thread ? data.translationSettings : null);
    messageMenu.sync(thread?.id || "", Boolean(thread && thread.status !== "closed" && !closing && dialog.open));
    supportCall.setThread(thread?.id || "", thread?.status === "active" && dialog.open && !closing, thread?.staffAssignment || "");
    get("supportStart").hidden = Boolean(thread); get("supportConversation").hidden = !thread;
    renderStatus(data);
    if (!thread) return;
    const closed = thread.status === "closed";
    get("supportSend").hidden = closed || closing;
    root.querySelector(".support-footer").hidden = !closed;
    get("supportNew").hidden = !closed;
    if (closed) get("supportEndConfirm").hidden = true;
    const log = get("supportMessages");
    if (renderedThread !== thread.id) { log.replaceChildren(); messageLabels.clear(); renderedThread = thread.id; }
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    let changed = false;
    for (const message of data.messages) {
      const previous = messageLabels.get(Number(message.sequence)), signature = JSON.stringify(message);
      if (previous?.signature === signature) continue;
      if (previous) translations.detach(message.sequence);
      const entry = document.createElement("article");
      entry.className = "support-message " + (message.kind === "visitor" ? "own" : "staff");
      const label = document.createElement("strong");
      const text = document.createElement("p"); text.textContent = message.text; text.dir = "auto";
      const stamp = document.createElement("time"); stamp.dateTime = new Date(message.created * 1000).toISOString();
      const metadata = { label, stamp, message, entry, signature }; messageLabels.set(Number(message.sequence), metadata); updateMessageLabel(metadata);
      entry.append(label, text, stamp);
      if (previous) previous.entry.replaceWith(entry); else log.append(entry);
      changed = true;
      if (!message.deleted) attachments.render(entry, message, thread.id);
      translations.attach(entry, message, Number(message.sequence) > Number(data.messages.at(-1)?.sequence || 0) - 10);
      messageMenu.attach(entry, message, thread.id);
    }
    if (changed && nearBottom) log.scrollTop = log.scrollHeight;
  };
  const refresh = () => {
    if (requiresSecureConnection) return activeRead;
    if (loading || busy || !dialog.open) return activeRead;
    loading = true;
    activeRead = (async () => {
      try { render(await request()); offline = false; initialized = true; if (!pending && !closing) error(""); }
      catch (failure) { offline = true; get("supportStatus").textContent = wording("Verbinding onderbroken. Beschikbaarheid onbekend.", "Connection interrupted. Availability unknown."); error(failure); }
      finally { loading = false; }
    })();
    return activeRead;
  };
  const perform = async (operation) => {
    if (busy) return;
    busy = true; error("");
    const buttons = [...root.querySelectorAll('button[type="submit"]')];
    buttons.forEach((button) => { button.disabled = true; });
    try { await activeRead; if (!csrf) await request(); await operation(); }
    catch (failure) { error(failure); }
    finally { busy = false; buttons.forEach((button) => { button.disabled = false; }); }
  };
  const minimize = () => { messageMenu.hide(); closeEmoji(); for (const panel of headerPanels) panel.open = false; translations.setVisible(false); supportCall.setThread("", false); dialog.close(); get("supportLauncher").setAttribute("aria-expanded", "false"); get("supportLauncher").focus(); };
  get("supportLauncher").addEventListener("click", () => {
    if (dialog.open) { minimize(); return; }
    dialog.show(); get("supportLauncher").setAttribute("aria-expanded", "true");
    translations.setVisible(true);
    (thread ? get("supportText") : get("supportName")).focus();
    void refresh();
  });
  const requestClose = async () => {
    if (requiresSecureConnection) { minimize(); return; }
    if (loading) await activeRead;
    if (busy) return;
    if (!thread || thread.status === "closed") { resetChat(); minimize(); return; }
    closeEmoji(); for (const panel of headerPanels) panel.open = false;
    get("supportEndConfirm").hidden = false; get("supportEndNo").focus();
  };
  get("supportMinimize").addEventListener("click", minimize);
  get("supportClose").addEventListener("click", requestClose);
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (!get("supportEmojiPanel").hidden) { closeEmoji(); get("supportEmoji").focus(); }
    else if (!get("supportEndConfirm").hidden) get("supportEndNo").click();
    else requestClose();
  });
  const closeEmoji = () => { get("supportEmojiPanel").hidden = true; get("supportEmoji").setAttribute("aria-expanded", "false"); };
  const updateComposer = () => {
    const hasText = Boolean(get("supportText").value.trim());
    get("supportMessageSend").hidden = !hasText; get("supportMicrophone").hidden = hasText;
    get("supportText").style.height = "auto";
    get("supportText").style.height = Math.min(96, Math.max(44, get("supportText").scrollHeight)) + "px";
  };
  get("supportText").addEventListener("input", updateComposer);
  get("supportText").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && get("supportText").value.trim()) { event.preventDefault(); get("supportSend").requestSubmit(get("supportMessageSend")); }
  });
  get("supportEmoji").addEventListener("click", () => {
    const open = get("supportEmojiPanel").hidden;
    get("supportEmojiPanel").hidden = !open; get("supportEmoji").setAttribute("aria-expanded", String(open));
    if (open) get("supportEmojiPanel").querySelector("button").focus();
  });
  for (const emoji of ["😀", "😊", "😂", "❤️", "👍", "👋", "🙏", "🤟", "🎉", "😮", "😢", "✅"]) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = emoji; button.setAttribute("aria-label", emoji);
    button.addEventListener("click", () => {
      const input = get("supportText");
      if (input.value.length - (input.selectionEnd - input.selectionStart) + emoji.length > input.maxLength) return;
      input.setRangeText(emoji, input.selectionStart, input.selectionEnd, "end"); input.dispatchEvent(new Event("input", { bubbles: true })); closeEmoji(); input.focus();
    });
    get("supportEmojiPanel").append(button);
  }
  get("supportStart").addEventListener("submit", (event) => {
    event.preventDefault();
    void perform(async () => {
      await request({ action: "start", name: get("supportName").value, acknowledged: get("supportAcknowledged").checked, translationConsent: get("supportAcknowledged").checked, targetLanguage: language.language });
      newDraft = false; render(await request()); get("supportText").focus();
    });
  });
  get("supportSend").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!thread || closing) return;
    void perform(async () => {
      const text = get("supportText").value;
      if (!pending || pending.text !== text || pending.threadId !== thread.id) pending = { action: "send", threadId: thread.id, text, clientId: crypto.randomUUID() };
      await request(pending);
      supportCall.final(text);
      if (get("supportText").value === text) get("supportText").value = "";
      pending = null; render(await request()); get("supportText").focus();
    });
  });
  get("supportEndNo").addEventListener("click", () => {
    if (busy) return;
    closing = false; get("supportEndConfirm").hidden = true; translations.setVisible(true);
    if (latestData) render(latestData); get("supportClose").focus();
  });
  get("supportEndYes").addEventListener("click", () => void perform(async () => {
    if (!thread) return;
    closing = true; translations.setVisible(false); supportCall.stop();
    if (latestData) render(latestData);
    get("supportEndYes").disabled = get("supportEndNo").disabled = true;
    try {
      await request({ action: "close", threadId: thread.id }); resetChat(); minimize();
    } finally { get("supportEndYes").disabled = get("supportEndNo").disabled = false; }
  }));
  const resetChat = () => {
    messageMenu.sync("", false);
    closeEmoji();
    translations.clear(); supportCall.setThread("", false); attachments.setThread("", false);
    closing = false; newDraft = true; thread = null; pending = null; renderedThread = "";
    get("supportMessages").replaceChildren(); messageLabels.clear(); get("supportText").value = ""; get("supportStart").reset();
    get("supportEndConfirm").hidden = true;
    get("supportLanguage").value = language.language;
    get("supportStart").hidden = false; get("supportConversation").hidden = true; updateComposer(); renderStatus(latestData);
  };
  get("supportNew").addEventListener("click", () => { resetChat(); get("supportName").focus(); void refresh(); });
  setInterval(() => { if (initialized && !document.hidden) void refresh(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && dialog.open) void refresh(); });
  const localize = () => {
    root.lang = language.language; get("supportLanguage").value = language.language;
    const text = (selector, dutch, english) => { root.querySelector(selector).textContent = wording(dutch, english); };
    const control = (selector, symbol, dutch, english) => icons.set(root.querySelector(selector), symbol, wording(dutch, english));
    const title = wording("Klantenservice", "Support");
    get("supportLauncher").title = title; get("supportLauncher").setAttribute("aria-label", title);
    text("#supportTitle", "Klantenservice", "Support"); text(".support-heading span", "Een vraag? Chat met ons.", "Questions? Chat with us.");
    text('label[for="supportName"]', "Hoe mogen we je noemen?", "What should we call you?"); text('label[for="supportLanguage"]', "Taal", "Language");
    get("supportName").placeholder = wording("Je voornaam of schuilnaam", "First name or nickname");
    text("#supportPrivacy", "RTT deelt tekst tijdens het typen met de toegewezen medewerker, ook vóór versturen. Camera en microfoon staan uit totdat je die zelf toestaat. Deze chat gebruikt een noodzakelijke sessiecookie. Naam en berichten worden 30 dagen na afsluiten verwijderd bij de opruiming. Deel geen BSN, medische gegevens of wachtwoorden. Geen spoeddienst.", "RTT shares text while typing with the assigned agent, before sending. Camera and microphone stay off until you allow them. This chat uses a necessary session cookie. Your name and messages are removed during cleanup 30 days after closing. Do not share identity numbers, medical information or passwords. Not an emergency service.");
    get("supportPrivacy").textContent += " " + wording("Berichten en live tekst worden automatisch vertaald via Google Cloud Translation, ook vóór versturen. Vertalingen kunnen fouten bevatten. Via de wereldbol kun je de vertaaltoestemming intrekken; tekstchat en RTT blijven beschikbaar.", "Messages and live text are translated automatically through Google Cloud Translation, including before sending. Translations may contain errors. Use the globe to withdraw translation consent; text chat and RTT remain available.");
    get("supportAcknowledged").parentNode.lastChild.textContent = " " + wording("Ik accepteer de chatvoorwaarden: live RTT delen en berichten en concepttekst automatisch laten vertalen door Google Cloud Translation, ook vóór versturen.", "I accept the chat terms: share live RTT and automatically translate messages and draft text through Google Cloud Translation, including before sending.");
    get("supportPrivacy").textContent += " " + wording("Bijlagen verdwijnen samen met de chat en worden niet naar Google gestuurd. Open alleen bestanden die je vertrouwt.", "Attachments are deleted with the chat and are not sent to Google. Only open files you trust.");
    text('label[for="supportText"]', "Je bericht", "Your message"); get("supportText").placeholder = wording("Typ een bericht", "Type a message");
    control("#supportEmoji", "emoji", "Emoji kiezen", "Choose emoji");
    get("supportEmojiPanel").setAttribute("aria-label", wording("Emoji kiezen", "Choose emoji"));
    get("supportMessages").setAttribute("aria-label", wording("Chatberichten", "Chat messages"));
    text("#supportEndConfirm p", "Alles afsluiten? Het gesprek, RTT, camera en microfoon stoppen. Niet-verstuurde tekst en gekozen bestanden vervallen.", "Close everything? The chat, RTT, camera and microphone will stop. Unsent text and selected files will be discarded.");
    control("#supportMinimize", "minimize", "Chat verbergen", "Hide chat");
    control("#supportClose", "close", "Alles afsluiten", "Close everything");
    control(".support-start-help summary", "help", "Informatie en privacy", "Information and privacy");
    control('#supportStart button[type="submit"]', "send", "Start chat", "Start chat"); control('#supportSend button[type="submit"]', "send", "Versturen", "Send");
    control("#supportNew", "plus", "Nieuwe chat", "New chat");
    text("#supportEndYes", "Alles afsluiten", "Close everything"); text("#supportEndNo", "Terug", "Back");
    messageLabels.forEach(updateMessageLabel); renderStatus(latestData); error(lastFailure);
    if (requiresSecureConnection) {
      get("supportStatus").textContent = wording("Beveiligde verbinding nodig", "Secure connection required");
      get("supportSecure").querySelector("p").textContent = wording("Open deze chat via HTTPS om veilig te chatten. Voor je iPhone moet het certificaat geldig en vertrouwd zijn. Krijg je een certificaatwaarschuwing? Laat eerst de beveiligde verbinding instellen; ga niet langs de waarschuwing verder.", "Open this chat using HTTPS to chat securely. Your phone needs a valid, trusted certificate. If you see a certificate warning, have the secure connection configured first; do not bypass the warning.");
      get("supportSecure").querySelector("a").textContent = wording("Open via HTTPS", "Open using HTTPS");
    }
    if (offline) get("supportStatus").textContent = wording("Verbinding onderbroken. Beschikbaarheid onbekend.", "Connection interrupted. Availability unknown.");
  };
  get("supportLanguage").addEventListener("change", () => language.set(get("supportLanguage").value));
  language.onChange(localize); localize();
})();
