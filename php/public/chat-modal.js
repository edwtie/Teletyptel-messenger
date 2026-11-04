(function () {
  "use strict";
  const entries = [];
  const inertElements = new Map();
  let previousFocus = document.activeElement;
  let synchronizing = false;
  const visible = element => element?.isConnected && !element.closest("[hidden], [inert]")
    && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  const controls = dialog => [...dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
    .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && visible(element));
  const nativeModal = () => document.querySelector("dialog:modal");
  const restoreInert = () => {
    for (const [element, inert] of inertElements) element.inert = inert;
    inertElements.clear();
  };
  const focusInside = dialog => {
    const title = document.getElementById(dialog.getAttribute("aria-labelledby"));
    const target = title && dialog.contains(title) ? title : dialog;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };
  const sync = returnTarget => {
    if (synchronizing) return;
    const native = nativeModal();
    if (native) {
      for (const [element, inert] of inertElements) {
        if (element === native || element.contains(native)) element.inert = inert;
      }
      return;
    }
    synchronizing = true;
    try {
      restoreInert();
      let restoreTarget = null;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.dialog.hidden || !entry.dialog.isConnected) {
          if (index === entries.length - 1) restoreTarget = entry.returnTarget;
          entries.splice(index, 1);
        }
      }
      for (const dialog of document.querySelectorAll('[aria-modal="true"]:not(dialog)')) {
        if (dialog.hidden || entries.some(entry => entry.dialog === dialog)) continue;
        const candidate = returnTarget || document.activeElement;
        entries.push({ dialog, returnTarget: dialog.contains(candidate) ? previousFocus : candidate });
      }
      const dialog = entries.at(-1)?.dialog;
      if (!nativeModal()) {
        if (dialog) {
          for (let branch = dialog; branch && branch !== document.body; branch = branch.parentElement) {
            for (const sibling of branch.parentElement.children) {
              if (sibling === branch) continue;
              inertElements.set(sibling, sibling.inert);
              sibling.inert = true;
            }
          }
        }
        if (restoreTarget && visible(restoreTarget) && (!dialog || dialog.contains(restoreTarget))) {
          restoreTarget.focus({ preventScroll: true });
        }
        if (dialog && !dialog.contains(document.activeElement)) focusInside(dialog);
      }
    } finally { synchronizing = false; }
  };
  document.addEventListener("focusin", event => {
    sync(event.relatedTarget);
    const dialog = entries.at(-1)?.dialog;
    if (dialog && !nativeModal() && !dialog.contains(event.target)) focusInside(dialog);
    previousFocus = event.target;
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Tab" || nativeModal()) return;
    sync();
    const dialog = entries.at(-1)?.dialog;
    if (!dialog) return;
    const items = controls(dialog);
    const index = items.indexOf(document.activeElement);
    if (!items.length) { event.preventDefault(); focusInside(dialog); return; }
    if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
      event.preventDefault();
      items[event.shiftKey ? items.length - 1 : 0].focus({ preventScroll: true });
    }
  }, true);
  new MutationObserver(() => sync()).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["hidden", "open"]
  });
  sync();
})();
