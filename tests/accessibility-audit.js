const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const output = path.resolve(__dirname, "../artifacts/accessibility-2026-11-04");
const axePath = path.join(output, "axe.min.js");
const expectedHash = "880970c081707360e64f34cea25ff91892f5bc95675b0776925b9709dd8a68bb";
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

function contrast(first, second) {
  const luminance = hex => {
    const channels = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function run() {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(axePath)).digest("hex");
  if (hash !== expectedHash) throw new Error("Use the documented, pinned axe-core 4.10.3 audit artifact.");
  const report = {
    generatedAt: new Date().toISOString(), axeVersion: "4.10.3", axeSha256: hash,
    method: "Isolated source DOM/CSS fixtures; application scripts removed; synthetic data; all requests intercepted. Not a live-app, native-device or screen-reader audit.",
    contrast: {
      unusedSelectionTokenPair: contrast("eef6ff", "dbeafe"),
      renderedSelectedPreview: contrast("eef6ff", "2563eb"),
      interpreterFocusOnWhite: contrast("ffb000", "ffffff"),
      answerButtonText: contrast("ffffff", "16a34a")
    },
    cases: []
  };
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://accessibility-audit.test") return route.abort();
        if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|svg|png|ico)$/.test(file) || !fs.existsSync(file)) {
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({ path: file });
      });
      for (const fixture of [
        { name: "chat-desktop-light", width: 1280, height: 800, mode: "chat" },
        { name: "chat-reflow-320", width: 320, height: 800, mode: "chat" },
        { name: "tc-phone-portrait", width: 390, height: 844, mode: "tc" },
        { name: "tc-phone-landscape", width: 844, height: 390, mode: "tc" },
        { name: "tc-tablet-portrait", width: 834, height: 1194, mode: "tc" },
        { name: "tc-tablet-landscape", width: 1194, height: 834, mode: "tc" },
        { name: "incoming-desktop", width: 1280, height: 800, mode: "incoming" }
      ]) {
        await page.setViewportSize({ width: fixture.width, height: fixture.height });
        await page.goto("https://accessibility-audit.test/chat.html");
        await page.evaluate(fixture => {
          const byId = id => document.getElementById(id);
          const phone = fixture.name.includes("phone") || fixture.width === 320;
          const tablet = fixture.name.includes("tablet");
          const device = phone ? "phone" : tablet ? "tablet" : "desktop";
          document.body.dataset.deviceClass = device;
          document.body.dataset.theme = "light";
          document.body.className = `device-${device} viewport-${device} conversation-open`;
          if (phone || tablet) document.body.classList.add("device-ios");
          document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
          byId("conversationItems").innerHTML = '<button type="button" class="conversation-item selected"><span class="conversation-text"><strong>Audit contact</strong><span>Testbericht voor contrast</span></span><span class="conversation-time">12:00</span></button>';
          byId("messageTimeline").innerHTML = '<p>Fictief auditbericht.</p>';
          if (fixture.mode === "tc") {
            document.body.classList.add("call-active", "tc-call-active", "tc-text-visible-active", "tc-text-full-active");
            const landscape = fixture.width > fixture.height;
            document.body.classList.add(landscape ? "viewport-landscape" : "viewport-portrait");
            if (phone && landscape) document.body.classList.add("tc-phone-landscape-active");
            document.documentElement.style.setProperty("--visual-viewport-height", `${fixture.height}px`);
            byId("callPanel").hidden = false;
            byId("callPanel").className = "call-panel tc-text-full no-call-video no-remote-video";
            byId("localVideo").hidden = true;
            byId("remoteVideo").hidden = true;
            byId("totalConversationTextPanel").hidden = false;
            byId("totalConversationRemoteText").textContent = "Fictieve live tekst van de andere deelnemer.";
            byId("totalConversationLocalText").disabled = false;
            byId("totalConversationLocalText").value = "Mijn fictieve antwoord";
            byId("totalConversationLocalPreviousText").hidden = true;
            byId("totalConversationRemotePreviousText").hidden = true;
            byId("hangupCallPanelButton").hidden = false;
            document.querySelector(".call-mode-buttons").hidden = true;
            byId("totalConversationLocalText").focus();
          }
          if (fixture.mode === "incoming") {
            byId("incomingCallDialog").hidden = false;
            byId("dialogAnswerButton").focus();
          }
        }, fixture);
        await page.addScriptTag({ path: axePath });
        const result = await page.evaluate(async () => {
          const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
          const simplify = entries => entries.map(entry => ({
            id: entry.id, impact: entry.impact, help: entry.help, helpUrl: entry.helpUrl,
            nodes: entry.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary }))
          }));
          const preview = document.querySelector(".conversation-text > span");
          const local = document.getElementById("totalConversationLocalText");
          const visible = element => element.getClientRects().length > 0;
          const bounds = element => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
          };
          return {
            violations: simplify(result.violations), incomplete: simplify(result.incomplete), passedRules: result.passes.length,
            measurements: {
              viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
              selectedPreview: { color: getComputedStyle(preview).color, background: getComputedStyle(preview.closest("button")).backgroundColor },
              tcInput: visible(local) ? { ...bounds(local), outline: getComputedStyle(local).outlineStyle, caret: getComputedStyle(local).caretColor } : null,
              callControls: [...document.querySelectorAll(".call-media-controls button")].filter(visible).map(element => ({ id: element.id, ...bounds(element) }))
            }
          };
        });
        if (fixture.mode === "incoming") {
          result.tabSequence = [];
          for (let count = 0; count < 5; count += 1) {
            await page.keyboard.press("Tab");
            result.tabSequence.push(await page.evaluate(() => ({ id: document.activeElement.id, insideDialog: Boolean(document.activeElement.closest("#incomingCallDialog")) })));
          }
        }
        report.cases.push({ engine: engine.name(), fixture, ...result });
        fs.writeFileSync(path.join(output, "accessibility-observations.json"), JSON.stringify(report, null, 2));
        console.log(`${engine.name()} ${fixture.name}: ${result.violations.length} rule violations; ${result.incomplete.length} manual-review rules`);
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, "accessibility-observations.json"), JSON.stringify(report, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
