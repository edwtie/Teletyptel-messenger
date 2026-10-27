"use strict";
(() => {
  const ui = window.intakeUI, get = (id) => document.getElementById(id);
  const auth = ui.client("api.php"), api = ui.client("support-chat-api.php");
  const attachments = window.TeleTypTelSupportAttachments.mount({ container: get("supportStaffAttachments"), request: (body) => api.request(body), endpoint: "support-chat-api.php", language: window.TeleTypTelSupportLanguage.create("nl"), onSent: () => loadInbox(), onError: (error) => fail(error) });
  const translations = window.TeleTypTelSupportTranslation.mount({ container: get("supportStaffTranslation"), request: (body) => api.request(body), staff: true });
  const supportCall = window.TeleTypTelSupportCall.mount({ container: get("supportStaffCall"), draftHost: get("supportStaffLive"), input: get("supportStaffText"), endpoint: "support-call-api.php", rtcEndpoint: "../api/rtc-config.php", onLive: translations.live });
  get("supportStaffCall").querySelector(".support-call-actions").prepend(get("supportStaffTranslation"));
  let admin = null, selected = "", page = 1, rendered = "", lastSequence = 0, pending = null, queueSignature = "";
  let busy = false, polling = false, available = false, lastPresence = 0, generation = 0;
  const stateNames = { waiting: "Wacht op een medewerker", active: "In behandeling", closed: "Afgesloten" };
  const status = (text) => { get("supportStaffStatus").textContent = text; };
  const clearThread = () => {
    attachments.setThread("", false);
    translations.clear();
    supportCall.setThread("", false);
    selected = rendered = ""; lastSequence = 0; pending = null;
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
    attachments.setThread(thread.id, thread.mine && thread.status === "active");
    translations.sync(thread.id, data.translationSettings);
    supportCall.setThread(thread.id, thread.mine && thread.status === "active");
    get("supportThreadTitle").textContent = thread.name;
    get("supportThreadStatus").textContent = stateNames[thread.status] + " · Naam door bezoeker opgegeven, identiteit niet gecontroleerd.";
    get("supportStaffReply").hidden = !thread.mine || thread.status !== "active";
    get("supportThreadActions").hidden = thread.status === "closed";
    get("supportStaffRelease").hidden = thread.status !== "active";
    const log = get("supportStaffMessages"), nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    if (rendered !== thread.id) { log.replaceChildren(); lastSequence = 0; rendered = thread.id; }
    let changed = false;
    for (const message of data.messages) {
      if (Number(message.sequence) <= lastSequence) continue;
      const entry = ui.node("article", undefined, message.kind);
      entry.append(ui.node("strong", message.name + (message.kind === "staff" ? " · medewerker" : " · bezoeker")), ui.node("p", message.text));
      const stamp = ui.node("time", new Date(message.created * 1000).toLocaleString("nl-NL"));
      stamp.dateTime = new Date(message.created * 1000).toISOString(); entry.append(stamp); log.append(entry);
      attachments.render(entry, message, thread.id);
      translations.attach(entry, message, Number(message.sequence) > Number(data.messages.at(-1)?.sequence || 0) - 10);
      lastSequence = Number(message.sequence); changed = true;
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
