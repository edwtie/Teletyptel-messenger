(function (root) {
  "use strict";

  function mount(document, client) {
    const byID = name => document.getElementById(name);
    const input = byID("hybridMessageInput");
    const messages = byID("hybridMessages");
    const panel = byID("hybridConversation");
    const notice = byID("hybridChatNotice");
    const menu = byID("hybridMessageMenu");
    const actionDialog = byID("hybridMessageAction");
    const drafts = new Map();
    const displayed = new Set();
    let state = null;
    let epoch = null;
    let peer = null;
    let kind = "direct";
    const draftKey = () => kind + ":" + peer;
    let dirty = false;
    let sending = false;
    let revision = 0;
    let nextDraft = null;
    let draftWork = null;
    let selectedMessage = null;
    let dialogAction = null;
    let disposed = false;
    let renderedSignature = "";

    function remember() {
      if (!peer || !epoch) return;
      drafts.set(draftKey(), input.value);
      nextDraft = { peer, epoch, kind, body: input.value };
    }

    function flush() {
      if (disposed) return Promise.reject(new Error("bridgeClosed"));
      if (!draftWork) {
        draftWork = (async () => {
          while (nextDraft) {
            const value = nextDraft;
            nextDraft = null;
            await client.setDraft(value.peer, value.body, value.epoch, value.kind);
          }
        })().finally(() => { draftWork = null; });
      }
      return draftWork;
    }

    function setNotice(value) { if (notice.textContent !== value) notice.textContent = value; }

    function scheduleDisplayed() {
      document.defaultView.requestAnimationFrame(() => {
        if (disposed || !state?.conversation || state.conversation.peer !== peer || document.visibilityState !== "visible" || panel.hidden
            || !["idle", "failed"].includes(state.call.phase)) return;
        const bounds = messages.getBoundingClientRect();
        const visible = state.conversation.messages.filter(message => !message.outgoing && !displayed.has(message.id)).filter(message => {
          const row = Array.from(messages.children).find(element => element.dataset.messageId === message.id);
          const box = row?.getBoundingClientRect();
          return box && box.height > 0 && box.bottom > bounds.top && box.top < bounds.bottom && box.top < innerHeight && box.bottom > 0;
        }).slice(0, 50).map(message => message.id);
        if (!visible.length) return;
        for (const id of visible) displayed.add(id);
        void client.displayed(peer, visible).catch(() => { for (const id of visible) displayed.delete(id); });
      });
    }

    function showMenu(message, anchor) {
      selectedMessage = message.id;
      const own = message.outgoing && message.state === "submitted" && !message.retracted;
      for (const button of menu.querySelectorAll("button")) {
        const action = button.dataset.messageAction;
        button.hidden = (action === "edit" && !(own && state.conversation.canChange)) || (action === "retract" && !message.canRetract)
          || (action === "react" && !message.canReact) || (action === "translate" && (!state.extras.ready || !state.extras.available || state.extras.mode === "off" || !state.extras.consent || message.retracted));
        button.disabled = action !== "hide" && !state.conversation.canSend;
      }
      menu.hidden = false;
      const box = anchor.getBoundingClientRect();
      const width = Math.min(230, document.defaultView.innerWidth - 16);
      menu.style.width = width + "px";
      menu.style.left = Math.max(8, Math.min(box.left, innerWidth - width - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(box.bottom, innerHeight - menu.offsetHeight - 8)) + "px";
      menu.querySelector("button:not([hidden])")?.focus();
    }

    function renderMessages(conversation) {
      const signature = JSON.stringify([peer, kind, conversation.messages, state.extras.translations, state.extras.fileMessages, state.account.avatars]);
      if (signature === renderedSignature) return;
      const atBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
      const existing = new Map(Array.from(messages.children, row => [row.dataset.messageId, row]));
      for (const [index, message] of conversation.messages.entries()) {
        const row = existing.get(message.id) || document.createElement("article");
        existing.delete(message.id);
        row.dataset.messageId = message.id;
        row.className = "message with-avatar" + (message.outgoing ? " self" : "");
        const avatar = document.createElement("span");
        avatar.className = "avatar";
        avatar.setAttribute("aria-hidden", "true");
        const contact = state.roster.contacts.find(value => value.jid === peer);
        avatar.textContent = message.outgoing ? "IK" : (contact?.name || peer).slice(0, 2).toUpperCase();
        document.defaultView.TeleTypTelHybridAvatar?.(avatar, message.outgoing ? state.account.owner : kind === "direct" ? peer : null,
          message.outgoing ? "IK" : (message.sender || contact?.name || peer).slice(0, 2).toUpperCase(), state.account);
        const bubble = document.createElement("div");
        bubble.className = "hybrid-bubble";
        const body = document.createElement("div");
        body.className = "message-body";
        body.textContent = message.body;
        if (message.sender && kind === "group") {
          const sender = document.createElement("strong"); sender.className = "hybrid-message-sender"; sender.textContent = message.sender;
          bubble.append(sender);
        }
        const footer = document.createElement("div");
        footer.className = "hybrid-message-footer";
        const time = document.createElement("time");
        const date = new Date(message.timestamp * 1000);
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) + (message.edited ? " · bewerkt" : "");
        footer.append(time);
        if (message.outgoing) {
          const status = document.createElement("span");
          status.className = "hybrid-message-receipt" + (message.delivery === "displayed" ? " is-read" : "");
          status.textContent = message.state === "sending" ? "◷" : message.state === "submitted" ? (message.delivery === "unconfirmed" ? "✓" : "✓✓") : "!";
          status.setAttribute("aria-label", message.state === "submitted" ? ({ unconfirmed: "Verzonden, ontvangst niet bevestigd", delivered: "Afgeleverd", displayed: "Weergegeven" }[message.delivery])
            : message.state === "sending" ? "Verzenden" : "Verzending niet bevestigd");
          footer.append(status);
        }
        const actions = document.createElement("button");
        actions.type = "button";
        actions.className = "hybrid-message-more";
        actions.setAttribute("aria-label", "Berichtacties");
        actions.setAttribute("aria-haspopup", "menu");
        actions.textContent = "⋯";
        actions.addEventListener("click", event => { event.stopPropagation(); showMenu(message, actions); });
        row.oncontextmenu = event => { event.preventDefault(); showMenu(message, actions); };
        bubble.append(body, footer, actions);
        if (state.extras.fileMessages.includes(message.id)) {
          const file = document.createElement("button"); file.type = "button"; file.className = "hybrid-file-button";
          file.textContent = "Bijlage openen";
          file.onclick = () => { void client.openAttachment(message.id).catch(() => setNotice("Bijlage niet geopend. Controleer de verbinding.")); };
          bubble.append(file);
        }
        const translated = document.createElement("div"); translated.className = "hybrid-translation";
        document.defaultView.TeleTypTelHybridCaption?.(translated, state.extras.translations[message.id]);
        if (translated.childNodes.length) bubble.append(translated);
        if (message.reactions.length) {
          const reactions = document.createElement("div");
          reactions.className = "hybrid-message-reactions";
          reactions.textContent = message.reactions.map(value => value.emoji + " " + value.count).join("  ");
          bubble.append(reactions);
        }
        row.replaceChildren(avatar, bubble);
        if (messages.children[index] !== row) messages.insertBefore(row, messages.children[index] || null);
      }
      for (const row of existing.values()) row.remove();
      renderedSignature = signature;
      if (atBottom) messages.scrollTop = messages.scrollHeight;
      scheduleDisplayed();
    }

    function render(value) {
      if (disposed) return;
      state = value;
      if (epoch !== value.epoch) {
        epoch = value.epoch; peer = null; dirty = false; nextDraft = null;
        drafts.clear(); displayed.clear(); input.value = "";
        menu.hidden = true; actionDialog.hidden = true;
      }
      const conversation = value.conversation;
      panel.hidden = !conversation;
      byID("hybridEmptyChat").hidden = Boolean(conversation);
      byID("hybridChatActions").hidden = !conversation;
      if (!conversation) {
        menu.hidden = true; actionDialog.hidden = true;
        messages.replaceChildren(); renderedSignature = "";
        return;
      }
      if (peer !== conversation.peer || kind !== conversation.kind) {
        peer = conversation.peer;
        kind = conversation.kind;
        input.value = drafts.get(draftKey()) ?? conversation.draft;
        dirty = drafts.has(draftKey()) && drafts.get(draftKey()) !== conversation.draft;
        renderedSignature = "";
        displayed.clear();
      } else if (!sending && input.value === conversation.draft) { dirty = false; drafts.delete(draftKey()); }
      else if (!dirty && !sending) { input.value = conversation.draft; drafts.delete(draftKey()); }
      byID("hybridSend").disabled = sending || !conversation.canSend || !input.value.trim() || new TextEncoder().encode(input.value).length > 8192;
      input.disabled = !conversation.canSend;
      byID("hybridHistoryStatus").textContent = conversation.history === "loading" ? "Geschiedenis laden…" : conversation.history === "failed" ? "Geschiedenis kon niet worden geladen." : "";
      const contact = value.roster.contacts.find(item => item.jid === peer);
      for (const name of ["hybridStartTotal", "hybridStartAudio", "hybridStartVideo"]) byID(name).disabled = kind !== "direct" || !value.callsAvailable || !contact?.canCall;
      renderMessages(conversation);
    }

    const onInput = () => {
      revision += 1; dirty = true; remember();
      setNotice(new TextEncoder().encode(input.value).length > 8192 ? "Maximaal 8 kB per bericht. Je tekst blijft staan." : "");
      if (new TextEncoder().encode(input.value).length <= 8192) void flush().catch(() => setNotice("Concept nog niet opgeslagen. Je tekst blijft staan."));
      if (state) render(state);
    };
    const send = async event => {
      event?.preventDefault();
      if (sending || !peer || !state?.conversation?.canSend || !input.value.trim()) return;
      const body = input.value;
      const version = revision;
      const target = peer;
      const scope = epoch;
      const targetKind = kind;
      if (new TextEncoder().encode(body).length > 8192) return;
      sending = true;
      remember();
      render(state);
      try {
        await flush();
        await client.sendMessage(target, body, scope, targetKind);
        if (epoch === scope && peer === target && kind === targetKind && revision === version) {
          input.value = ""; dirty = false; drafts.delete(draftKey()); nextDraft = null;
        } else if (epoch === scope && peer === target && kind === targetKind) {
          remember();
          await flush();
        }
        setNotice("");
      } catch { setNotice("Bericht niet verstuurd. Je tekst blijft staan; probeer bewust opnieuw."); }
      finally { sending = false; if (state) render(state); }
    };
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) void send(event); });
    byID("hybridComposer").addEventListener("submit", send);
    messages.addEventListener("scroll", scheduleDisplayed);
    document.addEventListener("visibilitychange", scheduleDisplayed);
    byID("hybridEmojiToggle").onclick = () => {
      const picker = byID("hybridEmojiPanel"); picker.hidden = !picker.hidden;
      byID("hybridEmojiToggle").setAttribute("aria-expanded", String(!picker.hidden));
    };
    for (const emoji of ["😀", "😊", "👍", "❤️", "👋", "🙏", "😂", "🤟"]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = emoji; button.setAttribute("aria-label", emoji);
      button.onclick = () => { input.setRangeText(emoji, input.selectionStart, input.selectionEnd, "end"); onInput(); input.focus(); };
      byID("hybridEmojiPanel").append(button);
    }
    const act = async action => {
      const message = state?.conversation?.messages.find(value => value.id === selectedMessage);
      if (!message || !peer) return;
      menu.hidden = true;
      if (action === "edit" || action === "forward") {
        dialogAction = action;
        byID("hybridMessageActionTitle").textContent = action === "edit" ? "Bericht bewerken" : "Bericht doorsturen";
        byID("hybridEditLabel").hidden = action !== "edit";
        byID("hybridForwardLabel").hidden = action !== "forward";
        byID("hybridEditBody").value = message.body;
        const targets = byID("hybridForwardTarget"); targets.replaceChildren();
        for (const contact of state.roster.contacts) { const option = document.createElement("option"); option.value = contact.jid; option.textContent = contact.name; targets.append(option); }
        byID("hybridActionNotice").textContent = "";
        actionDialog.hidden = false;
        return;
      }
      try {
        if (action === "hide") await client.hideMessage(peer, message.id);
        else if (action === "retract") await client.retractMessage(peer, message.id);
        else if (action === "react") await client.reactMessage(peer, message.id, "👍");
        else if (action === "translate") await client.translateMessage(message.id);
      } catch { setNotice("Berichtactie niet uitgevoerd. Het bericht blijft behouden."); }
    };
    for (const button of menu.querySelectorAll("button")) button.onclick = () => { void act(button.dataset.messageAction); };
    byID("hybridConfirmAction").onclick = async () => {
      if (!peer || !selectedMessage) return;
      try {
        if (dialogAction === "edit") await client.editMessage(peer, selectedMessage, byID("hybridEditBody").value);
        else await client.forwardMessage(peer, selectedMessage, byID("hybridForwardTarget").value);
        actionDialog.hidden = true;
      } catch { byID("hybridActionNotice").textContent = "Niet uitgevoerd. Controleer je tekst en verbinding."; }
    };
    byID("hybridCancelAction").onclick = () => { actionDialog.hidden = true; };
    document.addEventListener("click", event => { if (!menu.contains(event.target)) menu.hidden = true; });
    document.addEventListener("keydown", event => { if (event.key === "Escape") { menu.hidden = true; actionDialog.hidden = true; } });
    const unsubscribe = client.subscribe(render);
    document.defaultView.addEventListener("pagehide", () => {
      disposed = true; unsubscribe(); nextDraft = null; drafts.clear(); displayed.clear();
      input.value = ""; messages.replaceChildren();
    }, { once: true });
    return Object.freeze({ flush, send: () => send() });
  }

  if (typeof module === "object" && module.exports) module.exports = { mount };
  else root.TeleTypTelHybridChat = mount(root.document, root.TeleTypTelNativeSession);
})(typeof window === "undefined" ? globalThis : window);
