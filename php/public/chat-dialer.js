"use strict";
(() => {
  const dialog = document.getElementById("phoneDialerDialog");
  const trigger = document.getElementById("phoneDialerButton");
  const form = document.getElementById("phoneDialerForm");
  const number = document.getElementById("phoneDialerNumber");
  const invalid = document.getElementById("phoneDialerInvalid");
  const keys = document.getElementById("phoneDialerKeys");
  let returnFocus = trigger;

  const validate = () => {
    const value = number.value.trim();
    const normalized = value.replace(/[ ()-]/g, "");
    const valid = !value || (/^[+0-9 ()-]+$/.test(value) && /^\+[1-9][0-9]{1,14}$/.test(normalized));
    invalid.hidden = valid;
    number.setAttribute("aria-invalid", String(!valid));
  };
  const reset = () => {
    form.reset();
    invalid.hidden = true;
    number.removeAttribute("aria-invalid");
  };
  trigger.addEventListener("click", () => {
    returnFocus = window.matchMedia("(max-width: 520px)").matches
      ? document.getElementById("mobileActionsToggle") : trigger;
    queueMicrotask(() => {
      if (dialog.open) return;
      reset();
      dialog.showModal();
      number.focus();
    });
  });
  document.getElementById("phoneDialerClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    reset();
    returnFocus?.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      dialog.close();
    } else if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }, true);
  number.addEventListener("input", validate);
  keys.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) event.preventDefault();
  });
  keys.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    let start = number.selectionStart ?? number.value.length;
    const end = number.selectionEnd ?? start;
    const digit = button.dataset.digit ?? "";
    if (!digit && start === end) start = Math.max(0, start - 1);
    if (number.value.length - (end - start) + digit.length > number.maxLength) return;
    number.setRangeText(digit, start, end, "end");
    number.focus();
    validate();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    validate();
  });
  window.addEventListener("pagehide", () => {
    dialog.close();
    reset();
  });
})();
