const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const publicRoot = path.resolve(__dirname, "../php/public");
const origin = "https://teletyptel.test";
const php = process.env.PHP_BINARY || "php";
const screenshotDirectory = process.env.WEBSITE_SCREENSHOT_DIR || os.tmpdir();
const render = (file) => execFileSync(php, ["-r", '$_SERVER["HTTPS"] = "on"; require $argv[1];', file], { encoding: "utf8" });
const session = {
  ok: true, csrfToken: "fixture", fresh: true, freshUntil: Math.floor(Date.now() / 1000) + 900,
  account: { account_id: "fixture", display_name: "Voorbeeldgebruiker" }, application: null,
  plans: [{ plan_id: "fixture", name: "Voorbeeldabonnement", description: "Alleen een test, geen echt aanbod.",
    price_cents: 0, billing_period: "none", requires_bsn: 0, requires_documents: 0, plan_version: 1, rule_version: 1 }],
  insurers: { sourcePublishedOn: "2026-03-04", items: [] },
  readiness: { bsnReady: false, medicalReady: false, privacyUrl: "", maxFileBytes: 4194304 }
};

async function checkNewFeatures(page, width, name) {
  const section = page.locator("#nieuw");
  assert.equal(await section.locator(".feature-card").count(), 2);
  assert.equal(await section.getByRole("heading", { name: "Vertaling in jouw taal", exact: true }).count(), 1);
  assert.equal(await section.getByRole("heading", { name: "Gebarentolk oproepen", exact: true }).count(), 1);
  assert.match(await section.innerText(), /voorlopige vertaling/);
  assert.match(await section.innerText(), /Na acceptatie en toestemming/);
  assert.match(await section.innerText(), /Tolkcontact is nog niet aangesloten/);
  assert.match(await section.innerText(), /Vertalingen kunnen fouten bevatten/);
  assert.equal(await section.locator('a[href="chat.html"]').count(), 2);
  const bounds = await section.locator(".feature-card").evaluateAll((cards) => cards.map((card) => {
    const rectangle = card.getBoundingClientRect();
    return { top: rectangle.top, left: rectangle.left, right: rectangle.right, bottom: rectangle.bottom };
  }));
  assert.ok(bounds.every((rectangle) => rectangle.left >= 0 && rectangle.right <= width));
  assert.ok(width <= 760 ? bounds[1].top >= bounds[0].bottom : Math.abs(bounds[1].top - bounds[0].top) < 2);
  if (width === 1440 || width === 390) {
    await section.screenshot({ path: path.join(screenshotDirectory, "teletyptel-new-features-" + name + "-" + width + ".png") });
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const failures = [];
    const adminRequests = [];
    let applicant = { ...session, fresh: false, account: null };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== "GET") {
        failures.push("Unexpected network request: " + request.method() + " " + url.pathname);
        return route.abort();
      }
      if (url.pathname === "/aanmelden/api.php") return route.fulfill({ json: applicant });
      if (url.pathname === "/admin/api.php") {
        const action = url.searchParams.get("action");
        adminRequests.push(action);
        if (action === "session") return route.fulfill({ json: { ok: true, admin: { role: "staff", canReviewIntake: true }, csrfToken: "fixture" } });
        if (action === "intake_list") return route.fulfill({ json: { ok: true, applications: { items: [], page: 1, pageSize: 25, total: 0 } } });
        failures.push("Staff requested admin action: " + action);
        return route.fulfill({ status: 403, json: { ok: false } });
      }
      let file = path.resolve(publicRoot, "." + decodeURIComponent(url.pathname));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.php");
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file)) {
        failures.push("Missing local asset: " + url.pathname);
        return route.fulfill({ status: 404, body: "Not found" });
      }
      const extension = path.extname(file);
      const contentType = { ".php": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
        ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" }[extension] || "text/html";
      return route.fulfill({ contentType, body: extension === ".php" ? render(file) : fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto(origin + "/");
      await page.locator(".site-hero").waitFor();
      await checkNewFeatures(page, width, "home");
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Homepage fits at " + width);
      const missingLinks = await page.locator('a[href^="#"]').evaluateAll((links) =>
        links.filter((link) => !document.getElementById(link.hash.slice(1))).map((link) => link.hash));
      assert.deepEqual(missingLinks, []);
      const paths = await page.locator('a[href]:not([href^="#"]):not([href^="mailto:"])').evaluateAll((links) =>
        links.map((link) => new URL(link.href).pathname));
      for (const routePath of paths) assert.ok(fs.existsSync(path.join(publicRoot, routePath)), "Local link exists: " + routePath);
      await page.locator(".faq-list summary").first().click();
      assert.equal(await page.locator(".faq-list details").first().getAttribute("open"), "");
      if (width === 1440 || width === 390) {
        await page.locator(".faq-list summary").first().click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(screenshotDirectory, "teletyptel-home-" + width + ".png"), fullPage: true });
        await page.screenshot({ path: path.join(screenshotDirectory, "teletyptel-home-top-" + width + ".png") });
      }
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto(origin + "/demo.html");
      await checkNewFeatures(page, width, "demo");
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator("a[download]").count(), 9);
      assert.match(await page.locator("h1").innerText(), /Typ wat je wilt zeggen/);
      assert.equal(await page.locator('.demo-intro a[href="aanmelden/"]').isVisible(), true);
      assert.equal(await page.locator('.demo-end a[href="chat.html"]').count(), 1);
      assert.equal(await page.locator(".demo-benefits .feature-card").count(), 3);
      assert.match(await page.locator(".demo-intro .hero-description").innerText(), /Total Conversation combineert realtime tekst, beeld en geluid/);
      assert.match(await page.locator(".demo-benefits .feature-card").first().innerText(), /RTT is realtime tekst/);
      assert.doesNotMatch(await page.locator("main").innerText(), /RTT brengt tekst, beeld en geluid samen/);
      assert.match(await page.locator(".demo-disclosure").innerText(), /geen live gesprekken/);
      const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll((links) =>
        links.filter((link) => !document.getElementById(link.hash.slice(1))).map((link) => link.hash));
      assert.deepEqual(brokenAnchors, []);
      await page.locator(".demo-production-note summary").click();
      assert.equal(await page.locator(".demo-production-note").getAttribute("open"), "");
      await page.locator(".demo-production-note summary").click();
      for (const picture of await page.locator(".screenshot-link img").all()) {
        await picture.scrollIntoViewIfNeeded();
        await picture.evaluate((element) => element.decode());
        assert.ok(await picture.evaluate((element) => element.naturalWidth > 0), "Screenshot is a real image");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Demo fits at " + width);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width !== 320) await page.screenshot({ path: path.join(screenshotDirectory, "teletyptel-demo-" + width + ".png") });
    }
    await page.goto(origin + "/");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.className), "skip-link");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "inhoud");
    await page.locator('.hero-copy a[href="aanmelden/"]').click();
    await page.getByText("Log opnieuw in bij Messenger en klik daarna op Aanmelding laden.").waitFor();
    assert.equal(await page.locator("#planSection").isVisible(), false);
    applicant = session;
    await page.locator("#reload").click();
    await page.getByText("Je ziet alleen je eigen aanmelding.", { exact: true }).waitFor();
    assert.equal(await page.locator("#planSection").isVisible(), true);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Signup fits at " + width);
      if (width !== 320) await page.screenshot({ path: path.join(screenshotDirectory, "teletyptel-signup-" + width + ".png"), fullPage: true });
    }
    await page.goto(origin + "/admin/aanmeldingen.php");
    await page.getByText("Aanmeldingen geladen. Inzage wordt gelogd.").waitFor();
    for (const identifier of ["ownerSection", "teamSection", "adminBack"]) assert.equal(await page.locator("#" + identifier).isVisible(), false);
    assert.deepEqual(adminRequests, ["session", "intake_list"]);
    assert.deepEqual(failures, []);
    console.log("Website checks passed: responsive layouts, local links/assets, keyboard navigation, FAQ, signup and staff scope. No live accounts accessed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
