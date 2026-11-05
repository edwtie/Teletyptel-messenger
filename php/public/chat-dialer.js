"use strict";
(() => {
  const dialog = document.getElementById("phoneDialerDialog");
  const trigger = document.getElementById("phoneDialerButton");
  const form = document.getElementById("phoneDialerForm");
  const number = document.getElementById("phoneDialerNumber");
  const invalid = document.getElementById("phoneDialerInvalid");
  const keys = document.getElementById("phoneDialerKeys");
  const keypadPanel = document.getElementById("phoneDialerKeypadPanel");
  const contactsPanel = document.getElementById("phoneDialerContactsPanel");
  const keypadView = document.getElementById("phoneDialerKeypadView");
  const contactsView = document.getElementById("phoneDialerContactsView");
  const contactsList = document.getElementById("phoneDialerContactsList");
  const deviceContact = document.getElementById("phoneDialerDeviceContact");
  const deviceError = document.getElementById("phoneDialerDeviceError");
  let pickerBusy = false;
  let viewGeneration = 0;
  let returnFocus = trigger;
  let selectionStart = 0;
  let selectionEnd = 0;
  const letterGroups = { 2: "ABC", 3: "DEF", 4: "GHI", 5: "JKL", 6: "MNO", 7: "PQRS", 8: "TUV", 9: "WXYZ" };
  let heldKey = null;
  let suppressedClick = null;

  const cancelHold = () => {
    if (!heldKey) return;
    suppressedClick = heldKey.button;
    clearTimeout(heldKey.timer);
    heldKey.label.textContent = heldKey.digit;
    heldKey.button.classList.remove("is-holding");
    heldKey = null;
  };

  const rememberSelection = () => {
    selectionStart = number.selectionStart ?? number.value.length;
    selectionEnd = number.selectionEnd ?? selectionStart;
  };

  const nativeContacts = () => {
    const capacitor = window.Capacitor;
    if (window.location.protocol !== "capacitor:" || window.location.hostname !== "localhost"
        || capacitor?.getPlatform?.() !== "ios" || !capacitor.isPluginAvailable?.("TeleTypTelContacts")) return null;
    const plugin = capacitor.Plugins?.TeleTypTelContacts;
    return typeof plugin?.pickPhoneNumber === "function" ? plugin : null;
  };

  const chooseNumber = (value) => {
    number.value = value;
    selectionStart = selectionEnd = number.value.length;
    number.setSelectionRange(selectionStart, selectionEnd);
    validate();
    showContacts(false);
    keypadView.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  };

  const renderContacts = () => {
    deviceContact.hidden = !nativeContacts();
    const detail = { contacts: [] };
    window.dispatchEvent(new CustomEvent("teletyptel:dialer-contacts-request", { detail }));
    const focusedId = document.activeElement?.dataset.contactId;
    contactsList.replaceChildren();
    for (const contact of detail.contacts) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.contactId = contact.id;
      const name = document.createElement("strong");
      name.textContent = contact.name;
      const phone = document.createElement("span");
      phone.textContent = contact.number;
      button.append(name, phone);
      button.addEventListener("click", () => {
        chooseNumber(contact.number);
      });
      contactsList.appendChild(button);
      if (focusedId === contact.id) button.focus({ preventScroll: true });
    }
    if (focusedId && !detail.contacts.some(contact => contact.id === focusedId)) {
      contactsView.focus({ preventScroll: true });
    }
    document.getElementById("phoneDialerContactsEmpty").hidden = detail.contacts.length > 0;
  };
  const showContacts = (visible) => {
    cancelHold();
    keypadPanel.hidden = visible;
    contactsPanel.hidden = !visible;
    keypadView.setAttribute("aria-pressed", String(!visible));
    contactsView.setAttribute("aria-pressed", String(visible));
    if (visible) renderContacts();
  };

  const validate = () => {
    const value = number.value.trim();
    const normalized = value.toUpperCase().replace(/[A-Z]/g, letter =>
      Object.keys(letterGroups).find(digit => letterGroups[digit].includes(letter))).replace(/[ ()-]/g, "");
    const valid = !value || (/^[+0-9A-Za-z ()-]+$/.test(value) && /^\+[1-9][0-9]{1,14}$/.test(normalized));
    invalid.hidden = valid;
    number.setAttribute("aria-invalid", String(!valid));
  };
  const reset = () => {
    cancelHold();
    suppressedClick = null;
    viewGeneration++;
    deviceError.hidden = true;
    form.reset();
    showContacts(false);
    contactsList.replaceChildren();
    number.setSelectionRange(0, 0);
    selectionStart = selectionEnd = 0;
    invalid.hidden = true;
    number.removeAttribute("aria-invalid");
  };
  const insertDigit = (digit) => {
    if (document.activeElement === number) rememberSelection();
    let start = Math.min(selectionStart, number.value.length);
    const end = Math.min(selectionEnd, number.value.length);
    if (!digit && start === end) start = Math.max(0, start - 1);
    if (number.value.length - (end - start) + digit.length > number.maxLength) return;
    number.value = number.value.slice(0, start) + digit + number.value.slice(end);
    selectionStart = selectionEnd = start + digit.length;
    number.setSelectionRange(selectionStart, selectionEnd);
    validate();
  };
  trigger.addEventListener("click", () => {
    const menuToggle = document.getElementById("mobileActionsToggle");
    returnFocus = menuToggle?.getClientRects().length ? menuToggle : trigger;
    queueMicrotask(() => {
      if (dialog.open) return;
      reset();
      document.activeElement?.blur();
      dialog.showModal();
      document.getElementById("phoneDialerClose").focus({ preventScroll: true });
    });
  });
  document.getElementById("phoneDialerClose").addEventListener("click", () => dialog.close());
  keypadView.addEventListener("click", () => showContacts(false));
  contactsView.addEventListener("click", () => showContacts(true));
  deviceContact.addEventListener("click", async () => {
    const plugin = nativeContacts();
    if (!dialog.open || contactsPanel.hidden || !plugin || pickerBusy) return;
    const generation = viewGeneration;
    pickerBusy = true;
    deviceContact.disabled = true;
    deviceError.hidden = true;
    try {
      const result = await plugin.pickPhoneNumber({ language: document.documentElement.lang.startsWith("en") ? "en" : "nl" });
      if (!dialog.open || generation !== viewGeneration) return;
      if (typeof result?.phoneNumber !== "string" || !result.phoneNumber.trim() || result.phoneNumber.length > 40) {
        throw new Error("Invalid contact selection");
      }
      chooseNumber(result.phoneNumber.trim());
    } catch (error) {
      if (dialog.open && generation === viewGeneration && error?.code !== "CANCELLED") deviceError.hidden = false;
    } finally {
      pickerBusy = false;
      deviceContact.disabled = false;
    }
  });
  window.addEventListener("teletyptel:dialer-contacts-changed", () => {
    if (dialog.open && !contactsPanel.hidden) renderContacts();
  });
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
    } else if (!keypadPanel.hidden && event.target !== number && !event.ctrlKey && !event.metaKey && !event.altKey
        && (/^[+0-9]$/.test(event.key) || event.key === "Backspace")) {
      event.preventDefault();
      insertDigit(event.key === "Backspace" ? "" : event.key);
    } else if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")]
        .filter(element => element.getClientRects().length > 0);
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
  number.addEventListener("input", () => {
    rememberSelection();
    validate();
  });
  number.addEventListener("blur", rememberSelection);
  keys.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || !dialog.open || keypadPanel.hidden) return;
    event.preventDefault();
    if (event.isPrimary === false || event.button !== 0) return;
    cancelHold();
    suppressedClick = null;
    const digit = button.dataset.digit;
    if (!letterGroups[digit]) return;
    if (document.activeElement === number) rememberSelection();
    heldKey = { button, digit, label: button.firstElementChild, pointerId: event.pointerId, index: 0,
      characters: digit + letterGroups[digit], generation: viewGeneration, timer: null };
    button.setPointerCapture(event.pointerId);
    const advance = () => {
      if (!heldKey || !dialog.open || keypadPanel.hidden || heldKey.generation !== viewGeneration) return cancelHold();
      heldKey.index = (heldKey.index + 1) % heldKey.characters.length;
      heldKey.label.textContent = heldKey.characters[heldKey.index];
      heldKey.button.classList.add("is-holding");
      heldKey.timer = setTimeout(advance, 650);
    };
    heldKey.timer = setTimeout(advance, 500);
  });
  keys.addEventListener("pointerup", (event) => {
    if (!heldKey || event.pointerId !== heldKey.pointerId) return;
    const current = heldKey;
    const bounds = current.button.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    cancelHold();
    suppressedClick = current.button;
    if (inside) insertDigit(current.characters[current.index]);
  });
  for (const type of ["pointercancel", "lostpointercapture"]) {
    keys.addEventListener(type, event => {
      if (heldKey?.pointerId !== event.pointerId) return;
      cancelHold();
    });
  }
  keys.addEventListener("contextmenu", event => event.preventDefault());
  window.addEventListener("blur", cancelHold);
  window.addEventListener("resize", cancelHold);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelHold();
  });
  keys.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || !dialog.open || keypadPanel.hidden) return;
    if (event.detail > 0 && suppressedClick === button) {
      suppressedClick = null;
      return;
    }
    insertDigit(button.dataset.digit ?? "");
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
