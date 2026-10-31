(() => {
  if (location.protocol !== "capacitor:" || location.hostname !== "localhost"
      || window.Capacitor?.getPlatform?.() !== "ios"
      || !window.Capacitor?.isPluginAvailable?.("Keyboard")) return;

  const orientation = () => {
    const type = window.screen?.orientation?.type;
    if (type) return type.startsWith("landscape");
    if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
    return window.screen.width > window.screen.height;
  };
  const keyboard = { nativeResize: true, active: false, landscape: orientation() };
  window.TeleTypTelKeyboard = keyboard;
  const update = () => {
    keyboard.landscape = orientation();
    window.dispatchEvent(new Event("teletyptel:keyboard-layout"));
  };
  for (const name of ["keyboardWillShow", "keyboardDidShow"]) {
    window.addEventListener(name, event => {
      keyboard.active = Number(event.keyboardHeight ?? event.detail?.keyboardHeight ?? 0) > 0;
      update();
    });
  }
  for (const name of ["keyboardWillHide", "keyboardDidHide"]) {
    window.addEventListener(name, () => { keyboard.active = false; update(); });
  }
  window.addEventListener("orientationchange", update);
  window.screen?.orientation?.addEventListener("change", update);
})();
