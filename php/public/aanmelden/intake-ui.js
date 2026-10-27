"use strict";
window.intakeUI = (() => {
  const statuses = { draft: "Concept", submitted: "Ingediend", processing: "In behandeling",
    needs_info: "Aanvulling nodig", reviewed: "Beoordeling afgerond", closed: "Gesloten",
    withdrawn: "Ingetrokken", expired: "Bewaartermijn verstreken" };
  const feedback = { contact_us: "Neem contact op met TeleTypTel.", replace_audiogram: "Upload een nieuw audiogram.",
    replace_prescription: "Upload een nieuw voorschrift van arts/audioloog.", check_insurer: "Controleer je zorgverzekeraar.",
    complete: "De beoordeling is afgerond.", "": "" };
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const button = (text, action, className = "secondary") => {
    const element = node("button", text, className);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  const date = (value) => value ? new Date(value.replace(" ", "T") + "Z").toLocaleString("nl-NL") : "—";
  const price = (plan) => plan.price_cents === null ? "Prijs op aanvraag" :
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(plan.price_cents) / 100)
      + ({ month: " per maand", year: " per jaar", none: "", once: " eenmalig" }[plan.billing_period] || "");
  const requirements = (plan) => [
    Number(plan.requires_bsn) === 1 ? "BSN verplicht" : "Geen BSN",
    Number(plan.requires_documents) === 1 ? "Audiogram én voorschrift verplicht" : "Geen medische documenten",
    Number(plan.requires_documents) === 1 || Number(plan.requires_bsn) === 1 ? "Zorgverzekeraar verplicht" : "Geen zorgverzekeraar nodig"
  ].join(" · ");
  const ready = (plan, readiness) => (!Number(plan.requires_bsn) || readiness.bsnReady)
    && (!Number(plan.requires_documents) || readiness.medicalReady);
  const attention = (application) => {
    if (["withdrawn", "expired"].includes(application.status)) return "De zorggegevens van deze aanvraag zijn verwijderd.";
    const missing = [];
    if ((Number(application.requires_bsn) || Number(application.requires_documents)) && !application.insurer) missing.push("zorgverzekeraar");
    if (Number(application.requires_bsn) && !application.bsnMasked) missing.push("BSN");
    if (Number(application.requires_documents)) {
      const kinds = (application.documents || []).map((file) => file.kind);
      if (!kinds.includes("audiogram")) missing.push("audiogram");
      if (!kinds.includes("prescription")) missing.push("voorschrift van arts/audioloog");
    }
    return [
      application.status === "draft" ? "Concept: nog niet ingediend." : "",
      missing.length ? "Ontbreekt: " + missing.join(", ") + "." : "Alle gevraagde onderdelen zijn opgeslagen; dit zegt niets over inhoudelijke goedkeuring.",
      feedback[application.feedback_code] || ""
    ].filter(Boolean).join(" ");
  };
  const client = (endpoint) => {
    let csrf = "";
    let generation = 0;
    const pending = new Set();
    const request = async (payload, query = "", download = false, path = endpoint) => {
      const ticket = generation;
      const controller = new AbortController();
      pending.add(controller);
      try {
        const multipart = payload instanceof FormData;
        const response = await fetch(path + query, { method: payload ? "POST" : "GET",
          headers: payload ? { "X-CSRF-Token": csrf, "X-TeleTypTel-CSRF": csrf, ...(!multipart ? { "Content-Type": "application/json" } : {}) } : {},
          body: payload ? (multipart ? payload : JSON.stringify(payload)) : undefined,
          credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = download && response.ok ? await response.blob() : await response.json();
        if (ticket !== generation) throw new DOMException("Verlopen aanvraag", "AbortError");
        if (!response.ok || (!download && !data.ok)) {
          const error = new Error(data.message || "Aanvraag niet gelukt. Log zo nodig opnieuw in.");
          error.status = response.status;
          throw error;
        }
        if (data.csrfToken) csrf = data.csrfToken;
        if (download) {
          const url = URL.createObjectURL(data);
          const anchor = node("a");
          anchor.href = url;
          anchor.download = /filename="([a-z]+\.(?:pdf|png|jpg))"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "teletyptel-document";
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return;
        }
        return data;
      } finally {
        pending.delete(controller);
      }
    };
    return { request, cancel: () => { generation++; pending.forEach((controller) => controller.abort()); pending.clear(); } };
  };
  return { statuses, feedback, node, button, date, price, requirements, ready, attention, client };
})();
