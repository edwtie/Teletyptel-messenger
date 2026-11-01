(function (root) {
  "use strict";
  let busy = false;

  async function signIn(endpoint) {
    if (busy) throw Object.assign(new Error("Facebook sign-in is already open."), { code: "BUSY" });
    const capacitor = root.Capacitor;
    const plugin = capacitor?.Plugins?.TeleTypTelFacebook;
    if (capacitor?.getPlatform?.() !== "ios" || !capacitor.isPluginAvailable?.("TeleTypTelFacebook")
        || typeof plugin?.signIn !== "function") {
      throw Object.assign(new Error("Update TeleTypTel to use Facebook sign-in."), { code: "UPDATE_REQUIRED" });
    }
    const url = new URL(endpoint, root.location.href);
    const bundled = root.TeleTypTelApp && root.location.protocol === "capacitor:" && root.location.hostname === "localhost"
      && url.protocol === "capacitor:" && url.hostname === "localhost";
    if ((!bundled && (url.origin !== root.location.origin || url.protocol !== "https:"))
        || (bundled && url.port) || url.username || url.password || url.search || url.hash
        || url.pathname !== "/api/auth/facebook/native.php") throw new Error("Secure same-origin sign-in is required.");
    async function post(body) {
      const response = await root.fetch(url.toString(), {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "X-TeleTypTel-Native": "facebook" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        throw Object.assign(new Error("Facebook sign-in could not be completed."), { code: payload.error || "SERVER_ERROR" });
      }
      return payload;
    }
    busy = true;
    try {
      const challenge = await post({ action: "begin" });
      if (typeof challenge.challenge !== "string" || !/^[a-f0-9]{64}$/.test(challenge.challenge)
          || typeof challenge.appId !== "string" || !/^[0-9]+$/.test(challenge.appId)) {
        throw Object.assign(new Error("Facebook sign-in is not configured."), { code: "CONFIGURATION" });
      }
      const result = await plugin.signIn({ appId: challenge.appId, nonce: challenge.challenge });
      if (typeof result?.token !== "string" || !result.token || result.token.length > 16384) {
        throw new Error("Facebook did not provide an authentication token.");
      }
      const token = result.token;
      delete result.token;
      const payload = await post({ action: "complete", challenge: challenge.challenge, token });
      if (typeof payload.accountId !== "string" || !payload.accountId) throw new Error("No signed-in account returned.");
      return payload;
    } finally {
      busy = false;
    }
  }

  root.TeleTypTelNativeFacebook = { signIn };
})(typeof window === "undefined" ? globalThis : window);
