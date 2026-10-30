const bundleId = "com.tiedragon.teletyptel";
const teamId = "H29RTRBD9D";

function settings(serverUrl, buildNumber = "1.0") {
  const server = new URL(serverUrl);
  if (server.protocol !== "https:" || server.username || server.password || server.search || server.hash
      || server.pathname !== "/chat.html" || ["localhost", "127.0.0.1", "[::1]"].includes(server.hostname)) {
    throw new Error("Provide a reachable HTTPS /chat.html address, without credentials or parameters.");
  }
  if (!/^\d{1,4}(?:\.\d{1,2}){0,2}$/.test(buildNumber)) throw new Error("Invalid Apple build number");
  return {
    bundleId, teamId, buildNumber, serverUrl: server.href,
    capacitor: {
      appId: bundleId, appName: "TeleTypTel Test", webDir: "www", loggingBehavior: "none",
      server: { appStartPath: server.pathname, hostname: "localhost", iosScheme: "capacitor", cleartext: false, errorPath: "offline.html" },
      ios: { contentInset: "automatic", webContentsDebuggingEnabled: false },
      plugins: { CapacitorHttp: { enabled: false } }
    }
  };
}

module.exports = { settings, bundleId, teamId };
