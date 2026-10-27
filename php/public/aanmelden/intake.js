"use strict";
(() => {
  const ui = window.intakeUI;
  const api = ui.client("api.php");
  const get = (id) => document.getElementById(id);
  let state = null;
  let application = null;
  let busy = false;
  let expiryTimer;
  let revealTimer;
  const message = (text, error = false) => { get("message").textContent = text; get("message").className = error ? "notice error" : "notice"; };
  const clear = () => {
    api.cancel();
    clearTimeout(expiryTimer);
    clearTimeout(revealTimer);
    state = null;
    application = null;
    get("detailsForm").reset();
    get("submitForm").reset();
    get("stored").replaceChildren();
    get("plans").replaceChildren();
    get("bsnValue").textContent = "";
    get("summary").textContent = "";
    get("applicationSection").hidden = true;
    get("planSection").hidden = true;
    get("identity").textContent = "Log in bij Messenger en laad deze pagina opnieuw.";
  };
  const run = async (operation) => {
    if (busy) return;
    busy = true;
    get("message").setAttribute("aria-busy", "true");
    try { await operation(); }
    catch (error) {
      if (error.name !== "AbortError") {
        if (error.status === 403) clear();
        message(error.message, true);
      }
    } finally { busy = false; get("message").removeAttribute("aria-busy"); }
  };
  const input = () => ({ id: application.id, version: Number(application.version) });
  const update = async (action, extra = {}) => {
    const result = await api.request({ action, ...input(), ...extra });
    application = result.application;
  };
  const render = () => {
    const active = application && !["withdrawn", "expired"].includes(application.status);
    get("planSection").hidden = Boolean(active) || !state?.fresh;
    get("applicationSection").hidden = !application || !state?.fresh;
    get("plans").replaceChildren();
    for (const plan of state?.plans || []) {
      const card = ui.node("article");
      card.append(ui.node("h3", plan.name), ui.node("p", plan.description), ui.node("p", ui.price(plan)), ui.node("p", ui.requirements(plan)));
      const choose = ui.button("Dit abonnement aanvragen", () => run(async () => {
        const result = await api.request({ action: "start", planId: plan.plan_id,
          planVersion: Number(plan.plan_version), ruleVersion: Number(plan.rule_version) });
        application = result.application;
        render();
        message("Concept aangemaakt. Vul de vereiste gegevens in.");
      }));
      choose.disabled = !ui.ready(plan, state.readiness);
      if (choose.disabled) card.append(ui.node("p", "Zorgaanmelding nog niet geactiveerd. Neem contact op met TeleTypTel.", "notice"));
      card.append(choose);
      get("plans").append(card);
    }
    if (!state?.plans?.length) get("plans").append(ui.node("p", "Er zijn nog geen abonnementen voor aanmelding gepubliceerd."));
    if (!application) return;
    const sensitive = Number(application.requires_bsn) || Number(application.requires_documents);
    const editable = ["draft", "needs_info"].includes(application.status);
    get("summary").textContent = application.plan_name + " · " + ui.price(application) + " · " + ui.statuses[application.status];
    get("requirements").textContent = ui.requirements(application);
    get("feedback").hidden = !application.feedback_code;
    get("feedback").textContent = ui.feedback[application.feedback_code] || "";
    get("retention").textContent = "Zorggegevens worden uiterlijk verwijderd op " + ui.date(application.expires_at) + ". Je kunt ze eerder verwijderen door de aanvraag in te trekken.";
    get("medicalNotice").hidden = !sensitive;
    get("detailsForm").hidden = !editable || !sensitive;
    get("submitForm").hidden = !editable;
    get("withdraw").hidden = !active;
    get("bsnField").hidden = !Number(application.requires_bsn);
    get("bsn").required = Boolean(Number(application.requires_bsn) && !application.bsnMasked);
    get("bsn").value = "";
    get("bsnHelp").textContent = application.bsnMasked ? "Opgeslagen: " + application.bsnMasked + ". Laat leeg om dit te behouden." : "Alleen verplicht voor dit gekozen abonnement.";
    get("uploadFields").hidden = !Number(application.requires_documents);
    get("insurer").value = application.insurer?.id || "";
    get("bsnValue").textContent = application.bsnMasked ? "BSN: " + application.bsnMasked : "";
    get("revealBsn").hidden = !application.bsnMasked;
    get("privacyLink").hidden = !sensitive || !state.readiness.privacyUrl;
    if (state.readiness.privacyUrl) get("privacyLink").href = state.readiness.privacyUrl;
    get("stored").replaceChildren();
    if (application.insurer) get("stored").append(ui.node("p", "Zorgverzekeraar: " + application.insurer.name + " (UZOVI " + application.insurer.uzovi + ")"));
    for (const file of application.documents || []) {
      const row = ui.node("p", (file.kind === "audiogram" ? "Audiogram" : "Voorschrift") + " opgeslagen · ");
      row.append(ui.button("Eigen document downloaden", () => run(async () => {
        await api.request({ action: "document", ...input(), documentId: file.id }, "", true);
        message("Download gestart. Bewaar medische documenten niet op een gedeeld apparaat.");
      })));
      get("stored").append(row);
    }
  };
  const load = async () => {
    clear();
    message("Aanmelding laden…");
    state = await api.request();
    application = state.application;
    get("identity").textContent = state.account ? "Ingelogd als " + (state.account.display_name || "TeleTypTel-gebruiker") : "Maak een account of log eerst in via Messenger.";
    get("insurer").replaceChildren(new Option("Kies je zorgverzekeraar", ""));
    for (const insurer of state.insurers.items) get("insurer").append(new Option(insurer.name + " — " + insurer.uzovi, insurer.id));
    get("insurer").required = true;
    get("insurerSource").textContent = "Keuzelijst: Vektis UZOVI-register, bron " + state.insurers.sourcePublishedOn + ". Niet in de lijst? Neem contact op; dit is geen controle van je verzekering.";
    render();
    message(state.fresh ? "Je ziet alleen je eigen aanmelding." : "Log opnieuw in bij Messenger en klik daarna op Aanmelding laden.");
    if (state.fresh) expiryTimer = setTimeout(() => { clear(); message("Voor je privacy is deze weergave gesloten. Log opnieuw in en laad de aanmelding."); }, Math.max(0, state.freshUntil * 1000 - Date.now()));
  };
  get("reload").addEventListener("click", () => run(load));
  get("detailsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const bsn = get("bsn").value;
      get("bsn").value = "";
      await update("save_details", { insurerId: get("insurer").value, bsn });
      try {
        for (const kind of ["audiogram", "prescription"]) {
          const file = get(kind).files[0];
          if (!file) continue;
          if (file.size > state.readiness.maxFileBytes) throw new Error("Maximaal 4 MB per document.");
          message("Document wordt gecontroleerd en opgeslagen…");
          const form = new FormData();
          for (const [key, value] of Object.entries({ action: "upload", ...input(), kind })) form.append(key, String(value));
          form.append("document", file);
          const result = await api.request(form);
          application = result.application;
          get(kind).value = "";
        }
        message("Opgeslagen. Controleer je aanvraag en dien deze vervolgens in.");
      } finally { if (application && state) render(); }
    });
  });
  get("submitForm").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await update("submit", { confirmed: get("confirmed").checked, privacyVersion: state.readiness.privacyVersion });
      get("confirmed").checked = false;
      render();
      message("Aanvraag ingediend. Een bevoegde medewerker beoordeelt deze. Dit is nog geen bevestiging van vergoeding of abonnement.");
    });
  });
  get("withdraw").addEventListener("click", () => run(async () => {
    if (!confirm("Aanvraag intrekken? BSN, zorgverzekeraar en documenten worden direct uit deze aanvraag verwijderd. Dit stopt geen bestaand abonnement.")) return;
    await update("withdraw", { confirmed: true });
    get("detailsForm").reset();
    render();
    message("Aanvraag ingetrokken en zorggegevens verwijderd.");
  }));
  get("revealBsn").addEventListener("click", () => run(async () => {
    const result = await api.request({ action: "reveal_bsn", ...input() });
    get("bsnValue").textContent = "BSN: " + result.bsn;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { get("bsnValue").textContent = application?.bsnMasked || ""; }, 15000);
  }));
  window.addEventListener("pagehide", clear);
  window.addEventListener("pageshow", (event) => { if (event.persisted) run(load); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { get("bsn").value = ""; get("bsnValue").textContent = application?.bsnMasked || ""; } });
  run(load);
})();
