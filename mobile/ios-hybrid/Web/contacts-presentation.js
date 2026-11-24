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
    const shell = byID("hybridConnected");
    const xmppDirectory = byID("hybridXmppDirectory");
    const sipDirectory = byID("hybridSipDirectory");
    const xmppButton = byID("hybridSelectXmpp");
    const sipButton = byID("hybridSelectSip");
    const sipList = byID("hybridSipContacts");
    const sipStatus = byID("hybridSipStatus");
    const sipAdd = byID("hybridSipAdd");
    const sipForm = byID("hybridSipForm");
    const sipName = byID("hybridSipName");
    const sipDestination = byID("hybridSipDestination");
    const sipCancel = byID("hybridSipCancel");
    let roster = { status: "hidden", contacts: [] };
    let selected = null;
    let selectedKind = "direct";
    let groups = [];
    let disposed = false;
    let latestState = null;
    let rosterSignature = "";
    let sipSignature = "";
    let editingSipID = "";
    let sipOperation = null;
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
      const entries = [...roster.contacts.map(contact => ({ ...contact, kind: "direct" })), ...groups.map(group => ({ jid: group.room, name: group.name, kind: "group", presence: group.joined ? "online" : "offline" }))];
      const contact = entries.find(value => value.jid === selected && value.kind === selectedKind);
      if (!contact) selected = null;
      document.body.classList.toggle("hybrid-contact-selected", selected !== null);
      back.hidden = selected === null;
      avatar.hidden = selected === null;
      avatar.textContent = contact ? initials(contact.name) : "";
      if (contact) document.defaultView.TeleTypTelHybridAvatar?.(avatar, contact.kind === "direct" ? contact.jid : null, initials(contact.name), latestState?.account);
      title.textContent = contact?.name || "Kies een contact";
      jid.textContent = contact?.jid || "";
      presence.textContent = contact ? (contact.kind === "group" ? "Groep" : presenceLabels[contact.presence]) : "";
      const query = normalized(search.value);
      const contacts = entries.filter(value => (value.jid === selected && value.kind === selectedKind || !latestState?.history.archived.some(item => item.peer === value.jid && item.kind === value.kind))
        && (!query || normalized(value.name + " " + value.jid).includes(query)));
      search.disabled = roster.status !== "ready";
      toggle.disabled = roster.status !== "ready";
      status.textContent = roster.status === "loading" ? "Contacten laden…" : roster.status === "unavailable" ? "Contacten zijn niet beschikbaar."
        : roster.status === "hidden" ? "" : roster.contacts.length === 0 ? "Nog geen contacten." : contacts.length === 0 ? "Geen contacten gevonden."
        : contacts.length + (contacts.length === 1 ? " contact" : " contacten");
      const rows = new Map(Array.from(list.children, row => [row.dataset.conversationKind + ":" + row.dataset.contactJid, row]));
      contacts.forEach((value, index) => {
        const key = value.kind + ":" + value.jid;
        let row = rows.get(key);
        if (!row) {
          row = document.createElement("button");
          row.type = "button";
          row.dataset.contactJid = value.jid;
          row.dataset.conversationKind = value.kind;
          row.addEventListener("click", () => {
            if (value.kind === "direct" && latestState?.account.blocked.includes(value.jid)) { document.defaultView.TeleTypTelHybridManageContact?.(value.jid); return; }
            selected = value.jid;
            selectedKind = value.kind;
            render();
            const epoch = latestState?.epoch;
            Promise.resolve(document.defaultView.TeleTypTelHybridChat?.flush()).then(() => client.openChat(value.jid, epoch, value.kind))
              .catch(() => { selected = null; render(); status.textContent = "Chat is niet beschikbaar. Probeer opnieuw."; });
          });
          row.oncontextmenu = event => { if (value.kind === "direct") { event.preventDefault(); document.defaultView.TeleTypTelHybridManageContact?.(value.jid); } };
        }
        rows.delete(key);
        row.className = "conversation-item" + (value.jid === selected ? " selected" : "");
        const blocked = value.kind === "direct" && latestState?.account.blocked.includes(value.jid);
        const statusLabel = value.kind === "group" ? "Groep" : blocked ? "Geblokkeerd" : presenceLabels[value.presence];
        row.setAttribute("aria-label", value.name + " · " + statusLabel);
        if (value.jid === selected) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
        const picture = document.createElement("span");
        picture.className = "avatar avatar-list";
        picture.setAttribute("aria-hidden", "true");
        picture.textContent = initials(value.name);
        document.defaultView.TeleTypTelHybridAvatar?.(picture, value.kind === "direct" ? value.jid : null, initials(value.name), latestState?.account);
        const text = document.createElement("span");
        text.className = "conversation-text";
        const name = document.createElement("strong");
        name.textContent = value.name;
        const label = document.createElement("span");
        label.textContent = statusLabel;
        text.append(name, label);
        const meta = document.createElement("span");
        meta.className = "conversation-row-meta";
        const dot = document.createElement("span");
        const dotStatus = value.kind === "group" ? "group" : blocked ? "blocked"
          : ["online", "away", "extendedAway", "busy"].includes(value.presence) ? "online" : "offline";
        dot.className = "presence-dot presence-" + dotStatus;
        dot.setAttribute("aria-hidden", "true");
        meta.append(dot);
        row.replaceChildren(picture, text, meta);
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
      });
      for (const row of rows.values()) row.remove();
    }

    const changeSearch = () => render();
    const showList = () => {
      const epoch = latestState?.epoch;
      Promise.resolve(document.defaultView.TeleTypTelHybridChat?.flush()).then(() => client.closeChat(epoch)).then(() => { selected = null; render(); })
        .catch(() => { status.textContent = "Teruggaan is niet gelukt. Probeer opnieuw."; });
    };
    const toggleActions = () => {
      actions.hidden = !actions.hidden;
      toggle.setAttribute("aria-expanded", String(!actions.hidden));
    };
    function selectDirectory(sipSelected) {
      shell.dataset.contactDirectory = sipSelected ? "sip" : "xmpp";
      xmppDirectory.hidden = sipSelected;
      sipDirectory.hidden = !sipSelected;
      xmppButton.setAttribute("aria-pressed", String(!sipSelected));
      sipButton.setAttribute("aria-pressed", String(sipSelected));
      if (sipSelected) {
        actions.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
    }
    const showXmpp = () => selectDirectory(false);
    const showSip = () => selectDirectory(true);
    xmppButton.addEventListener("click", showXmpp);
    sipButton.addEventListener("click", showSip);

    function showSipForm(contact) {
      editingSipID = contact?.id || "";
      sipName.value = contact?.name || "";
      sipDestination.value = contact?.destination || "";
      sipForm.hidden = false;
      sipAdd.setAttribute("aria-expanded", "true");
      sipName.focus();
    }

    function closeSipForm() {
      editingSipID = "";
      sipForm.reset();
      sipForm.hidden = true;
      sipAdd.setAttribute("aria-expanded", "false");
    }

    async function sipCommand(command, args) {
      const scope = latestState?.epoch;
      if (!scope || !latestState.account.sipContactsAvailable || sipOperation) return;
      const operation = {};
      sipOperation = operation;
      sipStatus.textContent = "";
      try {
        await client.accountCommand(command, args, scope);
        if (latestState?.epoch !== scope || sipOperation !== operation) return;
        closeSipForm();
        const hasContacts = latestState.account.sipContacts.length > 0;
        sipStatus.textContent = command === "account.sip.save" ? "SIP-contact opgeslagen." : hasContacts ? "SIP-contact verwijderd." : "Nog geen SIP-contacten.";
        sipAdd.focus();
      } catch {
        if (latestState?.epoch === scope && sipOperation === operation) sipStatus.textContent = "Niet gelukt. Controleer de naam en het telefoonnummer of SIP-adres.";
      } finally {
        if (sipOperation === operation) sipOperation = null;
      }
    }

    function renderSip(state) {
      const { sipContactsAvailable, sipContacts } = state.account;
      const signature = JSON.stringify([state.epoch, sipContactsAvailable, sipContacts]);
      if (signature === sipSignature) return;
      sipSignature = signature;
      if (!sipContactsAvailable) closeSipForm();
      sipAdd.disabled = !sipContactsAvailable || sipContacts.length >= 100;
      sipStatus.textContent = !sipContactsAvailable ? "SIP-contacten zijn nu niet beschikbaar."
        : sipContacts.length ? "" : "Nog geen SIP-contacten.";
      sipList.replaceChildren(...sipContacts.map(contact => {
        const row = document.createElement("li");
        const details = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = contact.name;
        const destination = document.createElement("span");
        destination.textContent = contact.destination;
        details.append(name, destination);
        const edit = document.createElement("button");
        edit.type = "button"; edit.textContent = "Bewerken";
        edit.setAttribute("aria-label", contact.name + " bewerken");
        edit.addEventListener("click", () => showSipForm(contact));
        const remove = document.createElement("button");
        remove.type = "button"; remove.textContent = "Verwijderen";
        remove.setAttribute("aria-label", contact.name + " verwijderen");
        remove.addEventListener("click", () => void sipCommand("account.sip.remove", { id: contact.id }));
        row.append(details, edit, remove);
        return row;
      }));
    }

    const addSip = () => showSipForm();
    const cancelSip = () => { closeSipForm(); sipAdd.focus(); };
    const saveSip = event => {
      event.preventDefault();
      void sipCommand("account.sip.save", {
        id: editingSipID, name: sipName.value.trim(), destination: sipDestination.value.trim()
      });
    };
    sipAdd.addEventListener("click", addSip);
    sipCancel.addEventListener("click", cancelSip);
    sipForm.addEventListener("submit", saveSip);
    search.addEventListener("input", changeSearch);
    back.addEventListener("click", showList);
    toggle.addEventListener("click", toggleActions);
    const unsubscribe = client.subscribe(state => {
      if (latestState?.epoch !== state.epoch || !state.account.sipContactsAvailable) {
        closeSipForm();
        sipOperation = null;
      }
      latestState = state;
      renderSip(state);
      const next = state.roster || { status: "hidden", contacts: [] };
      if (next.status === "hidden") {
        selectDirectory(false);
        search.value = "";
        selected = null;
        actions.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
      groups = state.groups;
      if (state.conversation) { selected = state.conversation.peer; selectedKind = state.conversation.kind; }
      else selected = null;
      roster = next;
      const signature = JSON.stringify([next, groups, state.groupsAvailable, state.conversation?.peer || null, state.conversation?.kind, state.account.avatars, state.account.blocked, state.history.archived]);
      if (signature === rosterSignature) return;
      rosterSignature = signature;
      render();
    });
    const dispose = () => {
      disposed = true;
      unsubscribe();
      xmppButton.removeEventListener("click", showXmpp);
      sipButton.removeEventListener("click", showSip);
      sipAdd.removeEventListener("click", addSip);
      sipCancel.removeEventListener("click", cancelSip);
      sipForm.removeEventListener("submit", saveSip);
      search.removeEventListener("input", changeSearch);
      back.removeEventListener("click", showList);
      toggle.removeEventListener("click", toggleActions);
      document.defaultView.removeEventListener("pagehide", dispose);
      list.replaceChildren();
      sipList.replaceChildren();
      closeSipForm();
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
