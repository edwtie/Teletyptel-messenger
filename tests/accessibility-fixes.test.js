const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const contrast = (first, second) => {
  const luminance = color => color.match(/\d+/g).slice(0, 3).map(Number)
    .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: interpreter polling keeps action identity and a contrasting focus indicator`, { timeout: 30000 }, async () => {
    const source = fs.readFileSync(path.join(root, "tolk/tolk.js"), "utf8");
    const helpers = source.slice(source.indexOf("  const node ="), source.indexOf("  const nameFor ="));
    const refresh = source.slice(source.indexOf("  const refreshDashboard ="), source.indexOf("  const poll ="));
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<div id="workspace"><p id="profileStatus" role="status"></p><button id="register">Register</button><label id="availabilityLabel"><input type="checkbox" id="available"></label><div id="rooms"></div><div id="queue" role="region" aria-label="Requests"></div></div>');
      await page.addStyleTag({ path: path.join(root, "tolk/tolk.css") });
      await page.evaluate(source => {
        window.deskData = { accountId: "interpreter", profile: { status: "enabled", available: 0 }, rooms: [],
          queue: [{ room_id: "first", created: 10, inline_call: 0 }] };
        window.desk = new Function(source + `
          const byId = id => document.getElementById(id);
          let accountId;
          const api = async () => window.deskData;
          const action = async (action, data) => { window.lastAction = { action, ...data }; };
          const perform = callback => callback(), status = () => {};
          return { refreshDashboard };
        `)();
        return window.desk.refreshDashboard();
      }, helpers + refresh);
      await page.locator("#queue button").first().focus();
      await page.evaluate(() => { window.originalAction = document.activeElement; });
      for (let count = 0; count < 3; count += 1) {
        await page.evaluate(() => window.desk.refreshDashboard());
        assert.equal(await page.evaluate(() => document.activeElement === window.originalAction), true);
      }
      const colors = await page.locator("#queue button").first().evaluate(element => [getComputedStyle(element).outlineColor, getComputedStyle(element.parentElement).backgroundColor]);
      assert.ok(contrast(...colors) >= 3);
      await page.evaluate(async () => {
        window.deskData.queue.unshift({ room_id: "new", created: 20, inline_call: 0 });
        await window.desk.refreshDashboard();
      });
      assert.equal(await page.evaluate(() => document.activeElement === window.originalAction), true);
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.lastAction?.roomId === "first");
      await page.evaluate(async () => {
        window.deskData.queue = []; await window.desk.refreshDashboard();
      });
      assert.equal(await page.evaluate(() => document.activeElement.id), "queue");
    } finally { await browser.close(); }
  });

  test(`${name}: modal containment, nested dialogs, restoration and answer contrast`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", route => route.abort());
      await page.setContent(html);
      await page.addStyleTag({ path: path.join(root, "chat-client.css") });
      await page.evaluate(() => {
        document.body.className = "";
        document.body.dataset.theme = "light";
        const opener = document.createElement("button");
        opener.id = "fixtureOpener"; opener.textContent = "Open";
        document.body.prepend(opener);
        opener.focus();
      });
      await page.addScriptTag({ path: path.join(root, "chat-modal.js") });
      for (const id of ["incomingCallDialog", "accountDialog", "contactProfileDialog"]) {
        await page.evaluate(id => { document.getElementById(id).hidden = false; }, id);
        for (const key of [...Array(20).fill("Tab"), ...Array(20).fill("Shift+Tab")]) {
          await page.keyboard.press(key);
          assert.equal(await page.evaluate(id => document.getElementById(id).contains(document.activeElement), id), true);
        }
        assert.equal(await page.locator("#fixtureOpener").evaluate(element => element.inert), true);
        await page.evaluate(() => document.getElementById("fixtureOpener").focus());
        assert.equal(await page.evaluate(id => document.getElementById(id).contains(document.activeElement), id), true);
        if (id === "incomingCallDialog") {
          for (const theme of ["light", "dark"]) {
            await page.evaluate(theme => { document.body.dataset.theme = theme; }, theme);
            for (const hover of [false, true]) {
              if (hover) await page.locator("#dialogAnswerButton").hover();
              const colors = await page.locator("#dialogAnswerButton").evaluate(element => {
                const style = getComputedStyle(element); return [style.color, style.backgroundColor];
              });
              assert.ok(contrast(...colors) >= 4.5, `${theme} answer contrast ${contrast(...colors)}`);
            }
          }
        }
        await page.evaluate(id => { document.getElementById(id).hidden = true; }, id);
        assert.equal(await page.evaluate(() => document.activeElement.id), "fixtureOpener");
        assert.equal(await page.locator("#fixtureOpener").evaluate(element => element.inert), false);
      }
      await page.evaluate(() => {
        const account = document.getElementById("accountDialog"); account.hidden = false;
        document.getElementById("accountDialogTitle").focus();
      });
      await page.evaluate(() => { document.getElementById("contactProfileDialog").hidden = false; });
      await page.keyboard.press("Tab");
      await page.evaluate(() => { document.getElementById("contactProfileDialog").hidden = true; });
      assert.equal(await page.evaluate(() => document.getElementById("accountDialog").contains(document.activeElement)), true);
      await page.evaluate(() => {
        const dialog = document.getElementById("callKeypadDialog");
        window.savedInert = new Map([...document.body.children].filter(element => element !== dialog)
          .map(element => [element, element.inert]));
        for (const element of window.savedInert.keys()) element.inert = true;
        dialog.showModal();
      });
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.getElementById("callKeypadDialog").contains(document.activeElement)), true);
      await page.evaluate(() => {
        document.getElementById("callKeypadDialog").close();
        for (const [element, inert] of window.savedInert) element.inert = inert;
      });
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.getElementById("accountDialog").contains(document.activeElement)), true);
      await page.evaluate(() => { document.getElementById("accountDialog").hidden = true; });
      assert.equal(await page.locator("#fixtureOpener").evaluate(element => element.inert), false);
    } finally { await browser.close(); }
  });

  test(`${name}: conversation polling preserves the focused row and its current action`, { timeout: 30000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<input id="search"><div id="items"></div>');
      const start = client.indexOf("  function renderConversations()");
      const end = client.indexOf("  function normalizeConversationSearchText", start);
      await page.evaluate(source => {
        window.renderFixture = new Function(source + `
          const el = { conversationItems: document.getElementById("items"), conversationSearchInput: document.getElementById("search"),
            peerInput: {}, messageInput: {} };
          const state = { conversations: [{ id: "a", peer: "old" }, { id: "b", peer: "second" }], activeTabId: "chat" };
          const isOwnContact = () => false, isBlockedConversation = () => false, isArchivedConversation = () => false;
          const normalizeConversationSearchText = text => text, conversationMatchesSearch = () => true;
          const ensurePublicProfileForConversation = () => {}, updateComposerAvailability = () => {};
          const createAvatarElement = () => document.createElement("span"), createConversationUnreadBadge = createAvatarElement;
          const conversationDisplayName = item => item.peer, conversationListPreviewText = () => "", conversationListTimeText = () => "", conversationPresence = () => "online";
          const selectConversation = item => { window.selectedPeer = item.peer; };
          const closeConversationContextMenu = () => {}, renderActiveConversation = () => {}, syncConversationMessageState = () => {}, focusConversationComposer = () => {};
          return { renderConversations, state };
        `)();
        window.renderFixture.renderConversations();
        window.originalRow = document.querySelector('[data-conversation-id="a"]');
        window.originalRow.focus();
      }, client.slice(start, end));
      await page.evaluate(() => {
        for (let count = 0; count < 3; count += 1) {
          window.renderFixture.state.conversations = [{ id: "b", peer: "second" }, { id: "a", peer: "updated" }];
          window.renderFixture.renderConversations();
        }
      });
      assert.equal(await page.evaluate(() => document.activeElement === window.originalRow), true);
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => window.selectedPeer), "updated");
      await page.evaluate(() => {
        window.renderFixture.state.conversations = []; window.renderFixture.renderConversations();
      });
      assert.equal(await page.evaluate(() => document.activeElement.id), "search");
    } finally { await browser.close(); }
  });
}
