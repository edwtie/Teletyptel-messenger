"use strict";
(() => {
  let csrf = "";
  const status = document.getElementById("status");
  const container = document.getElementById("interpreters");
  const names = { pending: "Wacht op goedkeuring", enabled: "Goedgekeurd", blocked: "Geblokkeerd" };
  const refresh = async (body) => {
    status.textContent = "Bezig…";
    try {
      const response = await fetch("interpreters-api.php", { method: body ? "POST" : "GET", cache: "no-store",
        headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {}, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Laden mislukt.");
      csrf = data.csrfToken;
      container.replaceChildren();
      for (const interpreter of data.interpreters) {
        const card = document.createElement("article");
        const title = document.createElement("h3");
        title.textContent = interpreter.display_name;
        const detail = document.createElement("p");
        detail.textContent = interpreter.jid + " · " + names[interpreter.status];
        card.append(title, detail);
        for (const [value, label] of [["enabled", "Goedkeuren / deblokkeren"], ["blocked", "Blokkeren"]]) {
          if (value === interpreter.status) continue;
          const button = document.createElement("button");
          button.textContent = label;
          button.addEventListener("click", () => {
            if (window.confirm(label + " voor " + interpreter.display_name + "?")) void refresh({ accountId: interpreter.account_id, status: value });
          });
          card.append(button);
        }
        container.append(card);
      }
      status.textContent = data.interpreters.length + " tolkaanmeldingen.";
    } catch (error) { container.replaceChildren(); status.textContent = error.message; }
  };
  document.getElementById("refresh").addEventListener("click", () => { void refresh(); });
  void refresh();
})();
