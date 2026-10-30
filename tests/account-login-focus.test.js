const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
const section = (start, end) => {
  const first = client.indexOf(start);
  const last = client.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first);
  return client.slice(first, last);
};
const functions = section("  function openAccountDialog(", "  function updateAccountDialogMode(")
  + section("  function focusAccountDialogField(", "  function startGoogleLoginFromDialog(")
  + section("  function showLoginTwoFactorChallenge(", "  async function verifyLoginTwoFactorFromDialog(")
  + section("  function showAccountDialogError(", "  function accountDialogStatusText(");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: mobile authentication waits for an explicit input tap`, { timeout: 30000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", route => route.abort());
      await page.setContent(markup);
      await page.evaluate(source => {
        document.querySelector(".app-shell").hidden = true;
        window.focusedInputs = [];
        document.addEventListener("focusin", event => {
          if (event.target.matches("input, textarea, select")) window.focusedInputs.push(event.target.id);
        });
        window.accountFocus = new Function(source + `
          const byId = id => document.getElementById(id);
          const el = Object.fromEntries([...document.querySelectorAll("[id]")].map(element => [element.id, element]));
          const state = { accountDialogMode: "signin", accountGateRequired: true, pendingLoginTwoFactor: null };
          const setAccountGateRequired = required => { state.accountGateRequired = required; };
          const syncAccountDialogFromControls = () => {};
          const renderSettingsPanels = () => {};
          const ensureAccountSettingsPanel = () => {};
          const updateAccountDialogMode = () => { el.loginTwoFactorSection.hidden = !state.pendingLoginTwoFactor; };
          const renderGoogleSdkLoginButton = () => {};
          const currentAccountProfile = () => ({});
          const serverSettingsControls = () => [];
          const t = (key, fallback) => fallback;
          const accountDialogStatusText = t;
          return { openAccountDialog, showLoginTwoFactorChallenge, showAccountDialogError, state };
        `)();
      }, functions);
      for (const deviceClass of ["phone", "tablet"]) {
        await page.evaluate(deviceClass => {
          document.body.dataset.deviceClass = deviceClass;
          window.focusedInputs = [];
          window.accountFocus.openAccountDialog({ required: true });
        }, deviceClass);
        await page.waitForFunction(() => document.activeElement.id === "accountDialogTitle");
        assert.deepEqual(await page.evaluate(() => window.focusedInputs), [], "Opening login must not focus an editable field");
        await page.locator("#dialogJidInput").click();
        assert.equal(await page.evaluate(() => document.activeElement.id), "dialogJidInput", "User can still tap to type");
        await page.evaluate(() => {
          window.focusedInputs = [];
          window.accountFocus.showLoginTwoFactorChallenge({ accountId: "fixture" });
        });
        await page.waitForFunction(() => document.activeElement.id === "accountDialogTitle");
        assert.deepEqual(await page.evaluate(() => window.focusedInputs), [], "OAuth/2FA handoff must not reopen the keyboard automatically");
        await page.evaluate(() => window.accountFocus.showAccountDialogError({ message: "Testfout", fieldId: "dialogPasswordInput" }));
        assert.equal(await page.evaluate(() => document.activeElement.id), "accountDialogTitle");
        await page.evaluate(() => {
          window.accountFocus.state.pendingLoginTwoFactor = null;
          window.accountFocus.openAccountDialog({ mode: "reset", required: true });
        });
        await page.waitForFunction(() => document.activeElement.id === "accountDialogTitle");
        await page.waitForTimeout(30);
        assert.deepEqual(await page.evaluate(() => window.focusedInputs), [], "Reset-password screen also waits for a tap");
      }
      await page.evaluate(() => {
        document.body.dataset.deviceClass = "desktop";
        window.accountFocus.openAccountDialog({ required: true });
      });
      await page.waitForFunction(() => document.activeElement.id === "dialogJidInput");
      await page.evaluate(() => {
        document.body.dataset.deviceClass = "phone";
        document.getElementById("dialogJidInput").blur();
        window.focusedInputs = [];
        window.accountFocus.openAccountDialog({ required: true });
        document.getElementById("accountDialog").hidden = true;
      });
      await page.waitForTimeout(30);
      assert.deepEqual(await page.evaluate(() => window.focusedInputs), [], "A delayed focus cannot target a closed login dialog");
    } finally { await browser.close(); }
  });
}
