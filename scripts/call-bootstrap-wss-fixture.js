"use strict";
const assert = require("node:assert/strict");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let stage = "connect";

async function run(input) {
  const socket = new WebSocket(`wss://127.0.0.1:${input.port}/${input.scoped ? "xmpp-call-websocket" : "xmpp-websocket"}`, "xmpp");
  const frames = []; let closed = false;
  socket.addEventListener("message", event => frames.push(String(event.data)));
  socket.addEventListener("close", () => { closed = true; });
  socket.addEventListener("error", () => {});
  const wait = async pattern => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const index = frames.findIndex(frame => pattern.test(frame));
      if (index >= 0) return frames.splice(index, 1)[0];
      if (closed) throw new Error("Scoped WebSocket closed");
      await delay(25);
    }
    throw new Error("Scoped WebSocket timed out");
  };
  try {
    for (let attempt = 0; attempt < 100 && socket.readyState === WebSocket.CONNECTING; attempt++) await delay(25);
    assert.equal(socket.readyState, WebSocket.OPEN);
    stage = "features";
    const open = "<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='example.test' version='1.0'/>";
    socket.send(open); await wait(/<mechanisms/);
    stage = "authentication";
    socket.send("<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>" + Buffer.from("\0bob\0" + input.grant.credential).toString("base64") + "</auth>");
    const authentication = await wait(/<(?:success|failure)\b/);
    if (!input.scoped) { assert.match(authentication, /<failure\b/); return { unattestedDenied: true }; }
    assert.match(authentication, /<success\b/);
    stage = "binding";
    socket.send(open); await wait(/<bind/);
    socket.send(`<iq type='set' id='bind'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>${input.grant.claims.resource}</resource></bind></iq>`);
    assert.match(await wait(/id=['"]bind['"]/), /type=['"]result['"]/);
    stage = "ping";
    socket.send("<iq type='get' to='example.test' id='ping'><ping xmlns='urn:xmpp:ping'/></iq>");
    assert.match(await wait(/id=['"]ping['"]/), /type=['"]result['"]/);
    stage = "roster isolation";
    socket.send("<iq type='get' to='example.test' id='forbidden'><query xmlns='jabber:iq:roster'/></iq>");
    for (let attempt = 0; attempt < 100 && !closed; attempt++) await delay(25);
    assert.ok(closed);
    return { authenticated: true, bound: true, ping: true, rosterClosed: true };
  } finally { socket.close(); }
}

if (require.main === module) {
  let input = "";
  process.stdin.on("data", chunk => { input += chunk; if (input.length > 8192) process.exit(1); });
  process.stdin.on("end", () => run(JSON.parse(input)).then(result => process.stdout.write(JSON.stringify(result), () => process.exit(0)))
    .catch(() => process.stderr.write("Isolated scoped WebSocket check failed at " + stage + "\n", () => process.exit(1))));
}
