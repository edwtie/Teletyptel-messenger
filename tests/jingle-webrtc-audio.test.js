const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  assert.ok(require("../scripts/ios-testflight/bundle-frontend").assetFiles().includes("jingle-webrtc-audio.js"));
  const html = fs.readFileSync(path.join(__dirname, "../php/public/chat.html"), "utf8");
  assert.ok(html.indexOf('src="jingle-session.js') < html.indexOf('src="jingle-webrtc-audio.js'));
  assert.match(fs.readFileSync(path.join(__dirname, "../php/public/service-worker.js"), "utf8"), /jingle-webrtc-audio\.js/);
  const browser = await chromium.launch({ headless: true, args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
  const pages = new Map();
  const queue = [];
  const wire = [];
  const failures = [];
  let finished = false;
  let corruptAnswers = false;
  let pump;
  try {
    for (const name of ["caller", "receiver"]) {
      const page = await browser.newPage();
      pages.set(`${name}@example.test/browser`, page);
      page.on("pageerror", error => failures.push(error.message));
      await page.route("https://jingle-audio.teletyptel.test/**", route => route.fulfill({
        contentType: "text/html", body: "<!doctype html><title>Isolated Jingle audio test</title>"
      }));
      await page.goto("https://jingle-audio.teletyptel.test/");
      await page.exposeFunction("queueIq", xml => {
        if (corruptAnswers && xml.includes('action="session-accept"')) {
          xml = xml.replace(/(<fingerprint\b[^>]*>)[^<]+/, `$1${Array(32).fill("00").join(":")}`);
        }
        queue.push(xml);
        wire.push(xml);
      });
      for (const file of ["jingle-session.js", "jingle-webrtc-audio.js"]) {
        await page.addScriptTag({ path: path.join(__dirname, "../php/public", file) });
      }
      await page.evaluate(async name => {
        window.events = [];
        window.tracks = [];
        window.context = new AudioContext();
        const oscillator = context.createOscillator();
        const output = context.createMediaStreamDestination();
        oscillator.frequency.value = name === "caller" ? 440 : 660;
        oscillator.connect(output);
        oscillator.start();
        await context.resume();
        window.stream = output.stream;
        window.endpoint = TeleTypTelJingleAudio.create({
          localJid: `${name}@example.test/browser`,
          send: xml => { void window.queueIq(xml); return true; },
          allowPeer: peer => peer === `${name === "caller" ? "receiver" : "caller"}@example.test/browser`,
          rtcConfig: { iceServers: [] },
          onEvent: event => events.push(event),
          onTrack: track => tracks.push(track),
          timeoutMs: 4000, connectTimeoutMs: 4000
        });
        window.receive = xml => endpoint.handleIq(new DOMParser().parseFromString(xml, "application/xml").documentElement);
        window.received = async () => [...(await endpoint.stats()).values()]
          .filter(report => report.type === "inbound-rtp" && report.kind === "audio")
          .map(report => ({ packets: report.packetsReceived, energy: report.totalAudioEnergy, codec: report.codecId }));
      }, name);
    }
    pump = (async () => {
      while (!finished) {
        const xml = queue.shift();
        if (xml) {
          const target = xml.match(/\bto="([^"]+)"/)?.[1];
          assert.ok(pages.has(target), "IQ must be routed to a fixture full JID");
          await pages.get(target).evaluate(xml => receive(xml), xml);
        } else await new Promise(resolve => setTimeout(resolve, 5));
      }
    })().catch(error => { failures.push(error.message); finished = true; });

    const caller = pages.get("caller@example.test/browser");
    const receiver = pages.get("receiver@example.test/browser");
    const features = await caller.evaluate(async () => [...await endpoint.discover("receiver@example.test/browser")]);
    assert.ok(features.includes("urn:xmpp:jingle:apps:rtp:1"));
    assert.ok(!features.some(feature => feature.includes("rtt")), "Audio adapter must not advertise RTT");
    await caller.evaluate(() => endpoint.start("receiver@example.test/browser", stream));
    await receiver.waitForFunction(() => events.some(event => event.event === "incoming"));
    assert.equal(await receiver.evaluate(async () => (await endpoint.stats()).size), 0, "No media before acceptance");
    assert.equal(await receiver.evaluate(() => tracks.length), 0);
    await receiver.evaluate(() => endpoint.accept(stream));
    for (const page of pages.values()) {
      await page.waitForFunction(() => events.some(event => event.event === "connection" && event.state === "connected"), null, { timeout: 15000 });
      await page.waitForFunction(async () => (await received()).some(report => report.packets > 5 && report.energy > 0), null, { timeout: 15000 });
      const codec = await page.evaluate(async () => [...(await endpoint.stats()).values()]
        .find(report => report.type === "codec" && report.mimeType === "audio/PCMU")?.clockRate);
      assert.equal(codec, 8000);
      assert.equal(await page.evaluate(async () => [...(await endpoint.stats()).values()]
        .some(report => report.type === "transport" && report.dtlsState === "connected")), true);
      assert.equal(await page.evaluate(() => tracks.length), 1);
    }
    assert.ok(wire.some(xml => xml.includes('action="session-accept"')));
    assert.ok(wire.every(xml => !xml.includes("v=0") && !xml.includes("browser-managed") && !xml.includes("jingle-signal:0")),
      "Exchange actual application/transport XML, never embedded private SDP");
    console.log("PASS real bidirectional PCMU audio/energy with ICE + DTLS-SRTP negotiated through Jingle IQs");

    const offer = wire.find(xml => xml.includes('action="session-initiate"'));
    const validationCount = await caller.evaluate(offer => {
      const api = TeleTypTelJingleAudio;
      const parse = () => new DOMParser().parseFromString(offer, "application/xml")
        .getElementsByTagNameNS(api.NS.jingle, "jingle")[0];
      const valid = parse();
      const description = api.toSdp(valid, "offer");
      const content = api.fromSdp(description);
      if (content.getAttribute("name") !== valid.children[0].getAttribute("name")) throw new Error("Roundtrip changed content");
      const badXml = [
        jingle => jingle.appendChild(jingle.children[0].cloneNode(true)),
        jingle => jingle.children[0].setAttribute("senders", "responder"),
        jingle => jingle.children[0].setAttribute("name", "audio\r\na=crypto:bad"),
        jingle => jingle.getElementsByTagNameNS(api.NS.rtp, "description")[0].setAttribute("media", "video"),
        jingle => jingle.getElementsByTagNameNS(api.NS.rtp, "payload-type")[0].setAttribute("name", "opus"),
        jingle => jingle.getElementsByTagNameNS(api.NS.rtp, "rtcp-mux")[0].remove(),
        jingle => jingle.getElementsByTagNameNS(api.NS.ice, "transport")[0].removeAttribute("pwd"),
        jingle => jingle.getElementsByTagNameNS(api.NS.dtls, "fingerprint")[0].remove(),
        jingle => jingle.getElementsByTagNameNS(api.NS.dtls, "fingerprint")[0].setAttribute("hash", "sha-1"),
        jingle => jingle.getElementsByTagNameNS(api.NS.dtls, "fingerprint")[0].setAttribute("setup", "active"),
        jingle => jingle.getElementsByTagNameNS(api.NS.dtls, "fingerprint")[0].textContent = "browser-managed",
        jingle => jingle.getElementsByTagNameNS(api.NS.ice, "candidate")[0].setAttribute("port", "999999"),
        jingle => jingle.getElementsByTagNameNS(api.NS.ice, "candidate")[0].setAttribute("ip", "127.0.0.1\r\na=crypto:bad"),
        jingle => jingle.getElementsByTagNameNS(api.NS.ice, "candidate")[0].setAttribute("protocol", "tcp"),
        jingle => jingle.getElementsByTagNameNS(api.NS.ice, "candidate")[0].setAttribute("generation", "1"),
        jingle => Array.from(jingle.getElementsByTagNameNS(api.NS.ice, "candidate")).forEach(candidate => candidate.remove())
      ];
      let count = 0;
      for (const mutate of badXml) {
        const jingle = parse();
        mutate(jingle);
        let rejected = false;
        try { api.toSdp(jingle, "offer"); } catch { rejected = true; }
        if (!rejected) throw new Error(`Accepted invalid XML case ${count}`);
        count += 1;
      }
      const badSdp = [
        description.sdp.replace("UDP/TLS/RTP/SAVPF", "RTP/AVP"),
        description.sdp.replace("m=audio 9", "m=audio 0"),
        description.sdp.replace("a=sendrecv", "a=sendonly"),
        description.sdp.replace(/a=fingerprint:[^\r]+\r\n/, ""),
        description.sdp + "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
        description.sdp + "a=ice-ufrag:duplicate\r\n"
      ];
      for (const sdp of badSdp) {
        let rejected = false;
        try { api.fromSdp({ type: "offer", sdp }); } catch { rejected = true; }
        if (!rejected) throw new Error(`Accepted invalid SDP case ${count}`);
        count += 1;
      }
      return count;
    }, offer);
    assert.equal(validationCount, 22);
    console.log("PASS 22 malformed/unsupported XML and SDP security/profile checks plus roundtrip");

    await caller.evaluate(() => endpoint.end());
    await receiver.waitForFunction(() => endpoint.snapshot() === null);
    for (const page of pages.values()) {
      assert.equal(await page.evaluate(async () => (await endpoint.stats()).size), 0);
      assert.equal(await page.evaluate(() => stream.getAudioTracks()[0].readyState), "live", "Caller retains source ownership");
      assert.equal(await page.evaluate(() => tracks[0].readyState), "ended");
    }
    console.log("PASS termination closes media at both ends without stopping caller-owned source tracks");

    await caller.evaluate(() => endpoint.start("receiver@example.test/browser", stream));
    await receiver.evaluate(() => endpoint.end("decline"));
    await caller.waitForFunction(() => endpoint.snapshot() === null);
    assert.equal(await receiver.evaluate(() => tracks.length), 1, "Declined call must not create new receiver media");
    console.log("PASS declined second offer creates no receiver PeerConnection or remote track");

    const cancelled = await caller.evaluate(async () => {
      const pending = endpoint.start("receiver@example.test/browser", stream).then(() => "unexpected-success", () => "cancelled");
      endpoint.reset();
      return pending;
    });
    assert.equal(cancelled, "cancelled");
    assert.equal(await caller.evaluate(async () => (await endpoint.stats()).size), 0);
    console.log("PASS reset during async media setup cancels work and releases the connection");

    for (const page of pages.values()) await page.evaluate(() => { events.length = 0; });
    corruptAnswers = true;
    await caller.evaluate(() => endpoint.start("receiver@example.test/browser", stream));
    await receiver.evaluate(() => endpoint.accept(stream).catch(() => {}));
    for (const [jid, page] of pages) {
      await page.waitForFunction(() => events.some(event => event.event === "ended"), null, { timeout: 15000 });
      if (jid.startsWith("caller@")) {
        assert.equal(await page.evaluate(() => events.some(event => event.event === "connection" && event.state === "connected")), false,
          "The peer checking the incorrect fingerprint must not connect");
      }
      assert.equal(await page.evaluate(async () => (await endpoint.stats()).size), 0);
    }
    corruptAnswers = false;
    console.log("PASS valid-looking but wrong DTLS fingerprint fails the real handshake and releases both peers");

    const failedSend = await caller.evaluate(async () => {
      const broken = TeleTypTelJingleAudio.create({ localJid: "caller@example.test/browser", send: () => false });
      let rejected = false;
      try { await broken.start("receiver@example.test/browser", stream); } catch { rejected = true; }
      return rejected && broken.snapshot() === null && (await broken.stats()).size === 0;
    });
    assert.equal(failedSend, true);
    console.log("PASS signaling send failure releases prepared media rather than leaving a live microphone clone");

    const offerGates = await receiver.evaluate(async offer => {
      const parse = () => new DOMParser().parseFromString(offer, "application/xml").documentElement;
      const output = [];
      const deniedEvents = [];
      const denied = TeleTypTelJingleAudio.create({ localJid: "receiver@example.test/browser",
        send: xml => output.push(xml), allowPeer: () => false, onEvent: event => deniedEvents.push(event) });
      denied.handleIq(parse());
      const forbidden = output.some(xml => xml.includes("forbidden")) && denied.snapshot() === null
        && (await denied.stats()).size === 0 && !deniedEvents.some(event => event.event === "incoming");
      denied.reset();
      const events = [];
      const expires = TeleTypTelJingleAudio.create({ localJid: "receiver@example.test/browser",
        send: () => true, allowPeer: () => true, ringingTimeoutMs: 20, timeoutMs: 20,
        onEvent: event => events.push(event) });
      expires.handleIq(parse());
      await new Promise(resolve => setTimeout(resolve, 100));
      const timedOut = expires.snapshot() === null && (await expires.stats()).size === 0
        && events.some(event => event.event === "ended" && event.reason === "timeout");
      expires.reset();
      return { forbidden, timedOut };
    }, offer);
    assert.deepEqual(offerGates, { forbidden: true, timedOut: true });
    console.log("PASS unauthorized and unanswered offers never open receiver media; ringing is bounded");
    assert.deepEqual(failures, []);
  } finally {
    finished = true;
    if (pump) await pump;
    for (const page of pages.values()) await page.evaluate(async () => { endpoint?.reset(); await context?.close(); }).catch(() => {});
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
