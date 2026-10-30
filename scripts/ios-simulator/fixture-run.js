"use strict";
(async () => {
  const results = [];
  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (condition, message) => {
    const deadline = Date.now() + 15000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error(message);
      await pause(100);
    }
  };
  const check = async (name, action) => {
    try { await action(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    await waitFor(() => window.iosFixture && !document.body.classList.contains("account-booting"), "Messenger did not finish initialization");
    await check("Native Capacitor iOS bridge", () => assert(window.Capacitor?.getPlatform?.() === "ios", "Not running the iOS bridge"));
    window.iosFixture.setup();
    await check("Incoming XMPP body renders", async () => {
      window.iosFixture.incoming();
      await waitFor(() => window.iosFixture.timeline().includes("Hallo Sam, dit is een simulatortest."), "Incoming message missing");
    });
    await check("Composer creates outgoing XMPP body", async () => {
      await window.iosFixture.outgoing();
      await waitFor(() => window.iosFixture.timeline().includes("Hallo Noor, ik test de iPhone-app."), "Own message missing");
      assert(window.iosFixture.packets.some((packet) => packet.includes("<body>") && packet.includes("Hallo Noor")), "No outgoing XMPP body produced");
    });
    await check("No invented read confirmation for outgoing message", () => assert(window.iosFixture.status() === "sent", "Outgoing message is incorrectly shown as delivered/read"));
    await check("Message action menu opens", async () => {
      const message = [...document.querySelectorAll("article[data-message-id]")].find((entry) => entry.textContent.includes("Hallo Noor"));
      assert(message, "Message element missing");
      message.scrollIntoView({ block: "center" });
      await pause(300);
      const bounds = message.getBoundingClientRect();
      message.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: bounds.left + 10, clientY: bounds.top + 10 }));
      await waitFor(() => !document.getElementById("messageContextMenu").hidden, "Message menu did not open");
      window.iosFixture.closeMenu();
    });
    await check("Incoming live RTT renders before send", async () => {
      window.iosFixture.draft();
      await waitFor(() => window.iosFixture.timeline().includes("Je ziet mijn tekst terwijl ik typ..."), "Incoming live RTT missing");
    });
    await check("Own live typing preview renders", async () => {
      window.iosFixture.ownDraft();
      await waitFor(() => document.querySelector('[data-local-draft="true"]')?.textContent.includes("En ik typ ook live terug"), "Own live RTT preview missing");
    });
    await pause(700);
    await check("Phone viewport has no horizontal overflow", () => assert(document.documentElement.scrollWidth <= innerWidth + 2, "Page overflows phone width"));
    await check("Composer remains inside visible viewport", () => {
      const bounds = document.getElementById("messageInput").getBoundingClientRect();
      assert(bounds.width > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight + 2, "Composer is outside viewport");
    });
    await check("No uncaught JavaScript errors", () => assert(window.iosSmokeErrors.length === 0, window.iosSmokeErrors.join("; ")));
  } catch (error) { results.push({ name: "Fixture initialization", passed: false, error: error.message }); }
  const report = { fixture: "teletyptel-ios-smoke-v1", passed: results.length === 10 && results.every((result) => result.passed),
    results, errors: window.iosSmokeErrors, platform: window.Capacitor?.getPlatform?.(), userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight }, network: "fictitious data, external connections disabled" };
  window.iosSmokeReport = report;
  window.webkit?.messageHandlers?.iosSmokeResult?.postMessage(report);
})();
