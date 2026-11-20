(function (root) {
  "use strict";

  const presenceLabels = Object.freeze({ unknown: "Status onbekend", offline: "Offline", online: "Online", away: "Afwezig", extendedAway: "Langdurig afwezig", busy: "Niet storen" });

  function initials(value) {
    const parts = String(value || "TX").replace(/@.*/, "").split(/[\s._-]+/u).filter(Boolean);
    return (parts.length > 1 ? parts.slice(0, 2).map(part => Array.from(part)[0]).join("") : Array.from(parts[0] || "TX").slice(0, 2).join("")).toUpperCase();
  }

  function normalized(value) {
    return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("nl").trim();
  }

  function mount(document, client) {
    if (!client) throw new Error("nativeUnavailable");
    const byID = name => {
      const element = document.getElementById(name);
      if (!element) throw new Error("invalidPresentation");
      return element;
    };
    const list = byID("conversationItems");
    const search = byID("conversationSearchInput");
    const status = byID("hybridRosterStatus");
    const title = byID("hybridContactTitle");
    const jid = byID("hybridContactJid");
    const presence = byID("hybridContactPresence");
    const avatar = byID("hybridContactAvatar");
    const back = byID("hybridContactsBack");
    const actions = byID("conversationActionsPanel");
    const toggle = byID("conversationActionsToggle");
    let roster = { status: "hidden", contacts: [] };
    let selected = null;
    let disposed = false;
    document.querySelector("#conversationSidebar .section-heading > span").textContent = "Contacten";
    const searchIcon = document.querySelector(".conversation-search .material-icon");
    searchIcon.replaceChildren();
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
    outline.setAttribute("d", "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0");
    icon.append(outline);
    searchIcon.append(icon);
    for (const name of ["addConversationButton", "addGroupButton"]) {
      const button = byID(name);
      button.disabled = true;
      button.title = "Nog niet aangesloten in deze hybride testversie";
    }
    search.setAttribute("autocapitalize", "none");

    function render() {
      if (disposed) return;
      const contact = roster.contacts.find(value => value.jid === selected);
      if (!contact) selected = null;
      document.body.classList.toggle("hybrid-contact-selected", selected !== null);
      back.hidden = selected === null;
      avatar.hidden = selected === null;
      avatar.textContent = contact ? initials(contact.name) : "";
      title.textContent = contact?.name || "Kies een contact";
      jid.textContent = contact?.jid || "";
      presence.textContent = contact ? presenceLabels[contact.presence] : "";
      const query = normalized(search.value);
      const contacts = roster.contacts.filter(value => !query || normalized(value.name + " " + value.jid).includes(query));
      search.disabled = roster.status !== "ready";
      toggle.disabled = roster.status !== "ready";
      status.textContent = roster.status === "loading" ? "Contacten laden…" : roster.status === "unavailable" ? "Contacten zijn niet beschikbaar."
        : roster.status === "hidden" ? "" : roster.contacts.length === 0 ? "Nog geen contacten." : contacts.length === 0 ? "Geen contacten gevonden."
        : contacts.length + (contacts.length === 1 ? " contact" : " contacten");
      const rows = new Map(Array.from(list.children, row => [row.dataset.contactJid, row]));
      contacts.forEach((value, index) => {
        let row = rows.get(value.jid);
        if (!row) {
          row = document.createElement("button");
          row.type = "button";
          row.dataset.contactJid = value.jid;
          row.addEventListener("click", () => { selected = value.jid; render(); });
        }
        rows.delete(value.jid);
        row.className = "conversation-item" + (value.jid === selected ? " selected" : "");
        row.setAttribute("aria-label", value.name + " · " + presenceLabels[value.presence]);
        if (value.jid === selected) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
        const picture = document.createElement("span");
        picture.className = "avatar avatar-list";
        picture.setAttribute("aria-hidden", "true");
        picture.textContent = initials(value.name);
        const text = document.createElement("span");
        text.className = "conversation-text";
        const name = document.createElement("strong");
        name.textContent = value.name;
        const label = document.createElement("span");
        label.textContent = presenceLabels[value.presence];
        text.append(name, label);
        const meta = document.createElement("span");
        meta.className = "conversation-row-meta";
        const dot = document.createElement("span");
        dot.className = "presence-dot presence-" + value.presence;
        dot.setAttribute("aria-hidden", "true");
        meta.append(dot);
        row.replaceChildren(picture, text, meta);
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
      });
      for (const row of rows.values()) row.remove();
    }

    const changeSearch = () => render();
    const showList = () => { selected = null; render(); };
    const toggleActions = () => {
      actions.hidden = !actions.hidden;
      toggle.setAttribute("aria-expanded", String(!actions.hidden));
    };
    search.addEventListener("input", changeSearch);
    back.addEventListener("click", showList);
    toggle.addEventListener("click", toggleActions);
    const unsubscribe = client.subscribe(state => {
      const next = state.roster || { status: "hidden", contacts: [] };
      if (next.status === "hidden") {
        search.value = "";
        selected = null;
        actions.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
      roster = next;
      render();
    });
    const dispose = () => {
      disposed = true;
      unsubscribe();
      search.removeEventListener("input", changeSearch);
      back.removeEventListener("click", showList);
      toggle.removeEventListener("click", toggleActions);
      document.defaultView.removeEventListener("pagehide", dispose);
      list.replaceChildren();
      search.value = "";
      title.textContent = "";
      jid.textContent = "";
      presence.textContent = "";
      avatar.textContent = "";
      roster = { status: "hidden", contacts: [] };
      selected = null;
    };
    document.defaultView.addEventListener("pagehide", dispose, { once: true });
    render();
    return { dispose };
  }

  if (typeof module === "object" && module.exports) module.exports = { mount, initials, normalized };
  else mount(root.document, root.TeleTypTelNativeSession);
})(typeof window === "undefined" ? globalThis : window);
