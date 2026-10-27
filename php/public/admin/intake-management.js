"use strict";
(() => {
  const ui = window.intakeUI;
  const api = ui.client("api.php");
  const get = (id) => document.getElementById(id);
  let admin = null;
  let application = null;
  let page = 1;
  let busy = false;
  let expiryTimer;
  let revealTimer;
  const message = (text, error = false) => { get("message").textContent = text; get("message").className = error ? "notice error" : "notice"; };
  const clear = () => {
    api.cancel();
    clearTimeout(expiryTimer);
    clearTimeout(revealTimer);
    admin = null;
    application = null;
    for (const id of ["team", "rows", "documents", "audit", "bsnValue", "detailSummary", "detailInsurer", "detailAttention", "identity"]) get(id).replaceChildren();
    for (const id of ["password", "ownerPassword", "reviewPassword", "staffPassword"]) get(id).value = "";
    get("staffForm").reset();
    for (const id of ["workspace", "ownerSection", "teamSection", "adminBack", "listSection", "detailSection"]) get(id).hidden = true;
    get("loginForm").hidden = false;
    get("logout").hidden = true;
  };
  const run = async (operation) => {
    if (busy) return;
    busy = true;
    try {
      await operation();
      if (admin) {
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => { clear(); message("Sessie verlopen. Log opnieuw in."); }, 30 * 60 * 1000);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        if (error.status === 401 || error.status === 403) clear();
        message(error.message, true);
      }
    } finally { busy = false; }
  };
  const password = (id) => { const value = get(id).value; get(id).value = ""; return value; };
  const loadTeam = async () => {
    const data = await api.request(null, "?action=intake_members");
    get("team").replaceChildren();
    for (const member of data.team) {
      const allowed = Boolean(member.canReviewIntake);
      const row = ui.node("p", (member.display_name || member.email) + " · " + member.role + " · Inzage: " + (allowed ? "aan " : "uit "));
      if (member.role !== "staff") {
        row.append(ui.node("span", !Number(member.enabled) ? "(account uitgeschakeld)" :
          ["owner", "admin"].includes(member.role) ? "(via beheerrol)" : "(geen beoordelaarsrol)"));
        get("team").append(row);
        continue;
      }
      const toggle = ui.button(allowed ? "Intrekken" : "Toekennen", () => run(async () => {
        if (!confirm((allowed ? "Inzagerecht intrekken voor " : "Toegang tot BSN en medische documenten geven aan ") + member.email + "?")) return;
        await api.request({ action: "intake_team", adminId: member.admin_id, canReview: !allowed,
          expected: Boolean(Number(member.can_review_intake)), expectedVersion: Number(member.session_version),
          reviewPassword: password("ownerPassword") });
        await load();
        message("Inzagerecht aangepast en gelogd.");
      }));
      toggle.disabled = !Number(member.enabled);
      row.append(toggle);
      const enabled = Boolean(Number(member.enabled));
      row.append(ui.node("span", enabled ? " · Actief " : " · Geblokkeerd "));
      row.append(ui.button(enabled ? "Blokkeren" : "Deblokkeren", () => run(async () => {
        if (!confirm((enabled ? "Staffaccount blokkeren en alle sessies ongeldig maken: " :
          "Staffaccount deblokkeren zonder inzagerecht te herstellen: ") + member.email + "?")) return;
        await api.request({ action: "intake_staff_status", adminId: member.admin_id, enabled: !enabled,
          expectedEnabled: enabled, expectedVersion: Number(member.session_version), confirmed: true,
          reviewPassword: password("ownerPassword") });
        await loadTeam();
        message(enabled ? "Staffaccount geblokkeerd. Inzage ingetrokken en bestaande sessies ongeldig." :
          "Staffaccount gedeblokkeerd. Opnieuw inloggen en afzonderlijk inzagerecht toekennen zijn nodig.");
      }), enabled ? "danger" : "secondary"));
      get("team").append(row);
    }
  };
  const list = async () => {
    const data = await api.request(null, "?action=intake_list&page=" + page);
    page = data.applications.page;
    get("rows").replaceChildren();
    for (const entry of data.applications.items) {
      const row = ui.node("tr");
      for (const value of [entry.display_name || entry.account_id, entry.plan_name, ui.statuses[entry.status], ui.date(entry.submitted_at || entry.created_at)]) row.append(ui.node("td", value));
      const cell = ui.node("td");
      cell.append(ui.button("Bekijken", () => run(() => detail(entry.id))));
      row.append(cell);
      get("rows").append(row);
    }
    get("pagination").textContent = "Pagina " + page + " · " + data.applications.total + " aanmeldingen";
    get("previous").disabled = page <= 1;
    get("next").disabled = page * data.applications.pageSize >= data.applications.total;
  };
  const detail = async (id) => {
    get("detailSection").hidden = true;
    get("reviewPassword").value = "";
    const data = await api.request(null, "?action=intake_view&id=" + encodeURIComponent(id));
    application = data.application;
    get("detailSummary").textContent = application.plan_name + " · " + application.account_id + " · " + ui.statuses[application.status];
    get("detailRequirements").textContent = ui.requirements(application);
    get("detailAttention").textContent = ui.attention(application);
    get("detailInsurer").textContent = application.insurer ? application.insurer.name + " · UZOVI " + application.insurer.uzovi : "Geen zorgverzekeraar opgeslagen.";
    get("detailExpiry").textContent = "Zorggegevens verwijderen uiterlijk: " + ui.date(application.expires_at);
    get("bsnValue").textContent = application.bsnMasked ? "BSN: " + application.bsnMasked : "Geen BSN opgeslagen.";
    get("reveal").hidden = !application.bsnMasked;
    get("documents").replaceChildren();
    for (const file of application.documents) {
      get("documents").append(ui.button(file.kind === "audiogram" ? "Audiogram downloaden" : "Voorschrift downloaden", () => run(async () => {
        await api.request({ action: "intake_document", id: application.id, documentId: file.id, reviewPassword: password("reviewPassword") }, "", true);
        await detail(application.id);
        message("Download gestart. Gebruik een beveiligd apparaat.");
      })));
    }
    get("reviewForm").hidden = !["submitted", "processing", "needs_info"].includes(application.status);
    get("reviewStatus").value = application.status === "needs_info" ? "needs_info" : "processing";
    get("reviewFeedback").value = application.feedback_code;
    get("audit").textContent = data.audit.map((entry) => ui.date(entry.created_at) + " · " + entry.actor_id + " · " + entry.action).join("\n");
    get("detailSection").hidden = false;
  };
  const load = async () => {
    clear();
    const session = await api.request(null, "?action=session");
    admin = session.admin;
    get("loginForm").hidden = Boolean(admin);
    get("logout").hidden = !admin;
    if (!admin) { message("Log in met je eigen beheer- of staffaccount."); return; }
    get("identity").textContent = (admin.displayName || admin.email) + " · " + admin.role;
    get("adminBack").hidden = !["owner", "admin"].includes(admin.role);
    get("ownerSection").hidden = admin.role !== "owner";
    get("teamSection").hidden = !["owner", "admin"].includes(admin.role);
    get("listSection").hidden = !admin.canReviewIntake;
    get("workspace").hidden = false;
    if (["owner", "admin"].includes(admin.role)) await loadTeam();
    if (admin.canReviewIntake) await list();
    message(admin.canReviewIntake ? "Aanmeldingen geladen. Inzage wordt gelogd." : "Je hebt nog geen apart inzagerecht. Een admin of eigenaar kan dit toekennen.");
  };
  get("refresh").addEventListener("click", () => run(load));
  get("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => { await api.request({ action: "login", email: get("email").value, password: password("password") }); await load(); });
  });
  get("logout").addEventListener("click", async () => {
    clear();
    try { await api.request({ action: "logout" }); message("Uitgelogd."); }
    catch { message("Weergave gesloten. Controleer je verbinding om ook de serversessie af te sluiten.", true); }
  });
  get("staffForm").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await api.request({ action: "intake_staff", email: get("staffEmail").value, displayName: get("staffName").value,
        staffPassword: password("staffPassword"), reviewPassword: password("ownerPassword") });
      get("staffForm").reset();
      await loadTeam();
      message("Staffaccount aangemaakt zonder inzagerecht. Ken dit apart toe indien bevoegd.");
    });
  });
  get("previous").addEventListener("click", () => run(async () => { page--; await list(); }));
  get("next").addEventListener("click", () => run(async () => { page++; await list(); }));
  get("reviewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await api.request({ action: "intake_review", id: application.id, version: Number(application.version),
        status: get("reviewStatus").value, feedback: get("reviewFeedback").value });
      await detail(application.id);
      await list();
      message("Beoordeling opgeslagen. Abonnement en facturatie zijn niet gewijzigd.");
    });
  });
  get("reveal").addEventListener("click", () => run(async () => {
    const data = await api.request({ action: "intake_bsn", id: application.id, reviewPassword: password("reviewPassword") });
    get("bsnValue").textContent = "BSN: " + data.bsn;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { get("bsnValue").textContent = application?.bsnMasked || ""; }, 15000);
  }));
  window.addEventListener("pagehide", clear);
  window.addEventListener("pageshow", (event) => { if (event.persisted) run(load); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      for (const id of ["password", "ownerPassword", "reviewPassword", "staffPassword"]) get(id).value = "";
      get("bsnValue").textContent = application?.bsnMasked || "";
    }
  });
  run(load);
})();
