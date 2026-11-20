(function (root) {
  "use strict";

  function avatar(document, container, jid, fallback, account) {
    container.replaceChildren();
    const image = account?.avatars[jid];
    if (!image) { container.textContent = fallback; return; }
    const picture = document.createElement("img"); picture.src = image; picture.alt = "";
    picture.width = 48; picture.height = 48; container.append(picture);
  }

  function mount(document, client) {
    const byID = id => document.getElementById(id);
    let state;
    let recovery = false;
    let focus;
    let epoch;
    let profileDirty = false;
    let disposed = false;
    function close(id) {
      byID(id).hidden = true;
      if (id === "hybridEntry") { byID("hybridEntryPassword").value = ""; byID("hybridEntryRepeat").value = ""; }
      if (focus?.getClientRects().length) focus.focus({ preventScroll: true });
    }
    function open(id) {
      focus = document.activeElement;
      byID("hybridMainMenu").open = false;
      byID("hybridEntry").hidden = true; byID("hybridProfile").hidden = true; byID("hybridNewContact").hidden = true;
      byID(id).hidden = false;
      byID(id).querySelector("button[data-close-account]")?.focus({ preventScroll: true });
    }
    async function command(name, args = {}) {
      if (!state) return;
      const scope = state.epoch;
      try { await client.accountCommand(name, args, scope); }
      catch {
        if (state?.epoch !== scope) return;
        for (const id of ["hybridEntry", "hybridProfile", "hybridNewContact"]) if (!byID(id).hidden) byID(id + "Notice").textContent = "Niet bevestigd. Controleer gegevens en verbinding voordat je opnieuw probeert.";
      }
    }
    function entry(isRecovery) {
      recovery = isRecovery; byID("hybridEntryForm").reset();
      byID("hybridEntryTitle").textContent = recovery ? "Wachtwoord herstellen" : "Nieuwe gebruiker";
      byID("hybridRegistrationFields").hidden = recovery;
      byID("hybridEntrySubmit").textContent = recovery ? "Herstellink aanvragen" : "Account aanmaken";
      open("hybridEntry");
    }
    byID("dialogCreateAccountButton").onclick = () => entry(false);
    byID("dialogForgotPasswordButton").onclick = () => entry(true);
    byID("hybridEntryPrivacy").onclick = () => { void command("auth.privacy"); };
    byID("hybridEntryForm").onsubmit = event => {
      event.preventDefault();
      const jid = byID("hybridEntryJid").value.trim();
      if (recovery) { void command("auth.recover", { jid }); return; }
      const password = byID("hybridEntryPassword").value;
      if (password !== byID("hybridEntryRepeat").value || !byID("hybridEntryConsent").checked) { byID("hybridEntryNotice").textContent = "Controleer wachtwoorden en toestemming."; return; }
      byID("hybridEntryPassword").value = ""; byID("hybridEntryRepeat").value = "";
      void command("auth.register", { jid, name: byID("hybridEntryName").value.trim(), password, consent: true });
    };
    byID("addConversationButton").onclick = () => { byID("hybridNewContactForm").reset(); open("hybridNewContact"); };
    byID("hybridNewContactForm").onsubmit = event => { event.preventDefault(); void command("contacts.add", {
      jid: byID("hybridNewContactJid").value.trim(), name: byID("hybridNewContactName").value.trim(), presence: byID("hybridNewContactPresence").checked }); };
    byID("hybridOpenProfile").onclick = () => { profileDirty = false; renderProfile(); open("hybridProfile"); void command("account.refresh"); };
    byID("hybridMenuTranslation").onclick = () => { byID("hybridMainMenu").open = false; byID("hybridTranslationOptions").click(); };
    byID("hybridProfileReload").onclick = () => { profileDirty = false; void command("account.refresh"); };
    byID("hybridEditAvatar").onclick = () => { close("hybridProfile"); void command("account.avatar"); };
    byID("hybridProfileForm").oninput = () => { profileDirty = true; };
    byID("hybridProfileForm").onsubmit = event => {
      event.preventDefault(); void command("account.save", { name: byID("hybridProfileName").value.trim(), phone: byID("hybridProfilePhone").value,
        language: byID("hybridProfileLanguage").value, color: byID("hybridProfileColor").value });
    };
    for (const button of document.querySelectorAll("[data-close-account]")) button.onclick = () => close(button.dataset.closeAccount);
    function renderProfile() {
      const profile = state?.account.profile;
      byID("hybridProfileJid").textContent = profile?.jid || "Profiel ophalen…";
      if (profile && !profileDirty) {
        byID("hybridProfileName").value = profile.name; byID("hybridProfilePhone").value = profile.phone;
        byID("hybridProfileLanguage").value = profile.language; byID("hybridProfileColor").value = profile.color;
      }
    }
    const unsubscribe = client.subscribe(value => {
      if (disposed) return;
      if (epoch && epoch !== value.epoch) {
        for (const form of document.querySelectorAll(".hybrid-account-dialog form")) form.reset();
        for (const dialog of document.querySelectorAll(".hybrid-account-dialog")) dialog.hidden = true;
        byID("hybridProfileJid").textContent = ""; byID("hybridContactRequests").replaceChildren(); profileDirty = false; focus = null;
      }
      epoch = value.epoch; state = value;
      if (value.phase === "connected" || value.phase === "suspended" || !["idle", "failed"].includes(value.call.phase)) byID("hybridEntry").hidden = true;
      if (value.phase !== "connected" || !["idle", "failed"].includes(value.call.phase)) { byID("hybridProfile").hidden = true; byID("hybridNewContact").hidden = true; byID("hybridMainMenu").open = false; }
      byID("addConversationButton").disabled = !value.account.contactsAvailable;
      byID("addConversationButton").title = value.account.contactsAvailable ? "Nieuw contact" : "Geen actieve contactenverbinding";
      byID("addGroupButton").title = value.groupsAvailable ? "Groep openen of maken" : "Groepsfunctie niet beschikbaar";
      byID("hybridOpenProfile").disabled = !value.account.entryAvailable;
      byID("hybridEntrySubmit").disabled = value.account.busy || (!recovery && !value.account.registrationAvailable);
      byID("hybridProfileSave").disabled = value.account.busy || !value.account.profile;
      byID("hybridProfileReload").disabled = value.account.busy;
      byID("hybridNewContactSave").disabled = value.account.busy || !value.account.contactsAvailable;
      for (const id of ["hybridEntryNotice", "hybridProfileNotice", "hybridNewContactNotice"]) byID(id).textContent = value.account.notice || "";
      if (!byID("hybridProfile").hidden) renderProfile();
      const requests = byID("hybridContactRequests"); requests.replaceChildren();
      for (const jid of value.account.requests) {
        const row = document.createElement("div"); const label = document.createElement("span"); label.textContent = jid + " vraagt toestemming voor je online status."; row.append(label);
        for (const [allow, text] of [[true, "Toestaan"], [false, "Weigeren"]]) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.disabled = value.account.busy;
          button.onclick = () => { void command("contacts.respond", { jid, allow }); }; row.append(button);
        }
        requests.append(row);
      }
    });
    const keyboard = event => {
      const dialog = document.querySelector(".hybrid-account-dialog:not([hidden])");
      if (!dialog) return;
      if (event.key === "Escape") { event.preventDefault(); close(dialog.id); }
      if (event.key === "Tab") {
        const fields = Array.from(dialog.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")).filter(field => field.getClientRects().length);
        const index = fields.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); fields.at(-1)?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === fields.length - 1)) { event.preventDefault(); fields[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    document.defaultView.addEventListener("pagehide", () => { disposed = true; unsubscribe(); document.removeEventListener("keydown", keyboard); }, { once: true });
  }
  if (typeof module === "object" && module.exports) module.exports = { mount, avatar };
  else { root.TeleTypTelHybridAvatar = (container, jid, fallback, account) => avatar(root.document, container, jid, fallback, account); mount(root.document, root.TeleTypTelNativeSession); }
})(typeof window === "undefined" ? globalThis : window);
