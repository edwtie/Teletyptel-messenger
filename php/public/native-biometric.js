(function (root) {
  "use strict";
  function create({ translate, signedOut, signedIn, verifySession, clearSaved, restoreProfile, notify, settingsButton } = {}) {
    const plugin = () => root.Capacitor?.getPlatform?.() === "ios" && root.Capacitor?.Plugins?.TeleTypTelBiometrics;
    let prepared;
    let busy = false;
    let offered = false;
    let generation = 0;
    let expectedAccount = "";
    let activeAccount;
    const text = (key, fallback) => translate?.(key, fallback) || fallback;
    const status = async () => {
      const bridge = plugin();
      if (!bridge) return null;
      const result = await bridge.status();
      if (settingsButton) {
        settingsButton.hidden = !result.available && !result.enabled;
        settingsButton.textContent = result.enabled
          ? text("account.faceid_disable", "Disable Face ID") : text("account.faceid_enable", "Enable Face ID");
        settingsButton.dataset.enabled = String(result.enabled);
      }
      return result;
    };
    const disable = async keepSession => {
      generation++;
      expectedAccount = "";
      if (plugin()) await plugin().disable({ keepSession });
      await status();
    };
    const unlock = async () => {
      const attempt = generation;
      try {
        const result = await plugin().unlock();
        if (attempt !== generation) return false;
        const profile = result?.profile;
        if (!profile?.accountId || !profile?.jid) throw new Error("Invalid biometric profile");
        clearSaved?.();
        restoreProfile?.({ accountId: profile.accountId, jid: profile.jid });
        expectedAccount = profile.accountId;
        return true;
      } catch {
        if (attempt !== generation) return false;
        clearSaved?.();
        await disable(false);
        notify?.(text("account.faceid_sign_in", "Face ID was not completed or your session expired. Sign in again."));
        return false;
      }
    };
    const controller = {
      prepare() {
        if (!plugin()) return Promise.resolve();
        if (!prepared) prepared = (async () => {
          busy = true;
          try {
            const current = await status();
            if (current?.enabled) await unlock();
          } finally { busy = false; }
        })();
        return prepared;
      },
      async validate(account, authenticated, retryable = false) {
        if (!expectedAccount) return true;
        if (!authenticated && retryable) return null;
        if (authenticated && account?.accountId === expectedAccount) {
          expectedAccount = "";
          return true;
        }
        clearSaved?.();
        await disable(false);
        return false;
      },
      async ready(account) {
        activeAccount = account;
        if (!plugin() || offered || busy || !account?.savedInDatabase) return;
        offered = true;
        const current = await status();
        if (current?.available && !current.enabled && !current.asked) await controller.enable();
      },
      async enable() {
        if (!plugin() || busy || !activeAccount?.savedInDatabase || !signedIn?.()) return;
        busy = true;
        const attempt = generation;
        try {
          await plugin().enroll({ accountId: activeAccount.accountId, jid: activeAccount.jid });
          if (attempt === generation) await status();
        } catch {
          notify?.(text("account.faceid_failed", "Face ID was not enabled. Normal sign-in remains available."));
        } finally { busy = false; }
      },
      async logout() {
        activeAccount = null;
        offered = true;
        await disable(false);
      },
      async revoke() {
        activeAccount = null;
        offered = true;
        await disable(true);
      }
    };
    settingsButton?.addEventListener("click", async () => {
      try {
        if (settingsButton.dataset.enabled === "true") await disable(true);
        else await controller.enable();
      } catch { notify?.(text("account.faceid_failed", "Face ID could not be changed. Please try again.")); }
    });
    root.addEventListener?.("teletyptel-faceid-resume", async () => {
      if (!plugin() || busy) return;
      busy = true;
      try {
        if (!await unlock()) await signedOut?.();
        else if (verifySession) {
          const valid = await verifySession();
          if (valid === false) await signedOut?.();
        }
      } catch {
        await signedOut?.();
      } finally { busy = false; }
    });
    return controller;
  }
  root.TeleTypTelBiometric = { create };
})(typeof window === "undefined" ? globalThis : window);
