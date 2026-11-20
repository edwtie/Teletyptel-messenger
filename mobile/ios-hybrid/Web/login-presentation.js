(function (root) {
  "use strict";

  function mount(document, client) {
    if (!client) throw new Error("nativeUnavailable");
    const byID = name => {
      const value = document.getElementById(name);
      if (!value) throw new Error("invalidPresentation");
      return value;
    };
    const translations = document.defaultView.TeleTypTelHybridTranslations || {};
    const text = (key, fallback) => translations[key] || fallback;
    for (const element of document.querySelectorAll("[data-i18n]")) {
      if (translations[element.dataset.i18n]) element.textContent = translations[element.dataset.i18n];
    }
    for (const element of document.querySelectorAll("[data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]")) {
      for (const [attribute, key] of [["title", element.dataset.i18nTitle], ["aria-label", element.dataset.i18nAriaLabel], ["placeholder", element.dataset.i18nPlaceholder]]) {
        if (translations[key]) element.setAttribute(attribute, translations[key]);
      }
    }
    const nodes = Object.fromEntries(["accountDialog", "accountDialogTitle", "accountDialogSubtitle", "dialogRealAccountTitle",
      "dialogAccountStatus", "dialogJidInput", "dialogPasswordInput", "dialogConnectButton", "dialogCreateAccountButton",
      "dialogSaveAccountButton", "dialogResetPasswordButton", "cancelAccountDialogButton", "closeAccountDialogButton",
      "dialogServerSettingsButton", "loginTwoFactorSection", "loginTwoFactorCodeInput", "verifyLoginTwoFactorButton",
      "dialogRememberPasswordToggle", "hybridStartup", "hybridStartupStatus", "hybridProgress", "hybridRetry", "hybridCancel",
      "hybridBack", "hybridStartupSettings", "hybridConnected", "hybridLogout"].map(name => [name, byID(name)]));
    const accountGrid = document.querySelector(".account-auth-section > .account-dialog-grid");
    const busyPhases = new Set(["checking", "authenticating", "connecting"]);
    const networkErrors = new Set(["certificate", "configuration", "offline", "timeout", "serverResponse", "connectionLost"]);
    const messages = {
      checking: "Chatserver controleren…", authenticating: "Aanmelden…", connecting: "XMPP verbinden…",
      certificate: "Het servercertificaat is niet vertrouwd. Controleer het certificaat in de iOS-instellingen.",
      offline: "De chatserver is offline of niet bereikbaar.", timeout: "De server reageert niet op tijd.",
      configuration: "Controleer de serverinstellingen via het tandwiel.", serverResponse: "De server geeft geen geldig antwoord.",
      connectionLost: "De verbinding is verbroken.", invalidCredentials: "Aanmelden mislukt. Controleer je gegevens of gebruik je XMPP-account.",
      accountRejected: "Aanmelden is geweigerd.", secondFactorRequired: "Voor dit account is tweestapsverificatie nodig.",
      invalidSecondFactor: "De code is niet juist. Probeer opnieuw.", suspended: "De native sessie is onderbroken. Keer terug naar de app."
    };
    let state = null;
    let pending = false;
    let bridgeError = false;
    let allowForm = false;
    let disposed = false;
    const listeners = [];
    const listen = (element, name, action) => {
      element.addEventListener(name, action);
      listeners.push(() => element.removeEventListener(name, action));
    };
    const unavailable = "Nog niet aangesloten in deze hybride testversie";
    for (const name of ["dialogGoogleLoginFallbackButton", "dialogFacebookLoginButton", "dialogForgotPasswordButton", "dialogCreateAccountButton", "dialogRememberPasswordToggle"]) {
      const element = byID(name);
      element.disabled = true;
      element.title = unavailable;
    }
    nodes.dialogRememberPasswordToggle.checked = false;
    for (const name of ["dialogSaveAccountButton", "dialogResetPasswordButton", "closeAccountDialogButton"]) nodes[name].hidden = true;
    nodes.dialogConnectButton.textContent = text("button.sign_in", "Aanmelden");
    nodes.dialogCreateAccountButton.textContent = text("button.sign_up", "Nieuwe gebruiker");
    const usernameLabel = nodes.dialogJidInput.closest("label").querySelector("span");
    usernameLabel.textContent = "E-mailadres of XMPP-account";
    nodes.dialogJidInput.placeholder = "naam@domein.nl";
    nodes.dialogJidInput.setAttribute("autocapitalize", "none");
    nodes.dialogJidInput.spellcheck = false;

    function render() {
      if (disposed) return;
      const phase = state?.phase || "starting";
      const twoFactor = phase === "awaitingSecondFactor";
      const connected = phase === "connected";
      const busy = pending || busyPhases.has(phase) || state?.account.busy;
      const networkFailure = phase === "failed" && networkErrors.has(state.errorCode) && !allowForm;
      const startup = bridgeError || (!state) || pending || busyPhases.has(phase) || networkFailure || phase === "suspended";
      document.body.classList.toggle("account-booting", startup);
      document.body.classList.toggle("account-gate", !connected || startup);
      document.body.classList.toggle("modal-open", !startup && !connected);
      nodes.hybridStartup.toggleAttribute("open", startup);
      nodes.accountDialog.hidden = startup || connected;
      nodes.hybridConnected.hidden = !connected || startup;
      nodes.hybridProgress.hidden = bridgeError || networkFailure || phase === "suspended";
      nodes.hybridRetry.hidden = !bridgeError;
      nodes.hybridCancel.hidden = !busyPhases.has(phase);
      nodes.hybridCancel.disabled = pending;
      nodes.hybridBack.hidden = !networkFailure;
      nodes.hybridStartupSettings.hidden = !networkFailure || !state?.settingsAvailable;
      nodes.hybridStartupSettings.disabled = busy;
      nodes.hybridStartupStatus.textContent = bridgeError ? "De native appverbinding is niet beschikbaar. Probeer opnieuw."
        : messages[state?.errorCode] || messages[phase] || "TeleTypTel starten…";
      nodes.accountDialogTitle.textContent = twoFactor ? text("account.login_two_factor_title", "Tweestapsverificatie") : text("account.start_title", "Aanmelden");
      nodes.accountDialogSubtitle.textContent = twoFactor ? text("account.login_two_factor_subtitle", "Gebruik de code uit je authenticator-app.")
        : "Gebruik je gekoppelde e-mailadres of XMPP-account.";
      nodes.dialogRealAccountTitle.textContent = text("section.sign_in", "Aanmelden");
      nodes.dialogAccountStatus.textContent = messages[state?.errorCode] || "Gebruik je TeleTypTel-wachtwoord.";
      accountGrid.hidden = twoFactor;
      nodes.loginTwoFactorSection.hidden = !twoFactor;
      nodes.dialogConnectButton.hidden = twoFactor;
      nodes.dialogCreateAccountButton.hidden = twoFactor;
      nodes.cancelAccountDialogButton.hidden = !twoFactor;
      nodes.cancelAccountDialogButton.disabled = busy;
      nodes.dialogConnectButton.disabled = busy || !nodes.dialogJidInput.value.trim() || !nodes.dialogPasswordInput.value;
      nodes.dialogJidInput.disabled = busy;
      nodes.dialogPasswordInput.disabled = busy;
      nodes.verifyLoginTwoFactorButton.disabled = busy || !/^[0-9]{6}$/.test(nodes.loginTwoFactorCodeInput.value);
      nodes.loginTwoFactorCodeInput.disabled = busy;
      nodes.dialogServerSettingsButton.disabled = busy || twoFactor || state?.settingsAvailable !== true;
      nodes.dialogServerSettingsButton.title = state?.settingsAvailable ? "Geavanceerde instellingen" : unavailable;
      nodes.dialogServerSettingsButton.setAttribute("aria-label", "Serverinstellingen");
      nodes.hybridLogout.disabled = pending || busyPhases.has(phase);
      const account = state?.account;
      for (const [id, provider] of [["dialogGoogleLoginFallbackButton", "google"], ["dialogFacebookLoginButton", "facebook"]]) {
        byID(id).disabled = busy || !account?.providers.includes(provider);
        byID(id).title = account?.providers.includes(provider) ? "Aanmelden met " + provider : "Niet geconfigureerd in deze appbuild";
      }
      byID("dialogForgotPasswordButton").disabled = busy || !account?.entryAvailable;
      byID("dialogCreateAccountButton").disabled = busy || !account?.registrationAvailable;
      byID("dialogForgotPasswordButton").title = account?.entryAvailable ? "Wachtwoord herstellen" : unavailable;
      byID("dialogCreateAccountButton").title = account?.registrationAvailable ? "Nieuwe gebruiker" : "Deze server ondersteunt hier geen nieuwe XMPP-accounts";
      nodes.dialogRememberPasswordToggle.disabled = busy || !account?.rememberAvailable;
      nodes.dialogRememberPasswordToggle.title = "Voor wachtwoordaanmelding: alleen op dit apparaat, na toestemming voor Face ID of Touch ID";
      byID("hybridBiometric").hidden = !account?.savedLogin; byID("hybridBiometric").disabled = busy;
      byID("hybridForgetLogin").hidden = !account?.savedLogin; byID("hybridForgetLogin").disabled = busy;
      byID("hybridAuthCancel").hidden = !account?.busy || busyPhases.has(phase);
      byID("hybridFeatureNotice").textContent = account?.notice || (!state?.socialLoginAvailable ? "Google/Facebook zijn nog niet geconfigureerd in deze appbuild." : "Je meldt je aan via de native app, niet via een ingebouwde webbrowser.");
    }

    async function perform(action) {
      if (pending || disposed) return;
      pending = true;
      bridgeError = false;
      render();
      try { await action(); }
      catch (error) {
        if (disposed) return;
        if (["sessionBusy", "invalidState"].includes(error?.message)) {
          try { await client.snapshot(); } catch { bridgeError = true; }
        } else bridgeError = true;
      } finally {
        pending = false;
        render();
      }
    }

    function signIn() {
      if (pending || busyPhases.has(state?.phase) || !nodes.dialogJidInput.value.trim() || !nodes.dialogPasswordInput.value) return;
      const jid = nodes.dialogJidInput.value.trim();
      const password = nodes.dialogPasswordInput.value;
      nodes.dialogPasswordInput.value = "";
      nodes.dialogPasswordInput.blur();
      allowForm = false;
      void perform(() => client.login(jid, password, nodes.dialogRememberPasswordToggle.checked));
    }

    listen(nodes.dialogConnectButton, "click", signIn);
    for (const input of [nodes.dialogJidInput, nodes.dialogPasswordInput]) {
      listen(input, "input", render);
      listen(input, "keydown", event => { if (event.key === "Enter") { event.preventDefault(); signIn(); } });
    }
    listen(nodes.loginTwoFactorCodeInput, "input", render);
    const verify = () => {
      if (nodes.verifyLoginTwoFactorButton.disabled) return;
      const code = nodes.loginTwoFactorCodeInput.value;
      nodes.loginTwoFactorCodeInput.value = "";
      nodes.loginTwoFactorCodeInput.blur();
      void perform(() => client.verifySecondFactor(code));
    };
    listen(nodes.verifyLoginTwoFactorButton, "click", verify);
    listen(nodes.loginTwoFactorCodeInput, "keydown", event => { if (event.key === "Enter") { event.preventDefault(); verify(); } });
    listen(nodes.cancelAccountDialogButton, "click", () => { void perform(() => client.cancel()); });
    listen(nodes.hybridCancel, "click", () => { void perform(() => client.cancel()); });
    listen(nodes.hybridRetry, "click", () => { void perform(() => client.snapshot()); });
    listen(nodes.hybridBack, "click", () => { allowForm = true; render(); });
    listen(nodes.hybridLogout, "click", () => {
      nodes.dialogPasswordInput.value = "";
      nodes.loginTwoFactorCodeInput.value = "";
      void perform(() => client.logout());
    });
    for (const button of [nodes.dialogServerSettingsButton, nodes.hybridStartupSettings]) {
      listen(button, "click", () => { nodes.dialogPasswordInput.value = ""; void perform(() => client.openSettings()); });
    }
    for (const [id, provider] of [["dialogGoogleLoginFallbackButton", "google"], ["dialogFacebookLoginButton", "facebook"]]) {
      listen(byID(id), "click", () => { nodes.dialogPasswordInput.value = ""; nodes.dialogRememberPasswordToggle.checked = false; void perform(() => client.accountCommand("auth.social", { provider })); });
    }
    listen(byID("hybridBiometric"), "click", () => { void perform(() => client.accountCommand("auth.biometric")); });
    listen(byID("hybridForgetLogin"), "click", () => { void perform(() => client.accountCommand("auth.forget")); });
    listen(byID("hybridAuthCancel"), "click", () => { void perform(() => client.cancel()); });
    const unsubscribe = client.subscribe(value => {
      if (disposed) return;
      state = value;
      if (value.phase === "signedOut") nodes.dialogRememberPasswordToggle.checked = false;
      bridgeError = false;
      if (value.phase === "signedOut" || value.phase === "idle") nodes.loginTwoFactorCodeInput.value = "";
      render();
    });
    const dispose = () => {
      disposed = true;
      unsubscribe();
      for (const remove of listeners) remove();
      nodes.dialogPasswordInput.value = "";
      nodes.loginTwoFactorCodeInput.value = "";
    };
    listen(document.defaultView, "pagehide", dispose);
    render();
    void perform(() => client.snapshot());
    return { dispose };
  }

  if (typeof module === "object" && module.exports) module.exports = { mount };
  else {
    try { mount(root.document, root.TeleTypTelNativeSession); }
    catch {
      const status = root.document.getElementById("hybridStartupStatus");
      if (status) status.textContent = "De hybride weergave kon niet starten. Open de app opnieuw.";
      const progress = root.document.getElementById("hybridProgress");
      if (progress) progress.hidden = true;
    }
  }
})(typeof window === "undefined" ? globalThis : window);
