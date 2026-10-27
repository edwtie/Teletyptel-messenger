"use strict";
window.TeleTypTelSupportMessageMenu = {
  mount({ language, request, refresh }) {
    const word = language.word, bindings = new Map();
    const menu = document.createElement("div"); menu.className = "support-message-menu"; menu.hidden = true; menu.setAttribute("role", "menu");
    const editor = document.createElement("dialog"); editor.className = "support-message-editor";
    editor.innerHTML = '<form><h2></h2><p class="support-message-explanation"></p><label><span></span><textarea rows="4" maxlength="2000" required></textarea></label><p class="support-message-error" role="alert" hidden></p><div class="support-message-editor-actions"><button type="button" data-action="cancel"></button><button type="submit" data-action="save"></button></div></form>';
    document.body.append(menu, editor);
    const form = editor.querySelector("form"), input = editor.querySelector("textarea"), error = editor.querySelector('[role="alert"]');
    const cancel = editor.querySelector('[data-action="cancel"]'), save = editor.querySelector('[data-action="save"]');
    let thread = "", permitted = false, selected = null, editing = null, busy = false, pending = null, pressTimer = null;
    const hideMenu = (restore = false) => {
      menu.hidden = true;
      if (restore && selected?.entry.isConnected) selected.trigger.focus();
      selected = null;
    };
    const hide = () => { clearTimeout(pressTimer); hideMenu(); if (editor.open) editor.close(); editing = null; pending = null; input.value = ""; };
    const localize = () => {
      menu.setAttribute("aria-label", word("Berichtmenu", "Message menu"));
      editor.setAttribute("aria-label", editing?.action === "copy" ? word("Kopiëren", "Copy") : editing?.action === "delete" ? word("Bericht verwijderen", "Delete message") : word("Bericht bewerken", "Edit message"));
      editor.querySelector("h2").textContent = editor.getAttribute("aria-label");
      editor.querySelector("label span").textContent = word("Je bericht", "Your message");
      editor.querySelector(".support-message-explanation").textContent = editing?.action === "copy"
        ? word("Kopiëren niet toegestaan. Selecteer en kopieer de tekst zelf.", "Clipboard access denied. Select and copy the text yourself.") : editing?.action === "delete"
        ? word("Dit bericht voor iedereen verwijderen? Ook de bijlage wordt verwijderd. Dit kun je niet ongedaan maken.", "Delete this message for everyone? Its attachment will also be deleted. This cannot be undone.")
        : word("Alleen dit bericht wordt aangepast. Je nieuwe concept in de chat blijft staan.", "Only this message changes. Your new draft in the chat is preserved.");
      cancel.textContent = word("Annuleren", "Cancel");
      save.textContent = editing?.action === "delete" ? word("Verwijderen", "Delete") : word("Opslaan", "Save");
      for (const [entry, binding] of bindings) {
        if (!entry.isConnected) { bindings.delete(entry); continue; }
        binding.trigger.title = word("Berichtmenu", "Message menu"); binding.trigger.setAttribute("aria-label", binding.trigger.title);
        if (binding.message.deleted) entry.querySelector("p").textContent = word("Bericht verwijderd", "Message deleted");
        if (binding.badge) binding.badge.textContent = word("Bewerkt", "Edited");
      }
    };
    const openEditor = (binding, action) => {
      hideMenu(); editing = { ...binding, action, thread }; pending = null;
      input.value = action === "edit" ? binding.message.text : ""; input.required = action === "edit";
      editor.querySelector("label").hidden = action !== "edit"; error.hidden = true;
      localize(); editor.showModal(); (action === "edit" ? input : cancel).focus();
    };
    const positionMenu = (binding, point) => {
      const anchor = binding.trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      menu.style.left = Math.max(left + 8, Math.min(point?.x ?? anchor.left, left + (viewport?.width || innerWidth) - menu.offsetWidth - 8)) + "px";
      menu.style.top = Math.max(top + 8, Math.min(point?.y ?? anchor.bottom, top + (viewport?.height || innerHeight) - menu.offsetHeight - 8)) + "px";
    };
    const openMenu = (binding, point) => {
      if (busy || !binding.entry.isConnected || binding.thread !== thread || editor.open) return;
      menu.replaceChildren(); selected = binding;
      const action = (name, callback, danger = false) => {
        const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitem"); button.textContent = name;
        if (danger) button.className = "danger";
        button.addEventListener("click", callback); menu.append(button);
      };
      if (permitted && binding.message.canEdit) action(word("Bewerken", "Edit"), () => openEditor(binding, "edit"));
      if (permitted && binding.message.canDelete) action(word("Verwijderen", "Delete"), () => openEditor(binding, "delete"), true);
      if (!binding.message.deleted && binding.message.text) action(word("Kopiëren", "Copy"), async () => {
        hideMenu(true);
        try { await navigator.clipboard.writeText(binding.message.text); }
        catch {
          openEditor(binding, "copy"); editor.querySelector("label").hidden = false; input.value = binding.message.text; input.readOnly = true;
          input.select(); editor.querySelector("h2").textContent = word("Kopiëren", "Copy");
          editor.querySelector(".support-message-explanation").textContent = word("Kopiëren niet toegestaan. Selecteer en kopieer de tekst zelf.", "Clipboard access denied. Select and copy the text yourself."); save.hidden = true;
        }
      });
      if (!binding.message.deleted && binding.message.attachment) action(word("Downloaden", "Download"), () => { hideMenu(true); binding.entry.querySelector(".support-file")?.click(); });
      if (!menu.children.length) { hideMenu(); return; }
      menu.hidden = false;
      positionMenu(binding, point);
      menu.querySelector("button").focus({ preventScroll: true });
    };
    menu.addEventListener("keydown", (event) => {
      const buttons = [...menu.querySelectorAll("button")], position = buttons.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (position + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      } else if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); hideMenu(true); }
    });
    document.addEventListener("pointerdown", (event) => { if (!menu.contains(event.target)) hideMenu(); });
    window.addEventListener("resize", () => hideMenu());
    document.addEventListener("scroll", () => { if (!menu.hidden && selected) positionMenu(selected); }, true);
    cancel.addEventListener("click", () => { if (!busy) editor.close(); });
    editor.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    editor.addEventListener("close", () => {
      const current = editing;
      const binding = current && [...bindings.values()].find((candidate) => candidate.entry.isConnected && candidate.thread === current.thread && candidate.message.sequence === current.message.sequence);
      editing = null; pending = null; input.value = ""; input.readOnly = false; save.hidden = false;
      if (binding) (binding.trigger.isConnected ? binding.trigger : binding.entry).focus();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (busy || !editing || editing.action === "copy") return;
      const current = editing, text = input.value;
      if (!pending || pending.text !== text) pending = { action: current.action, threadId: current.thread, sequence: Number(current.message.sequence), revision: current.message.revision, text, clientId: crypto.randomUUID() };
      const body = pending; busy = true; save.disabled = cancel.disabled = true; input.readOnly = true; error.hidden = true;
      try {
        await request(body);
        if (thread === current.thread) await refresh();
        if (editing === current) editor.close();
      } catch (failure) {
        if (editing === current) {
          error.textContent = failure.status === 409
            ? word("Dit bericht of gesprek is intussen gewijzigd. Sluit dit venster en open het bericht opnieuw. Je tekst staat hier nog.", "This message or chat has changed. Close this window and reopen the message. Your text is still here.")
            : word("Opslaan mislukt. Je tekst blijft staan; probeer opnieuw.", "Saving failed. Your text is preserved; try again.");
          error.hidden = false;
        }
      } finally { busy = false; save.disabled = cancel.disabled = false; input.readOnly = editing?.action === "copy"; }
    });
    language.onChange(() => { hideMenu(); localize(); }); localize();
    return {
      hide,
      sync(identifier, writable) {
        if (thread !== identifier || (permitted && !writable)) hide();
        thread = identifier; permitted = writable;
        if (selected && !selected.entry.isConnected) hideMenu();
        for (const entry of bindings.keys()) if (!entry.isConnected) bindings.delete(entry);
      },
      attach(entry, message, identifier) {
        const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "support-message-more"; trigger.textContent = "⋯"; trigger.setAttribute("aria-haspopup", "menu");
        entry.classList.add("support-menu-message"); entry.dataset.sequence = message.sequence; entry.tabIndex = 0;
        const badge = message.editedAt && !message.deleted ? document.createElement("small") : null;
        if (badge) { badge.className = "support-message-edited"; entry.append(badge); }
        const binding = { entry, message, trigger, badge, thread: identifier }; bindings.set(entry, binding);
        if (!message.deleted) entry.append(trigger);
        localize();
        trigger.addEventListener("click", () => openMenu(binding));
        entry.addEventListener("contextmenu", (event) => { if (!message.deleted) { event.preventDefault(); openMenu(binding, { x: event.clientX, y: event.clientY }); } });
        entry.addEventListener("keydown", (event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); openMenu(binding); }
        });
        let start = null;
        entry.addEventListener("pointerdown", (event) => {
          if (event.pointerType !== "touch" || event.target.closest("button, a, summary")) return;
          start = { x: event.clientX, y: event.clientY }; clearTimeout(pressTimer);
          pressTimer = setTimeout(() => { openMenu(binding, start); start = null; }, 550);
        });
        entry.addEventListener("pointermove", (event) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { clearTimeout(pressTimer); start = null; } });
        for (const name of ["pointerup", "pointercancel"]) entry.addEventListener(name, () => { clearTimeout(pressTimer); start = null; });
      }
    };
  }
};
