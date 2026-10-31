const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium, webkit, devices } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const origin = "https://live-rtt.teletyptel.test";
const profile = { accountId: "rtt-fixture", jid: "sam@example.test", displayName: "Sam (test)",
  providerId: "example-provider", preferredLanguage: "ned", peer: "noor@example.test", liveRttEnabled: true,
  xmppWebSocket: "wss://live-rtt.teletyptel.test/websocket", xmppDomain: "example.test" };
const hook = `
  window.rttFixture = {
    endCall() { state.call = null; updateCallUi(); },
    group() {
      state.call = null;
      updateCallUi();
      const conversation = ensureConversationForPeer("languages@conference.example.test", "group", "Language group");
      state.activeConversationId = conversation.id;
      renderActiveConversation();
    },
    frame(xml) { handleXmppIncomingFrame(xml); },
    async translationLanguage(language) {
      byId("translationTarget").value = language;
      byId("translationMode").value = "automatic";
      byId("translationConsent").checked = true;
      byId("translationMode").dispatchEvent(new Event("change"));
      await messageTranslation.savePreferences();
    },
    xmpp(xml) {
      const stanza = new DOMParser().parseFromString(xml, "application/xml").documentElement;
      handleXmppRttMessage(activeConversation(), stanza, stanza.getElementsByTagNameNS("urn:xmpp:rtt:0", "rtt")[0], stanza.getAttribute("from"), "chat");
    },
    relay(text) { applyRelayEnvelope({ type: "rtt", from: "noor@example.test", to: "sam@example.test", text }); },
    call() { state.call = createCallState("fixture-call", "noor@example.test", "callee", "video", true); state.totalConversationTextVisible = true; updateCallUi(); },
    jingle(text) { applyJingleRttSyncDraft(state.call, { text, from: "noor@example.test" }); },
    t140(text) { applyT140DataChannelText(state.call, text); },
    packet(text) { return handleJingleRttSyncPacket(state.call, text); },
    final(text) { applyJingleRttSyncFinal(state.call, { text, from: "noor@example.test", messageId: "fixture-final" }); },
    sendOwn() {
      const packets = [];
      const socket = state.relaySocket;
      state.relaySocket = { readyState: WebSocket.OPEN, send: (payload) => packets.push(JSON.parse(payload)) };
      try { sendRelayFinalMessage(el.messageInput.value); } finally { state.relaySocket = socket; }
      return packets;
    },
    sendXmppOwn() {
      const packets = [];
      const original = { mode: state.mode, socket: state.xmppSocket, session: state.xmppSession, rtt: el.rttToggle.checked };
      state.mode = "xmpp";
      state.xmppSocket = { readyState: WebSocket.OPEN, send: (xml) => packets.push(xml) };
      state.xmppSession = { ...original.session, authenticated: true, streamManagement: null };
      el.rttToggle.checked = true;
      try {
        sendXmppRttPacket("edit", el.messageInput.value);
        sendComposerMessage({ preventDefault() {} });
      } finally {
        state.mode = original.mode;
        state.xmppSocket = original.socket;
        state.xmppSession = original.session;
        el.rttToggle.checked = original.rtt;
      }
      return packets.map((xml) => {
        const document = new DOMParser().parseFromString(xml, "application/xml");
        const rtt = document.getElementsByTagNameNS("urn:xmpp:rtt:0", "rtt")[0];
        return { xml, valid: !document.querySelector("parsererror"), to: document.documentElement.getAttribute("to"),
          type: document.documentElement.getAttribute("type"), event: rtt?.getAttribute("event"),
          draft: rtt?.textContent, body: document.getElementsByTagName("body")[0]?.textContent };
      });
    },
    close() { state.activeConversationId = null; renderActiveConversation(); },
    messages() { return activeConversation().messages; }
  };
`;
const mainSource = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
assert.ok(mainSource.trimEnd().endsWith("})();"));
const instrumented = mainSource.replace(/\}\)\(\);\s*$/, hook + "})();");

