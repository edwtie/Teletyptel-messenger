"use strict";
window.TeleTypTelSupportAttachments = {
  mount({ container, selectionHost = null, symbol = "attachment", request, endpoint, language, onSent, onError }) {
    const word = language.word, icons = window.TeleTypTelSupportIcons;
    container.classList.add("support-attachments");
    container.innerHTML = '<button type="button" data-file="choose"></button><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" hidden><div class="support-file-selection" hidden><span></span><button type="button" data-file="send"></button><button type="button" data-file="cancel"></button></div><p class="support-file-error" role="alert" hidden></p>';
    const failure = container.querySelector(".support-file-error");
    const input = container.querySelector("input"), selection = container.querySelector(".support-file-selection"), name = selection.querySelector("span");
    const choose = container.querySelector('[data-file="choose"]'), send = container.querySelector('[data-file="send"]'), cancel = container.querySelector('[data-file="cancel"]');
    if (selectionHost) selectionHost.append(selection, failure);
    let thread = "", clientId = "", busy = false, enabled = false;
    container.hidden = true; choose.disabled = send.disabled = cancel.disabled = true;
    const clear = () => { input.value = ""; clientId = ""; name.textContent = ""; selection.hidden = true; failure.hidden = true; };
    const localize = () => {
      icons.set(choose, symbol, word("Foto of document toevoegen", "Attach photo or document"));
      choose.title += " · PDF, DOC, DOCX, JPG, PNG, WebP · 5 MB";
      icons.set(send, "send", word("Bestand versturen", "Send file"));
      icons.set(cancel, "close", word("Annuleren", "Cancel"));
      input.setAttribute("aria-label", choose.getAttribute("aria-label"));
    };
    language.onChange(localize); localize();
    choose.addEventListener("click", () => input.click()); cancel.addEventListener("click", clear);
    input.addEventListener("change", () => {
      const file = input.files[0]; if (!file) { clear(); return; }
      if (file.size > 5 * 1024 * 1024 || !/\.(pdf|docx?|jpe?g|png|webp)$/i.test(file.name)) {
        clear(); failure.textContent = word("Kies PDF, Word of een foto, maximaal 5 MB.", "Choose PDF, Word or a photo, maximum 5 MB."); failure.hidden = false; return;
      }
      clientId = crypto.randomUUID(); failure.hidden = true; name.textContent = file.name + " · " + Math.ceil(file.size / 1024) + " KB"; selection.hidden = false;
    });
    send.addEventListener("click", async () => {
      const file = input.files[0], identifier = thread;
      if (busy || !enabled || !identifier || !file) return;
      busy = true; failure.hidden = true; choose.disabled = send.disabled = cancel.disabled = true;
      const form = new FormData(); form.set("file", file); form.set("threadId", identifier); form.set("clientId", clientId);
      try { await request(form); if (thread === identifier) { clear(); await onSent(); } }
      catch (error) { if (thread === identifier && error.name !== "AbortError") { failure.textContent = word("Bestand versturen mislukt. Controleer type en grootte (maximaal 5 MB) en probeer opnieuw.", "File upload failed. Check the file type and size (maximum 5 MB), then try again."); failure.hidden = false; if ([401, 403].includes(error.status)) onError(error); } }
      finally { busy = false; choose.disabled = send.disabled = cancel.disabled = !enabled; }
    });
    return {
      setThread(identifier, permitted) { if (thread !== identifier) clear(); thread = identifier; enabled = Boolean(identifier && permitted); container.hidden = !enabled; if (selectionHost) selectionHost.hidden = !enabled; choose.disabled = send.disabled = cancel.disabled = busy || !enabled; },
      render(parent, message, identifier) {
        const file = message.attachment; if (!file) return;
        const url = new URL(endpoint, location.href); url.searchParams.set("thread", identifier); url.searchParams.set("attachment", file.id);
        const link = document.createElement("a"); link.className = "support-file"; link.href = url.href; link.download = file.name;
        link.textContent = file.name + " · " + Math.ceil(Number(file.size) / 1024) + " KB";
        if (file.mime.startsWith("image/")) {
          url.searchParams.set("preview", "1");
          const photo = document.createElement("img"); photo.src = url.href; photo.alt = file.name; photo.loading = "lazy"; photo.width = 220; photo.height = 160; link.prepend(photo);
        }
        parent.append(link);
      }
    };
  }
};
