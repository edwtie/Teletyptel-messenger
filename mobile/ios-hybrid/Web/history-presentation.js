(function (root) {
  "use strict";
  function mount(document, client) {
    const byID = name => document.getElementById(name);
    const dialog = byID("hybridHistory");
    let state; let ticket; let timer; let returnFocus; let messageSignature;
    function valid() { return ticket === state?.epoch && state.history.available && ["idle", "failed"].includes(state.call.phase); }
    async function action(name, args = {}) {
      if (!valid()) return;
      try { await client.historyCommand(name, args, ticket); }
      catch { if (valid()) byID("hybridHistoryNotice").textContent = "Niet uitgevoerd. Controleer de verbinding."; }
    }
    function reset() {
      clearTimeout(timer); dialog.hidden = true; ticket = undefined; messageSignature = undefined;
      byID("hybridHistoryEntries").replaceChildren(); byID("hybridHistoryMessages").replaceChildren();
      byID("hybridHistorySearch").value = ""; byID("hybridHistoryWindow").hidden = true;
    }
    async function close() {
      const epoch = ticket; reset();
      if (epoch === state?.epoch) await client.historyCommand("close", {}, epoch).catch(() => {});
      if (returnFocus?.getClientRects().length) returnFocus.focus({ preventScroll: true });
      byID("hybridMessages").dispatchEvent(new document.defaultView.Event("scroll"));
    }
    function render() {
      const history = state.history;
      const list = byID("hybridHistoryEntries"); list.replaceChildren();
      for (const entry of history.entries) {
        const row = document.createElement("div"); row.className = "hybrid-history-entry"; row.setAttribute("role", "listitem");
        const open = document.createElement("button"); open.type = "button"; open.dataset.historyId = entry.id;
        const name = document.createElement("strong"); name.textContent = entry.name;
        const preview = document.createElement("span"); preview.textContent = entry.preview;
        open.append(name, preview); open.onclick = () => { void action("open", { id: entry.id }); };
        const archive = document.createElement("button"); archive.type = "button"; archive.textContent = entry.archived ? "Herstellen" : "Archiveren";
        archive.setAttribute("aria-label", archive.textContent + ": " + entry.name);
        archive.onclick = () => { void action("archive", { id: entry.id, archived: !entry.archived }); }; row.append(open, archive); list.append(row);
      }
      const window = history.window;
      byID("hybridHistoryWindow").hidden = !window;
      byID("hybridHistoryNotice").textContent = window?.loading ? "Berichten laden…" : window?.notice || history.notice || (!history.entries.length ? "Geen gesprekken gevonden." : "");
      if (!window) { byID("hybridHistoryMessages").replaceChildren(); messageSignature = undefined; return; }
      byID("hybridHistoryWindowTitle").textContent = window.title;
      byID("hybridHistoryEarlier").disabled = window.loading || !window.hasEarlier;
      byID("hybridHistoryRefresh").disabled = window.loading;
      byID("hybridHistoryChat").disabled = !window.canChat || window.loading;
      const signature = JSON.stringify([window.id, window.messages]);
      if (messageSignature === signature) return;
      messageSignature = signature;
      const messages = byID("hybridHistoryMessages"); messages.replaceChildren();
      for (const message of window.messages) {
        const item = document.createElement("div"); item.setAttribute("role", "listitem"); item.className = "hybrid-history-message" + (message.outgoing ? " outgoing" : "");
        const sender = document.createElement("strong"); sender.textContent = message.outgoing ? "Jij" : message.sender || window.title;
        const body = document.createElement("div"); body.textContent = message.body; document.defaultView.TeleTypTelHybridSmileys?.body(body, message.body);
        const time = document.createElement("time"); const date = new Date(message.timestamp * 1000); time.dateTime = date.toISOString(); time.textContent = date.toLocaleString("nl-NL");
        item.append(sender, body, time); messages.append(item);
      }
    }
    async function open(archived) {
      if (!state.history.available || !["idle", "failed"].includes(state.call.phase)) return;
      ticket = state.epoch; returnFocus = document.activeElement;
      await document.defaultView.TeleTypTelHybridChat?.flush();
      if (!valid()) return;
      byID("hybridMainMenu").open = false; byID("hybridHistorySearch").value = ""; byID("hybridHistoryArchived").checked = archived;
      byID("hybridHistoryTitle").textContent = archived ? "Archief" : "Geschiedenis";
      dialog.hidden = false; byID("hybridHistoryClose").focus({ preventScroll: true }); render();
      await action("search", { query: "", archived });
    }
    byID("hybridOpenHistory").onclick = () => { void open(false); };
    byID("hybridOpenArchive").onclick = () => { void open(true); };
    byID("hybridHistoryClose").onclick = () => { void close(); };
    const search = () => { clearTimeout(timer); timer = setTimeout(() => { void action("search", { query: byID("hybridHistorySearch").value, archived: byID("hybridHistoryArchived").checked }); }, 200); };
    byID("hybridHistorySearch").oninput = search; byID("hybridHistoryArchived").onchange = search;
    for (const [id, command] of [["hybridHistoryEarlier", "earlier"], ["hybridHistoryRefresh", "refresh"], ["hybridHistoryChat", "chat"]]) byID(id).onclick = async () => {
      const window = state.history.window; if (!window || !valid()) return;
      await action(command, { id: window.id }); if (command === "chat" && !state.history.window) await close();
    };
    const keyboard = event => {
      if (dialog.hidden) return;
      if (event.key === "Escape") { event.preventDefault(); void close(); }
      if (event.key !== "Tab") return;
      const fields = Array.from(dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")).filter(value => value.getClientRects().length);
      const index = fields.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); fields.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === fields.length - 1)) { event.preventDefault(); fields[0]?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    const unsubscribe = client.subscribe(value => {
      if (state?.epoch !== value.epoch || !value.history.available || !["idle", "failed"].includes(value.call.phase)) reset();
      state = value;
      for (const id of ["hybridOpenHistory", "hybridOpenArchive"]) byID(id).disabled = !value.history.available;
      if (!dialog.hidden && valid()) render();
    });
    document.defaultView.addEventListener("pagehide", () => { reset(); unsubscribe(); document.removeEventListener("keydown", keyboard); }, { once: true });
  }
  if (typeof module === "object" && module.exports) module.exports = { mount };
  else mount(root.document, root.TeleTypTelNativeSession);
})(typeof window === "undefined" ? globalThis : window);
