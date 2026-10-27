"use strict";
(() => {
  const toggle = document.getElementById("mobileActionsToggle");
  const panel = document.getElementById("mobileActionsPanel");
  const header = toggle.closest(".topbar");
  const mobile = window.matchMedia("(max-width: 520px)");
  const setOpen = (open, restoreFocus = false) => {
    header.classList.toggle("mobile-actions-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) {
      panel.querySelectorAll("details[open]").forEach((details) => { details.open = false; });
      if (restoreFocus) toggle.focus();
    }
  };
  document.body.classList.add("mobile-navigation-ready");
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  panel.addEventListener("click", (event) => {
    if (!mobile.matches || !event.target.closest("button") || event.target.closest(".top-menu")) return;
    setOpen(false, panel.contains(document.activeElement));
  });
  document.addEventListener("click", (event) => {
    if (mobile.matches && !header.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener("focusin", (event) => {
    if (mobile.matches && !header.contains(event.target)) setOpen(false);
  });
  mobile.addEventListener("change", () => setOpen(false));
  window.addEventListener("pagehide", () => setOpen(false));

  const moreToggle = document.getElementById("chatMoreToggle");
  const morePanel = document.getElementById("chatMorePanel");
  const callStatus = document.getElementById("callStatus");
  const mobileCallStatus = document.getElementById("mobileCallStatus");
  const callStateControls = ["answerCallButton", "hangupCallButton"].map((id) => document.getElementById(id));
  const controls = ["startAudioCallOption", "startVideoCallOption", "resetRttButton", "enableRttButton"].map((id) => {
    const element = document.getElementById(id);
    const anchor = document.createTextNode("");
    element.before(anchor);
    return { element, anchor };
  });
  let compact = false;
  const setMoreOpen = (open, restoreFocus = false) => {
    morePanel.hidden = !open;
    moreToggle.setAttribute("aria-expanded", String(open));
    if (restoreFocus) moreToggle.focus();
    if (open) setOpen(false);
  };
  const syncLayout = () => {
    const nextCompact = mobile.matches && !document.body.classList.contains("call-active")
      && callStateControls.every((element) => element.hidden);
    if (nextCompact === compact) return;
    const focusedControl = controls.find(({ element }) => element === document.activeElement);
    setMoreOpen(false);
    setOpen(false);
    compact = nextCompact;
    controls.forEach(({ element, anchor }) => {
      if (compact) morePanel.insertBefore(element, mobileCallStatus);
      else anchor.after(element);
    });
    document.body.classList.toggle("compact-chat-header", compact);
    if (focusedControl) {
      if (compact) moreToggle.focus();
      else focusedControl.element.focus();
    }
  };
  moreToggle.addEventListener("click", () => setMoreOpen(morePanel.hidden));
  morePanel.addEventListener("click", (event) => {
    if (event.target.closest("button")) setMoreOpen(false, morePanel.contains(document.activeElement));
  });
  const closeMoreOutside = (event) => {
    if (!moreToggle.contains(event.target) && !morePanel.contains(event.target)) setMoreOpen(false);
  };
  document.addEventListener("click", closeMoreOutside);
  document.addEventListener("focusin", closeMoreOutside);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !morePanel.hidden) {
      event.preventDefault();
      setMoreOpen(false, true);
    }
  });
  mobile.addEventListener("change", syncLayout);
  window.addEventListener("pagehide", () => setMoreOpen(false));
  new MutationObserver(syncLayout).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const callStateObserver = new MutationObserver(syncLayout);
  callStateControls.forEach((element) => callStateObserver.observe(element, { attributes: true, attributeFilter: ["hidden"] }));
  const syncCallStatus = () => { mobileCallStatus.textContent = callStatus.textContent; };
  new MutationObserver(syncCallStatus).observe(callStatus, { childList: true, characterData: true, subtree: true });
  syncCallStatus();
  syncLayout();
})();