async function check(engine, device, name) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...device, serviceWorkers: "block", locale: "nl-NL", colorScheme: "light" });
    const failures = [];
    const translations = [];
    const writes = [];
    let preferencesFailure = false;
    let accountFailure = false;
    let preferenceWrites = 0;
    let accountWrites = 0;
    let preferences = { targetLanguage: "en", mode: "manual", automaticConsent: false, liveRttConsent: true, ownLiveRttConsent: false };
    await context.routeWebSocket("**/*", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/translation.php") {
        if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, accountId: profile.accountId,
          csrfToken: "fixture", available: true, languages: { en: "English", nl: "Nederlands" },
          preferences } });
        const input = route.request().postDataJSON();
        if (input.action === "preferences") {
          preferenceWrites += 1;
          if (preferencesFailure) return route.fulfill({ status: 503, json: { ok: false, error: "failed" } });
          preferences = { targetLanguage: input.targetLanguage, mode: input.mode, automaticConsent: input.automaticConsent,
            liveRttConsent: input.liveRttConsent, ownLiveRttConsent: input.ownLiveRttConsent };
          return route.fulfill({ json: { ok: true, preferences } });
        }
        assert.equal(input.consent, true);
        translations.push(input);
        return route.fulfill({ json: { ok: true, translation: { text: "Translated: " + input.text } } });
      }
      if (route.request().method() !== "GET") {
        writes.push(route.request().postData() || "");
        if (url.pathname === "/api/account.php") {
          accountWrites += 1;
          if (accountFailure) return route.fulfill({ status: 503, json: { ok: false, error: "save_failed" } });
          return route.fulfill({ json: { ok: true, account: profile } });
        }
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === "/config/account-profile.json") return route.fulfill({ json: profile });
      if (url.pathname === "/config/google-maps.json") return route.fulfill({ json: {} });
      if (url.pathname === "/api/account.php") return route.fulfill({ json: { ok: true, account: null } });
      if (url.pathname === "/api/history.php") return route.fulfill({ json: { ok: true, messages: [{
        conversationPeer: "noor@example.test", conversationName: "Noor (test)", conversationKind: "contact",
        messageId: "fixture-history", direction: "peer", text: "Hello from history", status: "history",
        from: "noor@example.test", timestamp: "2026-10-26T09:00:00Z"
      }], calls: [] } });
      if (url.pathname === "/api/group-metadata.php") return route.fulfill({ json: { ok: true, groups: [] } });
      if (url.pathname === "/api/rtc-config.php") return route.fulfill({ json: { iceServers: [] } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 403, json: { ok: false } });
      if (url.pathname === "/chat-client.js") return route.fulfill({ contentType: "text/javascript", body: instrumented });
      const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()
          || ![".html", ".js", ".css", ".json", ".lng", ".svg", ".png", ".ico", ".webmanifest"].includes(path.extname(file))) {
        return route.fulfill({ status: 404, body: "Not found" });
      }
      return route.fulfill({ path: file });
    });
    await context.addInitScript((account) => {
      localStorage.setItem("teletyptel.theme", "light");
      sessionStorage.setItem("teletyptel.serverAccountSession", JSON.stringify(account));
    }, profile);
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(origin + "/chat.html");
    await page.waitForFunction(() => !document.body.classList.contains("account-booting"));
    await page.locator(".conversation-item").filter({ hasText: "Noor (test)" }).click();
    await page.waitForFunction(() => !document.getElementById("translationTarget").disabled);
    assert.equal(await page.locator("#translationSave").count(), 0, "No separate translation save button");
    assert.equal(translations.length, 0, "Opening chat history never sends drafts");
    assert.equal(await page.locator(".message-translate-button").count(), 0, "No separate translate icon in message bubbles");
    await page.locator("article[data-message-id]").filter({ hasText: "Hello from history" }).dispatchEvent("contextmenu", { clientX: 120, clientY: 220 });
    assert.equal(await page.locator("#messageContextTranslateButton").innerText(), "Vertalen");
    assert.equal(await page.locator("#messageContextTranslateButton").isVisible(), true);
    await page.locator("#messageContextTranslateButton").press("Escape");
    assert.equal(await page.locator("#messageContextMenu").isVisible(), false);
    await page.locator("article[data-message-id]").filter({ hasText: "Hello from history" }).dispatchEvent("contextmenu", { clientX: 120, clientY: 220 });
    await page.locator("#messageContextTranslateButton").click();
    assert.equal(await page.locator('#accountDialog [data-settings-panel="privacy"]').isVisible(), true);
    assert.equal(await page.locator("#translationManualConsent").isChecked(), false);
    assert.equal(translations.length, 0, "Missing consent opens Privacy without sending the selected text");
    await page.locator("#closeAccountDialogButton").click();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const tick = async (milliseconds) => { await page.clock.runFor(milliseconds); await page.waitForTimeout(80); };
    await page.locator("#messageInput").fill("v");
    await page.locator('[data-local-draft="true"] .translation-notice').filter({ hasText: "Eigen vertaling staat nog uit" }).waitFor();
    assert.equal(translations.length, 0, "No unconsented draft is sent while displaying setup instructions");
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-translation-notice-" + name + ".png") });
    await page.locator('[data-local-draft="true"] .translation-notice button').click();
    assert.equal(await page.locator('#accountDialog [data-settings-panel="privacy"]').isVisible(), true);
    assert.equal(await page.locator("#translationManualConsent").isChecked(), false);
    await page.locator("#translationManualConsent").check();
    await page.locator("#translationOwnLiveConsent").check();
    await page.locator("#translationMode").selectOption("automatic");
    await page.locator("#dialogSaveAccountButton").click();
    await page.locator("#dialogAccountStatus").filter({ hasText: "toestemming" }).waitFor();
    assert.equal(accountWrites, 0, "Validate translation consent before saving profile");
    assert.equal(preferenceWrites, 0);
    await page.locator("#translationMode").selectOption("manual");
    accountFailure = true;
    await page.locator("#dialogSaveAccountButton").click();
    await page.locator("#dialogAccountStatus").filter({ hasText: "save_failed" }).waitFor();
    assert.equal(preferenceWrites, 0, "Profile failure does not save preferences");
    accountFailure = false;
    preferencesFailure = true;
    await page.locator("#dialogSaveAccountButton").click();
    await page.locator("#dialogAccountStatus").filter({ hasText: "maar de vertaalvoorkeuren niet" }).waitFor();
    assert.equal(await page.locator("#accountDialog").isVisible(), true);
    assert.equal(await page.locator("#translationOwnLiveConsent").isChecked(), true, "Failed save retains edits");
    assert.equal(preferences.ownLiveRttConsent, false, "Failed save does not claim consent persisted");
    assert.equal((await context.cookies()).some((cookie) => cookie.name.startsWith("teletyptel_translation_")), false, "Failed settings save does not persist a consent cookie");
    assert.equal(translations.length, 0, "Translation remains paused after failure");
    preferencesFailure = false;
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText("Vertaalvoorkeuren opgeslagen voor jouw account.", { exact: true }).waitFor();
    await page.locator("#dialogAccountStatus").filter({ hasText: "Instellingen opgeslagen" }).waitFor();
    assert.equal(preferences.ownLiveRttConsent, true);
    assert.equal((await context.cookies()).find((cookie) => cookie.name.startsWith("teletyptel_translation_")).value, "allowed");
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-privacy-cookies-" + name + ".png") });
    const savedWrites = preferenceWrites;
    await page.locator("#dialogSaveAccountButton").click();
    await page.locator("#dialogAccountStatus").filter({ hasText: "Instellingen opgeslagen" }).waitFor();
    assert.equal(preferenceWrites, savedWrites, "Unchanged preferences are not resubmitted");
    await page.locator("#translationReload").click();
    await page.waitForFunction(() => !document.getElementById("translationTarget").disabled);
    assert.equal(await page.locator("#translationOwnLiveConsent").isChecked(), true, "Main save persisted preferences across reload");
    await page.locator("#closeAccountDialogButton").click();
    await page.locator("#messageInput").fill("");
    assert.equal(await page.locator(".translation-notice").count(), 0);
    let incomingSequence = 0;
    const xmpp = (body, event = "new") => page.evaluate(({ body, event, sequence }) => window.rttFixture.xmpp(
      '<message from="noor@example.test" to="sam@example.test"><rtt xmlns="urn:xmpp:rtt:0" seq="' + sequence + '" event="' + event + '">' + body + '</rtt></message>'
    ), { body, event, sequence: incomingSequence++ });
    await xmpp("<t>Hello RTT</t>");
    assert.equal(await page.locator("#remoteDraftText").textContent(), "Hello RTT", "Original updates without waiting for provider");
    assert.equal(translations.length, 0);
    await tick(800);
    await page.locator('[data-remote-draft="true"] .live-rtt-translation').filter({ hasText: "Translated: Hello RTT" }).waitFor();
    assert.equal(translations.length, 1);
    await xmpp('<e n="3"/><t>world</t>', "edit");
    assert.equal(await page.locator("#remoteDraftText").textContent(), "Hello world");
    assert.equal(await page.getByText("Translated: Hello RTT", { exact: true }).count(), 0);
    await tick(3000);
    await page.locator("#remoteDraftTranslation").getByText("Translated: Hello world", { exact: true }).waitFor();
    await xmpp("", "cancel");
    assert.equal(await page.locator(".live-rtt-translation").count(), 0, "XMPP cancel clears provisional UI");
    await xmpp("<t>New sentence</t>");
    assert.equal(await page.locator("#remoteDraftText").textContent(), "New sentence", "XMPP new resets original text");
    await page.evaluate(() => window.rttFixture.relay("Relay draft"));
    await tick(3000);
    await page.locator("#remoteDraftTranslation").getByText("Translated: Relay draft", { exact: true }).waitFor();
    assert.equal(await page.locator(".call-controls > #interpreterButton").count(), 1, "Interpreter button belongs to the call toolbar, outside the hidden call-mode group");
    const interpreterButton = await page.locator("#interpreterButton").boundingBox();
    const totalCallButton = await page.locator("#startTotalCallOption").boundingBox();
    assert.ok(interpreterButton && totalCallButton && Math.abs(interpreterButton.y - totalCallButton.y) < 2, "Interpreter and RTT buttons share one row before a call");
    await page.evaluate(() => { window.rttFixture.call(); window.rttFixture.jingle("Video call text"); });
    assert.equal(await page.locator("#interpreterButton").isVisible(), true, "Interpreter button remains available during a call");
    await tick(3000);
    await page.locator("#totalConversationRemoteTranslation").getByText("Translated: Video call text", { exact: true }).waitFor();
    await page.evaluate(() => window.rttFixture.t140("!"));
    assert.equal(await page.locator("#totalConversationRemoteText").textContent(), "Video call text!");
    await page.locator("#totalConversationRemoteTranslation").getByText("Translated: Video call text", { exact: true }).waitFor();
    await page.locator("#totalConversationRemoteTranslation .live-rtt-translation-progress").filter({ hasText: "Wordt bijgewerkt" }).waitFor();
    await tick(3000);
    await page.locator("#totalConversationRemoteTranslation").getByText("Translated: Video call text!", { exact: true }).waitFor();
    const translationBounds = await page.locator("#totalConversationRemoteTranslation .live-rtt-translation > div").evaluate((element) => ({
      bottom: element.getBoundingClientRect().bottom,
      panelBottom: element.closest(".tc-text-line").getBoundingClientRect().bottom,
      color: getComputedStyle(element).color
    }));
    assert.ok(translationBounds.bottom <= translationBounds.panelBottom, "Translation is not clipped below the provisional label");
    assert.equal(translationBounds.color, "rgb(248, 250, 252)", "Readable contrast on the always-dark call overlay");
    assert.equal(await page.locator("#totalConversationRemoteTranslation .live-rtt-translation-text").evaluate((element) => getComputedStyle(element).fontSize), "16px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Live translation fits phone viewport");
    const composerBounds = await page.locator("#composerForm").evaluate((element) => ({ bottom: element.getBoundingClientRect().bottom, height: innerHeight }));
    assert.ok(composerBounds.bottom <= composerBounds.height + 1, "Visible live translation does not push the composer below the phone viewport");
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-live-rtt-" + name + ".png") });
    await page.locator("#messageInput").fill("Mijn eigen tekst");
    await tick(3000);
    await page.locator("#totalConversationLocalTranslation").getByText("Translated: Mijn eigen tekst", { exact: true }).waitFor();
    assert.equal(await page.locator("#messageInput").inputValue(), "Mijn eigen tekst", "Own translation never rewrites the composer");
    assert.equal(translations.at(-1).liveDirection, "self");
    await page.locator("#totalConversationRemoteTranslation").getByText("Translated: Video call text!", { exact: true }).waitFor();
    assert.equal(await page.locator('[data-local-draft="true"] .live-rtt-translation-text').textContent(), "Translated: Mijn eigen tekst");
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-own-rtt-" + name + ".png") });
    const sentPackets = await page.evaluate(() => window.rttFixture.sendOwn());
    assert.ok(sentPackets.some((packet) => packet.type === "message" && packet.text === "Mijn eigen tekst"), "Sending still sends the original, not its preview");
    assert.ok(!JSON.stringify(sentPackets).includes("Translated:"));
    assert.equal(await page.locator("#messageInput").inputValue(), "");
    assert.equal(await page.locator("#totalConversationLocalTranslation .live-rtt-translation").count(), 0);
    await page.locator("#totalConversationRemoteTranslation").getByText("Translated: Video call text!", { exact: true }).waitFor();
    for (const text of ["123", "true", '"Hallo"', "{}", "[]", " 123 ", "Hoi 👋"]) {
      await page.evaluate(async text => {
        window.rttFixture.jingle("");
        await window.rttFixture.packet(text);
      }, text);
      assert.equal(await page.locator("#totalConversationRemoteText").textContent(), text, "Raw RTT dispatcher preserves literal text");
    }
    await page.evaluate(() => window.rttFixture.final("Final message"));
    assert.equal(await page.locator(".live-rtt-translation").count(), 0, "Final message clears draft translation");
    const xmppOriginal = "XMPP <test> & 👋";
    await page.locator("#messageInput").fill(xmppOriginal);
    await tick(3000);
    await page.locator('#totalConversationLocalTranslation .live-rtt-translation-text').filter({ hasText: "Translated: " + xmppOriginal }).waitFor();
    const xmppPackets = await page.evaluate(() => window.rttFixture.sendXmppOwn());
    assert.equal(xmppPackets.length, 2, "XMPP emits one draft and one final stanza");
    assert.ok(xmppPackets.every((packet) => packet.valid && packet.to === "noor@example.test" && packet.type === "chat"), "Valid XML addressed to the intended contact");
    assert.equal(xmppPackets[0].event, "reset");
    assert.equal(xmppPackets[0].draft, xmppOriginal, "XMPP RTT carries the original, including XML characters and emoji");
    assert.equal(xmppPackets[1].body, xmppOriginal, "Final XMPP body carries the original, not its translation");
    assert.ok(!JSON.stringify(xmppPackets).includes("Translated:"), "Translation never leaks into XMPP stanzas");
    assert.equal(await page.locator("#messageInput").inputValue(), "");
    assert.equal(await page.locator('[data-local-draft="true"]').count(), 0, "Sending over XMPP clears the local draft");
    const messages = await page.evaluate(() => window.rttFixture.messages());
    assert.ok(messages.some((message) => message.direction === "self" && message.text === "Mijn eigen tekst"));
    assert.ok(messages.some((message) => message.text === "Final message"));
    assert.ok(messages.some((message) => message.direction === "self" && message.text === xmppOriginal));
    assert.ok(!JSON.stringify(messages).includes("Translated:"), "Translations never enter stored messages");
    await page.evaluate(() => window.rttFixture.endCall());
    const menuButton = page.locator("#messageContextTranslateButton");
    let manualConfirmations = 0;
    const confirmManual = async (dialog) => { manualConfirmations += 1; await dialog.accept(); };
    page.on("dialog", confirmManual);
    for (const message of [messages.find((item) => item.text === xmppOriginal), messages.find((item) => item.text === "Hello from history")]) {
      const bubble = page.locator(`[data-message-id="${message.id}"]`);
      const openMenu = () => bubble.dispatchEvent("contextmenu", { clientX: 120, clientY: 220 });
      const beforeManual = translations.length;
      await openMenu();
      assert.equal(await menuButton.innerText(), "Vertalen");
      await menuButton.click();
      await bubble.locator(".message-translation-result").filter({ hasText: "Translated: " + message.text }).waitFor();
      assert.equal(await page.locator("#messageContextMenu").isVisible(), false, "Menu closes after action");
      assert.equal(translations.length, beforeManual + 1);
      assert.equal(translations.at(-1).text, message.text, "Context menu translates the selected original");
      assert.equal(translations.at(-1).automatic, false);
      await openMenu();
      assert.equal(await menuButton.innerText(), "Vertaling verbergen");
      await menuButton.click();
      assert.equal(await bubble.locator(".message-translation").count(), 0, "Hidden translation leaves no empty border");
      await openMenu();
      assert.equal(await menuButton.innerText(), "Vertaling tonen");
      await menuButton.click();
      await bubble.locator(".message-translation-result").waitFor();
      assert.equal(translations.length, beforeManual + 1, "Showing again uses the cached translation");
    }
    assert.equal(manualConfirmations, 0, "Consent is managed in Privacy, never in repeated popups");
    page.off("dialog", confirmManual);
    await page.locator("article[data-message-id]").filter({ hasText: "Hello from history" }).dispatchEvent("contextmenu", { clientX: 120, clientY: 220 });
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-translation-menu-" + name + ".png") });
    await menuButton.press("Escape");
    await page.evaluate(() => window.rttFixture.group());
    const room = "languages@conference.example.test";
    const groupRtt = (nick, event, sequence, body) => page.evaluate((xml) => window.rttFixture.frame(xml),
      `<message xmlns="jabber:client" from="${room}/${nick}" to="sam@example.test" type="groupchat"><rtt xmlns="urn:xmpp:rtt:0" event="${event}" seq="${sequence}">${body}</rtt></message>`);
    await groupRtt("Noor", "new", 10, "<t>Hello group</t>");
    await groupRtt("Ayse", "new", 20, "<t>Merhaba grup</t>");
    assert.equal(await page.locator('[data-remote-draft="true"]').count(), 2, "Two MUC participants have independent drafts");
    await tick(3000);
    await tick(3000);
    for (const original of ["Hello group", "Merhaba grup"]) {
      assert.ok((await page.locator('[data-remote-draft="true"]').allTextContents()).some((text) => text.includes("Translated: " + original)));
    }
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-group-translation-" + name + ".png") });
    await groupRtt("Noor", "edit", 12, "<t> must not appear</t>");
    assert.ok(!(await page.locator('[data-remote-draft="true"]').allTextContents()).join("").includes("must not appear"), "Sequence gap does not modify the draft");
    await groupRtt("Noor", "edit", 11, "<t> still ignored</t>");
    assert.ok(!(await page.locator('[data-remote-draft="true"]').allTextContents()).join("").includes("still ignored"), "Out-of-sync sender waits for reset");
    await groupRtt("Noor", "reset", 30, "<t>A👋BC</t>");
    await groupRtt("Noor", "edit", 31, '<e p="2" n="8"/>');
    const noorDraft = page.locator(`[data-draft-sender="${room}/Noor"]`);
    assert.ok((await noorDraft.textContent()).includes("BC"), "Excess erase clips at the start and preserves following characters");
    await groupRtt("Noor", "edit", 32, '<e p="1" n="0"/>');
    await groupRtt("Noor", "unknown", 33, '<t>wrong</t>');
    assert.ok(!(await noorDraft.textContent()).includes("wrong"));
    await page.evaluate((xml) => window.rttFixture.frame(xml), `<message xmlns="jabber:client" from="${room}/Noor" to="sam@example.test" type="groupchat" id="muc-final"><body>Noor final</body></message>`);
    assert.equal(await noorDraft.count(), 0, "Final message clears only that participant");
    assert.equal(await page.locator(`[data-draft-sender="${room}/Ayse"]`).count(), 1, "Other participant keeps their draft and translation");
    await groupRtt("Ayse", "cancel", 21, "");
    assert.equal(await page.locator('[data-remote-draft="true"]').count(), 0);
    await groupRtt("Ayse", "new", 40, '<t>Leaving room</t>');
    await page.evaluate((xml) => window.rttFixture.frame(xml), `<presence xmlns="jabber:client" from="${room}/Ayse" type="unavailable"/>`);
    assert.equal(await page.locator('[data-remote-draft="true"]').count(), 0, "Leaving participant clears their own draft");
    const targetLanguage = name === "iphone" ? "nl" : "en";
    await page.evaluate((language) => window.rttFixture.translationLanguage(language), targetLanguage);
    const beforeGroupMessage = translations.length;
    const groupMessage = `<message xmlns="jabber:client" from="${room}/Ayse" to="sam@example.test" type="groupchat" id="muc-automatic"><body>Original group greeting</body></message>`;
    await page.evaluate((xml) => window.rttFixture.frame(xml), groupMessage);
    await page.locator('.message-translation-result').filter({ hasText: "Translated: Original group greeting" }).waitFor();
    assert.equal(translations.length, beforeGroupMessage + 1, "New received MUC message automatically translates once");
    assert.equal(translations.at(-1).targetLanguage, targetLanguage, "Each client uses its own target language");
    await page.evaluate((xml) => window.rttFixture.frame(xml), groupMessage);
    assert.equal(translations.length, beforeGroupMessage + 1, "Repeated group stanza does not duplicate translation");
    await groupRtt("Ayse", "new", 50, '<t>Close before translation</t>');
    const count = translations.length;
    await page.evaluate(() => window.rttFixture.close());
    await tick(5000);
    assert.equal(translations.length, count, "Leaving the conversation cancels queued translation");
    assert.ok(!writes.join("\n").includes("Translated:"), "No translated drafts sent to history endpoints");
    assert.deepEqual(failures, []);
    await page.clock.resume();
    console.log("Live RTT integration passed: " + name + " — actual XMPP, relay, Jingle and T.140 handlers with fixture translation only.");
  } finally {
    await browser.close();
  }
}

(async () => {
  await check(chromium, devices["Pixel 7"], "android");
  await check(webkit, devices["iPhone 13"], "iphone");
})().catch((error) => { console.error(error); process.exitCode = 1; });
