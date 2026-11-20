const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { chromium, webkit } = require("playwright");
const { createContent, element } = require("../scripts/ios-hybrid/build-content");
const { baseline, readReference } = require("../scripts/ios-hybrid/check-baseline");
const content = createContent();
const html = Buffer.from(content.files["chat.html"].base64, "base64").toString("utf8");

test("hybrid login reuses pinned markup styling and symbols without shipping web engines", () => {
  assert.equal(content.revision, baseline.revision);
  for (const name of ["chat-client.css", "xmpp-availability.css"]) {
    assert.equal(crypto.createHash("sha256").update(Buffer.from(content.files[name].base64, "base64")).digest("hex"),
      crypto.createHash("sha256").update(readReference(name)).digest("hex"));
  }
  const original = readReference("chat.html").toString("utf8");
  assert.ok(html.includes(element(original, /<section\b[^>]*\bclass="modal-section account-auth-section"[^>]*>/)));
  assert.match(html, /id="dialogServerSettingsButton"[\s\S]*?<svg viewBox="0 -960 960 960"/);
  assert.match(html, /connect-src 'none'/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), ["ui-language.js", "smileys-catalog.js", "native-session.js", "smileys-presentation.js", "login-presentation.js", "account-presentation.js", "contacts-presentation.js", "features-presentation.js", "chat-presentation.js", "history-presentation.js", "calls-presentation.js"]);
  assert.match(html, /id="conversationSidebar"/);
  assert.match(html, /id="conversationSearchInput"/);
  for (const name of Object.keys(content.files)) assert.doesNotMatch(name, /chat-client\.js|jingle|native-server|config|php|demo/i);
  assert.throws(() => element("<div id=missing>", /<section>/), /Missing/);
});

