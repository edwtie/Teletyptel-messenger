const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const html = fs.readFileSync(path.join(__dirname, "../php/public/chat.html"), "utf8");
  assert.ok(html.indexOf('src="jingle-t140.js') > 0 && html.indexOf('src="jingle-t140.js') < html.indexOf('src="jingle-webrtc-audio.js'));
  assert.ok(require("../scripts/ios-testflight/bundle-frontend").assetFiles().includes("jingle-t140.js"));
  assert.match(fs.readFileSync(path.join(__dirname, "../php/public/service-worker.js"), "utf8"), /jingle-t140\.js/);
  const browser = await chromium.launch({ headless: true });
  const pages = new Map(), queue = [], wire = [], errors = [];
  let stopped = false, pump;
  try {
    for (const name of ["alice", "bob"]) {
      const page = await browser.newPage();
      pages.set(`${name}@example.test/device`, page);
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://jingle-media.teletyptel.test/**", route => route.fulfill({
        contentType: "text/html", body: '<!doctype html><video id="remote" autoplay muted playsinline></video>'
      }));
      await page.goto("https://jingle-media.teletyptel.test/");
      await page.exposeFunction("queueIq", xml => { queue.push(xml); wire.push(xml); });
      for (const file of ["jingle-session.js", "jingle-t140.js", "jingle-webrtc-audio.js"]) {
        await page.addScriptTag({ path: path.join(__dirname, "../php/public", file) });
      }
      await page.evaluate(async name => {
        window.audioContext = new AudioContext();
        const output = audioContext.createMediaStreamDestination();
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 440;
        oscillator.connect(output);
        oscillator.start();
        await audioContext.resume();
        window.audioStream = output.stream;
        window.makeVideo = color => {
          const canvas = document.createElement("canvas");
          canvas.width = 160; canvas.height = 90;
          const context = canvas.getContext("2d");
          const draw = () => { context.fillStyle = color; context.fillRect(0, 0, 160, 90); };
          draw();
          const timer = setInterval(draw, 50);
          const stream = canvas.captureStream(20);
          return { stream, stop: () => { clearInterval(timer); stream.getTracks().forEach(track => track.stop()); } };
        };
        window.videoSource = makeVideo(name === "alice" ? "#ff0000" : "#0000ff");
        window.setup = profile => {
          window.endpoint?.reset();
          window.events = [];
          window.remoteTracks = [];
          window.profile = profile;
          const tracks = profile === "rtt" ? [] : audioStream.getTracks();
          if (["total", "video"].includes(profile)) tracks.push(...videoSource.stream.getTracks());
          window.stream = new MediaStream(tracks);
          window.endpoint = TeleTypTelJingleMedia.create({
            profile, localJid: `${name}@example.test/device`,
            send: xml => { void queueIq(xml); return true; },
            allowPeer: peer => peer === `${name === "alice" ? "bob" : "alice"}@example.test/device`,
            onEvent: event => events.push(event),
            onTrack: track => {
              remoteTracks.push(track);
              if (track.kind === "video") {
                const video = document.getElementById("remote");
                video.srcObject = new MediaStream([track]);
                void video.play().catch(() => {});
              }
            },
            rtcConfig: { iceServers: [] }, timeoutMs: 5000, connectTimeoutMs: 15000
          });
        };
        window.receive = xml => endpoint.handleIq(new DOMParser().parseFromString(xml, "application/xml").documentElement);
        window.receivedText = () => events.filter(event => event.event === "rtt").at(-1)?.text ?? "";
        window.pixel = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 160; canvas.height = 90;
          const context = canvas.getContext("2d");
          context.drawImage(document.getElementById("remote"), 0, 0, 160, 90);
          return [...context.getImageData(80, 45, 1, 1).data];
        };
      }, name);
    }
    pump = (async () => {
      while (!stopped) {
        const xml = queue.shift();
        if (xml) {
          const destination = xml.match(/\bto="([^"]+)"/)?.[1];
          assert.ok(pages.has(destination));
          await pages.get(destination).evaluate(xml => receive(xml), xml);
        } else await new Promise(resolve => setTimeout(resolve, 5));
      }
    })().catch(error => { errors.push(error.message); stopped = true; });
    const caller = pages.get("alice@example.test/device"), receiver = pages.get("bob@example.test/device");

    for (const profile of ["total", "video", "audio-rtt", "rtt"]) {
      for (const page of pages.values()) await page.evaluate(profile => setup(profile), profile);
      const startIndex = wire.length;
      await caller.evaluate(() => endpoint.start("bob@example.test/device", stream));
      await receiver.waitForFunction(() => events.some(event => event.event === "incoming"));
      assert.equal(await receiver.evaluate(async () => (await endpoint.stats()).size), 0);
      assert.equal(await caller.evaluate(() => endpoint.sendRtt("not yet")), false);
      await receiver.evaluate(() => endpoint.accept(stream));
      for (const page of pages.values()) {
        await page.waitForFunction(() => events.some(event => event.event === "connection" && event.state === "connected"), null, { timeout: 20000 });
        if (profile !== "rtt") await page.waitForFunction(async () => [...(await endpoint.stats()).values()]
          .some(report => report.type === "inbound-rtp" && report.kind === "audio" && report.totalAudioEnergy > 0));
        if (["total", "video"].includes(profile)) await page.waitForFunction(async () => [...(await endpoint.stats()).values()]
          .some(report => report.type === "inbound-rtp" && report.kind === "video" && report.framesDecoded > 3));
      }
      if (["total", "video"].includes(profile)) {
        await caller.waitForFunction(() => document.getElementById("remote").videoWidth === 160 && pixel()[2] > 200);
        await receiver.waitForFunction(() => document.getElementById("remote").videoWidth === 160 && pixel()[0] > 200);
        assert.equal(await caller.evaluate(() => endpoint.setTrackEnabled("video", false)), true);
        assert.equal(await caller.evaluate(() => videoSource.stream.getVideoTracks()[0].enabled), true);
        assert.equal(await caller.evaluate(() => endpoint.setTrackEnabled("video", true)), true);
        if (profile === "total") {
          await caller.evaluate(async () => {
            window.replacement = makeVideo("#00ff00");
            await endpoint.replaceTrack(replacement.stream.getVideoTracks()[0]);
          });
          await receiver.waitForFunction(() => pixel()[1] > 200 && pixel()[0] < 30);
          assert.equal(await caller.evaluate(() => videoSource.stream.getVideoTracks()[0].readyState), "live");
          const replacements = await caller.evaluate(async () => {
            const track = replacement.stream.getVideoTracks()[0];
            return (await Promise.allSettled([endpoint.replaceTrack(track), endpoint.replaceTrack(track)]))
              .map(result => result.status);
          });
          assert.deepEqual(replacements, ["fulfilled", "rejected"]);
          assert.equal(await caller.evaluate(async () => {
            const replacing = endpoint.replaceTrack(replacement.stream.getVideoTracks()[0]);
            endpoint.setTrackEnabled("video", false);
            await replacing;
            return endpoint.connection().getSenders().find(sender => sender.track?.kind === "video").track.enabled;
          }), false);
          await caller.evaluate(() => endpoint.setTrackEnabled("video", true));
        }
      }
      if (profile !== "video") {
        for (const page of pages.values()) await page.waitForFunction(() => events.some(event => event.event === "rtt-state" && event.state === "open"));
        for (const text of ["Hallo 👋", "Hallo 👋 wereld", "Hallo 🌍!", '{"event":"reset","text":"literal"}', "Café\nمرحبا 👋"]) {
          assert.equal(await caller.evaluate(text => endpoint.setRttText(text), text), true);
          await receiver.waitForFunction(text => receivedText() === text, text);
        }
        assert.equal(await caller.evaluate(() => endpoint.setRttText("\ud800")), false);
        assert.equal(await caller.evaluate(() => endpoint.setRttText("x".repeat(5000))), false);
        assert.equal(await caller.evaluate(() => endpoint.setRttText("na fout")), true);
        await receiver.waitForFunction(() => receivedText() === "na fout");
        assert.equal(await receiver.evaluate(() => endpoint.sendRtt("regel\r")), true);
        assert.equal(await receiver.evaluate(() => endpoint.sendRtt("\nvolgende 👋\b!")), true);
        await caller.waitForFunction(() => receivedText() === "regel\nvolgende !");
        const binding = await receiver.evaluate(() => events.filter(event => event.event === "rtt").at(-1));
        assert.equal(binding.syncMode, "co-session");
        assert.equal(binding.sid, await caller.evaluate(() => endpoint.snapshot().sid));
        assert.ok(binding.content);
      }
      const profileWire = wire.slice(startIndex);
      assert.ok(profileWire.every(xml => !xml.includes("v=0") && !xml.includes("json-base64") && !xml.includes("jingle-signal:0")));
      if (profile === "total") {
        const offer = profileWire.find(xml => xml.includes('action="session-initiate"'));
        assert.equal((offer.match(/<content\b/g) || []).length, 3);
        const negative = await caller.evaluate(xml => {
          const api = TeleTypTelJingleMedia, ns = api.NS;
          const parse = () => new DOMParser().parseFromString(xml, "application/xml").getElementsByTagNameNS(ns.jingle, "jingle")[0];
          const changes = [
            jingle => jingle.children[2].remove(),
            jingle => jingle.children[1].setAttribute("name", jingle.children[0].getAttribute("name")),
            jingle => jingle.children[1].getElementsByTagNameNS(ns.rtp, "payload-type")[0].setAttribute("name", "H264"),
            jingle => jingle.children[1].getElementsByTagNameNS(ns.dtls, "fingerprint")[0].remove(),
            jingle => jingle.getElementsByTagNameNS(ns.rtt, "datachannel")[0].setAttribute("subprotocol", "teletyptel-rtt-json-v1"),
            jingle => jingle.getElementsByTagNameNS(ns.rtt, "datachannel")[0].setAttribute("reliability", "unreliable"),
            jingle => jingle.getElementsByTagNameNS(ns.rtt, "rtt-sync")[0].setAttribute("sync-mode", "media-clock"),
            jingle => jingle.getElementsByTagNameNS(ns.channel, "channel")[0].setAttribute("ordered", "false"),
            jingle => jingle.getElementsByTagNameNS(ns.channel, "channel")[0].setAttribute("id", "7"),
            jingle => jingle.getElementsByTagNameNS(ns.channel, "channel")[0].setAttribute("maxRetransmits", "0"),
            jingle => jingle.getElementsByTagNameNS(ns.sctp, "sctpmap")[0].setAttribute("number", "5000\r\na=bad"),
            jingle => jingle.getElementsByTagNameNS(ns.sctp, "sctpmap")[0].remove(),
            jingle => jingle.getElementsByTagNameNS(ns.ice, "candidate")[0].setAttribute("ip", "example.com"),
            jingle => jingle.getElementsByTagNameNS(ns.ice, "candidate")[0].setAttribute("ip", "host.local\r\na=bad"),
            jingle => {
              const candidate = jingle.getElementsByTagNameNS(ns.ice, "candidate")[0];
              candidate.setAttribute("ip", "host.local"); candidate.setAttribute("type", "relay");
            },
            jingle => {
              const candidate = jingle.getElementsByTagNameNS(ns.ice, "candidate")[0];
              candidate.setAttribute("rel-addr", "host.local"); candidate.setAttribute("rel-port", "12345");
            }
          ];
          let rejected = 0;
          for (const change of changes) {
            const jingle = parse(); change(jingle);
            try { api.toSdp(jingle, "offer", "total"); } catch { rejected += 1; }
          }
          const sdp = api.toSdp(parse(), "offer", "total");
          if (api.fromSdp(sdp, "total").length !== 3) throw new Error("Lost content on roundtrip");
          const mdns = parse();
          const candidate = mdns.getElementsByTagNameNS(ns.ice, "candidate")[0];
          candidate.setAttribute("ip", "peer-browser.local"); candidate.setAttribute("type", "host");
          if (!api.toSdp(mdns, "offer", "total").sdp.includes("peer-browser.local")) throw new Error("Lost mDNS host candidate");
          return rejected;
        }, offer);
        assert.equal(negative, 16);
        console.log("PASS 16 invalid media/RTT negotiations rejected, with three-content and bounded mDNS roundtrip");
      }
      await caller.evaluate(() => endpoint.end());
      await receiver.waitForFunction(() => endpoint.snapshot() === null);
      for (const page of pages.values()) {
        assert.equal(await page.evaluate(async () => (await endpoint.stats()).size), 0);
        assert.equal(await page.evaluate(() => endpoint.setRttText("late")), false);
        assert.equal(await page.evaluate(() => remoteTracks.every(track => track.readyState === "ended")), true);
      }
      console.log(`PASS ${profile}: actual negotiated media, consent gate, ownership and cleanup${profile !== "video" ? ", bidirectional T.140 edits/Unicode" : ""}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    stopped = true;
    if (pump) await pump;
    for (const page of pages.values()) await page.evaluate(async () => {
      window.endpoint?.reset(); window.videoSource?.stop(); window.replacement?.stop(); await window.audioContext?.close();
    }).catch(() => {});
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
