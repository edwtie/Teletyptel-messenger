const fs = require("node:fs");
const path = require("node:path");
const { webkit, devices } = require("playwright");
const { project, output } = require("./prepare");

(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ ...devices["iPhone 13"], locale: "nl-NL", serviceWorkers: "block" });
    page.on("pageerror", (error) => console.error("Browser fixture error: " + error.message));
    await page.addInitScript(() => { window.Capacitor = { getPlatform: () => "ios" }; });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "https://ios-fixture.example.test") return route.abort();
      const directory = path.join(project, "www");
      const file = path.resolve(directory, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ path: file });
    });
    await page.goto("https://ios-fixture.example.test/index.html");
    await page.waitForFunction(() => window.iosSmokeReport, null, { timeout: 90000 });
    const report = await page.evaluate(() => window.iosSmokeReport);
    report.browserPreviewOnly = true;
    fs.writeFileSync(path.join(output, "browser-preview.json"), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(output, "browser-preview.png"), fullPage: true });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