async function setup(engine, viewport = { width: 390, height: 844 }) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      let sequence = 0;
      window.nativeCommands = [];
      window.nativeSettingsCount = 0;
      let epoch = crypto.randomUUID();
      const messages = new Map();
      const drafts = new Map();
      let selectedPeer = null;
      let selectedKind = "direct";
      const state = phase => ({ version: 1, sequence: ++sequence, phase, errorCode: null,
        epoch, chatAvailable: phase === "connected", callsAvailable: phase === "connected", socialLoginAvailable: false, settingsAvailable: true,
        roster: { status: phase === "connected" ? "loading" : "hidden", contacts: [] }, conversation: null, call: { phase: "idle" } });
      window.nativeState = state("idle");
      window.emitNative = (phase, errorCode = null) => {
        window.nativeState = { ...state(phase), errorCode };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.emitRoster = (contacts, status = "ready") => {
        window.nativeState = { ...state("connected"), roster: { status, contacts } };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      const conversation = () => ({ peer: selectedPeer, kind: selectedKind, draft: drafts.get(selectedPeer) || "", messages: messages.get(selectedPeer) || [], history: "ready",
        canSend: selectedKind === "direct" || window.nativeState.groups?.find(group => group.room === selectedPeer)?.canSpeak === true, canChange: selectedKind === "direct" });
      window.emitExtras = changes => {
        window.nativeState = { ...window.nativeState, sequence: ++sequence, extras: { ...window.nativeState.extras, ...changes } };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.emitAccount = changes => {
        const account = { ...window.nativeState.account, ...changes };
        window.nativeState = { ...window.nativeState, sequence: ++sequence, account, socialLoginAvailable: account.providers?.length > 0 };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.emitHistory = value => {
        window.fixtureHistoryEntries = structuredClone(value.entries);
        window.nativeState = { ...window.nativeState, sequence: ++sequence, history: value };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.emitAdministration = value => {
        window.nativeState = { ...window.nativeState, sequence: ++sequence, groupAdministration: value };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.stageFixtureAttachment = () => {
        drafts.set(selectedPeer, (drafts.get(selectedPeer) || "") + "\nBestand: fixture.pdf\nhttps://fixture.invalid/api/file.php?id=" + "a".repeat(32));
        window.nativeState = { ...window.nativeState, sequence: ++sequence, conversation: conversation() };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.fixtureMessage = (body, outgoing = false, delivery = "unconfirmed") => ({ id: crypto.randomUUID(), body, outgoing, timestamp: 1780000000,
        state: outgoing ? "submitted" : "incoming", delivery, edited: false, retracted: false, reactions: [] });
      window.emitMessages = values => {
        messages.set(selectedPeer, values);
        window.nativeState = { ...window.nativeState, sequence: ++sequence, conversation: conversation() };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.emitCall = changes => {
        window.nativeState = { ...window.nativeState, sequence: ++sequence, call: { ...window.nativeState.call, ...changes }, conversation: null };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.module = {};
      Object.defineProperty(window.module, "exports", { get: () => ({}), set(factory) {
        const client = factory.createClient({ makeID: () => crypto.randomUUID(), postMessage: body => {
          const command = JSON.parse(body);
          window.nativeCommands.push(command);
          if ((/^(chat|calls|groups|files|translation|auth|account|contacts|history)\./.test(command.command) || ["session.logout", "session.cancel", "session.verifySecondFactor"].includes(command.command)) && command.epoch !== epoch) return Promise.reject(new Error("invalidState"));
          if (command.command === "session.login") { epoch = crypto.randomUUID(); window.nativeState = state("checking"); }
          if (["auth.social", "auth.biometric"].includes(command.command)) { epoch = crypto.randomUUID(); window.nativeState = state("checking"); }
          if (command.command === "session.verifySecondFactor") window.nativeState = state("authenticating");
          if (command.command === "session.cancel") window.nativeState = state("idle");
          if (command.command === "session.logout") { epoch = crypto.randomUUID(); messages.clear(); drafts.clear(); selectedPeer = null; window.nativeState = state("signedOut"); }
          if (command.command === "app.openSettings") window.nativeSettingsCount += 1;
          const apply = () => {
            const args = command.arguments;
            if (/^(account|contacts|auth)\./.test(command.command)) window.nativeState = { ...window.nativeState, sequence: ++sequence };
            if (["auth.register", "auth.recover", "contacts.add"].includes(command.command)) window.nativeState.account = { ...window.nativeState.account, notice: "Aanvraag ontvangen; controleer de bevestiging." };
            if (command.command === "account.save") window.nativeState.account = { ...window.nativeState.account,
              profile: { ...window.nativeState.account.profile, name: args.name, phone: args.phone, language: args.language, color: args.color }, notice: "Accountinstellingen opgeslagen." };
            if (command.command === "contacts.block") window.nativeState.account = { ...window.nativeState.account, blocked: args.blocked === "true" ? [args.jid] : [], notice: "Wijziging bevestigd." };
            if (command.command === "contacts.dnd") window.nativeState.account = { ...window.nativeState.account, doNotDisturb: args.enabled === "true" };
            if (/^(chat|calls|groups|files|translation)\./.test(command.command)) {
              if (command.epoch !== epoch) return Promise.reject(new Error("invalidState"));
              window.nativeState = { ...window.nativeState, sequence: ++sequence };
            }
            if (command.command === "chat.open") { selectedPeer = args.peer; selectedKind = args.kind || "direct"; window.nativeState.conversation = conversation(); }
            if (command.command === "chat.close") window.nativeState.conversation = null;
            if (command.command === "chat.draft") { drafts.set(args.peer, args.body); if (selectedPeer === args.peer) window.nativeState.conversation = conversation(); }
            if (command.command === "chat.send") {
              messages.set(args.peer, [...(messages.get(args.peer) || []), window.fixtureMessage(args.body, true)]);
              drafts.set(args.peer, ""); window.nativeState.conversation = conversation();
            }
            if (command.command === "groups.join") {
              const room = args.room.includes("@") ? args.room : args.room + "@conference.localhost";
              selectedPeer = room; selectedKind = "group";
              window.nativeState.groups = [{ room, name: "Familie", joined: true, joining: false, canSpeak: true, subject: "", participants: [args.nickname, "Peer"], canModerate: true }];
              window.nativeState.groupsAvailable = true; window.nativeState.conversation = conversation();
            }
            if (command.command === "groups.subject") { window.nativeState.groups[0].subject = args.subject; window.nativeState.groupNotice = "Onderwerp bevestigd."; }
            if (command.command === "groups.invite") window.nativeState.groupNotice = "Uitnodiging verzonden.";
            if (command.command === "groups.role") window.nativeState.groupNotice = "Rol bevestigd door groepsserver.";
            if (command.command === "groups.leave") { window.nativeState.groups[0].joined = false; window.nativeState.groups[0].canSpeak = false; window.nativeState.conversation = conversation(); }
            if (["chat.open", "chat.close", "calls.start", "groups.leave"].includes(command.command)) window.nativeState.groupAdministration = null;
            if (command.command === "groups.configuration") window.nativeState.groupAdministration = { ...window.nativeState.groupAdministration,
              configuration: { token: crypto.randomUUID(), name: "Familie", description: "Besloten", membersOnly: true, moderated: false, publicRoom: false, persistent: true, allowInvites: true,
                editableFields: ["name", "description", "membersOnly", "publicRoom"] } };
            if (command.command === "groups.configure") window.nativeState.groupAdministration = { ...window.nativeState.groupAdministration, configuration: null };
            if (command.command === "groups.members") window.nativeState.groupAdministration = { ...window.nativeState.groupAdministration, affiliation: args.affiliation, members: ["member@localhost"], configuration: null };
            if (command.command === "groups.affiliation") window.nativeState.groupNotice = "Wijziging bevestigd door de groepsserver.";
            if (command.command.startsWith("history.")) {
              const history = window.nativeState.history;
              window.nativeState.sequence = ++sequence;
              if (command.command === "history.archive") {
                const entry = window.fixtureHistoryEntries.find(value => value.id === args.id); entry.archived = args.archived === "true";
                history.archived = window.fixtureHistoryEntries.filter(value => value.archived).map(value => ({ peer: value.peer, kind: value.kind }));
                if (entry.archived && selectedPeer === entry.peer) { selectedPeer = null; window.nativeState.conversation = null; }
              }
              if (command.command === "history.search") { history.query = args.query; history.archivedOnly = args.archived === "true"; }
              history.entries = window.fixtureHistoryEntries.filter(value => (!history.archivedOnly || value.archived) && (value.name + value.preview).includes(history.query));
              if (command.command === "history.open") {
                const entry = window.fixtureHistoryEntries.find(value => value.id === args.id);
                history.window = { id: entry.id, title: entry.name, messages: [{ id: crypto.randomUUID(), body: "Alleen bekijken :)", outgoing: false, timestamp: 1780000000 }], loading: false, hasEarlier: true, canChat: true };
              }
              if (command.command === "history.earlier") { history.window.messages.unshift({ id: crypto.randomUUID(), body: "Eerder bericht", outgoing: true, timestamp: 1770000000 }); history.window.hasEarlier = false; }
              if (command.command === "history.chat") {
                selectedPeer = window.fixtureHistoryEntries.find(value => value.id === args.id).peer; selectedKind = "direct"; window.nativeState.conversation = conversation(); history.window = null;
              }
              if (command.command === "history.close") history.window = null;
            }
            if (command.command === "translation.disable") window.nativeState.extras = { ...window.nativeState.extras, consent: false, translations: {}, ownRtt: null, remoteRtt: null };
            if (command.command === "translation.settings") {
              window.nativeState.extras = { ...window.nativeState.extras, mode: args.mode, language: args.language, consent: args.consent === "true",
                liveConsent: args.liveConsent === "true", ownLiveConsent: args.ownLiveConsent === "true", translations: {}, ownRtt: null, remoteRtt: null };
            }
            if (["chat.edit", "chat.hide", "chat.retract", "chat.react"].includes(command.command)) {
              const values = messages.get(selectedPeer) || [];
              const message = values.find(value => value.id === args.id);
              if (command.command === "chat.hide") messages.set(selectedPeer, values.filter(value => value.id !== args.id));
              if (command.command === "chat.edit") { message.body = args.body; message.edited = true; }
              if (command.command === "chat.retract") { message.body = "Bericht verwijderd"; message.retracted = true; }
              if (command.command === "chat.react") message.reactions = [{ emoji: args.emoji, count: 1 }];
              window.nativeState.conversation = conversation();
            }
            if (command.command === "calls.start") {
              window.nativeState.conversation = null;
              window.nativeState.call = { phase: "active", id: crypto.randomUUID(), peer: args.peer, mode: args.mode, muted: false,
                cameraEnabled: ["video", "total"].includes(args.mode), remoteCamera: "on", rttReady: ["audio-rtt", "total"].includes(args.mode),
                ownText: "", remoteText: "", canSwitchCamera: true, canSendDtmf: true, videoFit: "contain" };
            }
            if (command.command === "calls.control") {
              const call = window.nativeState.call;
              if (args.id !== call.id) return Promise.reject(new Error("invalidState"));
              if (args.action === "end") { window.nativeState.call = { phase: "idle" }; window.nativeState.conversation = conversation(); }
              if (args.action === "mute") call.muted = !call.muted;
              if (args.action === "camera") call.cameraEnabled = !call.cameraEnabled;
              if (args.action === "rtt") call.ownText = args.value;
              if (args.action === "fit") call.videoFit = args.value;
              if (args.action === "answer") call.phase = "active";
            }
            return { version: 1, id: command.id, snapshot: structuredClone(window.nativeState) };
          };
          if (command.command === "chat.send" && window.holdSend) return new Promise(resolve => { window.releaseSend = () => resolve(apply()); });
          return Promise.resolve(apply());
        } });
        window.nativeFixtureClient = client;
        window.TeleTypTelNativeSession = client;
        delete window.module;
      } });
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      requests.push(url.href);
      const file = content.files[url.pathname === "/" ? "chat.html" : url.pathname.slice(1)];
      if (url.origin !== "https://hybrid.fixture.test" || !file) return route.abort();
      return route.fulfill({ contentType: file.mime + (file.mime.startsWith("text/") ? "; charset=utf-8" : ""),
        body: Buffer.from(file.base64, "base64") });
    });
    await page.goto("https://hybrid.fixture.test/chat.html");
    await page.locator("#accountDialog").waitFor({ state: "visible", timeout: 5000 });
    return { browser, page, errors, requests };
  } catch (error) { await browser.close(); throw error; }
}

for (const engine of [chromium, webkit]) {
  test(engine.name() + ": original web smileys render and insert aliases without changing native messages", { timeout: 60000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      await page.evaluate(() => window.emitRoster([{ jid: "peer@localhost", name: "Peer", presence: "online", canCall: false }]));
      await page.locator('[data-contact-jid="peer@localhost"]').click();
      await page.locator("#hybridEmojiToggle").click();
      assert.equal(await page.locator("#hybridEmojiPanel .smiley-picker-option").count(), 41);
      await page.locator('#hybridEmojiPanel .smiley-picker-option[aria-label="smile :)"]').click();
      assert.equal(await page.locator("#hybridMessageInput").inputValue(), ":)");
      await page.locator("#hybridMessageInput").press("Enter");
      await page.locator("#hybridMessages .smiley-image").waitFor();
      assert.equal(await page.locator("#hybridMessages .smiley-image").getAttribute("src"), "smileys/smile.svg");
      const sent = await page.evaluate(() => window.nativeCommands.find(command => command.command === "chat.send"));
      assert.equal(sent.arguments.body, ":)");
      await page.evaluate(() => window.emitMessages([window.fixtureMessage('<img src="https://tracker.invalid/x"> 🤟 :)')]));
      assert.equal(await page.locator("#hybridMessages img:not(.smiley-image)").count(), 0);
      assert.equal(requests.some(url => url.includes("tracker.invalid")), false); assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": archive history stays read-only restores contacts and closes before normal chat", { timeout: 60000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.evaluate(() => {
        window.emitRoster([{ jid: "peer@localhost", name: "Peer", presence: "online", canCall: false }]);
        window.emitHistory({ available: true, query: "", archivedOnly: false, entries: [{ id: crypto.randomUUID(), peer: "peer@localhost", kind: "direct", name: "Peer", preview: "Hallo", archived: false }], archived: [], window: null });
      });
      await page.locator("#hybridMainMenu summary").click(); await page.locator("#hybridOpenHistory").click();
      await page.locator("#hybridHistoryEntries button").filter({ hasText: "Archiveren" }).click();
      assert.equal(await page.locator('[data-contact-jid="peer@localhost"]').count(), 0);
      await page.locator("#hybridHistoryEntries button").filter({ hasText: "Herstellen" }).click();
      assert.equal(await page.locator('[data-contact-jid="peer@localhost"]').count(), 1);
      await page.locator("#hybridHistoryEntries button[data-history-id]").click();
      await page.locator("#hybridHistoryMessages .smiley-image").waitFor();
      await page.locator("#hybridHistoryEarlier").click();
      assert.match(await page.locator("#hybridHistoryMessages").textContent(), /Eerder bericht/);
      assert.equal(await page.evaluate(() => window.nativeCommands.filter(value => value.command === "chat.displayed" || value.command === "chat.send").length), 0);
      await page.locator("#hybridHistoryChat").click(); await page.locator("#hybridHistory").waitFor({ state: "hidden" });
      assert.equal(await page.locator("#hybridContactTitle").textContent(), "Peer");
      await page.locator("#hybridMainMenu summary").click(); await page.locator("#hybridOpenArchive").click();
      await page.keyboard.press("Escape"); assert.equal(await page.locator("#hybridHistory").isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": owner settings and member authority require explicit confirmation", { timeout: 60000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.evaluate(async () => {
        window.emitRoster([{ jid: "peer@localhost", name: "Peer", presence: "online", canCall: false }]);
        await window.nativeFixtureClient.joinGroup("familie", "Fixture", false);
        window.emitAdministration({ room: "familie@conference.localhost", busy: false, canConfigure: true, canManageMembers: true, configuration: null, affiliation: null, members: [] });
      });
      await page.locator("#hybridStartMenu summary").click();
      await page.locator("#hybridManageGroup").click(); await page.locator("#hybridGroupLoadConfiguration").click();
      await page.locator("#hybridGroupName").fill("Nieuwe familie");
      assert.equal(await page.locator("#hybridGroupModerated").isDisabled(), true);
      await page.locator("#hybridGroupSaveConfiguration").click();
      assert.equal(await page.evaluate(() => window.nativeCommands.some(value => value.command === "groups.configure")), false);
      await page.locator("#hybridGroupConfigurationConfirm").check(); await page.locator("#hybridGroupSaveConfiguration").click();
      await page.locator("#hybridGroupConfiguration").waitFor({ state: "hidden" });
      const command = await page.evaluate(() => window.nativeCommands.find(value => value.command === "groups.configure"));
      assert.equal(command.arguments.name, "Nieuwe familie"); assert.equal(command.arguments.confirmed, "true");
      await page.locator("#hybridGroupLoadMembers").click(); await page.locator("#hybridGroupMemberTarget").selectOption("member@localhost");
      await page.locator("#hybridGroupAffiliation").selectOption("outcast"); await page.locator("#hybridGroupAffiliationConfirm").check();
      await page.locator("#hybridGroupSaveAffiliation").click();
      assert.equal(await page.evaluate(() => window.nativeCommands.find(value => value.command === "groups.affiliation").arguments.peer), "member@localhost");
      await page.evaluate(() => window.emitAdministration({ room: "familie@conference.localhost", busy: false, canConfigure: false, canManageMembers: false, configuration: null, affiliation: null, members: [] }));
      assert.equal(await page.locator("#hybridGroupOwner").isVisible(), false); assert.equal(await page.locator("#hybridGroupMembers").isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": provider login, biometric controls and account entry never use browser authentication", { timeout: 60000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      for (const [provider, button] of [["google", "dialogGoogleLoginFallbackButton"], ["facebook", "dialogFacebookLoginButton"]]) {
        await page.evaluate(() => { window.emitNative("idle"); window.emitAccount({ providers: ["google", "facebook"], entryAvailable: true, registrationAvailable: true, rememberAvailable: true, savedLogin: true }); });
        await page.locator("#" + button).click();
        await page.waitForFunction(name => window.nativeCommands.some(value => value.command === "auth.social" && value.arguments.provider === name), provider);
        await page.locator("#hybridCancel").click();
      }
      await page.evaluate(() => window.emitAccount({ entryAvailable: true, registrationAvailable: true, savedLogin: true, rememberAvailable: true }));
      await page.locator("#hybridBiometric").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "auth.biometric"));
      await page.locator("#hybridCancel").click();
      await page.evaluate(() => window.emitAccount({ entryAvailable: true, registrationAvailable: true }));
      await page.locator("#dialogForgotPasswordButton").click();
      await page.locator("#hybridEntryJid").fill("fixture@example.invalid");
      await page.locator("#hybridEntrySubmit").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "auth.recover"));
      await page.locator('[data-close-account="hybridEntry"]').click();
      await page.locator("#dialogCreateAccountButton").click();
      await page.locator("#hybridEntryJid").fill("new@localhost");
      await page.locator("#hybridEntryName").fill("Fictieve gebruiker");
      await page.locator("#hybridEntryPassword").fill("Fictional123!");
      await page.locator("#hybridEntryRepeat").fill("Fictional123!");
      await page.locator("#hybridEntryConsent").check();
      await page.locator("#hybridEntrySubmit").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "auth.register"));
      assert.equal(await page.locator("#hybridEntryPassword").inputValue(), "");
      assert.equal(await page.locator("#hybridEntryRepeat").inputValue(), "");
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
      assert.equal(requests.some(url => /\/api\/|facebook\.com|google\.com/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": profile forms, native avatars and new contacts remain account scoped", { timeout: 45000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.evaluate(() => {
        window.emitRoster([{ jid: "peer@localhost", name: "Peer", presence: "online" }]);
        const canvas = document.createElement("canvas"); canvas.width = 48; canvas.height = 48;
        const context = canvas.getContext("2d"); context.fillStyle = "#2563eb"; context.fillRect(0, 0, 48, 48);
        const image = canvas.toDataURL("image/jpeg");
        window.emitAccount({ entryAvailable: true, contactsAvailable: true, nativePanels: true, owner: "fixture@localhost", requests: ["new@localhost"],
          profile: { jid: "fixture@localhost", name: "Fixture", phone: "", language: "nl", color: "#2563eb" },
          avatars: { "fixture@localhost": image, "peer@localhost": image } });
      });
      assert.equal(await page.locator("#conversationItems .avatar img").count(), 1);
      await page.locator("#hybridMainMenu summary").click();
      await page.locator("#hybridOpenProfile").click();
      await page.locator("#hybridProfileName").fill("Nieuwe naam");
      await page.locator("#hybridProfileLanguage").selectOption("en");
      await page.locator("#hybridProfileSave").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "account.save" && value.arguments.name === "Nieuwe naam"));
      assert.equal(await page.evaluate(() => Object.hasOwn(window.nativeCommands.find(value => value.command === "account.save").arguments, "accountId")), false);
      await page.locator('[data-close-account="hybridProfile"]').click();
      await page.locator("#hybridMainMenu summary").click();
      await page.locator('[data-native-panel="security"]').click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "account.panel" && value.arguments.panel === "security"));
      await page.locator("#hybridMainMenu summary").click();
      await page.locator("#hybridOpenContacts").click();
      await page.locator("#hybridManagedName").fill("Peer gewijzigd");
      await page.locator("#hybridManagedRename").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "contacts.rename"));
      await page.locator("#hybridManagedBlock").click();
      await page.waitForFunction(() => document.getElementById("hybridManagedBlock").textContent === "Deblokkeren");
      await page.locator("#hybridManagedBlock").click();
      assert.equal(await page.locator("#hybridManagedRemove").isDisabled(), true);
      await page.locator("#hybridManagedConfirm").check();
      await page.locator("#hybridManagedRemove").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "contacts.remove"));
      assert.equal(await page.locator("#hybridManagedConfirm").isChecked(), false);
      await page.locator('[data-close-account="hybridContactManager"]').click();
      await page.locator("#conversationActionsToggle").click();
      await page.locator("#addConversationButton").click();
      await page.locator("#hybridNewContactJid").fill("other@localhost");
      await page.locator("#hybridNewContactName").fill("Other");
      await page.locator("#hybridNewContactSave").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "contacts.add" && value.arguments.presence === "false"));
      await page.locator('[data-close-account="hybridNewContact"]').click();
      await page.locator("#conversationItems .conversation-item").click();
      await page.evaluate(() => window.emitMessages([window.fixtureMessage("Hallo", false), window.fixtureMessage("Hoi", true)]));
      assert.equal(await page.locator("#hybridMessages .avatar img").count(), 2);
      await page.locator("#hybridMainMenu summary").click();
      await page.locator("#hybridOpenProfile").click();
      const covered = await page.evaluate(() => { const message = window.fixtureMessage("Achter het instellingenvenster", false); window.emitMessages([...window.nativeState.conversation.messages, message]); return message.id; });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(id => window.nativeCommands.some(value => value.command === "chat.displayed" && value.arguments.ids.split(",").includes(id)), covered), false);
      await page.locator('[data-close-account="hybridProfile"]').click();
      await page.waitForFunction(id => window.nativeCommands.some(value => value.command === "chat.displayed" && value.arguments.ids.split(",").includes(id)), covered);
      await page.locator("#hybridLogout").click();
      assert.equal(await page.locator("#hybridProfileName").inputValue(), "");
      assert.equal(await page.locator("#hybridConnected .avatar img").count(), 0);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": group join, messaging, invitations and moderation retain native authority", { timeout: 45000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.evaluate(() => { window.emitRoster([{ jid: "peer@localhost", name: "Peer", presence: "online" }]); window.nativeState.groupsAvailable = true; window.emitExtras({}); });
      await page.locator("#conversationActionsToggle").click();
      await page.locator("#addGroupButton").click();
      await page.locator("#hybridGroupRoom").fill("familie");
      await page.locator("#hybridGroupNickname").fill("Fixture");
      await page.locator("#hybridGroupCreate").check();
      await page.locator("#hybridGroupJoinForm button[type=submit]").click();
      await page.locator("#hybridConversation").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridContactPresence").textContent(), "Groep");
      assert.equal(await page.locator("#hybridStartTotal").isDisabled(), true);
      await page.locator("#hybridMessageInput").fill("Bericht voor de groep");
      await page.locator("#hybridSend").click();
      await page.locator("#hybridMessages .message").waitFor();
      assert.equal(await page.evaluate(() => window.nativeCommands.find(value => value.command === "chat.send").arguments.kind), "group");
      assert.equal(await page.locator(".hybrid-message-receipt.is-read").count(), 0);
      await page.locator("#hybridStartMenu summary").click();
      const groupMenuReachable = await page.locator("#hybridManageGroup").evaluate(button => {
        const bounds = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      });
      assert.equal(groupMenuReachable, true, "chat bubbles cannot cover the group menu");
      await page.locator("#hybridManageGroup").click();
      await page.locator("#hybridGroupSubject").fill("Nieuw onderwerp");
      await page.locator("#hybridGroupSubjectSave").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "groups.subject"));
      await page.locator("#hybridGroupInvite").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "groups.invite"));
      await page.locator("#hybridGroupOccupant").selectOption("Peer");
      await page.locator("#hybridGroupRole").selectOption("visitor");
      await page.locator("#hybridGroupRoleSave").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "groups.role" && value.arguments.nickname === "Peer"));
      await page.locator("#hybridGroupLeave").click();
      await page.locator('[data-close-feature="hybridGroupManage"]').click();
      assert.equal(await page.locator("#hybridMessageInput").isDisabled(), true);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": private compact translations and native attachment staging do not send messages", { timeout: 45000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      await page.evaluate(() => window.emitRoster([{ jid: "peer@localhost", name: "Fixture", presence: "online" }]));
      await page.locator("#conversationItems .conversation-item").click();
      await page.evaluate(() => window.emitExtras({ ready: true, available: true, attachmentAvailable: true, mode: "manual", language: "en", consent: true }));
      await page.locator("#hybridMessageInput").fill("Mijn concept");
      await page.locator("#hybridPickAttachment").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "files.pick"));
      await page.evaluate(() => window.stageFixtureAttachment());
      await page.waitForFunction(() => document.getElementById("hybridMessageInput").value.includes("fixture.pdf"));
      assert.match(await page.locator("#hybridMessageInput").inputValue(), /^Mijn concept/);
      await page.evaluate(() => window.emitMessages([window.fixtureMessage("Hallo van de ander", false)]));
      await page.locator("#hybridMessages .message button.hybrid-message-more").click();
      await page.locator('[data-message-action="translate"]').click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "translation.message"));
      await page.evaluate(() => {
        const id = window.nativeState.conversation.messages[0].id;
        window.emitExtras({ translations: { [id]: "Hello from the other person" }, fileMessages: [id] });
      });
      await page.locator("#hybridMessages .hybrid-translation summary").waitFor();
      assert.equal(await page.locator("#hybridMessages .hybrid-translation summary").textContent(), "Vertaling");
      await page.locator("#hybridMessages .hybrid-file-button").click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "files.open"));
      await page.evaluate(() => window.emitExtras({ translations: {} }));
      await page.waitForFunction(() => !document.querySelector("#hybridMessages .hybrid-translation"));
      await page.locator("#hybridStartMenu summary").click();
      await page.locator("#hybridTranslationOptions").click();
      await page.locator("#hybridTranslationConsent").uncheck();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "translation.disable"));
      await page.locator('[data-close-feature="hybridTranslationSettings"]').click();
      await page.locator("#hybridLogout").click();
      assert.equal(await page.locator("#hybridTranslationConsent").isChecked(), false);
      assert.equal(await page.evaluate(() => window.nativeCommands.filter(value => value.command === "chat.send").length), 0);
      assert.equal(requests.some(url => /\/api\/|googleapis|translate\.google/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": native chat sends safely, displays real receipts and exposes message actions", { timeout: 45000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.evaluate(() => window.emitRoster([{ jid: "peer@localhost", name: "Fictieve Gebruiker", presence: "online", canCall: true }]));
      await page.locator("#conversationItems .conversation-item").click();
      await page.locator("#hybridMessageInput").fill("Hallo vanuit de webballon");
      await page.locator("#hybridSend").click();
      await page.locator("#hybridMessages .message.self").waitFor();
      assert.match(await page.locator("#hybridMessages").textContent(), /Hallo vanuit de webballon/);
      assert.equal(await page.locator("#hybridMessageInput").inputValue(), "");
      assert.equal(await page.locator(".hybrid-message-receipt.is-read").count(), 0);
      await page.evaluate(() => window.emitMessages([
        window.fixtureMessage("<img src=x onerror=alert(1)>", false),
        window.fixtureMessage("Afgeleverd", true, "delivered"), window.fixtureMessage("Gelezen", true, "displayed")
      ]));
      await page.waitForFunction(() => document.querySelectorAll("#hybridMessages .message").length === 3);
      assert.equal(await page.locator("#hybridMessages img, #hybridMessages script").count(), 0);
      assert.equal(await page.locator(".hybrid-message-receipt.is-read").count(), 1);
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "chat.displayed"));
      await page.locator("#hybridMessages .message.self").last().locator("button").click();
      await page.locator('[data-message-action="edit"]').click();
      await page.locator("#hybridEditBody").fill("Bewerkt bericht");
      await page.locator("#hybridConfirmAction").click();
      await page.waitForFunction(() => document.getElementById("hybridMessages").textContent.includes("Bewerkt bericht"));
      await page.locator("#hybridMessages .message.self").last().locator("button").click();
      await page.locator('[data-message-action="react"]').click();
      await page.locator(".hybrid-message-reactions").waitFor();
      await page.locator("#hybridMessages .message.self").last().locator("button").click();
      await page.locator('[data-message-action="retract"]').click();
      await page.waitForFunction(() => document.getElementById("hybridMessages").textContent.includes("Bericht verwijderd"));
      await page.locator("#hybridMessages .message").first().locator("button").click();
      await page.locator('[data-message-action="hide"]').click();
      await page.waitForFunction(() => document.querySelectorAll("#hybridMessages .message").length === 2);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": typing during an outstanding send survives replies and account changes", { timeout: 45000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.evaluate(() => window.emitRoster([{ jid: "peer@localhost", name: "Fixture", presence: "online", canCall: true }]));
      await page.locator("#conversationItems .conversation-item").click();
      await page.locator("#hybridMessageInput").fill("Eerste bericht");
      await page.evaluate(() => { window.holdSend = true; });
      await page.locator("#hybridSend").click();
      await page.waitForFunction(() => Boolean(window.releaseSend));
      await page.locator("#hybridMessageInput").fill("Nieuw concept tijdens verzenden");
      await page.evaluate(() => window.releaseSend());
      await page.waitForFunction(() => !document.getElementById("hybridSend").disabled);
      assert.equal(await page.locator("#hybridMessageInput").inputValue(), "Nieuw concept tijdens verzenden");
      assert.equal(await page.locator("#hybridMessages .message").count(), 1);
      await page.locator("#hybridLogout").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridMessageInput").inputValue(), "");
      assert.equal(await page.locator("#hybridMessages .message").count(), 0);
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": chat and TC share one native engine; RTT, DTMF and rotation stay separate", { timeout: 45000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      await page.evaluate(() => window.emitRoster([{ jid: "peer@localhost", name: "Fixture", presence: "online", canCall: true }]));
      await page.locator("#conversationItems .conversation-item").click();
      await page.locator("#hybridMessageInput").fill("Bewaard concept");
      await page.locator("#hybridStartTotal").click();
      await page.locator("#hybridCallPanel").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridConversation").isVisible(), false);
      assert.equal(await page.locator("#hybridConnected").evaluate(value => value.inert), true);
      await page.locator("#hybridOwnRtt").fill("Dit is live RTT, geen chatbericht");
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "calls.control" && value.arguments.action === "rtt"));
      assert.equal(await page.evaluate(() => window.nativeCommands.filter(value => value.command === "chat.send").length), 0);
      await page.locator("#hybridCallMute").click();
      await page.waitForFunction(() => document.getElementById("hybridCallMute").classList.contains("is-off"));
      await page.locator("#hybridCallCamera").click();
      await page.evaluate(() => window.emitCall({ cameraEnabled: false, remoteCamera: "unknown" }));
      assert.equal(await page.locator("#hybridVideoSurface").isVisible(), true);
      await page.evaluate(() => window.emitCall({ cameraEnabled: false, remoteCamera: "off", remoteText: "Tekst van de ander" }));
      await page.waitForFunction(() => document.getElementById("hybridCallPanel").classList.contains("is-rtt-only"));
      assert.equal(await page.locator("#hybridVideoSurface").isVisible(), false);
      for (const [width, height] of [[390, 844], [844, 390], [834, 1194], [1194, 834], [390, 410]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator("#hybridOwnRtt").inputValue(), "Dit is live RTT, geen chatbericht");
        assert.equal(await page.locator("#hybridRemoteRtt").textContent(), "Tekst van de ander");
        for (const selector of ["#hybridEndCall", "#hybridOwnRtt"]) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(box && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, selector + " reachable after rotation");
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#hybridDtmfToggle").click();
      assert.deepEqual(await page.locator("#hybridDtmf button").evaluateAll(values => values.map(value => value.dataset.tone)), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]);
      await page.locator('#hybridDtmf button[data-tone="#"]').click();
      await page.waitForFunction(() => window.nativeCommands.some(value => value.command === "calls.control" && value.arguments.action === "dtmf" && value.arguments.value === "#"));
      await page.locator("#hybridEndCall").click();
      await page.locator("#hybridConversation").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridMessageInput").inputValue(), "Bewaard concept");
      await page.locator("#hybridStartMenu summary").click();
      await page.locator("#hybridStartAudio").click();
      await page.locator("#hybridCallPanel").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridCallCamera").isVisible(), false);
      assert.equal(await page.locator("#hybridCallRtt").isVisible(), false);
      await page.locator("#hybridEndCall").click();
      await page.evaluate(() => window.emitCall({ phase: "ringing", id: crypto.randomUUID(), peer: "peer@localhost", mode: "audio" }));
      await page.locator("#hybridAnswerCall").click();
      await page.waitForFunction(() => document.getElementById("hybridCallStatus").textContent === "Verbonden");
      assert.equal(await page.evaluate(() => window.nativeCommands.filter(value => value.command === "calls.control" && value.arguments.action === "answer").length), 1);
      await page.locator("#hybridEndCall").click();
      assert.equal(requests.some(url => /\/api\/|jingle|chat-client\.js/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": login native states two-factor errors settings and logout", { timeout: 45000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      assert.equal(await page.locator("#accountDialogTitle").textContent(), "Aanmelden");
      assert.equal(await page.evaluate(() => document.activeElement.tagName), "BODY");
      assert.equal(await page.locator("#dialogConnectButton").isDisabled(), true);
      assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isVisible(), true);
      assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isDisabled(), true);
      assert.equal(await page.locator("#dialogFacebookLoginButton").isDisabled(), true);
      assert.equal(await page.locator("#dialogRememberPasswordToggle").isChecked(), false);
      await page.locator("#dialogServerSettingsButton").click();
      assert.equal(await page.evaluate(() => window.nativeSettingsCount), 1);
      assert.equal(await page.locator("input[type=url], input[name=server], #dialogXmppDomainInput").count(), 0);
      await page.locator("#dialogJidInput").fill("fixture@localhost");
      await page.locator("#dialogPasswordInput").fill("fixture-password");
      await page.locator("#dialogConnectButton").click();
      await page.locator("#hybridStartup[open]").waitFor({ state: "visible" });
      assert.match(await page.locator("#hybridStartupStatus").textContent(), /Chatserver controleren/);
      assert.equal(await page.locator("#dialogPasswordInput").inputValue(), "");
      assert.equal(await page.evaluate(() => window.nativeCommands.filter(value => value.command === "session.login").length), 1);
      await page.evaluate(() => window.emitNative("failed", "certificate"));
      assert.match(await page.locator("#hybridStartupStatus").textContent(), /certificaat/);
      assert.equal(await page.locator("#hybridProgress").isVisible(), false);
      await page.locator("#hybridBack").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#dialogJidInput").inputValue(), "fixture@localhost");
      await page.locator("#dialogPasswordInput").fill("fixture-password");
      await page.locator("#dialogPasswordInput").press("Enter");
      await page.evaluate(() => window.emitNative("awaitingSecondFactor"));
      await page.locator("#loginTwoFactorSection").waitFor({ state: "visible" });
      assert.notEqual(await page.evaluate(() => document.activeElement.id), "loginTwoFactorCodeInput");
      await page.locator("#loginTwoFactorCodeInput").fill("000000");
      await page.locator("#verifyLoginTwoFactorButton").click();
      await page.evaluate(() => window.emitNative("awaitingSecondFactor", "invalidSecondFactor"));
      assert.match(await page.locator("#dialogAccountStatus").textContent(), /code is niet juist/);
      await page.locator("#loginTwoFactorCodeInput").fill("123456");
      await page.locator("#verifyLoginTwoFactorButton").click();
      await page.evaluate(() => window.emitNative("connected"));
      await page.locator("#hybridConnected").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridStartup[open]").count(), 0);
      await page.locator("#hybridLogout").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#loginTwoFactorCodeInput").inputValue(), "");
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
      assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
      assert.equal(requests.some(url => /\/api\/|facebook\.com|google\.com|chat-client\.js|jingle/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": iPhone and iPad rotation preserve form and keyboard focus is not forced", { timeout: 45000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.locator("#dialogJidInput").fill("fixture@localhost");
      await page.locator("#dialogPasswordInput").fill("rotation-fixture");
      await page.locator("#dialogPasswordInput").blur();
      for (const [width, height] of [[390, 844], [844, 390], [834, 1194], [1194, 834], [390, 410]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator("#dialogPasswordInput").inputValue(), "rotation-fixture");
        assert.equal(await page.locator("#dialogJidInput").inputValue(), "fixture@localhost");
        assert.equal(await page.evaluate(() => document.activeElement.tagName), "BODY");
        const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(size.width <= size.viewport + 1, "no horizontal document overflow");
        for (const name of ["dialogConnectButton", "dialogServerSettingsButton"]) {
          await page.locator("#" + name).scrollIntoViewIfNeeded();
          const box = await page.locator("#" + name).boundingBox();
          assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
            name + " stays reachable at " + width + "x" + height);
        }
      }
      const colors = await page.locator("#dialogConnectButton").evaluate(button => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }));
      assert.deepEqual(colors, { background: "rgb(37, 99, 235)", color: "rgb(255, 255, 255)" });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": native contacts search presence selection privacy and rotation", { timeout: 45000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      await page.evaluate(() => window.emitNative("connected"));
      await page.locator("#hybridConnected").waitFor({ state: "visible" });
      await page.evaluate(() => window.emitRoster([
        { jid: "peer@localhost", name: "Édward Fixture", presence: "online" },
        { jid: "other@localhost", name: "<img src=x onerror=alert(1)>", presence: "unknown" }
      ]));
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 2);
      for (const row of await page.locator("#conversationItems .conversation-item").all()) {
        const rowBox = await row.boundingBox();
        const dotBox = await row.locator(".presence-dot").boundingBox();
        assert.ok(rowBox && dotBox && dotBox.x >= rowBox.x && dotBox.x + dotBox.width <= rowBox.x + rowBox.width + 1,
          "presence dot remains inside its contact row");
      }
      assert.equal(await page.locator("#conversationItems img, #conversationItems script").count(), 0);
      assert.match(await page.locator("#conversationItems").textContent(), /<img src=x onerror=alert\(1\)>/);
      await page.locator("#conversationSearchInput").fill("edward");
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 1);
      await page.locator("#conversationItems .conversation-item").focus();
      await page.evaluate(() => window.emitRoster([
        { jid: "peer@localhost", name: "Édward Fixture", presence: "away" },
        { jid: "other@localhost", name: "<img src=x onerror=alert(1)>", presence: "offline" }
      ]));
      assert.equal(await page.evaluate(() => document.activeElement.dataset.contactJid), "peer@localhost");
      assert.match(await page.locator("#conversationItems .conversation-item").getAttribute("aria-label"), /Afwezig/);
      await page.locator("#conversationItems .conversation-item").press("Enter");
      assert.equal(await page.locator("#hybridContactTitle").textContent(), "Édward Fixture");
      await page.locator("#hybridConversation").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridMessageInput").isDisabled(), false);
      for (const [width, height] of [[390, 844], [844, 390], [834, 1194], [1194, 834]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator("#hybridContactTitle").textContent(), "Édward Fixture");
        assert.equal(await page.locator("#conversationSearchInput").inputValue(), "edward");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const box = await page.locator("#hybridLogout").boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#hybridContactsBack").click();
      await page.locator("#conversationSearchInput").fill("");
      await page.locator("#conversationActionsToggle").click();
      assert.equal(await page.locator("#addConversationButton").isDisabled(), true);
      assert.equal(await page.locator("#addGroupButton").isDisabled(), true);
      await page.evaluate(() => window.emitRoster([], "unavailable"));
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 0);
      assert.match(await page.locator("#hybridRosterStatus").textContent(), /niet beschikbaar/);
      await page.locator("#hybridLogout").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 0);
      assert.equal(await page.locator("#conversationSearchInput").inputValue(), "");
      assert.equal(await page.locator("#hybridContactJid").textContent(), "");
      assert.equal(requests.some(url => /\/api\/|chat-client\.js|jingle/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
