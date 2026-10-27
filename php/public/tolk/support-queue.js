"use strict";
(() => {
  const container = document.createElement("section");
  container.id = "supportInterpreterQueue"; container.hidden = true;
  document.getElementById("queue").after(container);
  let csrf = "", busy = false, signature = "";
  const clientId = crypto.randomUUID();
  const api = async (body) => {
    const response = await fetch("../api/support-call-interpreter.php", { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {}, body: body ? JSON.stringify({ ...body, clientId }) : undefined });
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message || "Tolkqueue niet bereikbaar."); csrf = data.csrfToken; return data;
  };
  const node = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
  const poll = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const data = await api(); container.hidden = !data.enabled;
      const next = JSON.stringify([data.queue, data.assigned]); if (next === signature) return; signature = next;
      container.replaceChildren(node("h3", "Klantenservice · gebarentolk"));
      for (const item of data.assigned) { const link = node("a", "Open je klantenservice-oproep"); link.href = "support.php?call=" + encodeURIComponent(item.call_id); container.append(link); }
      if (!data.queue.length && !data.assigned.length) container.append(node("p", "Geen klantenservice-oproepen. Zet je tolkstatus op beschikbaar om nieuwe aanvragen te ontvangen."));
      for (const item of data.queue) {
        const card = node("article", ""); card.append(node("p", "Een bezoeker en medewerker vragen een gebarentolk. Accepteren start deelname met camera, microfoon en live tekst. Je krijgt geen eerdere chatgeschiedenis."));
        const accept = node("button", "Klantenservice-oproep accepteren"); accept.type = "button";
        accept.addEventListener("click", async () => {
          if (busy) return; busy = true; accept.disabled = true;
          try { await api({ action: "accept_interpreter", callId: item.call_id }); try { sessionStorage.setItem("support-interpreter-accepted-" + item.call_id, "yes"); } catch {} location.assign("support.php?call=" + encodeURIComponent(item.call_id)); }
          catch (failure) { container.append(node("p", failure.message)); accept.disabled = false; } finally { busy = false; }
        }); card.append(accept); container.append(card);
      }
    } catch { container.hidden = true; signature = ""; } finally { busy = false; }
  };
  setInterval(() => void poll(), 3000); void poll();
})();
