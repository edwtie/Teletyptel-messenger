const bundleId = "com.tiedragon.teletyptel.nativepreview";

function providerPlist(source, config, { expectedBundleId = bundleId } = {}) {
  if (!config) return source;
  if (![bundleId, "com.tiedragon.teletyptel"].includes(expectedBundleId)
      || config.bundleId !== expectedBundleId || Object.keys(config).some(key => !["bundleId", "google", "facebook"].includes(key))) {
    throw new Error("Use provider registrations specifically for the isolated native preview bundle");
  }
  if (expectedBundleId === "com.tiedragon.teletyptel") {
    const google = require("./ios-testflight/google-signin");
    if (config.google?.clientId !== google.clientId || config.google?.serverClientId !== google.serverClientId
        || config.facebook?.appId !== "926375633763307") throw new Error("Review production provider registrations for TeleTypTel");
  }
  const escape = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  const entry = (key, value) => `<key>${key}</key><string>${escape(value)}</string>\n`;
  let additions = entry("TeleTypTelProviderBundleID", expectedBundleId);
  const schemes = [];
  if (config.google) {
    const { clientId, serverClientId } = config.google;
    for (const value of [clientId, serverClientId]) {
      if (typeof value !== "string" || !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(value)) {
        throw new Error("Invalid native Google client configuration");
      }
    }
    additions += entry("GIDClientID", clientId) + entry("GIDServerClientID", serverClientId);
    schemes.push(clientId.split(".").reverse().join("."));
  }
  if (config.facebook) {
    const { appId, clientToken } = config.facebook;
    if (typeof appId !== "string" || !/^[1-9][0-9]{0,31}$/.test(appId) || typeof clientToken !== "string" ||
        !clientToken.length || clientToken.length > 1024 || /[\s\x00-\x1f\x7f]/.test(clientToken)) {
      throw new Error("Invalid native Facebook client configuration");
    }
    if (!source.includes("<key>TeleTypTelFacebookEnabled</key><false/>")) throw new Error("Review existing provider flags");
    source = source.replace("<key>TeleTypTelFacebookEnabled</key><false/>", "<key>TeleTypTelFacebookEnabled</key><true/>");
    additions += entry("FacebookAppID", appId) + entry("FacebookClientToken", clientToken) + entry("FacebookDisplayName", "TeleTypTel");
    schemes.push("fb" + appId);
  }
  if (!schemes.length || source.includes("CFBundleURLTypes") || source.includes("GIDClientID")) throw new Error("Review native provider configuration");
  additions += "<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array>" +
    schemes.map(value => `<string>${escape(value)}</string>`).join("") + "</array></dict></array>\n";
  return source.replace(/<\/dict>\s*<\/plist>\s*$/, additions + "</dict>\n</plist>\n");
}

module.exports = { providerPlist };
