const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const fixture = require("./fixtures/native-jingle-rtt.json");

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    await page.addScriptTag({ path: path.join(__dirname, "../php/public/jingle-webrtc-audio.js") });
    const results = await page.evaluate(fixture => {
      const root = new DOMParser().parseFromString(fixture.xml, "application/xml").documentElement;
      const decoded = TeleTypTelJingleMedia.toSdp(root, "offer", "rtt");
      const content = TeleTypTelJingleMedia.fromSdp({ type: "offer", sdp: fixture.sdp }, "rtt")[0];
      const generated = root.cloneNode(false);
      generated.appendChild(content);
      const canonical = element => JSON.stringify([element.localName, element.namespaceURI,
        Array.from(element.attributes).filter(attribute => attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/")
          .map(attribute => [attribute.name, attribute.value]).sort(),
        element.children.length ? Array.from(element.children).map(canonical) : element.textContent]);
      return { decoded, fixture: canonical(root), generated: canonical(generated) };
    }, fixture);
    assert.equal(results.decoded.sdp, fixture.sdp);
    assert.equal(results.fixture, results.generated);
    console.log("Browser/native shared Jingle RTT fixture matches in both directions");
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
