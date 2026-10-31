const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
const render = client.slice(client.indexOf("  function renderConversations()"), client.indexOf("  function normalizeConversationSearchText("));
const navigation = client.slice(client.indexOf("  function focusConversationComposer()"), client.indexOf("  function syncActiveConversationAvatarButton("));

test("iPhone contact taps do not open the keyboard; returning to contacts blurs the composer", { timeout: 30000 }, async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.route("**/*", route => route.abort());
    await page.setContent(markup);
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, "chat-client.css"), "utf8") });
    await page.evaluate(({ render, navigation }) => {
      document.body.className = "viewport-phone";
      document.body.dataset.deviceClass = "phone";
      document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
      window.contactsFixture = new Function(render + navigation + `
        const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
        const state = { activeTabId: 'chat', conversations: [
          { id: 'one', name: 'Contact One', peer: 'one@example.test' },
          { id: 'two', name: 'Contact Two', peer: 'two@example.test' } ] };
        const isOwnContact = () => false, isBlockedConversation = () => false, isArchivedConversation = () => false;
        const normalizeConversationSearchText = value => value;
        const ensurePublicProfileForConversation = () => {};
        const createAvatarElement = () => document.createElement('span');
        const conversationDisplayName = item => item.name;
        const conversationListPreviewText = () => 'Fixture';
        const conversationListTimeText = () => '';
        const conversationPresence = () => 'offline';
        const createConversationUnreadBadge = () => document.createElement('span');
        const closeConversationContextMenu = () => {}, closeCallMenus = () => {};
        const updateComposerAvailability = () => { el.messageInput.disabled = false; };
        const syncConversationMessageState = () => {};
        const selectConversation = item => { state.activeConversationId = item.id; };
        const renderActiveConversation = () => document.body.classList.toggle('conversation-open', Boolean(state.activeConversationId));
        el.backToContactsButton.addEventListener('click', closeActiveConversation);
        renderConversations();
        return { state, focusConversationComposer };
      `)();
    }, { render, navigation });
    const selectionRules = await page.evaluate(() => {
      const selection = element => {
        const style = getComputedStyle(element);
        return style.webkitUserSelect || style.userSelect;
      };
      const message = document.createElement("div");
      message.className = "message-body";
      message.textContent = "Copyable chat message";
      document.querySelector("#messageTimeline").appendChild(message);
      return {
        contact: selection(document.querySelector(".conversation-item strong")),
        menu: selection(document.querySelector("#logoutButton")),
        menuLabel: selection(document.querySelector("#mobileActionsPanel .sr-only")),
        search: selection(document.querySelector("#conversationSearchInput")),
        composer: selection(document.querySelector("#messageInput")),
        message: selection(message)
      };
    });
    assert.equal(selectionRules.contact, "none");
    assert.equal(selectionRules.menu, "none");
    assert.equal(selectionRules.menuLabel, "none");
    assert.equal(selectionRules.search, "text");
    assert.equal(selectionRules.composer, "text");
    assert.notEqual(selectionRules.message, "none");
    await page.getByRole("button", { name: /Contact One/ }).tap();
    assert.equal(await page.evaluate(() => contactsFixture.state.activeConversationId), "one");
    assert.equal(await page.evaluate(() => document.activeElement.matches("input,textarea")), false);
    await page.locator("#messageInput").tap();
    assert.equal(await page.evaluate(() => document.activeElement.id), "messageInput");
    await page.locator("#backToContactsButton").tap();
    assert.equal(await page.evaluate(() => document.activeElement.id === "messageInput"), false);
    await page.getByRole("button", { name: /Contact Two/ }).tap();
    assert.equal(await page.evaluate(() => contactsFixture.state.activeConversationId), "two");
    assert.equal(await page.evaluate(() => document.activeElement.matches("input,textarea")), false);
  } finally { await browser.close(); }
});
