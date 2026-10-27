const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit, devices } = require("playwright");

(async () => {
  for (const [engine, device] of [[chromium, devices["Pixel 7"]], [webkit, devices["iPhone 13"]]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ ...device, serviceWorkers: "block" });
      await context.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Fixture</title>" }));
      const page = await context.newPage();
      await page.goto("https://fixture.test/");
      await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../php/public/chat-xmpp-translation.js"), "utf8") });
      const result = await page.evaluate(async () => {
        const sent = [];
        const service = "translation@example.test/service";
        const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml").documentElement;
        let forgedAccepted = null;
        let behavior = "normal";
        const client = window.TeleTypTelXmppTranslation.create({ connected: () => true, send: (xml) => {
          sent.push(xml);
          const request = parse(xml);
          const id = request.getAttribute("id");
          const target = request.getElementsByTagNameNS("urn:xmpp:langtrans", "translation")[0]?.getAttribute("destination_lang");
          queueMicrotask(() => {
            if (behavior === "silent") return;
            if (!target) {
              const payload = request.getElementsByTagNameNS("urn:xmpp:langtrans:items", "query").length
                ? '<query xmlns="urn:xmpp:langtrans:items"><item source_lang="nl" destination_lang="en"/><item source_lang="nl" destination_lang="tr"/></query>'
                : '<query xmlns="http://jabber.org/protocol/disco#info"><feature var="urn:xmpp:langtrans"/></query>';
              client.handleIq(parse(`<iq type="result" from="${service}" id="${id}">${payload}</iq>`));
              return;
            }
            const reply = `<iq type="result" from="${service}" id="${id}"><x xmlns="urn:xmpp:langtrans"><translation source_lang="nl" destination_lang="${target}" engine="Google">Private ${target} &amp; &lt;safe&gt;</translation></x></iq>`;
            forgedAccepted = client.handleIq(parse(reply.replace(service, "attacker@example.test")));
            client.handleIq(parse(reply));
          });
          return true;
        } });
        client.configure(service);
        const english = await client.translate({ text: "Hallo <groep> & 👋", targetLanguage: "en", automatic: true });
        const turkish = await client.translate({ text: "Hallo <groep> & 👋", targetLanguage: "tr", liveRtt: true, liveDirection: "self" });
        behavior = "silent";
        const controller = new AbortController();
        const cancelled = client.translate({ text: "Cancelled", targetLanguage: "en" }, controller.signal).then(() => false, () => true);
        await Promise.resolve();
        controller.abort();
        const cancelledOk = await cancelled;
        const disconnected = client.translate({ text: "Disconnect", targetLanguage: "en" }).then(() => false, () => true);
        await Promise.resolve();
        client.disconnect();
        return { english, turkish, forgedAccepted, cancelledOk, disconnectedOk: await disconnected,
          packets: sent.map((xml) => {
            const packet = parse(xml);
            return { to: packet.getAttribute("to"), type: packet.getAttribute("type"), name: packet.localName,
              source: packet.getElementsByTagNameNS("urn:xmpp:langtrans", "source")[0]?.textContent,
              direction: packet.getElementsByTagNameNS("urn:teletyptel:translation:0", "context")[0]?.getAttribute("direction") };
          }) };
      });
      assert.equal(result.english.translation.text, "Private en & <safe>");
      assert.equal(result.turkish.translation.text, "Private tr & <safe>");
      assert.equal(result.forgedAccepted, false);
      assert.equal(result.cancelledOk, true);
      assert.equal(result.disconnectedOk, true);
      assert.ok(result.packets.every((packet) => packet.name === "iq" && packet.type === "get" && packet.to === "translation@example.test/service"));
      assert.equal(result.packets[2].source, "Hallo <groep> & 👋");
      assert.equal(result.packets[3].direction, "self");
    } finally { await browser.close(); }
  }
  console.log("XEP-0171 browser transport passed on Android/iPhone emulation: private IQ, languages, XML, sender validation, abort and disconnect.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
