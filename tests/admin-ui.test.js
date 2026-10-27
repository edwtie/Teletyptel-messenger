const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../php/public/admin/index.php"), "utf8")
  .replace("<?php require __DIR__ . '/user-bulk-panel.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/user-bulk-panel.php"), "utf8"))
  .replace("<?php require __DIR__ . '/user-bulk-dialog.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/user-bulk-dialog.php"), "utf8"))
  .replace("<?php require __DIR__ . '/user-details.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/user-details.php"), "utf8"))
  .replace("<?php require __DIR__ . '/staff-panel.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/staff-panel.php"), "utf8"))
  .replace("<?php require __DIR__ . '/staff-dialog.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/staff-dialog.php"), "utf8"))
  .replace("<?php require __DIR__ . '/management-panels.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/management-panels.php"), "utf8"))
  .replace("<?php require __DIR__ . '/management-dialogs.php'; ?>", fs.readFileSync(path.join(__dirname, "../php/public/admin/management-dialogs.php"), "utf8"));
const script = fs.readFileSync(path.join(__dirname, "../php/public/admin/management.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(__dirname, "../php/public/admin/staff.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(__dirname, "../php/public/admin/user-bulk.js"), "utf8") + "\n" + source.match(/<script>([\s\S]*?)<\/script>/)[1];
const identifiers = Array.from(source.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
assert.equal(new Set(identifiers).size, identifiers.length, "HTML IDs must be unique");
const admin = { adminId: "fixture-admin", email: "admin@example.test", displayName: "Test admin", role: "owner" };
const staffTeam = [
  { admin_id: "staff-one", role: "staff", display_name: '<img src=x onerror="test">', email: "one@example.test", enabled: 1, canReviewIntake: true, can_review_intake: 1, session_version: 1 },
  { admin_id: "staff-two", role: "staff", display_name: "Blocked fixture", email: "two@example.test", enabled: 0, canReviewIntake: false, can_review_intake: 0, session_version: 2 },
  { admin_id: "staff-three", role: "staff", display_name: "No access fixture", email: "three@example.test", enabled: 1, canReviewIntake: false, can_review_intake: 0, session_version: 1 },
  { admin_id: "owner", role: "owner", display_name: "Not a staff account", email: "owner@example.test", enabled: 1, canReviewIntake: true, can_review_intake: 0, session_version: 1 },
];
const account = {
  account_id: "alice", display_name: '<script>alert("test")</script>', jid: "alice@example.test",
  email: "alice.mail@example.test", provider_id: "google", identities: [], subscription_plan: "free", subscription_expires_at: null,
  account_status: "active", admin_note: "Fixture note",
};
const dashboard = { ok: true, admin, stats: { accounts: 1 }, server: { runtime: {
  apache: { active: true, version: "test-apache" }, mysql: { active: true, version: "test-mysql" },
  php: { active: true, version: "test-php" },
} } };
const logData = { ok: true, logs: [{ source: "admin", subject: "fixture-admin",
  detail: "<img src=x onerror=alert(1)>", created_at: "2026-01-01 12:00:00" }] };
const users = { ok: true, users: { items: [account], total: 1, page: 1, pageSize: 25 } };
const plans = [
  { plan_id: "free", name: "Gratis", description: "", price_cents: 0, billing_period: "none", enabled: 1, version: 1, account_count: 1 },
  { plan_id: "plus", name: "<img src=x onerror=alert(1)>", description: "<script>test</script>", price_cents: 1250, billing_period: "month", enabled: 1, version: 2, account_count: 0 },
  { plan_id: "retired", name: "Oud plan", description: "", price_cents: null, billing_period: "year", enabled: 0, version: 1, account_count: 0 },
];
const planHistory = { items: [{ account_id: "alice", display_name: "<img>", from_plan: "free", to_plan: "plus",
  from_plan_name: "Gratis", to_plan_name: "<img>", from_expires_at: null, to_expires_at: null,
  note: "<script>note</script>", actor_id: "fixture-admin", created_at: "2026-01-01 12:00:00" }],
  page: 1, pageSize: 25, total: 1 };
const planData = { ok: true, plans, history: planHistory, intake: {
  plans: plans.map((plan) => ({ plan_id: plan.plan_id, published: 0, requires_documents: plan.plan_id === "plus" ? 1 : 0,
    requires_bsn: plan.plan_id === "plus" ? 1 : 0, rule_version: plan.plan_id === "plus" ? 3 : 0 })),
  readiness: { medicalReady: false, bsnReady: false },
} };
const invoiceFixture = { id: "a".repeat(32), request_key: "fixture-invoice-request", account_id: "alice", recipient_type: "insurer",
  customer_name: "<img> insurer", customer_address: "Test address", customer_email: "", description: "<script> subscription",
  status: "draft", version: 1, quantity: 1, unit_cents: 1250, vat_basis_points: 2100, subtotal_cents: 1250,
  vat_cents: 263, total_cents: 1513, service_on: "2026-09-20", due_on: "2026-10-04" };
const billingData = { ok: true, invoices: { items: [invoiceFixture], page: 1, pageSize: 25, total: 1 },
  recurring: [], defaults: {}, worker: null };
const settingsData = { ok: true, settings: { revision: "fixture-revision", general: {}, billing: {},
  mysql: { host: "localhost", port: 3307, database: "fixture", username: "fixture", passwordConfigured: true },
  xmpp_mysql: { host: "localhost", port: 3307, database: "xmpp-fixture", username: "xmpp", passwordConfigured: true, environmentManaged: true } } };
const activity = { items: [{ happened_at: "2026-01-01 12:00:00", conversation_peer: "bob@example.test",
  conversation_kind: "contact", event_type: "message", direction: "self", status: "sent", text: "PRIVATE_MESSAGE" }],
  conversations: [], sources: ["message_history"], conversationsTruncated: false, total: 1, page: 1, pageSize: 50 };

function harness(session, hash = "") {
  const elements = new Map(identifiers.map((identifier) => [identifier, {
    value: "", textContent: "", innerHTML: "", hidden: true, disabled: false, open: false, checked: false, indeterminate: false,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
    listeners: {},
    addEventListener(name, listener) { this.listeners[name] = listener; },
    querySelectorAll() { return []; },
    replaceChildren() { this.innerHTML = ""; this.textContent = ""; },
    reset() {},
    close() { this.open = false; },
    showModal() { this.open = true; },
  }]));
  const requests = [];
  const listeners = {};
  const location = { hash, replace(url) { this.redirect = url; } };
  const state = {
    handler: async (url) => url.includes("action=session")
      ? { ok: true, csrfToken: "fixture-csrf", ...session }
      : url.includes("action=intake_members") ? { ok: true, team: staffTeam }
      : url.includes("action=settings") ? settingsData
      : url.includes("action=billing_account") ? { ok: true, account, plans, recurring: null, defaults: {} }
      : url.includes("action=billing") ? billingData : url.includes("action=invoice") ? { ok: true, invoice: invoiceFixture }
      : url.includes("action=user&") ? { ok: true, account, activity }
      : url.includes("action=users") ? users : url.includes("action=logs") ? logData
      : url.includes("action=plans") ? planData : url.includes("action=subscription") ? { ...planData, account } : dashboard,
  };
  const context = vm.createContext({
    document: { getElementById(identifier) {
      assert.ok(elements.has(identifier), "Unknown element " + identifier);
      return elements.get(identifier);
    } },
    window: { location, addEventListener(name, listener) { listeners[name] = listener; } },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    URLSearchParams, crypto: require("node:crypto").webcrypto, setTimeout() { return 1; }, clearTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      const data = await state.handler(url, options);
      return { ok: !data.failureStatus, status: data.failureStatus || 200, json: async () => data };
    },
  });
  vm.runInContext(script, context);
  return { elements, requests, state, run: (code) => vm.runInContext(code, context),
    navigate(hash) { location.hash = hash; listeners.hashchange(); } };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const guest = harness({ admin: null, setupRequired: true, localSetupAllowed: false });
  await settle();
  assert.equal(guest.elements.get("adminWorkspace").hidden, true);
  assert.equal(guest.elements.get("setupPanel").hidden, false);
  assert.equal(guest.elements.get("setupForm").hidden, true);
  assert.equal(guest.elements.get("setupLocalLink").hidden, false);
  assert.equal(guest.requests.length, 1, "No private request before authentication");
  const local = harness({ admin: null, setupRequired: true, localSetupAllowed: true });
  await settle();
  assert.equal(local.elements.get("setupForm").hidden, false);
  const staff = harness({ admin: { ...admin, role: "staff" }, setupRequired: false });
  await settle();
  assert.equal(staff.run("window.location.redirect"), "aanmeldingen.php");
  assert.equal(staff.elements.get("adminWorkspace").hidden, true);
  assert.equal(staff.requests.length, 1, "Staff must not request the general dashboard");
  const staffGuest = harness({ admin: null }, "#staff");
  await settle();
  assert.equal(staffGuest.requests.length, 1, "No staff list for guests");
  const staffList = harness({ admin: { ...admin, role: "admin" } }, "#staff");
  await settle();
  assert.equal(staffList.elements.get("staffView").hidden, false);
  assert.equal(staffList.elements.get("homeView").hidden, true);
  assert.equal(staffList.elements.get("usersView").hidden, true);
  assert.equal(staffList.elements.get("staffNavLink").attributes["aria-current"], "page");
  assert.match(staffList.run("document.title"), /Staffbeheer/);
  assert.equal(staffList.requests.length, 2, "Dedicated staff page only requests session and team");
  assert.match(staffList.requests[1].url, /action=intake_members/);
  assert.match(staffList.elements.get("staffRows").innerHTML, /one@example.test/);
  assert.equal((staffList.elements.get("staffRows").innerHTML.match(/<button\b/g) || []).length, 3, "One manage button per staff member");
  assert.match(staffList.elements.get("staffRows").innerHTML, /Beheren/);
  assert.match(staffList.elements.get("staffRows").innerHTML, /data-staff-select/);
  assert.match(staffList.elements.get("staffRows").innerHTML, /Toegekend/);
  assert.match(staffList.elements.get("staffRows").innerHTML, /&lt;img/);
  assert.doesNotMatch(staffList.elements.get("staffRows").innerHTML, /<img|owner@example.test/, "Escaped text and no admin accounts in staff list");
  assert.equal(staffList.elements.get("staffCount").textContent, "3 staffaccounts · 2 actief · 1 geblokkeerd");
  staffList.run('adminStaff.openDetails("staff-one")');
  assert.equal(staffList.elements.get("staffDetailsPanel").hidden, false);
  assert.equal(staffList.elements.get("staffListPanel").hidden, true);
  assert.match(staffList.elements.get("staffDetailsFields").innerHTML, /&lt;img/);
  assert.match(staffList.elements.get("staffDetailStatus").innerHTML, /Blokkeren/);
  assert.match(staffList.elements.get("staffDetailAccess").innerHTML, /Inzage intrekken/);
  staffList.elements.get("closeStaffDetails").listeners.click();
  assert.equal(staffList.elements.get("staffDetailsPanel").hidden, true);
  assert.equal(staffList.elements.get("staffListPanel").hidden, false);
  staffList.run('adminStaff.openDetails("staff-two")');
  assert.equal(staffList.elements.get("staffDetailAccess").disabled, true);
  staffList.elements.get("closeStaffDetails").listeners.click();
  staffList.elements.get("staffFilter").value = "blocked";
  staffList.elements.get("staffFilter").listeners.change();
  assert.match(staffList.elements.get("staffRows").innerHTML, /two@example.test/);
  assert.doesNotMatch(staffList.elements.get("staffRows").innerHTML, /one@example.test/);
  staffList.elements.get("staffFilter").value = "";
  staffList.elements.get("staffSearch").value = "THREE@EXAMPLE";
  staffList.elements.get("staffFilterForm").listeners.submit({ preventDefault() {} });
  assert.match(staffList.elements.get("staffRows").innerHTML, /three@example.test/);
  assert.doesNotMatch(staffList.elements.get("staffRows").innerHTML, /two@example.test/);
  staffList.elements.get("staffSearch").value = "";
  staffList.elements.get("staffFilterForm").listeners.submit({ preventDefault() {} });
  let staffMutation;
  staffList.state.handler = async (url, options) => {
    if (options?.method === "POST") {
      staffMutation = JSON.parse(options.body);
      assert.equal(options.headers["X-Teletyptel-Csrf"], "fixture-csrf");
      assert.equal(options.headers["X-CSRF-Token"], "fixture-csrf");
      return { ok: true };
    }
    return { ok: true, team: staffTeam };
  };
  staffList.run('adminStaff.open("status", "staff-one")');
  assert.equal(staffList.elements.get("staffActionDialog").open, true);
  assert.equal(staffList.elements.get("staffCreateFields").hidden, true);
  assert.equal(staffList.elements.get("staffCreateEmail").disabled, true, "Hidden create fields cannot block status form validation");
  assert.match(staffList.elements.get("staffActionSummary").textContent, /bestaande sessies/);
  staffList.elements.get("staffConfirmPassword").value = "fixture-confirmation";
  staffList.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  assert.equal(staffMutation, undefined, "Confirmation required before mutation");
  staffList.elements.get("staffActionConfirm").checked = true;
  staffList.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  assert.equal(staffList.elements.get("staffConfirmPassword").value, "", "Password cleared immediately");
  await settle();
  assert.equal(staffMutation.action, "intake_staff_status");
  assert.equal(staffMutation.adminId, "staff-one");
  assert.equal(staffMutation.enabled, false);
  assert.equal(staffMutation.expectedEnabled, true);
  assert.equal(staffMutation.expectedVersion, 1);
  assert.equal(staffList.elements.get("staffActionDialog").open, false);
  staffList.run('adminStaff.open("status", "staff-two")');
  staffList.elements.get("staffConfirmPassword").value = "fixture-confirmation";
  staffList.elements.get("staffActionConfirm").checked = true;
  staffList.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  await settle();
  assert.equal(staffMutation.enabled, true);
  assert.equal(staffMutation.expectedVersion, 2);
  staffList.run('adminStaff.open("access", "staff-two")');
  assert.equal(staffList.elements.get("staffActionDialog").open, false, "Cannot grant access to blocked staff");
  staffList.run('adminStaff.open("access", "staff-three")');
  staffList.elements.get("staffConfirmPassword").value = "fixture-confirmation";
  staffList.elements.get("staffActionConfirm").checked = true;
  staffList.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  await settle();
  assert.equal(staffMutation.action, "intake_team");
  assert.equal(staffMutation.canReview, true);
  assert.equal(staffMutation.expected, false);
  staffList.elements.get("newStaffButton").listeners.click();
  staffList.elements.get("staffCreateName").value = "New fixture";
  staffList.elements.get("staffCreateEmail").value = "new-staff@example.test";
  staffList.elements.get("staffCreatePassword").value = "fixture-new-staff-password";
  staffList.elements.get("staffConfirmPassword").value = "fixture-confirmation";
  staffList.elements.get("staffActionConfirm").checked = true;
  staffList.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  await settle();
  assert.equal(staffMutation.action, "intake_staff");
  assert.equal(staffMutation.email, "new-staff@example.test");
  assert.equal(staffList.elements.get("staffCreatePassword").value, "");
  staffList.state.handler = async () => ({ ok: true, team: [] });
  await staffList.run("adminStaff.load()");
  assert.match(staffList.elements.get("staffRows").innerHTML, /nog geen staffaccounts/);
  let releaseStaff;
  staffList.state.handler = () => new Promise((resolve) => { releaseStaff = resolve; });
  const delayedStaff = staffList.run("adminStaff.load()");
  staffList.run("clearPrivateData(); setAdminIdentity(null)");
  releaseStaff({ ok: true, team: staffTeam });
  await delayedStaff;
  assert.equal(staffList.elements.get("staffRows").innerHTML, "", "Late list cannot reopen staff details after logout");
  assert.equal(staffList.elements.get("staffConfirmPassword").value, "");
  const staffBatch = harness({ admin }, "#staff");
  await settle();
  const batchMutations = [];
  staffBatch.state.handler = async (url, options) => {
    if (options.method === "POST") {
      batchMutations.push(JSON.parse(options.body));
      return { ok: true };
    }
    return { ok: true, team: staffTeam };
  };
  staffBatch.elements.get("selectAllStaff").checked = true;
  staffBatch.elements.get("selectAllStaff").listeners.change();
  assert.equal(staffBatch.elements.get("staffSelectionCount").textContent, "3 geselecteerd");
  assert.equal(staffBatch.elements.get("staffBulkBar").hidden, false);
  staffBatch.elements.get("staffBulkBlock").listeners.click();
  assert.match(staffBatch.elements.get("staffActionSummary").textContent, /2 van 3/);
  assert.doesNotMatch(staffBatch.elements.get("staffActionTargets").innerHTML, /two@example.test|owner@example.test/);
  staffBatch.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  assert.equal(batchMutations.length, 0, "Batch still requires confirmation and password");
  staffBatch.elements.get("staffConfirmPassword").value = "fixture-confirmation";
  staffBatch.elements.get("staffActionConfirm").checked = true;
  staffBatch.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  await settle();
  assert.deepEqual(batchMutations.map((entry) => entry.adminId), ["staff-one", "staff-three"]);
  assert.ok(batchMutations.every((entry) => entry.action === "intake_staff_status" && entry.enabled === false && entry.expectedEnabled === true && entry.expectedVersion === 1));
  assert.equal(staffBatch.elements.get("staffBulkBar").hidden, true);
  assert.equal(staffBatch.elements.get("staffConfirmPassword").value, "");
  let partialMutations = 0;
  staffBatch.state.handler = async (url, options) => options.method === "POST"
    ? (++partialMutations === 1 ? { ok: true } : { ok: false, failureStatus: 409, message: "Fixture conflict" })
    : { ok: true, team: staffTeam };
  staffBatch.elements.get("selectAllStaff").checked = true;
  staffBatch.elements.get("selectAllStaff").listeners.change();
  staffBatch.elements.get("staffBulkBlock").listeners.click();
  staffBatch.elements.get("staffConfirmPassword").value = "fixture-confirmation";
  staffBatch.elements.get("staffActionConfirm").checked = true;
  staffBatch.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  await settle();
  assert.equal(partialMutations, 2);
  assert.match(staffBatch.elements.get("messagePanel").textContent, /1 van 2.*Fixture conflict/);
  assert.equal(staffBatch.elements.get("staffActionDialog").open, false);
  staffBatch.elements.get("selectAllStaff").checked = true;
  staffBatch.elements.get("selectAllStaff").listeners.change();
  staffBatch.elements.get("staffFilter").value = "blocked";
  staffBatch.elements.get("staffFilter").listeners.change();
  assert.equal(staffBatch.elements.get("staffBulkBar").hidden, true, "Filtering clears selection");
  const pageStaff = harness({ admin }, "#staff");
  await settle();
  pageStaff.run('adminStaff.open("create")');
  pageStaff.elements.get("staffCreatePassword").value = "fixture-secret";
  pageStaff.navigate("#hoofdpagina");
  await settle();
  assert.equal(pageStaff.elements.get("staffActionDialog").open, false, "Leaving staff page closes dialog");
  assert.equal(pageStaff.elements.get("staffCreatePassword").value, "");
  const pagedStaff = harness({ admin }, "#staff");
  await settle();
  pagedStaff.state.handler = async () => ({ ok: true, team: Array.from({ length: 26 }, (_, index) => ({
    ...staffTeam[0], admin_id: "paged-" + index, display_name: "Staff " + index, email: "paged" + index + "@example.test"
  })) });
  await pagedStaff.run("adminStaff.load()");
  assert.match(pagedStaff.elements.get("staffPageInfo").textContent, /Pagina 1 van 2/);
  assert.equal(pagedStaff.elements.get("staffNext").disabled, false);
  assert.doesNotMatch(pagedStaff.elements.get("staffRows").innerHTML, /paged25@example.test/);
  pagedStaff.elements.get("staffNext").listeners.click();
  assert.match(pagedStaff.elements.get("staffRows").innerHTML, /paged25@example.test/);
  assert.doesNotMatch(pagedStaff.elements.get("staffRows").innerHTML, /paged24@example.test/);
  assert.equal(pagedStaff.elements.get("staffNext").disabled, true);
  assert.equal(pagedStaff.elements.get("staffPrevious").disabled, false);
  const changingStaff = harness({ admin }, "#staff");
  await settle();
  let finishStaffMutation;
  changingStaff.state.handler = () => new Promise((resolve) => { finishStaffMutation = resolve; });
  changingStaff.run('adminStaff.open("status", "staff-one")');
  changingStaff.elements.get("staffConfirmPassword").value = "fixture-secret";
  changingStaff.elements.get("staffActionConfirm").checked = true;
  changingStaff.elements.get("staffActionForm").listeners.submit({ preventDefault() {} });
  changingStaff.run("clearPrivateData(); setAdminIdentity(null)");
  finishStaffMutation({ ok: true });
  await settle();
  assert.equal(changingStaff.elements.get("staffRows").innerHTML, "", "Late mutation cannot reload staff after logout");
  assert.equal(changingStaff.elements.get("staffActionDialog").open, false);
  assert.equal(changingStaff.elements.get("staffConfirmPassword").value, "");
  const home = harness({ admin, setupRequired: false });
  await settle();
  assert.equal(home.elements.get("homeView").hidden, false);
  assert.equal(home.elements.get("usersView").hidden, true);
  assert.equal(home.elements.get("logsView").hidden, true);
  assert.equal(home.elements.get("logs").innerHTML, "", "Home must not load log rows");
  assert.equal(home.elements.get("homeNavLink").attributes["aria-current"], "page");
  assert.equal(home.elements.get("usersNavLink").attributes["aria-current"], undefined);
  assert.match(home.run("document.title"), /Hoofdpagina/);
  assert.equal(home.requests.length, 2);
  assert.match(home.requests[1].url, /action=dashboard/);
  assert.equal(home.elements.get("accountsTable").innerHTML, "", "Home must not load user rows");
  for (const name of ["Apache", "MySQL", "PHP", "test-apache", "test-mysql", "test-php"]) {
    assert.ok(home.elements.get("runtimeStatus").innerHTML.includes(name), "Home runtime: " + name);
  }
  for (const name of ["server", "database", "code"]) {
    assert.ok(home.elements.get("runtimeStatus").innerHTML.includes("#admin-icon-" + name), "Runtime icon: " + name);
  }
  home.navigate("#gebruikers");
  await settle();
  assert.equal(home.elements.get("homeView").hidden, true);
  assert.equal(home.elements.get("usersView").hidden, false);
  assert.equal(home.elements.get("usersNavLink").attributes["aria-current"], "page");
  assert.equal(home.elements.get("homeNavLink").attributes["aria-current"], undefined);
  assert.equal(home.elements.get("usersTitle").focused, true);
  assert.match(home.requests.at(-1).url, /action=users/);
  assert.match(home.run("document.title"), /Gebruikersbeheer/);
  home.navigate("#logs");
  await settle();
  assert.equal(home.elements.get("homeView").hidden, true);
  assert.equal(home.elements.get("usersView").hidden, true);
  assert.equal(home.elements.get("logsView").hidden, false);
  assert.equal(home.elements.get("logsNavLink").attributes["aria-current"], "page");
  assert.equal(home.elements.get("usersNavLink").attributes["aria-current"], undefined);
  assert.equal(home.elements.get("homeNavLink").attributes["aria-current"], undefined);
  assert.equal(home.elements.get("logsTitle").focused, true);
  assert.match(home.requests.at(-1).url, /action=logs/);
  assert.match(home.run("document.title"), /Systeem- en beheerlog/);
  assert.match(home.elements.get("logs").innerHTML, /fixture-admin/);
  assert.match(home.elements.get("logs").innerHTML, /&lt;img/);
  assert.doesNotMatch(home.elements.get("logs").innerHTML, /<img/);
  assert.match(home.elements.get("logsStatus").textContent, /1 recente logregels/);
  home.navigate("#hoofdpagina");
  await settle();
  assert.equal(home.elements.get("homeView").hidden, false);
  assert.equal(home.elements.get("usersView").hidden, true);
  assert.equal(home.elements.get("logsView").hidden, true);
  assert.equal(home.elements.get("logsNavLink").attributes["aria-current"], undefined);
  assert.match(home.requests.at(-1).url, /action=dashboard/);
  home.navigate("#unknown");
  await settle();
  assert.equal(home.elements.get("homeView").hidden, false, "Unknown routes return home");
  const authenticated = harness({ admin, setupRequired: false }, "#gebruikers");
  await settle();
  assert.equal(authenticated.elements.get("homeView").hidden, true, "User deep link hides server status");
  assert.equal(authenticated.elements.get("usersView").hidden, false);
  assert.match(authenticated.requests[1].url, /action=users/);
  assert.equal(authenticated.elements.get("runtimeStatus").innerHTML, "", "User page must not request server status");
  assert.equal(authenticated.elements.get("logs").innerHTML, "", "User page must not request log rows");
  assert.equal(authenticated.elements.get("adminWorkspace").hidden, false);
  assert.match(authenticated.elements.get("accountsTable").innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(authenticated.elements.get("accountsTable").innerHTML, /<script>/);
  const userRows = authenticated.elements.get("accountsTable").innerHTML;
  assert.equal((userRows.match(/<button\b/g) || []).length, 1, "Only one action per user");
  assert.match(userRows, /data-details="alice"[\s\S]*Beheren/);
  assert.match(userRows, /Actief/);
  assert.doesNotMatch(userRows, /<select|<textarea|data-save|data-subscription|data-invoice|data-recurring|Fixture note/);
  assert.equal(authenticated.elements.get("userListPanel").hidden, false);
  assert.equal(authenticated.elements.get("userDetailsPanel").hidden, true);
  assert.doesNotMatch(source, /userDetailsDialog/, "User management is a page, not a stacked modal");
  authenticated.run('openUserDetails("alice")');
  assert.equal(authenticated.elements.get("saveUserAccount").disabled, true, "No editing until the selected account loads");
  assert.equal(authenticated.elements.get("userAdministration").hidden, true);
  await settle();
  assert.equal(authenticated.elements.get("userListPanel").hidden, true);
  assert.equal(authenticated.elements.get("userDetailsPanel").hidden, false);
  assert.equal(authenticated.elements.get("userDetailsTitle").focused, true);
  assert.equal(authenticated.elements.get("userAdministration").hidden, false);
  assert.equal(authenticated.elements.get("userAccountStatus").value, "active");
  assert.equal(authenticated.elements.get("userAdminNote").value, "Fixture note");
  assert.equal(authenticated.elements.get("saveUserAccount").disabled, false);
  assert.equal(authenticated.elements.get("userChatLog").open, false, "Conversation log starts collapsed");
  assert.match(authenticated.elements.get("userSubscriptionSummary").textContent, /free.*Geen einddatum/);
  assert.match(authenticated.elements.get("userFields").innerHTML, /&lt;script&gt;/);
  assert.match(authenticated.elements.get("userActivity").innerHTML, /bob@example\.test/);
  assert.doesNotMatch(authenticated.elements.get("userActivity").innerHTML, /PRIVATE_MESSAGE/);
  authenticated.elements.get("userAdminNote").value = "Unsaved note";
  authenticated.elements.get("userAccountStatus").value = "trial";
  authenticated.elements.get("userAccountForm").listeners.input();
  authenticated.elements.get("activityFrom").value = "2026-01-01";
  authenticated.elements.get("activityKind").value = "contact";
  authenticated.elements.get("activityPeer").value = "bob@example.test";
  await authenticated.run("loadUserDetails()");
  const filtered = new URLSearchParams(authenticated.requests.at(-1).url.split("?")[1]);
  assert.equal(filtered.get("accountId"), "alice");
  assert.equal(filtered.get("from"), "2026-01-01");
  assert.equal(filtered.get("kind"), "contact");
  assert.equal(filtered.get("peer"), "bob@example.test");
  assert.equal(authenticated.elements.get("userAdminNote").value, "Unsaved note", "Activity filters preserve unsaved account edits");
  assert.equal(authenticated.elements.get("userAccountStatus").value, "trial");
  assert.match(authenticated.elements.get("userAccountSaveStatus").textContent, /Nog niet opgeslagen/);
  await authenticated.run('adminFetch("api/admin.php", { method: "POST", body: "{}" })');
  assert.equal(authenticated.requests.at(-1).options.headers["X-Teletyptel-Csrf"], "fixture-csrf");
  assert.equal(authenticated.requests.at(-1).options.credentials, "same-origin");
  assert.equal(authenticated.requests.at(-1).options.cache, "no-store");
  let release;
  authenticated.state.handler = () => new Promise((resolve) => { release = resolve; });
  const pending = authenticated.run("loadUserDetails()");
  authenticated.run("clearUserDetails()");
  release({ ok: true, account, activity });
  await pending;
  assert.equal(authenticated.elements.get("userFields").innerHTML, "", "Discard closed detail page responses");
  assert.equal(authenticated.elements.get("userAdminNote").value, "", "Private notes are cleared on close");
  authenticated.state.handler = async () => ({ failureStatus: 401, ok: false, error: "admin_login_required" });
  await authenticated.run("loadAdmin()");
  assert.equal(authenticated.elements.get("adminWorkspace").hidden, true);
  assert.doesNotMatch(authenticated.elements.get("accountsTable").innerHTML, /alice/);
  assert.equal(authenticated.elements.get("userActivity").innerHTML, "");
  const userManagement = harness({ admin: { ...admin, role: "admin" } }, "#gebruikers");
  await settle();
  let managedAccount = { ...account };
  const accountMutations = [];
  const originalUserHandler = userManagement.state.handler;
  userManagement.state.handler = async (url, options) => {
    if (options.method === "POST") {
      const mutation = JSON.parse(options.body);
      accountMutations.push(mutation);
      managedAccount = { ...managedAccount, account_status: mutation.accountStatus, admin_note: mutation.adminNote };
      return { ok: true, updated: true };
    }
    if (url.includes("action=user&")) return { ok: true, account: managedAccount, activity };
    return originalUserHandler(url, options);
  };
  userManagement.elements.get("userSearchInput").value = "alice";
  userManagement.elements.get("userStatusInput").value = "active";
  userManagement.run('openUserDetails("alice")');
  await settle();
  for (const [button, dialog, action] of [
    ["userSubscriptionButton", "subscriptionDialog", "subscription"],
    ["userInvoiceButton", "invoiceDialog", "billing_account"],
    ["userRecurringButton", "recurringDialog", "billing_account"],
  ]) {
    userManagement.elements.get(button).listeners.click();
    await settle();
    assert.equal(userManagement.elements.get(dialog).open, true);
    const query = new URLSearchParams(userManagement.requests.at(-1).url.split("?")[1]);
    assert.equal(query.get("action"), action);
    assert.equal(query.get("accountId"), "alice", "Detail actions target the loaded account");
    assert.equal(userManagement.elements.get("userDetailsPanel").hidden, false);
    userManagement.elements.get(dialog).close();
  }
  userManagement.elements.get("userAdminNote").value = "Updated note";
  userManagement.elements.get("userAccountStatus").value = "trial";
  userManagement.elements.get("userAccountForm").listeners.input();
  userManagement.elements.get("userAccountForm").listeners.submit({ preventDefault() {} });
  assert.equal(userManagement.elements.get("saveUserAccount").disabled, true);
  await userManagement.run("saveAccount()");
  await settle();
  assert.equal(accountMutations.length, 1, "Double submit cannot duplicate the mutation");
  assert.deepEqual(accountMutations[0], { action: "update_account", accountId: "alice", accountStatus: "trial", adminNote: "Updated note" });
  assert.match(userManagement.elements.get("userAccountSaveStatus").textContent, /opgeslagen/);
  assert.match(userManagement.elements.get("userFields").innerHTML, /Proef/);
  assert.equal(userManagement.elements.get("saveUserAccount").disabled, false);
  assert.match(userManagement.requests.at(-1).url, /action=user&/, "Saving refreshes the detail page, not the list");
  await userManagement.run("loadAdmin()");
  assert.match(userManagement.requests.at(-1).url, /action=user&/, "Toolbar refresh stays on the detail page");
  userManagement.elements.get("closeUserDetails").listeners.click();
  await settle();
  assert.equal(userManagement.elements.get("userListPanel").hidden, false);
  assert.equal(userManagement.elements.get("userDetailsPanel").hidden, true);
  assert.equal(userManagement.elements.get("usersTitle").focused, true);
  const listQuery = new URLSearchParams(userManagement.requests.at(-1).url.split("?")[1]);
  assert.equal(listQuery.get("action"), "users");
  assert.equal(listQuery.get("search"), "alice", "Return preserves list search");
  assert.equal(listQuery.get("status"), "active", "Return preserves list filter");
  const requestsBeforeHiddenActions = userManagement.requests.length;
  userManagement.elements.get("userInvoiceButton").listeners.click();
  await userManagement.run("saveAccount()");
  assert.equal(userManagement.requests.length, requestsBeforeHiddenActions, "Closed details cannot invoke account actions");
  userManagement.run('openUserDetails("alice")');
  await settle();
  const workingUserHandler = userManagement.state.handler;
  userManagement.state.handler = async (url, options) => options.method === "POST"
    ? { failureStatus: 400, ok: false, message: "Fixture validation error" } : workingUserHandler(url, options);
  userManagement.elements.get("userAdminNote").value = "Keep on error";
  userManagement.elements.get("userAccountForm").listeners.input();
  await userManagement.run("saveAccount()");
  assert.match(userManagement.elements.get("userAccountSaveStatus").textContent, /Fixture validation error/);
  assert.equal(userManagement.elements.get("userAdminNote").value, "Keep on error");
  assert.equal(userManagement.elements.get("saveUserAccount").disabled, false);
  let releaseSave;
  userManagement.state.handler = async (url, options) => options.method === "POST"
    ? new Promise((resolve) => { releaseSave = resolve; }) : workingUserHandler(url, options);
  const pendingSave = userManagement.run("saveAccount()");
  userManagement.navigate("#staff");
  await settle();
  const requestsAfterNavigation = userManagement.requests.length;
  releaseSave({ ok: true });
  await pendingSave;
  assert.equal(userManagement.requests.length, requestsAfterNavigation, "Late save does not refresh a departed page");
  assert.equal(userManagement.elements.get("userAccountSaveStatus").textContent, "");
  assert.equal(userManagement.elements.get("userAdminNote").value, "");
  assert.equal(userManagement.elements.get("userFields").innerHTML, "");
  userManagement.navigate("#gebruikers");
  await settle();
  userManagement.run('openUserDetails("alice")');
  await settle();
  const saveBeforeLogout = userManagement.run("saveAccount()");
  userManagement.run("clearPrivateData(); setAdminIdentity(null)");
  releaseSave({ ok: true });
  await saveBeforeLogout;
  assert.equal(userManagement.elements.get("userDetailsPanel").hidden, true);
  assert.equal(userManagement.elements.get("userAdminNote").value, "");
  assert.equal(userManagement.elements.get("userFields").innerHTML, "");
  const mismatchedUser = harness({ admin }, "#gebruikers");
  await settle();
  mismatchedUser.run('openUserDetails("different-account")');
  await settle();
  assert.equal(mismatchedUser.elements.get("userAdministration").hidden, true);
  assert.equal(mismatchedUser.elements.get("saveUserAccount").disabled, true);
  assert.match(mismatchedUser.elements.get("userDetailsStatus").textContent, /niet overeen/);
  const unauthorizedUsers = [harness({ admin: null }, "#gebruikers"), harness({ admin: { ...admin, role: "staff" } }, "#gebruikers")];
  for (const unauthorizedUser of unauthorizedUsers) {
    await settle();
    unauthorizedUser.run('openUserDetails("alice")');
    await unauthorizedUser.run("saveAccount()");
    assert.equal(unauthorizedUser.requests.length, 1, "No user management requests for guests or staff");
  }
  const failedLogout = harness({ admin, setupRequired: false });
  await settle();
  failedLogout.state.handler = async () => { throw new Error("Network unavailable"); };
  await failedLogout.run("logoutAdmin()");
  assert.equal(failedLogout.elements.get("adminWorkspace").hidden, true);
  assert.match(failedLogout.elements.get("messagePanel").textContent, /niet bevestigd/);
  const guestLogs = harness({ admin: null, setupRequired: false }, "#logs");
  await settle();
  assert.equal(guestLogs.requests.length, 1, "No log request before authentication");
  assert.equal(guestLogs.elements.get("adminWorkspace").hidden, true);
  const logPage = harness({ admin, setupRequired: false }, "#logs");
  await settle();
  assert.equal(logPage.elements.get("logsView").hidden, false);
  assert.equal(logPage.elements.get("homeView").hidden, true);
  assert.equal(logPage.elements.get("usersView").hidden, true);
  assert.match(logPage.requests[1].url, /action=logs/);
  assert.equal(logPage.elements.get("runtimeStatus").innerHTML, "", "Log deep link does not load server status");
  assert.equal(logPage.elements.get("accountsTable").innerHTML, "", "Log deep link does not load users");
  await logPage.run("loadAdmin()");
  assert.match(logPage.requests.at(-1).url, /action=logs/, "Refresh stays on the log endpoint");
  logPage.state.handler = async () => ({ ok: true, logs: [] });
  await logPage.run("loadAdmin()");
  assert.match(logPage.elements.get("logs").innerHTML, /Geen logs gevonden/);
  logPage.state.handler = async () => { throw new Error("Network unavailable"); };
  await logPage.run("loadAdmin()");
  assert.match(logPage.elements.get("logsStatus").textContent, /kon niet worden geladen/);
  assert.equal(logPage.elements.get("logs").innerHTML, "", "Failed refresh clears old log rows");
  logPage.state.handler = async () => ({ failureStatus: 401, ok: false, error: "admin_login_required" });
  await logPage.run("loadAdmin()");
  assert.equal(logPage.elements.get("adminWorkspace").hidden, true);
  assert.doesNotMatch(logPage.elements.get("logs").innerHTML, /fixture-admin/);
  const planPage = harness({ admin, setupRequired: false }, "#abonnementen");
  const ordinaryPlanAdmin = harness({ admin: { ...admin, role: "admin" } }, "#abonnementen");
  await settle();
  ordinaryPlanAdmin.run('editPlan("plus")');
  assert.equal(ordinaryPlanAdmin.elements.get("planIntakeFields").hidden, true);
  assert.equal(ordinaryPlanAdmin.elements.get("planIntakeBsn").disabled, true);
  let ordinaryPlanMutation;
  const ordinaryPlanHandler = ordinaryPlanAdmin.state.handler;
  ordinaryPlanAdmin.state.handler = async (url, options) => {
    if (options.method === "POST") { ordinaryPlanMutation = JSON.parse(options.body); return { ok: true }; }
    return ordinaryPlanHandler(url, options);
  };
  await ordinaryPlanAdmin.run("savePlan({ preventDefault() {} })");
  assert.equal(ordinaryPlanMutation.intake, undefined, "Admin plan changes preserve owner-only intake requirements");
  const unavailableRules = harness({ admin }, "#abonnementen");
  await settle();
  unavailableRules.state.handler = async () => ({ ...planData, intake: null });
  await unavailableRules.run("loadAdmin()");
  unavailableRules.run('editPlan("plus")');
  assert.equal(unavailableRules.elements.get("savePlanButton").disabled, true, "Missing rules must not be replaced with unchecked defaults");
  await settle();
  assert.equal(planPage.elements.get("plansView").hidden, false);
  assert.equal(planPage.elements.get("homeView").hidden, true);
  assert.equal(planPage.elements.get("usersView").hidden, true);
  assert.equal(planPage.elements.get("logsView").hidden, true);
  assert.equal(planPage.elements.get("plansNavLink").attributes["aria-current"], "page");
  assert.match(planPage.requests[1].url, /action=plans/);
  assert.match(planPage.run("document.title"), /Abonnementen/);
  assert.equal(planPage.elements.get("accountsTable").innerHTML, "", "Plans view does not load users");
  assert.equal(planPage.elements.get("logs").innerHTML, "", "Plans view does not load system logs");
  assert.match(planPage.elements.get("plansTable").innerHTML, /&lt;img/);
  assert.doesNotMatch(planPage.elements.get("plansTable").innerHTML, /<img|<script>/);
  assert.match(planPage.elements.get("plansTable").innerHTML, /12,50/);
  assert.match(planPage.elements.get("plansTable").innerHTML, /Nog niet ingesteld/);
  assert.match(planPage.elements.get("planHistory").innerHTML, /&lt;script&gt;note/);
  planPage.run('editPlan("plus")');
  assert.equal(planPage.elements.get("planIntakeFields").hidden, false);
  assert.equal(planPage.elements.get("planIntakeDocuments").checked, true);
  assert.equal(planPage.elements.get("planIntakeBsn").checked, true);
  assert.equal(planPage.elements.get("planIntakePublished").checked, false);
  assert.match(planPage.elements.get("planIntakeReadiness").textContent, /nog niet actief/);
  assert.equal(planPage.elements.get("planCode").readOnly, true);
  assert.equal(planPage.elements.get("planPrice").value, "12.50");
  const originalPlanHandler = planPage.state.handler;
  const mutations = [];
  planPage.state.handler = async (url, options) => {
    if (options.method === "POST") {
      mutations.push(JSON.parse(options.body));
      return { ok: true, changed: true };
    }
    return originalPlanHandler(url, options);
  };
  planPage.elements.get("planName").value = "New name";
  await planPage.run("savePlan({ preventDefault() {} })");
  assert.equal(mutations[0].action, "update_plan");
  assert.equal(mutations[0].version, 2);
  assert.equal(mutations[0].planId, "plus");
  assert.deepEqual(mutations[0].intake, { version: 3, published: false, requiresDocuments: true, requiresBsn: true });
  assert.equal(mutations[0].price, "12.50");
  assert.equal(planPage.elements.get("planEditorPanel").hidden, true);
  planPage.run("editPlan()");
  assert.equal(planPage.elements.get("planCode").readOnly, false);
  planPage.elements.get("planCode").value = "new-plan";
  planPage.elements.get("planName").value = "Nieuw plan";
  planPage.elements.get("planPrice").value = "8,99";
  await planPage.run("savePlan({ preventDefault() {} })");
  assert.equal(mutations[1].action, "create_plan");
  assert.deepEqual(mutations[1].intake, { version: 0, published: false, requiresDocuments: false, requiresBsn: false });
  assert.equal(mutations[1].enabled, true);
  assert.equal(mutations[1].price, "8,99");
  await planPage.run('openSubscription("alice")');
  assert.equal(planPage.elements.get("subscriptionForm").hidden, false);
  assert.match(planPage.elements.get("subscriptionTarget").innerHTML, /&lt;img/);
  assert.doesNotMatch(planPage.elements.get("subscriptionTarget").innerHTML, /retired/);
  assert.equal(planPage.elements.get("subscriptionTarget").value, "free");
  assert.match(planPage.elements.get("subscriptionCurrent").textContent, /alice@example.test/);
  assert.match(planPage.elements.get("subscriptionHistory").innerHTML, /&lt;script&gt;note/);
  await planPage.run("saveSubscription({ preventDefault() {} })");
  assert.equal(mutations.length, 2, "Transition requires explicit confirmation");
  planPage.elements.get("subscriptionTarget").value = "plus";
  planPage.elements.get("subscriptionExpiry").value = "2999-12-31";
  planPage.elements.get("subscriptionNote").value = "Requested upgrade";
  planPage.elements.get("subscriptionConfirm").checked = true;
  await planPage.run("saveSubscription({ preventDefault() {} })");
  assert.equal(mutations[2].action, "change_subscription");
  assert.equal(mutations[2].expectedPlan, "free");
  assert.equal(mutations[2].expectedExpiresAt, null);
  assert.equal(mutations[2].planId, "plus");
  assert.equal(mutations[2].expiresAt, "2999-12-31");
  assert.equal(planPage.elements.get("subscriptionDialog").open, false);
  assert.match(planPage.elements.get("messagePanel").textContent, /direct gewijzigd/);
  await planPage.run('openSubscription("alice")');
  planPage.elements.get("subscriptionMode").value = "later";
  planPage.run("setSubscriptionMode()");
  assert.equal(planPage.elements.get("subscriptionEffectiveLabel").hidden, false);
  assert.equal(planPage.elements.get("subscriptionEffective").required, true);
  planPage.elements.get("subscriptionTarget").value = "plus";
  planPage.elements.get("subscriptionEffective").value = "2999-01-01";
  planPage.elements.get("subscriptionConfirm").checked = true;
  await planPage.run("saveSubscription({ preventDefault() {} })");
  assert.equal(mutations.at(-1).action, "schedule_subscription");
  assert.equal(mutations.at(-1).effectiveOn, "2999-01-01");
  assert.match(planPage.elements.get("messagePanel").textContent, /ingepland/);
  let releaseSubscription;
  planPage.state.handler = () => new Promise((resolve) => { releaseSubscription = resolve; });
  const loadingSubscription = planPage.run('openSubscription("alice")');
  planPage.run("clearSubscription()");
  releaseSubscription({ ...planData, account });
  await loadingSubscription;
  assert.equal(planPage.elements.get("subscriptionCurrent").textContent, "", "Discard closed subscription dialog data");
  planPage.run('editPlan("plus"); clearPrivateData(); setAdminIdentity(null)');
  assert.equal(planPage.elements.get("planName").value, "");
  assert.equal(planPage.elements.get("plansTable").innerHTML, "");
  assert.equal(planPage.elements.get("planHistory").innerHTML, "");
  assert.equal(planPage.elements.get("subscriptionHistory").innerHTML, "");
  const guestPlans = harness({ admin: null, setupRequired: false }, "#abonnementen");
  await settle();
  assert.equal(guestPlans.requests.length, 1, "Plan data is never requested before login");
  assert.equal(guestPlans.elements.get("adminWorkspace").hidden, true);
  const changingPages = harness({ admin, setupRequired: false });
  await settle();
  let releaseUsers;
  changingPages.state.handler = (url) => url.includes("action=users")
    ? new Promise((resolve) => { releaseUsers = resolve; }) : Promise.resolve(dashboard);
  changingPages.navigate("#gebruikers");
  changingPages.navigate("#hoofdpagina");
  await settle();
  releaseUsers(users);
  await settle();
  assert.equal(changingPages.elements.get("homeView").hidden, false);
  assert.equal(changingPages.elements.get("accountsTable").innerHTML, "", "Discard responses for an abandoned page");
  assert.match(changingPages.elements.get("dashboardStatus").textContent, /bijgewerkt/);
  let releaseLogs;
  changingPages.state.handler = (url) => url.includes("action=logs")
    ? new Promise((resolve) => { releaseLogs = resolve; }) : Promise.resolve(dashboard);
  changingPages.navigate("#logs");
  changingPages.navigate("#hoofdpagina");
  await settle();
  releaseLogs(logData);
  await settle();
  assert.equal(changingPages.elements.get("logsView").hidden, true);
  assert.equal(changingPages.elements.get("logs").innerHTML, "", "Discard logs after leaving the log page");
  for (const hash of ["#facturatie", "#instellingen"]) {
    const guestView = harness({ admin: null, setupRequired: false }, hash);
    await settle();
    assert.equal(guestView.requests.length, 1, "No financial/settings data before login");
    assert.equal(guestView.elements.get("adminWorkspace").hidden, true);
  }
  const limited = harness({ admin: { ...admin, role: "admin" } }, "#instellingen");
  await settle();
  assert.equal(limited.requests.length, 1, "Non-owner settings not requested");
  assert.equal(limited.elements.get("settingsNavLink").hidden, true);
  assert.equal(limited.elements.get("settingsForm").hidden, true);
  const finance = harness({ admin }, "#facturatie");
  await settle();
  assert.equal(finance.elements.get("billingView").hidden, false);
  assert.equal(finance.elements.get("homeView").hidden, true);
  assert.match(finance.elements.get("invoiceRows").innerHTML, /&lt;img&gt; insurer/);
  assert.doesNotMatch(finance.elements.get("invoiceRows").innerHTML, /<img>/);
  assert.match(finance.elements.get("billingWorkerStatus").textContent, /nog niet gecontroleerd/);
  await finance.run('adminManagement.invoiceFor("alice")');
  assert.equal(finance.elements.get("invoiceDialog").open, true);
  assert.equal(finance.elements.get("invoiceAccount").value, "alice");
  assert.equal(finance.elements.get("invoiceVat").value, "", "VAT not invented");
  const invoiceMutations = [];
  const originalFinanceHandler = finance.state.handler;
  finance.state.handler = async (url, options) => {
    if (options.method !== "POST") return originalFinanceHandler(url, options);
    const body = JSON.parse(options.body);
    invoiceMutations.push(body);
    return { ok: true, invoice: body.action === "issue_invoice"
      ? { ...invoiceFixture, status: "issued", invoice_number: "TT-fixture", version: 2 } : invoiceFixture };
  };
  for (const [field, content] of Object.entries({ Recipient: "insurer", Customer: "Insurer", Address: "Test address",
    Description: "Subscription", Unit: "12.50", Vat: "21" })) finance.elements.get("invoice" + field).value = content;
  finance.elements.get("invoiceForm").listeners.submit({ preventDefault() {} });
  await settle();
  assert.equal(invoiceMutations[0].recipientType, "insurer");
  assert.equal(invoiceMutations[0].accountId, "alice");
  assert.equal(invoiceMutations[0].requestKey.length, 36);
  assert.equal(finance.elements.get("invoiceIssuePanel").hidden, false);
  finance.elements.get("issueInvoiceButton").listeners.click();
  await settle();
  assert.equal(invoiceMutations.length, 1, "Issuing requires confirmation");
  finance.elements.get("invoiceIssueConfirm").checked = true;
  finance.elements.get("issueInvoiceButton").listeners.click();
  await settle();
  assert.equal(invoiceMutations[1].action, "issue_invoice");
  assert.equal(invoiceMutations[1].confirmed, true);
  assert.equal(finance.elements.get("invoiceForm").hidden, true);
  assert.equal(finance.elements.get("invoicePaidForm").hidden, false);
  finance.navigate("#instellingen");
  await settle();
  assert.equal(finance.elements.get("invoiceDialog").open, false);
  assert.equal(finance.elements.get("invoiceCustomer").value, "");
  assert.equal(finance.elements.get("settingsView").hidden, false);
  assert.equal(finance.elements.get("settingsCompanyName").value, "");
  assert.equal(finance.elements.get("settingsDefaultVat").value, "");
  assert.equal(finance.elements.get("settingsAgbCode").value, "", "No invented AGB code");
  assert.equal(finance.elements.get("settingsMysqlPassword").value, "");
  assert.equal(finance.elements.get("settingsXmppHost").disabled, true);
  let releaseSettings;
  let settingsMutation;
  finance.state.handler = async (url, options) => {
    settingsMutation = JSON.parse(options.body);
    return new Promise((resolve) => { releaseSettings = resolve; });
  };
  finance.elements.get("settingsOwnerPassword").value = "fixture-owner-secret";
  finance.elements.get("settingsMysqlPassword").value = "fixture-new-database-secret";
  finance.elements.get("settingsAgbCode").value = "01234567";
  finance.elements.get("settingsForm").listeners.submit({ preventDefault() {} });
  assert.equal(finance.elements.get("settingsOwnerPassword").value, "", "Owner password cleared immediately");
  assert.equal(finance.elements.get("settingsMysqlPassword").value, "", "Database password cleared immediately");
  assert.equal(settingsMutation.revision, "fixture-revision");
  assert.equal(settingsMutation.mysql.password, "fixture-new-database-secret");
  assert.equal(settingsMutation.billing.agbCode, "01234567", "AGB submitted as text with leading zero");
  finance.run("clearPrivateData(); setAdminIdentity(null)");
  releaseSettings(settingsData);
  await settle();
  assert.equal(finance.elements.get("settingsMysqlHost").value, "", "Late save cannot refill logged-out data");
  assert.equal(finance.elements.get("settingsAgbCode").value, "", "AGB cleared on logout");
  assert.equal(finance.elements.get("invoiceRows").innerHTML, "");
  assert.equal(finance.elements.get("settingsForm").hidden, true);
  const lateInvoice = harness({ admin }, "#gebruikers");
  await settle();
  let releaseInvoice;
  lateInvoice.state.handler = () => new Promise((resolve) => { releaseInvoice = resolve; });
  const invoiceLoading = lateInvoice.run('adminManagement.invoiceFor("alice")');
  lateInvoice.run("clearPrivateData(); setAdminIdentity(null)");
  releaseInvoice({ ok: true, account, defaults: {} });
  await invoiceLoading;
  assert.equal(lateInvoice.elements.get("invoiceAccount").value, "", "No late invoice data after logout");
  const printSource = fs.readFileSync(path.join(__dirname, "../php/public/admin/invoice.php"), "utf8");
  const printScript = printSource.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [supplier, expected] of [[{ agbCode: "01234567" }, /AGB-code: 01234567/], [{}, null],
    [{ agbCode: '<img src=x onerror="test">' }, /AGB-code: &lt;img/]]) {
    const printElements = new Map(["document", "status", "printButton"].map((identifier) => [identifier, {
      innerHTML: "", textContent: "", hidden: true, addEventListener() {}, replaceChildren() { this.innerHTML = ""; },
    }]));
    const printContext = vm.createContext({
      document: { getElementById: (identifier) => printElements.get(identifier) },
      window: { location: { search: "?id=" + invoiceFixture.id }, addEventListener() {} },
      URLSearchParams, setTimeout() {},
      fetch: async () => ({ ok: true, json: async () => ({ ok: true, invoice: { ...invoiceFixture, status: "issued", supplier } }) }),
    });
    vm.runInContext(printScript, printContext);
    await settle();
    const markup = printElements.get("document").innerHTML;
    assert.equal(printElements.get("document").hidden, false, "Invoice print rendered");
    if (expected) assert.match(markup, expected);
    else assert.doesNotMatch(markup, /AGB-code:/, "Legacy invoice without snapshot is not rewritten");
    assert.doesNotMatch(markup, /<img|<script/, "Printed supplier fields are escaped");
  }
  const homeStart = source.indexOf('id="homeView"');
  const usersStart = source.indexOf('id="usersView"');
  const logsStart = source.indexOf('id="logsView"');
  const plansStart = source.indexOf('id="plansView"');
  for (const identifier of ["runtimeStatus", "cards", "sipStatus"]) {
    const position = source.indexOf('id="' + identifier + '"');
    assert.ok(position > homeStart && position < usersStart, identifier + " belongs only to home");
  }
  assert.ok(source.indexOf('id="accountsTable"') > usersStart && source.indexOf('id="accountsTable"') < logsStart, "Users have a separate view");
  assert.ok(source.indexOf('id="logs"') > logsStart, "Logs have a separate view");
  assert.ok(source.indexOf('id="plansTable"') > plansStart && source.indexOf('id="plansTable"') < logsStart, "Plans have their own view");
  assert.doesNotMatch(source, /data-field="subscriptionPlan"|data-field="subscriptionExpiresAt"/, "User row cannot bypass transition history");
  const iconMarkup = source.split("<script>")[0] + home.elements.get("runtimeStatus").innerHTML
    + home.elements.get("cards").innerHTML + home.elements.get("accountsTable").innerHTML;
  for (const match of iconMarkup.matchAll(/<use href="#([^"]+)"/g)) {
    assert.ok(identifiers.includes(match[1]), "Icon symbol exists: " + match[1]);
  }
  process.stdout.write("Admin UI unit checks passed (mock DOM and fetch; no live users).\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
