const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const shared = read("php/public/aanmelden/intake-ui.js");
const settle = async () => { for (let turn = 0; turn < 8; turn++) await new Promise(setImmediate); };

class Element {
  constructor(tag = "div", text = "") {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
    this.listeners = {};
    this.hidden = false;
    this.value = "";
    this.files = [];
    this.disabled = false;
    this.checked = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.textContent = ""; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  reset() {}
  remove() {}
  click() { return this.listeners.click?.({ preventDefault() {} }); }
  submit() { return this.listeners.submit?.({ preventDefault() {} }); }
}
function harness(adminPage, handler) {
  const page = read(adminPage ? "php/public/admin/aanmeldingen.php" : "php/public/aanmelden/index.php");
  const identifiers = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(identifiers).size, identifiers.length, "Unique HTML IDs");
  const elements = new Map(identifiers.map((id) => [id, new Element()]));
  const requests = [];
  const timers = new Map();
  const listeners = {};
  const document = {
    body: new Element("body"),
    getElementById(id) { assert.ok(elements.has(id), "Known HTML ID " + id); return elements.get(id); },
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new Element("text", text),
    addEventListener(name, callback) { listeners[name] = callback; },
  };
  const state = { handler };
  const context = vm.createContext({
    document, window: { addEventListener(name, callback) { listeners[name] = callback; } },
    Option: function (text, value) { const option = new Element("option", text); option.value = value; return option; },
    setTimeout(callback, delay) { const identifier = timers.size + 1; timers.set(identifier, { callback, delay }); return identifier; },
    clearTimeout(identifier) { timers.delete(identifier); },
    FormData, Blob, AbortController, DOMException, URL, Intl, Date,
    confirm: () => true,
    fetch: async (url, options = {}) => {
      const body = options.body instanceof FormData ? Object.fromEntries(options.body) : options.body ? JSON.parse(options.body) : null;
      requests.push({ url, options, body });
      const data = await state.handler(url, body);
      return { ok: !data.failureStatus, status: data.failureStatus || 200, json: async () => data,
        headers: { get: () => "" }, blob: async () => new Blob(["fixture"]) };
    },
  });
  vm.runInContext(shared, context);
  vm.runInContext(read(adminPage ? "php/public/admin/intake-management.js" : "php/public/aanmelden/intake.js"), context);
  return { elements, requests, state, listeners, timers, context, get: (id) => elements.get(id) };
}
const plans = [
  { plan_id: "general", name: "Gewoon", price_cents: 0, billing_period: "none", requires_bsn: 0, requires_documents: 0, plan_version: 1, rule_version: 1 },
  { plan_id: "care", name: "<script>Fixture</script>", price_cents: 1200, billing_period: "month", requires_bsn: 1, requires_documents: 1, plan_version: 1, rule_version: 1 },
];
const fixture = { id: "a".repeat(32), account_id: "alice", plan_name: "Fixture", status: "draft", version: 1,
  requires_bsn: 1, requires_documents: 1, insurer: { id: "fixture-insurer", name: "Fixture", uzovi: "0000" },
  bsnMasked: "", expires_at: "2027-01-01 00:00:00", price_cents: 0, billing_period: "none", documents: [] };
const session = { ok: true, csrfToken: "fixture-csrf", fresh: true, freshUntil: Math.floor(Date.now() / 1000) + 900,
  account: { account_id: "alice", display_name: "Alice" }, application: null, plans,
  insurers: { sourcePublishedOn: "2026-03-04", items: [{ id: "fixture-insurer", name: "Fixture", uzovi: "0000" }] },
  readiness: { bsnReady: false, medicalReady: false, privacyUrl: "https://example.invalid/privacy", privacyVersion: "fixture-1", maxFileBytes: 4194304 } };
const staff = { adminId: "staff", role: "staff", canReviewIntake: true };
const list = { ok: true, applications: { items: [{ ...fixture, display_name: "Alice" }], page: 1, pageSize: 25, total: 1 } };

