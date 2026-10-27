const adminBulkUsers = (() => {
  let context;
  let rows = new Map();
  let selection = new Set();
  let pending = null;
  let generation = 0;
  let busy = false;
  const element = (identifier) => document.getElementById(identifier);
  const labels = { block: "Webtoegang blokkeren", unblock: "Webtoegang deblokkeren", trash: "Verwijderen naar prullenbak", restore: "Herstellen uit prullenbak" };
  const active = () => context.active() && context.page() === "users";

  function cancel() {
    generation += 1;
    pending = null;
    busy = false;
    if (element("userBulkDialog").open) element("userBulkDialog").close();
    element("userBulkPassword").value = "";
    element("userBulkConfirm").checked = false;
    element("userBulkConfirmButton").disabled = false;
    for (const identifier of ["userBulkSummary", "userBulkTargets", "userBulkStatus"]) element(identifier).replaceChildren();
  }

  function update() {
    const count = selection.size;
    element("userSelectionCount").textContent = count + " geselecteerd";
    element("userBulkBar").hidden = count === 0;
    element("selectAllUsers").checked = count > 0 && count === rows.size;
    element("selectAllUsers").indeterminate = count > 0 && count < rows.size;
    element("selectAllUsers").disabled = rows.size === 0;
    const selected = [...selection].map((accountId) => rows.get(accountId));
    const inTrash = count > 0 && selected.every((account) => account.trashed_at);
    element("userBulkRestore").hidden = !inTrash;
    element("userBulkTrash").hidden = inTrash;
    element("userBulkBlock").hidden = inTrash || !selected.some((account) => !Number(account.web_blocked));
    element("userBulkUnblock").hidden = inTrash || !selected.some((account) => Number(account.web_blocked));
    element("accountsTable").querySelectorAll("[data-account-select]").forEach((checkbox) => {
      checkbox.checked = selection.has(checkbox.dataset.accountSelect);
    });
  }

  function clear() {
    cancel();
    rows = new Map();
    selection = new Set();
    update();
  }

  function setRows(accounts) {
    clear();
    rows = new Map(accounts.map((account) => [account.account_id, account]));
    element("accountsTable").querySelectorAll("[data-account-select]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => toggle(checkbox.dataset.accountSelect, checkbox.checked));
    });
    update();
  }

  function toggle(accountId, checked) {
    if (!active() || !rows.has(accountId)) return;
    if (checked) selection.add(accountId);
    else selection.delete(accountId);
    update();
  }

  function open(operation) {
    if (!active() || !labels[operation] || !selection.size) return;
    cancel();
    pending = { operation, targets: [...selection].map((accountId) => ({ accountId, version: Number(rows.get(accountId).access_version || 1) })) };
    element("userBulkTitle").textContent = labels[operation];
    element("userBulkSummary").textContent = labels[operation] + " voor " + selection.size + " gebruiker(s). Controleer de selectie voordat je bevestigt.";
    element("userBulkTargets").innerHTML = [...selection].map((accountId) => {
      const account = rows.get(accountId);
      return "<li>" + context.escape(account.display_name || account.jid || accountId) + " · " + context.escape(account.jid || accountId) + "</li>";
    }).join("");
    element("userBulkDialog").showModal();
  }

  async function submit(event) {
    event.preventDefault();
    if (!active() || !pending || busy || !element("userBulkDialog").open) return;
    if (!element("userBulkConfirm").checked || !element("userBulkPassword").value) {
      element("userBulkStatus").textContent = "Bevestig de selectie en vul je beheerwachtwoord in.";
      return;
    }
    const request = generation;
    const body = { action: "bulk_accounts", ...pending, confirmed: true, adminPassword: element("userBulkPassword").value };
    element("userBulkPassword").value = "";
    busy = true;
    element("userBulkConfirmButton").disabled = true;
    element("userBulkStatus").textContent = "Actie uitvoeren…";
    try {
      const data = await context.fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (request !== generation || !active()) return;
      clear();
      await context.reload();
      if (active()) context.message(data.changed + " van " + data.selected + " geselecteerde gebruikers gewijzigd.");
    } catch (error) {
      if (request === generation && active()) element("userBulkStatus").textContent = error.message;
    } finally {
      if (request === generation) {
        busy = false;
        element("userBulkConfirmButton").disabled = false;
      }
    }
  }

  function init(options) {
    context = options;
    element("selectAllUsers").addEventListener("change", () => {
      if (!active()) return;
      selection = element("selectAllUsers").checked ? new Set(rows.keys()) : new Set();
      update();
    });
    for (const [identifier, operation] of [["userBulkBlock", "block"], ["userBulkUnblock", "unblock"], ["userBulkTrash", "trash"], ["userBulkRestore", "restore"]]) {
      element(identifier).addEventListener("click", () => open(operation));
    }
    element("userBulkClear").addEventListener("click", () => { selection.clear(); update(); element("selectAllUsers").focus(); });
    element("userBulkConfirmForm").addEventListener("submit", submit);
    element("closeUserBulk").addEventListener("click", cancel);
    element("userBulkDialog").addEventListener("close", cancel);
  }

  return { init, setRows, toggle, clear };
})();
