(function (root) {
  "use strict";

  function caption(document, container, text) {
    container.replaceChildren();
    if (!text) return;
    const info = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = "Vertaling";
    const explanation = document.createElement("p"); explanation.textContent = "Machinevertaling kan fouten bevatten. Alleen op jouw scherm; het origineel blijft behouden.";
    info.append(summary, explanation);
    const translated = document.createElement("div"); translated.textContent = text;
    container.append(info, translated);
  }

  function mount(document, client) {
    const byID = name => document.getElementById(name);
    let state;
    let groupTicket;
    let disposed = false;
    let returnFocus;
    let configurationToken;
    const configurationFields = { name: "Name", description: "Description", membersOnly: "MembersOnly", moderated: "Moderated", publicRoom: "PublicRoom", persistent: "Persistent", allowInvites: "AllowInvites" };
    function close(name) {
      byID(name).hidden = true;
      byID("hybridMessages").dispatchEvent(new document.defaultView.Event("scroll"));
      if (returnFocus?.tagName === "BUTTON" && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    }
    function open(name) {
      if (state?.call.phase !== "idle" && state?.call.phase !== "failed") return;
      byID("hybridStartMenu").open = false;
      returnFocus = document.activeElement;
      byID(name).hidden = false;
      byID(name).querySelector("button[data-close-feature]")?.focus({ preventScroll: true });
    }
    function options(select, values) {
      const old = select.value;
      select.replaceChildren();
      for (const [value, label] of values) { const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option); }
      if (values.some(value => value[0] === old)) select.value = old;
    }
    function settings() {
      const value = state.extras;
      byID("hybridTranslationMode").value = value.mode; byID("hybridTranslationLanguage").value = value.language;
      byID("hybridTranslationConsent").checked = value.consent;
      byID("hybridTranslationLive").checked = value.liveConsent; byID("hybridTranslationOwnLive").checked = value.ownLiveConsent;
      open("hybridTranslationSettings");
    }
    function renderGroup(group, value) {
      const admin = value.groupAdministration;
      byID("hybridGroupOwner").hidden = !admin?.canConfigure;
      byID("hybridGroupMembers").hidden = !admin?.canManageMembers;
      byID("hybridGroupLoadConfiguration").disabled = !admin?.canConfigure || admin.busy;
      byID("hybridGroupLoadMembers").disabled = !admin?.canManageMembers || admin.busy;
      const form = admin?.configuration;
      byID("hybridGroupConfiguration").hidden = !form;
      if (configurationToken !== form?.token) {
        configurationToken = form?.token;
        byID("hybridGroupConfigurationConfirm").checked = false;
        for (const [key, suffix] of Object.entries(configurationFields)) {
          const field = byID("hybridGroup" + suffix);
          if (field.type === "checkbox") field.checked = form?.[key] === true; else field.value = form?.[key] || "";
          field.disabled = !form?.editableFields.includes(key);
        }
      }
      byID("hybridGroupSaveConfiguration").disabled = !form || admin.busy;
      const members = new Map(value.roster.contacts.filter(contact => contact.jid !== value.account.owner).map(contact => [contact.jid, contact.name]));
      for (const peer of admin?.members || []) if (peer !== value.account.owner) members.set(peer, peer);
      options(byID("hybridGroupMemberTarget"), [...members]);
      byID("hybridGroupMemberCount").textContent = admin?.affiliation ? (admin.busy ? "Lijst laden…" : admin.members.length + " accounts in opgehaalde lijst.") : "";
      byID("hybridGroupAffiliation").querySelector('[value="admin"]').disabled = !admin?.canConfigure;
      if (!admin?.canConfigure && byID("hybridGroupAffiliation").value === "admin") byID("hybridGroupAffiliation").value = "member";
      byID("hybridGroupSaveAffiliation").disabled = !admin?.canManageMembers || admin.busy || !members.size;
      options(byID("hybridGroupOccupant"), group.participants.map(name => [name, name]));
      byID("hybridGroupModeration").hidden = !group.canModerate;
      byID("hybridGroupSubjectSave").disabled = !group.canSpeak;
      byID("hybridGroupInvite").disabled = !group.canSpeak;
      byID("hybridGroupManageNotice").textContent = value.groupNotice || (group.joining ? "Deelnemen…" : !group.joined ? "Niet verbonden met deze groep." : "De groepsserver bepaalt je rechten.");
    }
    async function groupAction(action, extra = {}) {
      if (!groupTicket || groupTicket.epoch !== state.epoch || groupTicket.room !== state.conversation?.peer || state.conversation.kind !== "group") return;
      try { await client.groupAction(action, { room: groupTicket.room, ...extra }); }
      catch { byID("hybridGroupManageNotice").textContent = "Niet uitgevoerd. Controleer je groepsrechten en verbinding."; }
    }
    const unsubscribe = client.subscribe(value => {
      if (disposed) return;
      if (state && state.epoch !== value.epoch) {
        configurationToken = undefined;
        groupTicket = undefined; returnFocus = undefined;
        byID("hybridGroupJoinForm").reset(); byID("hybridTranslationForm").reset();
        byID("hybridGroupSubject").value = "";
        options(byID("hybridGroupOccupant"), []); options(byID("hybridGroupInviteTarget"), []);
      }
      if (state && (state.epoch !== value.epoch || value.phase !== "connected" || !["idle", "failed"].includes(value.call.phase))) {
        for (const dialog of document.querySelectorAll(".hybrid-feature-dialog")) dialog.hidden = true;
      }
      state = value;
      const group = value.groups.find(group => group.room === value.conversation?.peer && value.conversation?.kind === "group");
      byID("addGroupButton").disabled = !value.groupsAvailable;
      byID("hybridManageGroup").hidden = !group;
      byID("hybridTranslationSave").disabled = !value.extras.ready || value.extras.busy;
      byID("hybridTranslationNotice").textContent = value.extras.notice || (!value.extras.ready ? "Vertaalinstellingen nog niet beschikbaar." : !value.extras.available ? "Geen vertaaldienst ingesteld." : "");
      byID("hybridPickAttachment").disabled = !value.extras.attachmentAvailable || !value.conversation?.canSend;
      if (!byID("hybridGroupManage").hidden) {
        if (!group || groupTicket?.room !== group.room || groupTicket.epoch !== value.epoch) close("hybridGroupManage");
        else renderGroup(group, value);
      }
    });
    byID("addGroupButton").onclick = () => { byID("hybridGroupJoinNotice").textContent = ""; open("hybridGroupJoin"); };
    byID("hybridGroupJoinForm").onsubmit = async event => {
      event.preventDefault();
      const epoch = state?.epoch;
      try {
        await document.defaultView.TeleTypTelHybridChat?.flush();
        if (epoch !== state?.epoch) return;
        await client.joinGroup(byID("hybridGroupRoom").value.trim(), byID("hybridGroupNickname").value.trim(), byID("hybridGroupCreate").checked);
        close("hybridGroupJoin");
      } catch { byID("hybridGroupJoinNotice").textContent = "Groep niet geopend. Controleer adres, bijnaam en verbinding."; }
    };
    byID("hybridManageGroup").onclick = () => {
      const group = state.groups.find(group => group.room === state.conversation?.peer && state.conversation?.kind === "group");
      if (!group) return;
      groupTicket = { room: group.room, epoch: state.epoch };
      byID("hybridGroupConfigurationConfirm").checked = false;
      byID("hybridGroupAffiliationConfirm").checked = false;
      byID("hybridGroupSubject").value = group.subject;
      options(byID("hybridGroupInviteTarget"), state.roster.contacts.map(contact => [contact.jid, contact.name]));
      renderGroup(group, state);
      open("hybridGroupManage");
    };
    byID("hybridGroupSubjectSave").onclick = () => { void groupAction("subject", { subject: byID("hybridGroupSubject").value }); };
    byID("hybridGroupInvite").onclick = () => { void groupAction("invite", { peer: byID("hybridGroupInviteTarget").value }); };
    byID("hybridGroupRoleSave").onclick = () => { void groupAction("role", { nickname: byID("hybridGroupOccupant").value, role: byID("hybridGroupRole").value }); };
    byID("hybridGroupLeave").onclick = () => { void groupAction("leave"); };
    byID("hybridGroupLoadConfiguration").onclick = () => { configurationToken = undefined; void groupAction("configuration"); };
    byID("hybridGroupSaveConfiguration").onclick = () => {
      if (!configurationToken || !byID("hybridGroupConfigurationConfirm").checked) { byID("hybridGroupManageNotice").textContent = "Bevestig eerst de wijzigingen."; return; }
      const values = Object.fromEntries(Object.entries(configurationFields).map(([key, suffix]) => {
        const field = byID("hybridGroup" + suffix); return [key, field.type === "checkbox" ? String(field.checked) : field.value];
      }));
      void groupAction("configure", { token: configurationToken, ...values, confirmed: "true" });
    };
    byID("hybridGroupLoadMembers").onclick = () => { byID("hybridGroupAffiliationConfirm").checked = false; void groupAction("members", { affiliation: byID("hybridGroupAffiliationList").value }); };
    for (const id of ["hybridGroupMemberTarget", "hybridGroupAffiliation"]) byID(id).onchange = () => { byID("hybridGroupAffiliationConfirm").checked = false; };
    byID("hybridGroupSaveAffiliation").onclick = () => {
      if (!byID("hybridGroupAffiliationConfirm").checked) { byID("hybridGroupManageNotice").textContent = "Bevestig eerst de bevoegdheidswijziging."; return; }
      byID("hybridGroupAffiliationConfirm").checked = false;
      void groupAction("affiliation", { peer: byID("hybridGroupMemberTarget").value, affiliation: byID("hybridGroupAffiliation").value, confirmed: "true" });
    };
    byID("hybridTranslationOptions").onclick = settings;
    byID("hybridTranslationForm").onsubmit = async event => {
      event.preventDefault();
      try {
        await client.translationSettings({ mode: byID("hybridTranslationMode").value, language: byID("hybridTranslationLanguage").value,
          consent: byID("hybridTranslationConsent").checked, liveConsent: byID("hybridTranslationLive").checked, ownLiveConsent: byID("hybridTranslationOwnLive").checked });
      } catch { byID("hybridTranslationNotice").textContent = "Niet opgeslagen. Controleer toestemming en verbinding."; }
    };
    for (const id of ["hybridTranslationConsent", "hybridTranslationMode"]) byID(id).onchange = () => {
      if (!byID("hybridTranslationConsent").checked || byID("hybridTranslationMode").value === "off") void client.disableTranslation().catch(() => {});
    };
    byID("hybridPickAttachment").onclick = async () => {
      const epoch = state?.epoch;
      try { await document.defaultView.TeleTypTelHybridChat?.flush(); await client.pickAttachment(epoch); }
      catch { byID("hybridChatNotice").textContent = "Bijlage niet geopend. Je concept blijft behouden."; }
    };
    for (const button of document.querySelectorAll("[data-close-feature]")) button.onclick = () => close(button.dataset.closeFeature);
    const keyboard = event => {
      const dialog = document.querySelector(".hybrid-feature-dialog:not([hidden])");
      if (!dialog) return;
      if (event.key === "Escape") { event.preventDefault(); close(dialog.id); }
      if (event.key === "Tab") {
        const fields = Array.from(dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")).filter(value => value.getClientRects().length);
        const index = fields.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); fields.at(-1)?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === fields.length - 1)) { event.preventDefault(); fields[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    document.defaultView.addEventListener("pagehide", () => { disposed = true; unsubscribe(); document.removeEventListener("keydown", keyboard); }, { once: true });
  }
  if (typeof module === "object" && module.exports) module.exports = { mount, caption };
  else { root.TeleTypTelHybridCaption = (container, text) => caption(root.document, container, text); mount(root.document, root.TeleTypTelNativeSession); }
})(typeof window === "undefined" ? globalThis : window);
