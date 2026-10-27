"use strict";
(() => {
  const ui = window.intakeUI, get = (id) => document.getElementById(id);
  const auth = ui.client("api.php"), api = ui.client("support-chat-api.php");
  const attachments = window.TeleTypTelSupportAttachments.mount({ container: get("supportStaffAttachments"), request: (body) => api.request(body), endpoint: "support-chat-api.php", language: window.TeleTypTelSupportLanguage.create("nl"), onSent: () => loadInbox(), onError: (error) => fail(error) });
  const translations = window.TeleTypTelSupportTranslation.mount({ container: get("supportStaffTranslation"), request: (body) => api.request(body), staff: true });
  const messageMenu = window.TeleTypTelSupportMessageMenu.mount({ language: window.TeleTypTelSupportLanguage.create("nl"), request: (body) => api.request(body), refresh: () => loadInbox() });
  const messageEntries = new Map();
  const supportCall = window.TeleTypTelSupportCall.mount({ container: get("supportStaffCall"), draftHost: get("supportStaffLive"), input: get("supportStaffText"), endpoint: "support-call-api.php", rtcEndpoint: "../api/rtc-config.php", actorRole: "staff", onLive: translations.live });
  get("supportStaffCall").querySelector(".support-call-actions").prepend(get("supportStaffTranslation"));
  let admin = null, selected = "", page = 1, rendered = "", pending = null, queueSignature = "";
  let busy = false, polling = false, available = false, lastPresence = 0, generation = 0;
  let transferSignature = "", transferPending = null, transferTargets = [];
  const stateNames = { waiting: "Wacht op een medewerker", active: "In behandeling", closed: "Afgesloten" };
  const status = (text) => { get("supportStaffStatus").textContent = text; };
  const clearThread = () => {
    get("supportStaffTransfer").hidden = true; get("supportStaffTransfer").open = false;
    get("supportStaffTransferError").hidden = true; transferSignature = ""; transferPending = null; transferTargets = [];
    messageMenu.sync("", false); messageEntries.clear();
    attachments.setThread("", false);
    translations.clear();
    supportCall.setThread("", false);
    selected = rendered = ""; pending = null;
    get("supportStaffMessages").replaceChildren(); get("supportStaffText").value = "";
    get("supportThreadTitle").textContent = "Kies een gesprek"; get("supportThreadStatus").textContent = "";
    get("supportStaffReply").hidden = get("supportThreadActions").hidden = true;
  };
  const clear = () => {
    generation++; auth.cancel(); api.cancel(); admin = null; available = false; clearThread();
    get("supportStaffQueue").replaceChildren(); queueSignature = ""; get("supportStaffIdentity").textContent = "";
    get("supportStaffPassword").value = ""; get("supportStaffAvailable").checked = false;
    get("supportAdminLink").hidden = get("supportStaffWorkspace").hidden = true;
    get("supportStaffLogin").hidden = false;
  };
  const fail = (error) => {
    if (error.name === "AbortError") return;
    if (error.status === 401) clear();
    else if ([403, 404, 409].includes(error.status)) clearThread();
    status(error.message || "De verbinding is onderbroken.");
  };
  const run = async (operation) => {
    if (busy) return;
    generation++;
    busy = true;
    try { await operation(); } catch (error) { fail(error); } finally { busy = false; }
  };
  const render = (data) => {
    const signature = JSON.stringify([data.threads, data.page, data.total]);
    if (signature !== queueSignature) {
      queueSignature = signature;
      get("supportStaffQueue").replaceChildren();
      for (const thread of data.threads) {
        const entry = ui.node("article");
        entry.append(ui.node("h3", thread.name), ui.node("p", stateNames[thread.status] + (thread.staffName ? " · " + thread.staffName : "") + " · " + new Date(thread.updated * 1000).toLocaleString("nl-NL")));
        if (thread.status === "waiting") entry.append(ui.button("Oppakken", () => void run(async () => {
          await api.request({ action: "claim", threadId: thread.id }); clearThread(); selected = thread.id; await loadInbox(); get("supportStaffText").focus();
        })));
        if (thread.canRead) entry.append(ui.button("Openen", () => void run(async () => { clearThread(); selected = thread.id; await loadInbox(); })));
        get("supportStaffQueue").append(entry);
      }
      if (!data.threads.length) get("supportStaffQueue").append(ui.node("p", "Geen gesprekken in dit overzicht."));
    }
    get("supportPagination").textContent = "Pagina " + data.page + " · " + data.total + " gesprekken";
    get("supportPrevious").disabled = data.page <= 1; get("supportNext").disabled = data.page * 30 >= data.total;
    if (!data.thread) return;
    const thread = data.thread;
    get("supportStaffTransfer").hidden = !thread.mine || thread.status !== "active";
    const nextTargets = JSON.stringify(data.transferTargets || []);
    if (transferSignature !== nextTargets) {
      transferSignature = nextTargets; transferTargets = data.transferTargets || [];
      const select = get("supportStaffRecipient"), previous = select.value;
      const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = transferTargets.length ? "Kies een medewerker" : "Geen andere medewerker beschikbaar";
      select.replaceChildren(placeholder, ...transferTargets.map((target) => {
        const option = document.createElement("option"); option.value = target.id; option.textContent = target.name; return option;
      }));
      if (transferTargets.some((target) => target.id === previous)) select.value = previous;
      select.disabled = !transferTargets.length; get("supportStaffTransferSend").disabled = !transferTargets.length;
    }
    attachments.setThread(thread.id, thread.mine && thread.status === "active");
    translations.sync(thread.id, data.translationSettings);
    messageMenu.sync(thread.id, thread.mine && thread.status === "active");
    supportCall.setThread(thread.id, thread.mine && thread.status === "active");
    get("supportThreadTitle").textContent = thread.name;
    get("supportThreadStatus").textContent = stateNames[thread.status] + " · Naam door bezoeker opgegeven, identiteit niet gecontroleerd.";
    get("supportStaffReply").hidden = !thread.mine || thread.status !== "active";
    get("supportThreadActions").hidden = thread.status === "closed";
    get("supportStaffRelease").hidden = thread.status !== "active";
    const log = get("supportStaffMessages"), nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    if (rendered !== thread.id) { log.replaceChildren(); messageEntries.clear(); rendered = thread.id; }
    let changed = false;
    for (const message of data.messages) {
      const previous = messageEntries.get(Number(message.sequence)), signature = JSON.stringify(message);
      if (previous?.signature === signature) continue;
      if (previous) translations.detach(message.sequence);
      const entry = ui.node("article", undefined, message.kind);
      entry.append(ui.node("strong", message.name + (message.kind === "staff" ? " · medewerker" : " · bezoeker")), ui.node("p", message.text));
      const stamp = ui.node("time", new Date(message.created * 1000).toLocaleString("nl-NL"));
      stamp.dateTime = new Date(message.created * 1000).toISOString(); entry.append(stamp);
      if (previous) previous.entry.replaceWith(entry); else log.append(entry);
      messageEntries.set(Number(message.sequence), { entry, signature });
      if (!message.deleted) attachments.render(entry, message, thread.id);
      translations.attach(entry, message, Number(message.sequence) > Number(data.messages.at(-1)?.sequence || 0) - 10);
      messageMenu.attach(entry, message, thread.id);
      changed = true;
    }
    if (changed && nearBottom) log.scrollTop = log.scrollHeight;
  };
  const loadInbox = async () => {
    const ticket = generation, identifier = selected;
    const data = await api.request(null, "?page=" + page + "&filter=" + encodeURIComponent(get("supportStaffFilter").value) + (identifier ? "&thread=" + encodeURIComponent(identifier) : ""));
    if (ticket !== generation || selected !== identifier) return;
    render(data); available = data.available; get("supportStaffAvailable").checked = available; status("Klantenservice-inbox bijgewerkt.");
  };
  const load = async () => {
    const data = await auth.request(null, "?action=session");
    if (!data.admin) { clear(); status("Log in met je eigen staff- of beheeraccount."); return; }
    admin = data.admin;
    get("supportStaffLogin").hidden = true; get("supportStaffWorkspace").hidden = false;
    get("supportAdminLink").hidden = !["owner", "admin"].includes(admin.role);
    get("supportStaffIdentity").textContent = (admin.displayName || "Medewerker") + " · " + admin.role;
    await loadInbox();
  };
  get("supportStaffLogin").addEventListener("submit", (event) => {
    event.preventDefault(); void run(async () => {
      const password = get("supportStaffPassword").value; get("supportStaffPassword").value = "";
      await auth.request({ action: "login", email: get("supportStaffEmail").value, password }); await load();
    });
  });
  get("supportStaffLogout").addEventListener("click", () => void run(async () => {
    supportCall.stop();
    try { await api.request({ action: "presence", available: false }); await auth.request({ action: "logout" }); status("Uitgelogd."); }
    finally { clear(); }
  }));
  get("supportStaffAvailable").addEventListener("change", () => void run(async () => {
    const wanted = get("supportStaffAvailable").checked;
    try { await api.request({ action: "presence", available: wanted }); available = wanted; lastPresence = Date.now(); status(wanted ? "Je bent beschikbaar voor website-chats." : "Je bent niet beschikbaar voor nieuwe chats."); }
    finally { get("supportStaffAvailable").checked = available; }
  }));
  get("supportStaffRefresh").addEventListener("click", () => void run(loadInbox));
  get("supportStaffFilter").addEventListener("change", () => void run(async () => { page = 1; await loadInbox(); }));
  get("supportPrevious").addEventListener("click", () => void run(async () => { page = Math.max(1, page - 1); await loadInbox(); }));
  get("supportNext").addEventListener("click", () => void run(async () => { page++; await loadInbox(); }));
  get("supportStaffReply").addEventListener("submit", (event) => {
    event.preventDefault(); void run(async () => {
      const text = get("supportStaffText").value;
      if (!pending || pending.text !== text || pending.threadId !== selected) pending = { action: "send", threadId: selected, text, clientId: crypto.randomUUID() };
      await api.request(pending); supportCall.final(text); if (get("supportStaffText").value === text) get("supportStaffText").value = ""; pending = null; await loadInbox();
    });
  });
  for (const [id, action, question] of [["supportStaffRelease", "release", "Dit gesprek terugzetten in de wachtrij?"], ["supportStaffClose", "close", "Dit gesprek afsluiten?"]]) {
    get(id).addEventListener("click", () => { if (window.confirm(question)) void run(async () => { await api.request({ action, threadId: selected }); clearThread(); await loadInbox(); }); });
  }
  get("supportStaffTransferForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const recipient = transferTargets.find((target) => target.id === get("supportStaffRecipient").value);
    if (!selected || !recipient) return;
    if (!window.confirm("Het hele gesprek doorsturen naar " + recipient.name + "? Je niet-verstuurde tekst wordt gewist en een lopende oproep stopt.")) return;
    void run(async () => {
      get("supportStaffTransferError").hidden = true; get("supportStaffTransferSend").disabled = true;
      if (!transferPending || transferPending.threadId !== selected || transferPending.recipientId !== recipient.id || transferPending.recipientVersion !== recipient.version) {
        transferPending = { action: "transfer", threadId: selected, recipientId: recipient.id, recipientVersion: recipient.version, clientId: crypto.randomUUID() };
      }
      try {
        await api.request(transferPending); clearThread(); await loadInbox(); status("Gesprek doorgestuurd naar " + recipient.name + ".");
      } catch (error) {
        if ([401, 403, 404].includes(error.status)) { fail(error); return; }
        get("supportStaffTransferError").textContent = error.message || "Doorsturen niet bevestigd. Ververs de inbox of probeer opnieuw.";
        get("supportStaffTransferError").hidden = false;
      } finally { get("supportStaffTransferSend").disabled = !transferTargets.length; }
    });
  });
  setInterval(async () => {
    if (!admin || busy || polling || document.hidden) return;
    const ticket = generation;
    polling = true;
    try {
      if (available && Date.now() - lastPresence >= 15000) { await api.request({ action: "presence", available: true }); lastPresence = Date.now(); }
      if (ticket !== generation || busy) return;
      await loadInbox();
    } catch (error) { fail(error); } finally { polling = false; }
  }, 3000);
  window.addEventListener("pagehide", clear);
  void run(load);
})();
