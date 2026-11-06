const https = require("node:https");

function accountReply(input, { username, password, origin }) {
  const scenarios = ["success", "rejected", "twofactor", "mismatch", "redirect", "xmpp-rejected", "delayed"];
  const scenario = scenarios.find(name => input.jid === (name === "success" ? username : `${name}-${username}`) + "@localhost");
  if (!scenario || input.action !== "login" || input.password !== password || input.rememberPassword !== false ||
      input.xmppDomain !== "localhost" || input.xmppTlsMode !== "websocket" ||
      input.xmppWebSocket !== origin.replace("https:", "wss:") + "/xmpp-websocket") {
    return { status: 400, body: { ok: false, error: "invalid_fixture_request" } };
  }
  const account = { jid: scenario === "mismatch" ? username + "@localhost" : input.jid, password };
  if (scenario === "rejected") return { scenario, status: 401, body: { ok: false, error: "invalid_credentials" } };
  if (scenario === "redirect") return { scenario, status: 302, location: origin + "/unexpected", body: { ok: false } };
  return { scenario, status: 200, delay: scenario === "delayed" ? 2000 : 0,
    body: { ok: true, account, ...(scenario === "twofactor" ? { twoFactorRequired: true } : {}) } };
}

async function startLoginFixture({ key, cert, ca, trustedPort, username, password }) {
  if (!/^native-test-[a-f0-9]+$/.test(username) || !password || !Number.isInteger(trustedPort) ||
      trustedPort < 1024 || trustedPort > 65535) throw new Error("Invalid local login fixture");
  const sockets = new Set();
  const timers = new Set();
  const statistics = { scenarios: {}, upgrades: 0, unexpectedRequests: 0, proxyErrors: 0 };
  let origin;
  const track = socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => {});
  };
  const server = https.createServer({ key, cert }, (request, response) => {
    if (request.method === "GET" && request.url === "/test-status") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ delayedReceived: statistics.scenarios.delayed === 1 }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/account.php" || request.headers.origin !== origin ||
        request.headers["content-type"] !== "application/json") {
      statistics.unexpectedRequests++;
      response.writeHead(400).end();
      return;
    }
    let body = "";
    request.on("error", () => {});
    request.on("data", chunk => {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 16384) request.destroy();
    });
    request.on("end", () => {
      let input;
      try { input = JSON.parse(body); } catch { response.writeHead(400).end(); return; }
      const reply = accountReply(input || {}, { username, password, origin });
      if (reply.scenario) statistics.scenarios[reply.scenario] = (statistics.scenarios[reply.scenario] || 0) + 1;
      else statistics.unexpectedRequests++;
      const send = () => {
        if (response.destroyed) return;
        response.writeHead(reply.status, { "Content-Type": "application/json", "Cache-Control": "no-store",
          ...(reply.location ? { Location: reply.location } : {}) });
        response.end(JSON.stringify(reply.body));
      };
      if (reply.delay) {
        const timer = setTimeout(() => { timers.delete(timer); send(); }, reply.delay);
        timers.add(timer);
      } else send();
    });
  });
  server.on("connection", track);
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/xmpp-websocket" || request.headers["sec-websocket-protocol"] !== "xmpp") {
      statistics.unexpectedRequests++;
      socket.destroy();
      return;
    }
    statistics.upgrades++;
    const upstream = https.request({ hostname: "127.0.0.1", servername: "localhost", port: trustedPort,
      path: "/xmpp-websocket", method: "GET", ca, rejectUnauthorized: true,
      headers: { ...request.headers, host: `localhost:${trustedPort}` } });
    upstream.on("error", () => { statistics.proxyErrors++; socket.destroy(); });
    upstream.on("response", response => { statistics.proxyErrors++; response.resume(); socket.destroy(); });
    upstream.on("upgrade", (response, remote, upstreamHead) => {
      track(remote);
      if (socket.destroyed) { remote.destroy(); return; }
      const headers = [];
      for (let index = 0; index < response.rawHeaders.length; index += 2) {
        headers.push(response.rawHeaders[index] + ": " + response.rawHeaders[index + 1]);
      }
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) remote.write(head);
      socket.pipe(remote).pipe(socket);
      socket.once("close", () => remote.destroy());
      remote.once("close", () => socket.destroy());
    });
    socket.once("close", () => upstream.destroy());
    upstream.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  origin = `https://localhost:${port}`;
  return { port, statistics, close: async () => {
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  } };
}

module.exports = { accountReply, startLoginFixture };
