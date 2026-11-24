(function (root) {
  "use strict";

  const limit = 100;
  const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const control = /[\u0000-\u001f\u007f-\u009f]/u;

  function normalizeDestination(value) {
    if (typeof value !== "string" || control.test(value) || new TextEncoder().encode(value).length > 254) return null;
    const destination = value.trim().replace(/^sip:/i, "");
    if (destination.includes("@")) {
      const parts = destination.split("@");
      if (parts.length !== 2 || !/^[a-z0-9._+%-]{1,128}$/i.test(parts[0]) ||
          !parts[1].split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
      return parts[0] + "@" + parts[1].toLowerCase();
    }
    const number = destination.replace(/[ ()-]/g, "");
    return /^\+?[0-9]{2,20}$/.test(number) ? number : null;
  }

  function contact(id, name, destination) {
    const cleanName = typeof name === "string" ? name.trim() : "";
    const target = normalizeDestination(destination);
    if (!idPattern.test(id) || !cleanName || control.test(cleanName) ||
        new TextEncoder().encode(cleanName).length > 120 || !target) throw new Error("invalidContact");
    return { id, name: cleanName, destination: target };
  }

  function createStore(storage) {
    function key(account) {
      if (typeof account !== "string" || !account || account.length > 96 || control.test(account)) throw new Error("accountRequired");
      return "teletyptel.sip-contacts.v1." + encodeURIComponent(account);
    }
    function read(account) {
      const value = storage.getItem(key(account));
      if (value === null) return [];
      if (value.length > 65536) throw new Error("invalidDirectory");
      const entries = JSON.parse(value);
      if (!Array.isArray(entries) || entries.length > limit) throw new Error("invalidDirectory");
      const validated = entries.map(entry => contact(entry.id, entry.name, entry.destination));
      if (new Set(validated.map(entry => entry.id)).size !== validated.length) throw new Error("invalidDirectory");
      return validated;
    }
    function save(account, id, name, destination) {
      const entries = read(account);
      const value = contact(id, name, destination);
      const index = entries.findIndex(entry => entry.id === value.id);
      if (index >= 0) entries[index] = value;
      else {
        if (entries.length >= limit) throw new Error("directoryFull");
        entries.push(value);
      }
      storage.setItem(key(account), JSON.stringify(entries));
    }
    function remove(account, id) {
      storage.setItem(key(account), JSON.stringify(read(account).filter(entry => entry.id !== id)));
    }
    return { read, save, remove };
  }

  function mount(document, translate) {
    const byId = id => document.getElementById(id);
    const sidebar = byId("conversationSidebar");
    const xmpp = byId("selectXmppDirectory");
    const sip = byId("selectSipDirectory");
    if (!sidebar || !xmpp || !sip) return null;
    const panel = byId("sipDirectory");
    const list = byId("sipDirectoryContacts");
    const status = byId("sipDirectoryStatus");
    const add = byId("sipDirectoryAdd");
    const form = byId("sipDirectoryForm");
    const name = byId("sipDirectoryName");
    const destination = byId("sipDirectoryDestination");
    const browser = document.defaultView;
    const store = createStore({
      getItem: key => browser.localStorage.getItem(key),
      setItem: (key, value) => browser.localStorage.setItem(key, value)
    });
    let account = "";
    let editing = "";
    let notice = null;

    function closeForm() {
      editing = "";
      form.reset();
      form.hidden = true;
      add.setAttribute("aria-expanded", "false");
    }

    function select(mode) {
      const showSip = mode === "sip" && Boolean(account);
      sidebar.dataset.contactDirectory = showSip ? "sip" : "xmpp";
      xmpp.setAttribute("aria-pressed", String(!showSip));
      sip.setAttribute("aria-pressed", String(showSip));
      byId("xmppDirectoryTitle").hidden = showSip;
      byId("sipDirectoryTitle").hidden = !showSip;
      panel.hidden = !showSip;
      notice = null;
      if (showSip) {
        byId("conversationActionsPanel").hidden = true;
        byId("conversationActionsToggle").setAttribute("aria-expanded", "false");
        refresh();
      } else {
        list.replaceChildren();
        status.textContent = "";
        closeForm();
      }
    }

    function openForm(entry) {
      if (!account) return;
      editing = entry?.id || "";
      name.value = entry?.name || "";
      destination.value = entry?.destination || "";
      form.hidden = false;
      add.setAttribute("aria-expanded", "true");
      name.focus();
    }

    function action(entry, label, operation) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", label + ": " + entry.name);
      button.addEventListener("click", operation);
      return button;
    }

    function refresh() {
      if (panel.hidden || !account) return;
      let entries;
      try { entries = store.read(account); }
      catch {
        list.replaceChildren();
        add.disabled = true;
        status.textContent = translate("sip.storage_error", "SIP contacts are not available in this browser.");
        return;
      }
      add.disabled = entries.length >= limit;
      status.textContent = notice ? translate(...notice) : entries.length ? "" : translate("sip.empty", "No SIP contacts yet.");
      const editLabel = translate("sip.edit", "Edit");
      const removeLabel = translate("sip.remove", "Remove");
      list.replaceChildren(...entries.map(entry => {
        const row = document.createElement("li");
        const label = document.createElement("strong");
        label.textContent = entry.name;
        const target = document.createElement("span");
        target.textContent = entry.destination;
        const actions = document.createElement("div");
        actions.className = "sip-directory-actions";
        actions.append(action(entry, editLabel, () => openForm(entry)), action(entry, removeLabel, () => {
          if (!account) return;
          try {
            store.remove(account, entry.id);
            closeForm();
            notice = ["sip.removed", "SIP contact removed."];
          } catch { notice = ["sip.storage_error", "SIP contacts are not available in this browser."]; }
          refresh();
          add.focus();
        }));
        row.append(label, target, actions);
        return row;
      }));
    }

    xmpp.addEventListener("click", () => select("xmpp"));
    sip.addEventListener("click", () => select("sip"));
    add.addEventListener("click", () => openForm());
    byId("sipDirectoryCancel").addEventListener("click", () => { closeForm(); add.focus(); });
    byId("sipDirectoryDialer").addEventListener("click", () => byId("phoneDialerButton").click());
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!account || panel.hidden || form.hidden) return;
      try {
        store.save(account, editing || browser.crypto.randomUUID(), name.value, destination.value);
        closeForm();
        notice = ["sip.saved", "SIP contact saved."];
        refresh();
        add.focus();
      } catch (error) {
        notice = error.message === "invalidContact" ? ["sip.invalid", "Check the name and phone number or SIP address."]
          : ["sip.save_error", "Could not save the SIP contact."];
        refresh();
      }
    });
    return {
      setAccount(value) {
        const next = typeof value === "string" && value.length <= 96 && !control.test(value) ? value : "";
        if (next === account) return;
        account = next;
        sip.disabled = !account;
        select("xmpp");
      },
      refresh
    };
  }

  const api = { mount, createStore, normalizeDestination };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TeleTypTelSipContacts = api;
})(typeof window === "undefined" ? globalThis : window);