async function main() {
  const guest = harness(false, async () => ({ ...session, account: null, fresh: false }));
  await settle();
  assert.equal(guest.get("planSection").hidden, true);
  assert.equal(guest.get("applicationSection").hidden, true);
  assert.equal(guest.requests.length, 1, "Guest gets no private request");
  const catalog = harness(false, async () => session);
  await settle();
  assert.equal(catalog.get("planSection").hidden, false);
  const cards = catalog.get("plans").children;
  assert.equal(cards[0].children.at(-1).disabled, false, "General signup needs no BSN configuration");
  assert.equal(cards[1].children.at(-1).disabled, true, "Medical signup cannot bypass readiness");
  assert.equal(cards[1].children[0].textContent, plans[1].name, "Plan names rendered as text, not markup");
  let stored = { ...fixture };
  const applicant = harness(false, async (_url, body) => {
    if (!body) return { ...session, application: stored, readiness: { ...session.readiness, bsnReady: true, medicalReady: true } };
    stored = { ...stored, version: stored.version + 1, bsnMasked: "*****9990" };
    if (body.action === "upload") stored.documents = [...stored.documents, { id: body.kind, kind: body.kind, extension: "pdf" }];
    return { ok: true, application: stored };
  });
  await settle();
  assert.equal(applicant.get("bsnField").hidden, false);
  assert.equal(applicant.get("bsn").required, true);
  assert.equal(applicant.get("uploadFields").hidden, false);
  applicant.get("bsn").value = "999999990";
  applicant.get("audiogram").files = [new Blob(["%PDF-fixture"], { type: "application/pdf" })];
  applicant.get("prescription").files = [new Blob(["%PDF-fixture"], { type: "application/pdf" })];
  applicant.get("detailsForm").submit();
  await settle();
  assert.deepEqual(applicant.requests.slice(1).map((entry) => entry.body.action), ["save_details", "upload", "upload"]);
  assert.deepEqual(applicant.requests.slice(1).map((entry) => Number(entry.body.version)), [1, 2, 3], "Uploads use updated version after each save");
  assert.equal(applicant.get("bsn").value, "");
  assert.equal(applicant.get("bsn").required, false, "Existing required BSN may be kept blank");
  assert.equal(applicant.requests[1].options.headers["X-CSRF-Token"], "fixture-csrf");
  assert.equal(applicant.requests[1].options.headers["X-TeleTypTel-CSRF"], "fixture-csrf");
  for (const request of applicant.requests) assert.equal(request.options.cache, "no-store");
  applicant.listeners.pagehide();
  assert.equal(applicant.get("applicationSection").hidden, true);
  assert.equal(applicant.get("stored").children.length, 0);
  assert.equal(applicant.get("bsnValue").textContent, "");
  const ordinary = harness(false, async () => ({ ...session, application: { ...fixture, requires_bsn: 0, requires_documents: 0 } }));
  await settle();
  assert.equal(ordinary.get("detailsForm").hidden, true);
  assert.equal(ordinary.get("bsnField").hidden, true);
  assert.equal(ordinary.get("uploadFields").hidden, true);
  assert.equal(ordinary.get("submitForm").hidden, false, "General signup still submits");
  const owner = harness(true, async (url) => {
    if (url.includes("action=session")) return { ok: true, csrfToken: "fixture-csrf", admin: { role: "owner", canReviewIntake: true } };
    if (url.includes("action=intake_list")) return list;
    return { ok: true, plans: [], team: [
      { role: "owner", enabled: 1, can_review_intake: 0, canReviewIntake: true, session_version: 1, email: "owner@example.invalid" },
      { role: "admin", enabled: 1, can_review_intake: 0, canReviewIntake: true, session_version: 1, email: "admin@example.invalid" },
      { role: "staff", enabled: 1, can_review_intake: 0, canReviewIntake: false, session_version: 1, email: "staff@example.invalid" }
    ], readiness: session.readiness };
  });
  await settle();
  assert.equal(owner.get("ownerSection").hidden, false);
  assert.ok(!owner.requests.some((entry) => entry.url.includes("action=intake_config")), "Intake settings are managed within the plan editor");
  assert.equal(owner.get("listSection").hidden, false);
  assert.ok(owner.requests.some((entry) => /intake_list/.test(entry.url)), "Owner sees applications through role-based access");
  for (const row of owner.get("team").children.slice(0, 2)) {
    assert.match(row.textContent, /Inzage: aan/);
    assert.equal(row.children[0].textContent, "(via beheerrol)");
    assert.ok(!row.children.some((element) => element.tagName === "button"), "No misleading switch for inherited admin rights");
  }
  assert.equal(owner.get("team").children[2].children[0].textContent, "Toekennen");
  let releaseSession;
  owner.state.handler = async (url) => {
    if (url.includes("action=session")) return new Promise((resolve) => { releaseSession = resolve; });
    if (url.includes("action=intake_list")) return list;
    throw new Error("Staff must not request management data");
  };
  owner.get("refresh").click();
  await settle();
  for (const id of ["workspace", "ownerSection", "teamSection", "adminBack", "listSection"]) {
    assert.equal(owner.get(id).hidden, true, id + " stays hidden while checking the new session");
  }
  releaseSession({ ok: true, csrfToken: "fixture-csrf", admin: staff });
  await settle();
  assert.equal(owner.get("workspace").hidden, false);
  assert.equal(owner.get("listSection").hidden, false);
  for (const id of ["ownerSection", "teamSection", "adminBack"]) {
    assert.equal(owner.get(id).hidden, true, id + " stays hidden after switching from owner to staff");
  }
  owner.listeners.pagehide();
  assert.equal(owner.get("listSection").hidden, true);
  const expiredOwner = harness(true, async (url) => {
    if (url.includes("action=session")) return { ok: true, admin: { role: "owner", canReviewIntake: true } };
    if (url.includes("action=intake_list")) return list;
    return { ok: true, team: [] };
  });
  await settle();
  const expire = [...expiredOwner.timers.values()].find((timer) => timer.delay === 30 * 60 * 1000);
  assert.ok(expire, "Authenticated session has an expiry timer");
  expire.callback();
  for (const id of ["workspace", "ownerSection", "teamSection", "adminBack", "listSection"]) {
    assert.equal(expiredOwner.get(id).hidden, true, id + " stays hidden after session expiry");
  }
  let teamMember = { admin_id: "fixture-staff", role: "staff", enabled: 1, can_review_intake: 1,
    canReviewIntake: true, session_version: 1, email: "staff@example.invalid" };
  const administrator = harness(true, async (url, body) => {
    if (url.includes("action=session")) return { ok: true, csrfToken: "fixture-csrf", admin: { role: "admin", canReviewIntake: true } };
    if (url.includes("action=intake_list")) return list;
    if (url.includes("action=intake_members")) return { ok: true, team: [{ ...teamMember }] };
    if (url.includes("action=intake_view")) return { ok: true, application: { ...fixture, insurer: null }, audit: [] };
    if (body?.action === "intake_staff_status") {
      assert.equal(body.expectedVersion, teamMember.session_version);
      assert.equal(body.expectedEnabled, Boolean(teamMember.enabled));
      assert.equal(body.confirmed, true);
      assert.equal(body.reviewPassword, "fixture-admin-password");
      teamMember = { ...teamMember, enabled: Number(body.enabled), can_review_intake: 0, canReviewIntake: false, session_version: teamMember.session_version + 1 };
      return { ok: true };
    }
    if (body?.action === "intake_staff") return { ok: true };
    throw new Error("Unexpected admin request");
  });
  await settle();
  assert.equal(administrator.get("ownerSection").hidden, true, "Admin does not gain owner settings");
  assert.equal(administrator.get("teamSection").hidden, false, "Admin can manage staff");
  assert.equal(administrator.get("listSection").hidden, false);
  administrator.get("rows").children[0].children.at(-1).children[0].click();
  await settle();
  assert.equal(administrator.get("detailSection").hidden, false);
  assert.match(administrator.get("detailAttention").textContent, /Concept: nog niet ingediend/);
  assert.match(administrator.get("detailAttention").textContent, /Ontbreekt: zorgverzekeraar, BSN, audiogram, voorschrift/);
  const attention = administrator.context.window.intakeUI.attention;
  assert.doesNotMatch(attention({ ...fixture, requires_bsn: 0, requires_documents: 0 }), /Ontbreekt/);
  assert.match(attention({ ...fixture, status: "needs_info", feedback_code: "replace_audiogram",
    bsnMasked: "*****9990", documents: [{ kind: "audiogram" }, { kind: "prescription" }] }), /inhoudelijke goedkeuring.*nieuw audiogram/);
  assert.equal(attention({ ...fixture, status: "withdrawn" }), "De zorggegevens van deze aanvraag zijn verwijderd.");
  administrator.get("ownerPassword").value = "fixture-admin-password";
  assert.equal(administrator.get("team").children[0].children.at(-1).textContent, "Blokkeren");
  administrator.get("team").children[0].children.at(-1).click();
  await settle();
  assert.match(administrator.get("team").children[0].children[1].textContent, /Geblokkeerd/);
  assert.equal(administrator.get("team").children[0].children[0].disabled, true, "Cannot grant rights to blocked staff");
  assert.equal(administrator.get("team").children[0].children.at(-1).textContent, "Deblokkeren");
  assert.equal(administrator.get("ownerPassword").value, "", "Confirmation password cleared");
  administrator.get("ownerPassword").value = "fixture-admin-password";
  administrator.get("team").children[0].children.at(-1).click();
  await settle();
  assert.equal(administrator.get("team").children[0].children[0].textContent, "Toekennen", "Unblock does not restore medical access");
  assert.equal(administrator.get("team").children[0].children.at(-1).textContent, "Blokkeren");
  assert.match(administrator.get("message").textContent, /Opnieuw inloggen/);
  administrator.get("staffEmail").value = "new-staff@example.invalid";
  administrator.get("staffName").value = "Fixture new staff";
  administrator.get("staffPassword").value = "fixture-new-password";
  administrator.get("ownerPassword").value = "fixture-admin-password";
  administrator.get("staffForm").submit();
  await settle();
  const creation = administrator.requests.find((entry) => entry.body?.action === "intake_staff");
  assert.equal(creation.body.email, "new-staff@example.invalid");
  assert.equal(creation.body.staffPassword, "fixture-new-password");
  assert.equal(creation.body.reviewPassword, "fixture-admin-password");
  assert.equal(administrator.get("staffPassword").value, "");
  assert.equal(administrator.get("ownerPassword").value, "");
  assert.ok(!administrator.requests.some((entry) => entry.url.includes("action=intake_config")), "Staff management does not require owner settings");
  const unassignedStaff = harness(true, async () => ({ ok: true, csrfToken: "fixture-csrf", admin: { ...staff, canReviewIntake: false } }));
  await settle();
  assert.equal(unassignedStaff.get("listSection").hidden, true);
  assert.equal(unassignedStaff.get("teamSection").hidden, true);
  assert.equal(unassignedStaff.requests.length, 1, "Staff without grant requests no dossiers");
  let release;
  const reviewer = harness(true, async (url, body) => {
    if (url.includes("action=session")) return { ok: true, csrfToken: "fixture-csrf", admin: staff };
    if (url.includes("action=intake_list")) return list;
    if (url.includes("action=intake_view")) return new Promise((resolve) => { release = resolve; });
    if (body?.action === "logout") return { ok: true };
    throw new Error("Unexpected request");
  });
  await settle();
  assert.equal(reviewer.get("ownerSection").hidden, true);
  assert.equal(reviewer.get("teamSection").hidden, true);
  assert.equal(reviewer.get("adminBack").hidden, true);
  assert.equal(reviewer.get("listSection").hidden, false);
  assert.ok(!reviewer.requests.some((entry) => /config|members|dashboard|users|billing/.test(entry.url)));
  reviewer.get("rows").children[0].children.at(-1).children[0].click();
  await settle();
  reviewer.get("logout").click();
  release({ ok: true, application: { ...fixture, bsnMasked: "*****9990" }, audit: [] });
  await settle();
  assert.equal(reviewer.get("workspace").hidden, true);
  assert.equal(reviewer.get("detailSection").hidden, true, "Late private response cannot reopen after logout");
  assert.equal(reviewer.get("bsnValue").textContent, "");
  let cacheOpened = 0;
  const worker = vm.createContext({
    self: { location: { origin: "https://example.invalid" }, addEventListener() {} },
    URL, fetch: async () => { throw new Error("offline"); },
    caches: { open: async () => { cacheOpened++; return { match: async () => "SENSITIVE CACHE" }; } },
  });
  vm.runInContext(read("php/public/service-worker.js"), worker);
  for (const route of ["/aanmelden/", "/aanmelden/api.php", "/admin/aanmeldingen.php", "/admin/api.php", "/api/admin.php"]) {
    worker.request = { url: "https://example.invalid" + route, mode: "navigate", destination: "document" };
    assert.equal(vm.runInContext("shouldCache(request)", worker), false);
    await assert.rejects(vm.runInContext("networkFirst(request)", worker), /offline/);
  }
  assert.equal(cacheOpened, 0, "Private routes never consult cached data or offline shell");
  for (const file of ["php/public/aanmelden/intake.js", "php/public/admin/intake-management.js", "php/public/aanmelden/intake-ui.js"]) {
    assert.doesNotMatch(read(file), /innerHTML|localStorage|sessionStorage/, "No unsafe markup or persistent browser storage");
  }
  process.stdout.write("Intake UI checks passed: conditional fields, staff scope, CSRF, upload versions, logout races, no private cache.\n");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
