(function (root) {
  "use strict";
  let busy = false;

  async function signIn(endpoint) {
    if (busy) throw Object.assign(new Error("Google sign-in is already open."), { code: "BUSY" });
    const capacitor = root.Capacitor;
    if (capacitor?.getPlatform?.() !== "ios" || !capacitor.isPluginAvailable?.("TeleTypTelGoogle")) {
      throw Object.assign(new Error("Update TeleTypTel in TestFlight to use Google sign-in."), { code: "UPDATE_REQUIRED" });
    }
    const url = new URL(endpoint, root.location.href);
    if (url.origin !== root.location.origin || url.protocol !== "https:") throw new Error("Secure same-origin sign-in is required.");
    const plugin = capacitor.registerPlugin("TeleTypTelGoogle");
    async function post(body) {
      const response = await root.fetch(url.toString(), {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "X-TeleTypTel-Native": "google" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        throw Object.assign(new Error("Google sign-in could not be completed. Please try again."), { code: payload.error || "SERVER_ERROR" });
      }
      return payload;
    }
    busy = true;
    try {
      const challenge = await post({ action: "begin" });
      if (!challenge.challenge || !challenge.serverClientId) throw new Error("Google sign-in is not configured.");
      const result = await plugin.signIn({ serverClientId: challenge.serverClientId });
      if (!result.serverAuthCode) throw new Error("Google did not provide a sign-in code.");
      const code = result.serverAuthCode;
      delete result.serverAuthCode;
      const payload = await post({ action: "complete", challenge: challenge.challenge, code });
      if (typeof payload.accountId !== "string" || !payload.accountId) throw new Error("No signed-in account returned.");
      return payload;
    } finally {
      busy = false;
    }
  }

  root.TeleTypTelNativeGoogle = { signIn };
})(typeof window === "undefined" ? globalThis : window);
