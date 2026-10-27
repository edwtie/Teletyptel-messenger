const adminStaff = (() => {
  let context;
  let generation = 0;
  let dialogGeneration = 0;
  let members = [];
  let page = 1;
  let selection = null;
  let operation = "";
  let busy = false;
  let selectedIds = new Set();
  let visibleMembers = [];
  let detailsId = "";
  let batch = [];
  let batchOperation = "";
  const element = (identifier) => document.getElementById(identifier);
  const active = () => context.active() && context.page() === "staff";
  const live = (request) => active() && request === generation;
  const fieldIds = ["staffCreateName", "staffCreateEmail", "staffCreatePassword", "staffConfirmPassword"];
  const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#admin-icon-' + name + '"/></svg>';
  const batchLabels = { block: "Staffaccounts blokkeren", unblock: "Staffaccounts deblokkeren", grant: "Inzagerecht toekennen", revoke: "Inzagerecht intrekken" };
  const eligible = (member, action) => action === "block" ? Number(member.enabled) === 1
    : action === "unblock" ? Number(member.enabled) !== 1
    : Number(member.enabled) === 1 && Boolean(member.canReviewIntake) === (action === "revoke");

  function updateSelection() {
    const selected = visibleMembers.filter((member) => selectedIds.has(member.admin_id));
    element("staffBulkBar").hidden = selected.length === 0;
    element("staffSelectionCount").textContent = selected.length + " geselecteerd";
    element("selectAllStaff").checked = selected.length > 0 && selected.length === visibleMembers.length;
    element("selectAllStaff").indeterminate = selected.length > 0 && selected.length < visibleMembers.length;
    element("selectAllStaff").disabled = visibleMembers.length === 0;
    for (const [identifier, action] of [["staffBulkBlock", "block"], ["staffBulkUnblock", "unblock"], ["staffBulkGrant", "grant"], ["staffBulkRevoke", "revoke"]]) {
      element(identifier).hidden = !selected.some((member) => eligible(member, action));
    }
    element("staffRows").querySelectorAll("[data-staff-select]").forEach((checkbox) => {
      checkbox.checked = selectedIds.has(checkbox.dataset.staffSelect);
    });
  }

  function clearSelection() {
    selectedIds.clear();
    updateSelection();
  }

  function closeDetails() {
    detailsId = "";
    element("staffDetailsPanel").hidden = true;
    element("staffListPanel").hidden = false;
    element("staffDetailsFields").replaceChildren();
    element("staffDetailsTitle").textContent = "Medewerker beheren";
    for (const identifier of ["staffDetailStatus", "staffDetailAccess"]) {
      element(identifier).replaceChildren();
      element(identifier).disabled = true;
    }
  }

  function openDetails(identifier, focus = true) {
    const member = members.find((entry) => entry.admin_id === identifier);
    if (!active() || !member) return;
    clearSelection();
    detailsId = identifier;
    element("staffListPanel").hidden = true;
    element("staffDetailsPanel").hidden = false;
    element("staffDetailsTitle").textContent = "Medewerker beheren: " + (member.display_name || member.email);
    const enabled = Number(member.enabled) === 1;
    const allowed = enabled && member.canReviewIntake;
    const fields = [["Naam", member.display_name], ["E-mailadres", member.email], ["Rol", "Staff"],
      ["Accountstatus", enabled ? "Actief" : "Geblokkeerd"], ["Inzagerecht aanmeldingen", allowed ? "Toegekend" : "Geen inzage"], ["Account-ID", member.admin_id]];
    element("staffDetailsFields").innerHTML = fields.map(([label, value]) => "<div><dt>" + context.escape(label) + "</dt><dd>" + context.escape(value || "—") + "</dd></div>").join("");
    element("staffDetailStatus").innerHTML = icon(enabled ? "lock" : "unlock") + (enabled ? "Blokkeren" : "Deblokkeren");
    element("staffDetailStatus").disabled = false;
    element("staffDetailAccess").innerHTML = icon(allowed ? "eye-off" : "eye") + (allowed ? "Inzage intrekken" : "Inzage toekennen");
    element("staffDetailAccess").disabled = !enabled;
    if (focus) element("staffDetailsTitle").focus();
  }

  function closeDialog() {
    dialogGeneration++;
    busy = false;
    selection = null;
    operation = "";
    batch = [];
    batchOperation = "";
    if (element("staffActionDialog").open) element("staffActionDialog").close();
    for (const identifier of fieldIds) element(identifier).value = "";
    element("staffActionConfirm").checked = false;
    element("staffActionSummary").textContent = "";
    element("staffActionStatus").textContent = "";
    element("staffActionTargets").replaceChildren();
    element("staffActionTargets").hidden = true;
    element("saveStaffAction").disabled = false;
  }

  function clear() {
    generation++;
    closeDialog();
    members = [];
    visibleMembers = [];
    clearSelection();
    closeDetails();
    page = 1;
    for (const identifier of ["staffRows", "staffPageInfo", "staffCount", "staffStatus"]) element(identifier).replaceChildren();
    element("staffSearch").value = "";
    element("staffFilter").value = "";
    element("staffPrevious").disabled = true;
    element("staffNext").disabled = true;
  }

  function render() {
    if (!active()) return;
    const search = element("staffSearch").value.trim().toLocaleLowerCase("nl");
    const status = element("staffFilter").value;
    const filtered = members.filter((member) => ((member.display_name || "") + " " + member.email).toLocaleLowerCase("nl").includes(search)
      && (!status || (status === "active" ? Number(member.enabled) === 1 : Number(member.enabled) !== 1)));
    page = Math.max(1, Math.min(page, Math.max(1, Math.ceil(filtered.length / 25))));
    const visible = filtered.slice((page - 1) * 25, page * 25);
    visibleMembers = visible;
    clearSelection();
    const escape = context.escape;
    element("staffRows").innerHTML = visible.length ? visible.map((member) => {
      const enabled = Number(member.enabled) === 1;
      const allowed = enabled && member.canReviewIntake;
      return '<tr><td><input type="checkbox" data-staff-select="' + escape(member.admin_id) + '" aria-label="'
        + escape((member.display_name || member.email) + ' selecteren') + '"></td><td><div class="user-person"><span class="user-avatar">' + icon("users")
        + '</span><div class="user-person-text"><strong>' + escape(member.display_name || "—") + '</strong><div class="small">' + escape(member.email)
        + '</div></div></div></td><td><span class="user-status-badge ' + (enabled ? "active" : "blocked") + '">' + icon(enabled ? "check" : "lock")
        + (enabled ? "Actief" : "Geblokkeerd") + '</span></td><td><span class="user-status-badge ' + (allowed ? "active" : "") + '">'
        + icon(allowed ? "eye" : "eye-off") + (allowed ? "Toegekend" : "Geen inzage")
        + '</span></td><td><button type="button" class="secondary" data-staff-id="' + escape(member.admin_id)
        + '">Beheren' + icon("arrow") + '</button></td></tr>';
    }).join("") : '<tr><td colspan="5">' + (members.length ? "Geen staffaccounts gevonden met deze filters." :
      "Er zijn nog geen staffaccounts. Kies Staffaccount aanmaken om de eerste medewerker toe te voegen.") + '</td></tr>';
    const enabledCount = members.filter((member) => Number(member.enabled) === 1).length;
    element("staffCount").textContent = members.length + " staffaccounts · " + enabledCount + " actief · " + (members.length - enabledCount) + " geblokkeerd";
    context.paginate("staff", { page, pageSize: 25, total: filtered.length });
    element("staffRows").querySelectorAll("button[data-staff-id]").forEach((button) => {
      button.addEventListener("click", () => openDetails(button.dataset.staffId));
    });
    element("staffRows").querySelectorAll("[data-staff-select]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (!active()) return;
        if (checkbox.checked) selectedIds.add(checkbox.dataset.staffSelect);
        else selectedIds.delete(checkbox.dataset.staffSelect);
        updateSelection();
      });
    });
    if (detailsId) {
      if (members.some((member) => member.admin_id === detailsId)) openDetails(detailsId, false);
      else closeDetails();
    }
  }

  async function load() {
    if (!active()) return;
    closeDialog();
    const request = ++generation;
    members = [];
    visibleMembers = [];
    clearSelection();
    for (const identifier of ["staffDetailStatus", "staffDetailAccess"]) element(identifier).disabled = true;
    for (const identifier of ["staffRows", "staffCount", "staffPageInfo"]) element(identifier).replaceChildren();
    element("staffStatus").textContent = "Staffaccounts laden…";
    try {
      const data = await context.fetch("api.php?action=intake_members");
      if (!live(request)) return;
      members = data.team.filter((member) => member.role === "staff");
      render();
      element("staffStatus").textContent = "";
    } catch (error) {
      if (!live(request)) return;
      clear();
      element("staffStatus").textContent = error.message;
    }
  }

  function open(action, identifier = "") {
    if (!active() || !["create", "status", "access"].includes(action)) return;
    const member = action === "create" ? null : members.find((entry) => entry.admin_id === identifier);
    if (action !== "create" && !member) return;
    if (action === "access" && Number(member.enabled) !== 1) return;
    closeDialog();
    selection = member ? { ...member } : null;
    operation = action;
    const creating = action === "create";
    element("staffCreateFields").hidden = !creating;
    for (const identifier of ["staffCreateName", "staffCreateEmail", "staffCreatePassword"]) element(identifier).disabled = !creating;
    const title = creating ? "Staffaccount aanmaken" : action === "status"
      ? (Number(member.enabled) === 1 ? "Staffaccount blokkeren" : "Staffaccount deblokkeren")
      : (member.canReviewIntake ? "Inzagerecht intrekken" : "Inzagerecht toekennen");
    element("staffActionTitle").textContent = title;
    element("saveStaffAction").textContent = title;
    const consequence = creating ? "Het account krijgt uitsluitend de staffrol, zonder inzagerecht. Geef dat recht zo nodig apart."
      : action === "status" ? (Number(member.enabled) === 1
        ? "Inzage wordt ingetrokken en bestaande sessies worden ongeldig."
        : "De medewerker moet opnieuw inloggen. Inzagerecht wordt niet automatisch hersteld.")
      : "Dit wijzigt toegang tot aanmeldingen, BSN en medische documenten. Staff krijgt geen algemeen beheer.";
    element("staffActionSummary").textContent = (member ? (member.display_name || member.email) + " · " + member.email + ". " : "") + consequence;
    element("staffActionDialog").showModal();
  }

  async function save() {
    if (!active() || !operation || busy) return;
    if (!element("staffActionConfirm").checked) {
      element("staffActionStatus").textContent = "Bevestig eerst de getoonde actie.";
      return;
    }
    const reviewPassword = element("staffConfirmPassword").value;
    const staffPassword = element("staffCreatePassword").value;
    element("staffConfirmPassword").value = "";
    element("staffCreatePassword").value = "";
    if (!reviewPassword) {
      element("staffActionStatus").textContent = "Vul je eigen beheerwachtwoord in.";
      return;
    }
    const payload = operation === "batch" ? null : operation === "create"
      ? { action: "intake_staff", displayName: element("staffCreateName").value, email: element("staffCreateEmail").value, staffPassword }
      : operation === "status"
        ? { action: "intake_staff_status", adminId: selection.admin_id, enabled: Number(selection.enabled) !== 1,
          expectedEnabled: Number(selection.enabled) === 1, expectedVersion: Number(selection.session_version), confirmed: true }
        : { action: "intake_team", adminId: selection.admin_id, canReview: !selection.canReviewIntake,
          expected: Boolean(Number(selection.can_review_intake)), expectedVersion: Number(selection.session_version) };
    const request = generation;
    const dialog = dialogGeneration;
    busy = true;
    element("saveStaffAction").disabled = true;
    if (operation === "batch") {
      await saveBatch(reviewPassword, request, dialog);
      return;
    }
    try {
      await context.fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, reviewPassword }) });
      if (!live(request) || dialog !== dialogGeneration) return;
      closeDialog();
      await load();
      if (active()) context.message("Staffwijziging opgeslagen en gelogd.");
    } catch (error) {
      if (live(request) && dialog === dialogGeneration) element("staffActionStatus").textContent = error.message;
    } finally {
      if (live(request) && dialog === dialogGeneration) {
        busy = false;
        element("saveStaffAction").disabled = false;
      }
    }
  }

  function openBatch(action) {
    if (!active() || !batchLabels[action]) return;
    const targets = visibleMembers.filter((member) => selectedIds.has(member.admin_id) && eligible(member, action));
    if (!targets.length) return;
    closeDialog();
    batch = targets.map((member) => ({ ...member }));
    batchOperation = action;
    operation = "batch";
    element("staffCreateFields").hidden = true;
    for (const identifier of ["staffCreateName", "staffCreateEmail", "staffCreatePassword"]) element(identifier).disabled = true;
    element("staffActionTitle").textContent = batchLabels[action];
    element("saveStaffAction").textContent = batchLabels[action];
    const consequence = action === "block" ? "Inzagerechten en bestaande sessies worden ingetrokken."
      : action === "unblock" ? "Medewerkers moeten opnieuw inloggen; inzagerecht wordt apart toegekend."
      : "Dit wijzigt toegang tot aanmeldingen, BSN en medische documenten.";
    element("staffActionSummary").textContent = targets.length + " van " + selectedIds.size + " geselecteerde medewerkers worden gewijzigd. " + consequence;
    element("staffActionTargets").innerHTML = targets.map((member) => "<li>" + context.escape(member.display_name || member.email) + " · " + context.escape(member.email) + "</li>").join("");
    element("staffActionTargets").hidden = false;
    element("staffActionDialog").showModal();
  }

  async function saveBatch(reviewPassword, request, dialog) {
    const targets = batch.slice();
    const action = batchOperation;
    let saved = 0;
    try {
      for (const member of targets) {
        if (!live(request) || dialog !== dialogGeneration) return;
        const payload = action === "block" || action === "unblock"
          ? { action: "intake_staff_status", adminId: member.admin_id, enabled: action === "unblock",
            expectedEnabled: Number(member.enabled) === 1, expectedVersion: Number(member.session_version), confirmed: true }
          : { action: "intake_team", adminId: member.admin_id, canReview: action === "grant",
            expected: Boolean(Number(member.can_review_intake)), expectedVersion: Number(member.session_version) };
        element("staffActionStatus").textContent = "Wijzigen: " + (saved + 1) + " van " + targets.length + "…";
        await context.fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, reviewPassword }) });
        saved++;
      }
      if (!live(request) || dialog !== dialogGeneration) return;
      closeDialog();
      await load();
      if (active()) context.message(saved + " staffaccounts bijgewerkt en gelogd.");
    } catch (error) {
      if (!live(request) || dialog !== dialogGeneration) return;
      if (saved) {
        closeDialog();
        await load();
        if (active()) context.message(saved + " van " + targets.length + " staffaccounts gewijzigd. Verwerking gestopt: " + error.message + " Controleer de lijst en selecteer opnieuw.", true);
      } else element("staffActionStatus").textContent = error.message;
    } finally {
      if (live(request) && dialog === dialogGeneration) {
        busy = false;
        element("saveStaffAction").disabled = false;
      }
    }
  }

  function init(options) {
    context = options;
    element("selectAllStaff").addEventListener("change", () => {
      if (!active()) return;
      selectedIds = element("selectAllStaff").checked ? new Set(visibleMembers.map((member) => member.admin_id)) : new Set();
      updateSelection();
    });
    element("staffBulkClear").addEventListener("click", () => { clearSelection(); element("selectAllStaff").focus(); });
    for (const [identifier, action] of [["staffBulkBlock", "block"], ["staffBulkUnblock", "unblock"], ["staffBulkGrant", "grant"], ["staffBulkRevoke", "revoke"]]) {
      element(identifier).addEventListener("click", () => openBatch(action));
    }
    element("closeStaffDetails").addEventListener("click", () => { closeDetails(); element("staffTitle").focus(); });
    element("staffDetailStatus").addEventListener("click", () => open("status", detailsId));
    element("staffDetailAccess").addEventListener("click", () => open("access", detailsId));
    element("newStaffButton").addEventListener("click", () => open("create"));
    element("staffFilterForm").addEventListener("submit", (event) => { event.preventDefault(); page = 1; render(); });
    element("staffFilter").addEventListener("change", () => { page = 1; render(); });
    element("staffPrevious").addEventListener("click", () => { page--; render(); });
    element("staffNext").addEventListener("click", () => { page++; render(); });
    element("closeStaffAction").addEventListener("click", closeDialog);
    element("staffActionDialog").addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
    element("staffActionForm").addEventListener("submit", (event) => { event.preventDefault(); save(); });
  }

  return { init, load, clear, open, openDetails };
})();
