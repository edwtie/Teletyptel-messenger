"use strict";
(() => {
  const byId = identifier => document.getElementById(identifier);
  const toolbar = byId("callCompactToolbar");
  const menu = byId("callControlsMenu");
  const toggle = byId("callControlsToggle");
  const panel = byId("callPanel");
  const controls = panel?.querySelector(".call-media-controls");
  if (!toolbar || !menu || !toggle || !controls) return;

  const camera = byId("toggleCameraButton");
  const microphone = byId("muteMicrophoneButton");
  const facing = byId("callVideoFacingToggle").closest(".ios-facing-control");
  const hangup = byId("hangupCallButton");
  const extraButtons = [byId("interpreterButton"), byId("resetRttButton"), byId("enableRttButton")];
  const moved = [controls, facing, hangup, ...extraButtons].map(element => {
    const marker = document.createComment("call control location");
    element.before(marker);
    return { element, marker };
  });
  let active = false;

  const setOpen = (open, restoreFocus = false) => {
    const next = active && open;
    menu.hidden = !next;
    toggle.setAttribute("aria-expanded", String(next));
    if (next) {
      const available = Math.max(0, (window.visualViewport?.height || innerHeight)
        - toolbar.closest(".chat-header").getBoundingClientRect().bottom - 12);
      menu.style.maxHeight = `${available}px`;
      const first = [...menu.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled)")]
        .find(element => element.getClientRects().length > 0);
      first?.focus({ preventScroll: true });
    } else if (restoreFocus && active) {
      toggle.focus({ preventScroll: true });
    }
  };

  const syncIndicators = () => {
    byId("callCameraOffIndicator").hidden = !(camera.disabled || camera.classList.contains("selected"));
    byId("callMicrophoneOffIndicator").hidden = !(microphone.disabled || microphone.classList.contains("selected"));
    byId("callVideoFacingToggle").disabled = camera.disabled;
  };

  const captions = new Map();
  const syncCaptions = () => {
    for (const [button, caption] of captions) caption.textContent = button.getAttribute("aria-label") || button.title;
    syncIndicators();
  };
  for (const button of [...controls.querySelectorAll(":scope > button"), ...extraButtons]) {
    if (button.id === "hangupCallPanelButton") continue;
    const caption = document.createElement("span");
    caption.className = "call-control-caption";
    button.append(caption);
    captions.set(button, caption);
    new MutationObserver(syncCaptions).observe(button, {
      attributes: true, attributeFilter: ["aria-label", "title", "class", "disabled"]
    });
  }

  const sync = () => {
    const next = document.body.classList.contains("call-active") && !panel.hidden;
    if (next === active) return;
    active = next;
    setOpen(false);
    if (active) {
      menu.append(controls);
      byId("callCameraSwitchSlot").append(facing);
      byId("callHangupSlot").append(hangup);
      for (const button of extraButtons) controls.insertBefore(button, controls.querySelector(".call-device-controls"));
    } else {
      const focusWasInside = toolbar.contains(document.activeElement) || menu.contains(document.activeElement);
      for (const { element, marker } of moved) marker.after(element);
      if (focusWasInside) byId("startTotalCallOption")?.focus({ preventScroll: true });
    }
    toolbar.hidden = !active;
    document.body.classList.toggle("call-menu-active", active);
    if (!active) window.dispatchEvent(new Event("teletyptel:call-controls-restored"));
    syncCaptions();
  };

  toggle.addEventListener("click", () => setOpen(menu.hidden, !menu.hidden));
  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false, true);
  });
  document.addEventListener("focusin", event => {
    if (!menu.hidden && !menu.contains(event.target) && event.target !== toggle) setOpen(false);
  });
  document.addEventListener("keydown", event => {
    if (!menu.hidden && event.key === "Escape") {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  menu.addEventListener("click", event => {
    if (event.target.closest("#callKeyboardButton, #callKeypadButton, #interpreterButton")) {
      setOpen(false);
      queueMicrotask(() => {
        if (menu.contains(document.activeElement)) toggle.focus({ preventScroll: true });
      });
    }
  }, true);
  window.addEventListener("resize", () => setOpen(false, menu.contains(document.activeElement)));
  window.addEventListener("pagehide", () => setOpen(false));
  byId("callKeypadDialog")?.addEventListener("close", () => {
    if (active && (document.activeElement === document.body || menu.contains(document.activeElement)
      || byId("callKeypadDialog").contains(document.activeElement))) {
      toggle.focus({ preventScroll: true });
    }
  });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  sync();
})();
