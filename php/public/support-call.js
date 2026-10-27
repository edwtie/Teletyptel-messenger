"use strict";
window.TeleTypTelSupportIcons = {
  paths: {
    emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 9h.01M16 9h.01M7 14c2 4 8 4 10 0"/>',
    attachment: '<path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2M5 15l9-9"/>',
    interpreter: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 4v4"/>',
    language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>',
    help: '<path d="M8 7a4 4 0 1 1 6 3.5c-1.5 1-2 1.5-2 4M12 19h.01"/>',
    send: '<path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    camera: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4"/>',
    microphone: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    end: '<path d="M4 16v-5a3 3 0 0 1 3-3h5M9 4l4 4-4 4M15 17l6-6M15 11l6 6"/>',
    translate: '<path d="M3 5h12M9 3v2M12 5c-1 6-4 9-9 11M5 8c1 3 4 6 7 7m1 6 4-11 4 11m-6.5-4h5"/>'
  },
  set(element, name, label) {
    element.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + this.paths[name] + '</svg>';
    element.classList.add("support-icon-control"); element.title = label; element.setAttribute("aria-label", label);
  }
};
window.TeleTypTelSupportCall = {
  mount({ container, toolbarHost = null, draftHost = null, composerCamera = null, composerMicrophone = null, endpoint, rtcEndpoint, input, interpreter = false, onLive = () => {}, english = false, language = window.TeleTypTelSupportLanguage.create(english ? "en" : "nl") }) {
    container.classList.add("support-call");
    container.innerHTML = `<div class="support-call-actions"><button type="button" data-action="interpreter">Gebarentolk oproepen</button><details class="support-call-help"><summary></summary><div><p class="support-call-state" role="status"></p>
      <p class="support-call-notice">RTT staat standaard aan zodra de medewerker aansluit: tekst wordt tijdens het typen gedeeld, ook vóór versturen. Camera en microfoon starten alleen als je zelf een tolk oproept of een video-uitnodiging accepteert. Vertaling werkt automatisch na toestemming. Deel geen gevoelige gegevens.</p></div></details></div>
      <div class="support-call-incoming" hidden><p></p><button type="button" data-action="join">Deelnemen</button><button type="button" data-action="decline">Weigeren</button></div>
      <div class="support-call-permission" hidden><p>Mag de gebarentolk je beeld, geluid en live tekst ontvangen? Er wordt geen eerdere chatgeschiedenis gedeeld.</p><button type="button" data-action="allow">Tolk toelaten</button></div>
      <button type="button" data-action="cancel-interpreter" hidden>Tolkaanvraag annuleren / tolk verwijderen</button>
      <div class="support-call-videos"></div><div class="support-call-drafts" aria-label="Live tekst van deelnemers"></div>
      <div class="support-call-media" hidden><button type="button" data-action="microphone" aria-pressed="true" hidden>Microfoon aan</button><button type="button" data-action="camera" aria-pressed="true" hidden>Camera aan</button><button type="button" data-action="end" hidden>Oproep beëindigen</button></div>
      <p class="support-call-error" role="alert" hidden></p>`;
    const actions = container.querySelector(".support-call-actions");
    const drafts = container.querySelector(".support-call-drafts");
    if (toolbarHost) toolbarHost.prepend(actions);
    if (draftHost) draftHost.append(drafts);
    const find = (selector) => selector === ".support-call-actions" ? actions : selector === ".support-call-drafts" ? drafts : container.querySelector(selector) || actions.querySelector(selector) || drafts.querySelector(selector), button = (action) => find('[data-action="' + action + '"]');
    const wording = language.word;
    const participantName = (role, name) => role === "interpreter" && name.startsWith("Gebarentolk · ") ? wording("Gebarentolk", "Sign language interpreter") + " · " + name.slice("Gebarentolk · ".length) : name;
    const icon = (action, symbol, label) => window.TeleTypTelSupportIcons.set(button(action), symbol, label);
    window.TeleTypTelSupportIcons.set(find(".support-call-help summary"), "help", wording("Informatie over deze chat", "About this chat"));
    icon("interpreter", "interpreter", wording("Gebarentolk oproepen", "Call a sign language interpreter"));
    icon("decline", "close", wording("Weigeren", "Decline"));
    icon("allow", "check", wording("Tolk toelaten", "Allow interpreter"));
    icon("end", "end", wording("Beeld en geluid beëindigen", "End video and audio"));
    const peers = new Map(), seen = new Set();
    const clientId = crypto.randomUUID();
    let thread = "", fixedCall = "", call = null, role = interpreter ? "interpreter" : "", csrf = "", stream = null;
    let joined = false, enabled = false, busy = false, polling = false, generation = 0, sequence = 0, timer = null, config = null;
    let automaticAttempted = false, automaticJoined = "", anotherWindow = false;
    let stateText = "", errorText = "";
    let ownDraft = null;
    const syncComposer = () => {
      const video = joined && call?.mode === "tc", microphoneOn = Boolean(stream?.getAudioTracks().some((track) => track.enabled));
      if (composerCamera) {
        composerCamera.disabled = !enabled || busy;
        window.TeleTypTelSupportIcons.set(composerCamera, "camera", video ? (stream?.getVideoTracks().some((track) => track.enabled) ? wording("Camera uitschakelen", "Camera off") : wording("Camera inschakelen", "Camera on")) : wording("Videogesprek starten", "Start video call"));
      }
      if (composerMicrophone) {
        composerMicrophone.disabled = !enabled || busy || !video;
        composerMicrophone.setAttribute("aria-pressed", String(microphoneOn));
        window.TeleTypTelSupportIcons.set(composerMicrophone, "microphone", !video ? wording("Microfoon beschikbaar tijdens videogesprek", "Microphone available during video call") : microphoneOn ? wording("Microfoon uitschakelen", "Microphone off") : wording("Microfoon inschakelen", "Microphone on"));
      }
    };
    const englishText = {
      "Oproep beëindigd. De tekstchat blijft beschikbaar.": "Call ended. Text chat remains available.",
      "Oproep gestopt. De gewone tekstchat blijft beschikbaar.": "Call stopped. Text chat remains available.",
      "Oproep gestopt.": "Call stopped.",
      "Deze oproep staat in een ander venster open. Beëindig die eerst om hier opnieuw te starten.": "This call is open in another window. End it there before starting here.",
      "Oproep ontvangen: kies zelf of je wilt deelnemen.": "Incoming call: choose whether to join.",
      "Wachten tot de andere deelnemer instemt…": "Waiting for the other participant to agree…",
      "RTT / TC actief. Gebarentolk gevraagd; wachten op toestemming en een beschikbare tolk.": "Interpreter requested; waiting for consent and an available interpreter.",
      "De gebarentolk sluit aan. Na verbinding wordt live tekst direct gedeeld.": "The interpreter is joining. Live text is shared once connected.",
      "RTT-verbinding opbouwen… De gewone tekstchat blijft beschikbaar.": "Connecting RTT… Text chat remains available.",
      "TC met gebarentolk verbonden. Wat je typt wordt direct gedeeld.": "TC with interpreter connected. What you type is shared live.",
      "Live RTT verbonden. Wat je vanaf nu typt wordt direct gedeeld.": "Live RTT connected. What you type from now on is shared live.",
      "RTT, TC en een gebarentolk zijn beschikbaar zodra een medewerker deze chat heeft opgepakt.": "RTT, TC and an interpreter become available once an agent picks up this chat.",
      "Camera of microfoon niet toegestaan. Je kunt de gewone tekstchat of RTT zonder camera blijven gebruiken.": "Camera or microphone permission denied. You can still use text chat or RTT without a camera.",
      "Deze browser ondersteunt deze oproep niet. Gebruik een actuele browser via HTTPS; tekstchat blijft werken.": "This browser does not support calls. Use an up-to-date browser with HTTPS; text chat still works.",
      "Tolkverbinding onderbroken. Je gesprek met de medewerker blijft behouden.": "Interpreter connection interrupted. Your call with the agent continues."
    };
    const state = (text) => { stateText = text; find(".support-call-state").textContent = text ? wording(text, englishText[text] || text) : ""; actions.dataset.rtt = container.dataset.rtt = peers.size && [...peers.values()].every((peer) => peer.channel?.readyState === "open") ? "connected" : "waiting"; syncComposer(); };
    const error = (text) => { errorText = text; find(".support-call-error").textContent = text ? wording(text, englishText[text] || "Call unavailable. Please try again; text chat remains available.") : ""; find(".support-call-error").hidden = !text; };
    const api = async (body, keepalive = false) => {
      const query = body ? "" : fixedCall ? "?call=" + encodeURIComponent(fixedCall) : "?thread=" + encodeURIComponent(thread);
      const response = await fetch(endpoint + query, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", keepalive,
        headers: { "X-Support-Client": clientId, ...(body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {}) },
        body: body ? JSON.stringify({ ...body, clientId }) : undefined, ...(keepalive ? {} : { signal: AbortSignal.timeout(8000) }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Oproep mislukt. De gewone tekstchat blijft beschikbaar.");
      csrf = data.csrfToken; return data;
    };
    const closePeer = (key) => {
      const peer = peers.get(key); if (!peer) return;
      onLive({ sourceRole: key, text: "" });
      peer.channel?.close(); peer.pc.close(); peer.tile.remove(); peer.draft.remove(); peers.delete(key);
    };
    const release = () => {
      onLive({ reset: true });
      generation++; clearTimeout(timer); timer = null;
      for (const key of [...peers.keys()]) closePeer(key);
      stream?.getTracks().forEach((track) => track.stop()); stream = null; joined = false; seen.clear();
      find(".support-call-videos").replaceChildren(); find(".support-call-drafts").replaceChildren();
      ownDraft = null;
      find(".support-call-media").hidden = true;
      container.classList.remove("has-media", "has-interpreter");
    };
    const stop = (message = "Oproep beëindigd. De tekstchat blijft beschikbaar.", notify = true, keepalive = false) => {
      const identifier = call?.id;
      release(); call = null; button("end").hidden = button("cancel-interpreter").hidden = true;
      button("interpreter").hidden = interpreter;
      find(".support-call-incoming").hidden = find(".support-call-permission").hidden = true;
      state(message);
      if (identifier && notify) void api({ action: "end", callId: identifier }, keepalive).catch(() => {});
    };
    const fail = (failure) => { stop("Oproep gestopt. De gewone tekstchat blijft beschikbaar."); error(failure.message); };
    const failPeer = (key, failure) => {
      if (!interpreter && key === "interpreter") {
        closePeer(key); error("Tolkverbinding onderbroken. Je gesprek met de medewerker blijft behouden.");
        if (call) void api({ action: "cancel_interpreter", callId: call.id }).catch(() => {});
      } else fail(failure);
    };
    const perform = async (operation) => {
      if (busy) return;
      busy = true; button("interpreter").disabled = true; error("");
      syncComposer();
      try { await operation(); } catch (failure) {
        if (failure.name !== "AbortError") {
          const message = failure.name === "NotAllowedError" ? "Camera of microfoon niet toegestaan. Je kunt de gewone tekstchat of RTT zonder camera blijven gebruiken." : failure.message;
          if (call?.mode === "rtt" && joined) error(message);
          else fail(new Error(message));
        }
      }
      finally { busy = false; button("interpreter").disabled = !enabled; syncComposer(); void poll(); }
    };
    const capture = async (mode, ticket) => {
      if (!window.isSecureContext || typeof RTCPeerConnection !== "function") throw new Error("Deze browser ondersteunt deze oproep niet. Gebruik een actuele browser via HTTPS; tekstchat blijft werken.");
      if (!config) {
        const response = await fetch(rtcEndpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const data = await response.json(); if (!response.ok || !data.ok) throw new Error("Verbindingsinstellingen niet beschikbaar.");
        config = { iceServers: data.iceServers, iceTransportPolicy: data.iceTransportPolicy || "all" };
      }
      const captured = mode === "tc" ? await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }) : new MediaStream();
      if (ticket !== generation) { captured.getTracks().forEach((track) => track.stop()); throw new DOMException("Geannuleerd", "AbortError"); }
      return captured;
    };
    const preview = () => {
      if (!stream?.getVideoTracks().length) return;
      const tile = document.createElement("div"); tile.className = "support-call-tile self";
      const video = document.createElement("video"); video.autoplay = true; video.playsInline = true; video.muted = true; video.srcObject = stream;
      const name = document.createElement("span"); name.textContent = wording("Jij", "You"); tile.append(video, name); find(".support-call-videos").append(tile);
      find(".support-call-media").hidden = false; container.classList.add("has-media");
      for (const action of ["microphone", "camera"]) { button(action).setAttribute("aria-pressed", "true"); icon(action, action, (action === "camera" ? wording("Camera", "Camera") : wording("Microfoon", "Microphone")) + wording(" uitschakelen", " off")); }
    };
    const showOwnDraft = (text) => {
      if (!ownDraft && text) {
        const bubble = document.createElement("div"), label = document.createElement("strong"), content = document.createElement("span");
        bubble.className = "support-call-draft own"; bubble.append(label, content); drafts.append(bubble);
        ownDraft = { bubble, label, content };
      }
      if (!ownDraft) return;
      ownDraft.label.textContent = wording("Jij", "You") + wording(" · live tekst", " · live text");
      ownDraft.content.textContent = text; ownDraft.bubble.hidden = !text;
      ownDraft.content.scrollTop = ownDraft.content.scrollHeight;
    };
    const broadcast = (text, final = false) => {
      if (!joined || typeof text !== "string" || text.length > 2000) return;
      showOwnDraft(final ? "" : text);
      onLive({ sourceRole: role, text: final ? "" : text, own: true, target: ownDraft?.bubble, callId: call?.id, clientId });
      const payload = JSON.stringify({ type: final ? "final" : "rtt", text, sequence: ++sequence });
      for (const peer of peers.values()) if (peer.channel?.readyState === "open" && peer.channel.bufferedAmount < 65536) peer.channel.send(payload);
    };
    const attach = (peer, channel) => {
      if (channel.label !== "teletyptel-support-rtt") { channel.close(); return; }
      peer.channel = channel;
      channel.onmessage = (event) => {
        if (typeof event.data !== "string" || event.data.length > 16000) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (!["rtt", "final"].includes(data.type) || typeof data.text !== "string" || data.text.length > 2000 || !Number.isSafeInteger(data.sequence) || data.sequence <= peer.sequence) return;
        peer.sequence = data.sequence;
        peer.text.textContent = data.type === "final" && !interpreter && peer.role !== "interpreter" ? "" : data.text;
        peer.text.scrollTop = peer.text.scrollHeight;
        peer.draft.hidden = !peer.text.textContent;
        onLive({ sourceRole: peer.role, text: peer.text.textContent, target: peer.draft, callId: call?.id, clientId });
      };
    };
    const connect = async (member) => {
      const ticket = generation, identifier = call.id;
      const pc = new RTCPeerConnection(config);
      const tile = document.createElement("div"); tile.className = "support-call-tile " + member.role;
      const video = document.createElement("video"); video.autoplay = true; video.playsInline = true;
      const incoming = new MediaStream(); video.srcObject = incoming;
      const name = document.createElement("span"); name.textContent = participantName(member.role, member.name);
      const play = document.createElement("button"); play.type = "button"; window.TeleTypTelSupportIcons.set(play, "camera", wording("Beeld / geluid starten", "Start video / audio")); play.hidden = true;
      play.addEventListener("click", () => void video.play().then(() => { play.hidden = true; }).catch(() => {}));
      tile.append(video, name, play); tile.hidden = call.mode !== "tc";
      find(".support-call-videos").append(tile);
      const draft = document.createElement("div"), label = document.createElement("strong"), text = document.createElement("span");
      draft.className = "support-call-draft " + member.role;
      label.textContent = participantName(member.role, member.name) + wording(" · live tekst", " · live text"); draft.append(label, text); draft.hidden = true; find(".support-call-drafts").append(draft);
      const peer = { role: member.role, name: member.name, pc, tile, draft, text, play, channel: null, candidates: [], sequence: 0 }; peers.set(member.role, peer);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      const signal = (payload) => api({ action: "signal", callId: identifier, recipient: member.role, payload });
      pc.onicecandidate = (event) => { if (ticket === generation && event.candidate) void signal({ type: "candidate", candidate: event.candidate.toJSON() }).catch((failure) => { if (ticket === generation && peers.has(member.role)) failPeer(member.role, failure); }); };
      pc.ontrack = (event) => { if (ticket !== generation) return; incoming.addTrack(event.track); video.play().catch(() => { play.hidden = false; }); };
      pc.ondatachannel = (event) => attach(peer, event.channel);
      pc.onconnectionstatechange = () => {
        if (ticket !== generation || !peers.has(member.role)) return;
        if (pc.connectionState === "failed") failPeer(member.role, new Error("De verbinding is mislukt. Probeer opnieuw; de tekstchat blijft beschikbaar."));
      };
      if (role < member.role) { attach(peer, pc.createDataChannel("teletyptel-support-rtt")); await pc.setLocalDescription(await pc.createOffer()); if (ticket === generation) await signal({ type: "offer", sdp: pc.localDescription.sdp }); }
    };
    const render = async (data) => {
      role = data.role;
      if (!data.call || data.call.status === "ended") {
        if (call?.mode === "tc") automaticAttempted = false;
        if (call || joined) stop("Oproep beëindigd. De tekstchat blijft beschikbaar.", false);
        anotherWindow = false; return;
      }
      if (call && call.id !== data.call.id) release();
      call = data.call; button("end").hidden = call.mode !== "tc"; find(".support-call-media").hidden = call.mode !== "tc";
      button("camera").hidden = button("microphone").hidden = !joined || call.mode !== "tc";
      const own = data.members.find((member) => member.role === role);
      anotherWindow = Boolean(own?.joined && !own.owned);
      find(".support-call-incoming").hidden = joined || anotherWindow || call.mode === "rtt";
      find(".support-call-incoming p").textContent = call.mode === "tc" ? wording("Deelnemen aan Total Conversation? Je deelt live tekst, camera en microfoon.", "Join Total Conversation? You will share live text, camera and microphone.") : wording("Deelnemen met RTT? Wat je typt wordt direct gedeeld, zonder camera of microfoon.", "Join RTT? What you type is shared live, without camera or microphone.");
      icon("join", "camera", wording("Deelnemen met beeld, geluid en RTT", "Join with video, audio and RTT"));
      find(".support-call-permission").hidden = interpreter || !joined || !call.requested || Boolean(own?.permission);
      button("cancel-interpreter").hidden = interpreter || !call.requested;
      icon("cancel-interpreter", "close", call.interpreterAssigned ? wording("Tolk verwijderen", "Remove interpreter") : wording("Tolkaanvraag annuleren", "Cancel interpreter request"));
      button("interpreter").hidden = interpreter || call.requested;
      if (anotherWindow) { state("Deze oproep staat in een ander venster open. Beëindig die eerst om hier opnieuw te starten."); return; }
      state(!joined ? "Oproep ontvangen: kies zelf of je wilt deelnemen."
        : call.status !== "active" ? "Wachten tot de andere deelnemer instemt…"
        : call.requested && !call.interpreterAssigned ? "RTT / TC actief. Gebarentolk gevraagd; wachten op toestemming en een beschikbare tolk."
        : call.interpreterAssigned ? "De gebarentolk sluit aan. Na verbinding wordt live tekst direct gedeeld."
        : "RTT-verbinding opbouwen… De gewone tekstchat blijft beschikbaar.");
      if (!joined || !own?.owned || !own.joined) return;
      const members = data.members.filter((member) => member.role !== role && member.joined && (member.role !== "interpreter" || data.members.filter((item) => item.role !== "interpreter").every((item) => item.permission)));
      for (const key of [...peers.keys()]) if (!members.some((member) => member.role === key)) closePeer(key);
      container.classList.toggle("has-interpreter", members.some((member) => member.role === "interpreter"));
      if (call.status !== "active") return;
      const ticket = generation;
      for (const member of members) { if (!peers.has(member.role)) await connect(member); if (ticket !== generation) return; }
      for (const message of data.signals) {
        if (seen.has(message.signal_id)) continue;
        const peer = peers.get(message.sender); if (!peer) continue;
        const payload = JSON.parse(message.payload);
        if (payload.type === "candidate") {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload.candidate); else peer.candidates.push(payload.candidate);
        } else {
          if ((payload.type === "offer") !== (role > peer.role)) throw new Error("Onverwacht verbindingsbericht.");
          await peer.pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
          if (payload.type === "offer") { await peer.pc.setLocalDescription(await peer.pc.createAnswer()); if (ticket !== generation) return; await api({ action: "signal", callId: call.id, recipient: peer.role, payload: { type: "answer", sdp: peer.pc.localDescription.sdp } }); }
          for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
        }
        if (ticket !== generation) return;
        seen.add(message.signal_id);
      }
      if (peers.size && [...peers.values()].every((peer) => peer.channel?.readyState === "open")) {
        if (call.interpreterAssigned && peers.has("interpreter")) state("TC met gebarentolk verbonden. Wat je typt wordt direct gedeeld.");
        else if (!call.requested || interpreter) state("Live RTT verbonden. Wat je vanaf nu typt wordt direct gedeeld.");
      }
    };
    const poll = async () => {
      if (!enabled || busy || polling) return;
      polling = true; const ticket = generation;
      try { const data = await api(); if (ticket === generation) await render(data); }
      catch (failure) { if (ticket === generation) { fail(failure); if (interpreter) enabled = false; } }
      finally { polling = false; automaticRtt(); }
    };
    const start = async (mode, wantInterpreter = false) => {
      if (call?.mode === mode && joined) return;
      const captured = await capture(mode, generation);
      release(); stream = captured;
      const ticket = generation;
      try {
        if (!csrf) await api();
        const data = await api({ action: "start", threadId: thread, mode, consent: true });
        if (ticket !== generation) { void api({ action: "end", callId: data.callId }).catch(() => {}); return; }
        call = { id: data.callId, mode }; joined = true; preview();
        if (wantInterpreter) await api({ action: "request_interpreter", callId: call.id });
      } catch (failure) { if (ticket === generation) release(); throw failure; }
    };
    const join = async () => {
      if (!call || joined) return;
      const ticket = generation, identifier = call.id;
      const captured = await capture(call.mode, ticket);
      try {
        await api({ action: "join", callId: identifier, consent: true });
        if (ticket !== generation) { captured.getTracks().forEach((track) => track.stop()); return; }
        stream = captured; joined = true; preview();
      } catch (failure) { captured.getTracks().forEach((track) => track.stop()); throw failure; }
    };
    const automaticRtt = () => {
      if (!enabled || interpreter || busy || anotherWindow || !role) return;
      if (!call && role === "visitor" && !automaticAttempted) {
        automaticAttempted = true; void perform(() => start("rtt"));
      } else if (call?.mode === "rtt" && !joined && automaticJoined !== call.id) {
        automaticJoined = call.id; void perform(join);
      }
    };
    button("interpreter").addEventListener("click", () => void perform(async () => {
      if (!call || call.mode !== "tc") { await start("tc", true); return; }
      if (!joined) throw new Error("Neem eerst deel aan de TC-oproep.");
      await api({ action: "request_interpreter", callId: call.id });
    }));
    button("join").addEventListener("click", () => void perform(join));
    composerCamera?.addEventListener("click", () => {
      if (!enabled || busy) return;
      if (joined && call?.mode === "tc") button("camera").click();
      else void perform(() => call?.mode === "tc" ? join() : start("tc"));
    });
    composerMicrophone?.addEventListener("click", () => { if (enabled && joined && call?.mode === "tc" && !busy) button("microphone").click(); });
    button("allow").addEventListener("click", () => void perform(() => api({ action: "allow_interpreter", callId: call.id })));
    button("cancel-interpreter").addEventListener("click", () => void perform(() => api({ action: "cancel_interpreter", callId: call.id })));
    for (const action of ["end", "decline"]) button(action).addEventListener("click", () => void perform(async () => {
      const identifier = call?.id; stop(undefined, false);
      if (identifier) await api({ action: "end", callId: identifier });
      automaticAttempted = false; automaticJoined = "";
    }));
    for (const [action, kind, name] of [["camera", "video", "Camera"], ["microphone", "audio", "Microfoon"]]) button(action).addEventListener("click", () => {
      const tracks = stream?.getTracks().filter((track) => track.kind === kind) || [];
      const on = !tracks.some((track) => track.enabled); tracks.forEach((track) => { track.enabled = on; });
      button(action).setAttribute("aria-pressed", String(on)); icon(action, action, (action === "camera" ? wording("Camera", "Camera") : wording(name, "Microphone")) + (on ? wording(" uitschakelen", " off") : wording(" inschakelen", " on")));
      syncComposer();
    });
    input.addEventListener("input", () => {
      if (thread || interpreter) showOwnDraft(input.value);
      if (!joined || timer !== null) return;
      timer = setTimeout(() => { timer = null; broadcast(input.value); }, 120);
    });
    window.addEventListener("pagehide", () => { enabled = false; stop("Oproep gestopt.", true, true); });
    if (interpreter || toolbarHost) actions.hidden = true;
    container.classList.toggle("operator", interpreter);
    setInterval(() => void poll(), 1000);
    container.hidden = true;
    if (draftHost) draftHost.hidden = true;
    const localize = () => {
      container.lang = language.language;
      drafts.lang = language.language;
      if (ownDraft) ownDraft.label.textContent = wording("Jij", "You") + wording(" · live tekst", " · live text");
      window.TeleTypTelSupportIcons.set(find(".support-call-help summary"), "help", wording("Informatie over deze chat", "About this chat"));
      find(".support-call-notice").textContent = wording("RTT staat standaard aan zodra de medewerker aansluit: tekst wordt tijdens het typen gedeeld, ook vóór versturen. Camera en microfoon starten alleen als je zelf een tolk oproept of een video-uitnodiging accepteert. Vertaling werkt automatisch na toestemming. Deel geen gevoelige gegevens.", "RTT is on by default once the agent joins: text is shared while typing, before sending. Camera and microphone only start when you call an interpreter or accept a video invitation. Translation works automatically after consent. Do not share sensitive information.");
      find(".support-call-permission p").textContent = wording("Mag de gebarentolk je beeld, geluid en live tekst ontvangen? Er wordt geen eerdere chatgeschiedenis gedeeld.", "Allow the sign language interpreter to receive your video, audio and live text? Earlier chat history is not shared.");
      find(".support-call-incoming p").textContent = call?.mode === "tc" ? wording("Deelnemen aan Total Conversation? Je deelt live tekst, camera en microfoon.", "Join Total Conversation? You will share live text, camera and microphone.") : wording("Deelnemen met RTT? Wat je typt wordt direct gedeeld, zonder camera of microfoon.", "Join RTT? What you type is shared live, without camera or microphone.");
      find(".support-call-drafts").setAttribute("aria-label", wording("Live tekst van deelnemers", "Live text from participants"));
      icon("interpreter", "interpreter", wording("Gebarentolk oproepen", "Call a sign language interpreter"));
      icon("decline", "close", wording("Weigeren", "Decline")); icon("allow", "check", wording("Tolk toelaten", "Allow interpreter"));
      icon("end", "end", wording("Beeld en geluid beëindigen", "End video and audio")); icon("join", "camera", wording("Deelnemen met beeld, geluid en RTT", "Join with video, audio and RTT"));
      icon("cancel-interpreter", "close", call?.interpreterAssigned ? wording("Tolk verwijderen", "Remove interpreter") : wording("Tolkaanvraag annuleren", "Cancel interpreter request"));
      for (const action of ["camera", "microphone"]) icon(action, action, (action === "camera" ? wording("Camera", "Camera") : wording("Microfoon", "Microphone")) + (button(action).getAttribute("aria-pressed") === "true" ? wording(" uitschakelen", " off") : wording(" inschakelen", " on")));
      const ownName = find(".support-call-tile.self > span"); if (ownName) ownName.textContent = wording("Jij", "You");
      for (const peer of peers.values()) {
        const name = participantName(peer.role, peer.name);
        peer.tile.querySelector("span").textContent = name; peer.draft.querySelector("strong").textContent = name + wording(" · live tekst", " · live text");
        window.TeleTypTelSupportIcons.set(peer.play, "camera", wording("Beeld / geluid starten", "Start video / audio"));
      }
      state(stateText); error(errorText);
    };
    language.onChange(localize); localize();
    return {
      setThread(identifier, permitted) {
        if (thread !== identifier || (enabled && !permitted)) { stop(); thread = identifier; automaticAttempted = false; automaticJoined = ""; anotherWindow = false; }
        enabled = Boolean(identifier && permitted); container.hidden = !identifier;
        if (draftHost) draftHost.hidden = !identifier;
        if (toolbarHost) actions.hidden = !identifier || interpreter;
        button("interpreter").disabled = !enabled || busy;
        syncComposer();
        if (!enabled) state("RTT, TC en een gebarentolk zijn beschikbaar zodra een medewerker deze chat heeft opgepakt.");
        else void poll();
      },
      async openInterpreter(identifier) { fixedCall = identifier; enabled = true; container.hidden = false; await poll(); },
      final(text) { clearTimeout(timer); timer = null; showOwnDraft(""); broadcast(text, true); },
      stop() { enabled = false; stop(); },
      async joinInterpreter() { await poll(); await perform(join); }
    };
  }
};
