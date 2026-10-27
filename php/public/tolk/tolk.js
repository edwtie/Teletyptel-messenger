"use strict";
(() => {
  const byId = (id) => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const roomId = query.get("room") || "";
  const peers = new Map();
  const seen = new Set();
  let csrf = "";
  let accountId = "";
  let members = [];
  let interpreterId = "";
  let localStream = null;
  let joined = false;
  let stopped = false;
  let polling = false;
  let busy = false;
  let rtcConfig = null;
  let rttTimer = null;
  let lastError = "";
  let inlineRoom = false;
  let acceptedFromDesk = false;
  try {
    acceptedFromDesk = sessionStorage.getItem("teletyptel.interpreter.accepted." + roomId) === "yes";
    sessionStorage.removeItem("teletyptel.interpreter.accepted." + roomId);
  } catch {}
  const api = async (body, room = "") => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("../api/interpreter.php" + (room ? "?room=" + encodeURIComponent(room) : ""), {
        method: body ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {}, body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Verbinding met de tolkdienst mislukt.");
      csrf = data.csrfToken;
      return data;
    } finally { clearTimeout(timeout); }
  };
  const status = (message) => { byId("status").textContent = lastError || message; };
  const stopMedia = () => {
    joined = false;
    document.body.classList.remove("in-session");
    clearTimeout(rttTimer);
    rttTimer = null;
    for (const peer of peers.values()) { peer.channel?.close(); peer.pc.close(); }
    peers.clear();
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    byId("videos").replaceChildren();
    byId("drafts").replaceChildren();
    byId("messages").replaceChildren();
    byId("text").value = "";
    byId("controls").hidden = byId("rttPanel").hidden = true;
  };
  const fail = (error) => { if (joined) { stopMedia(); stopped = true; } lastError = error.message || "Verbinding mislukt. Ververs de pagina."; status(lastError); };
  const perform = async (operation) => {
    if (busy) return;
    busy = true;
    lastError = "";
    try { await operation(); } catch (error) { fail(error); } finally { busy = false; }
  };
  const action = (name, extra = {}) => api({ action: name, roomId, ...extra });
  const node = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
  const button = (label, callback) => {
    const element = node("button", label);
    element.type = "button";
    element.addEventListener("click", () => { void perform(callback); });
    return element;
  };
  const nameFor = (identifier) => members.find((member) => member.account_id === identifier)?.display_name || "Deelnemer";
  const signal = (recipient, payload) => action("signal", { recipient, payload });
  const broadcast = (payload) => {
    if (!joined) return;
    const encoded = JSON.stringify(payload);
    for (const peer of peers.values()) if (peer.channel?.readyState === "open" && peer.channel.bufferedAmount < 65536) peer.channel.send(encoded);
  };
  const receiveText = (identifier, raw) => {
    if (typeof raw !== "string" || raw.length > 30000) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (!["rtt", "final"].includes(data.type) || typeof data.text !== "string" || data.text.length > 5000) return;
    const peer = peers.get(identifier);
    if (!peer) return;
    peer.draft.textContent = data.text ? nameFor(identifier) + ": " + data.text : "";
    if (data.type === "final") {
      peer.draft.textContent = "";
      appendMessage(nameFor(identifier), data.text);
    }
  };
  const appendMessage = (name, text) => {
    if (!text.trim()) return;
    const message = node("p", name + ": " + text);
    message.className = "draft";
    byId("messages").append(message);
    while (byId("messages").childElementCount > 100) byId("messages").firstElementChild.remove();
    byId("messages").scrollTop = byId("messages").scrollHeight;
  };
  const attachChannel = (identifier, channel) => {
    const peer = peers.get(identifier);
    if (!peer || channel.label !== "teletyptel-rtt") { channel.close(); return; }
    peer.channel = channel;
    channel.onmessage = (event) => receiveText(identifier, event.data);
    channel.onopen = () => {
      if (joined && channel.readyState === "open") channel.send(JSON.stringify({ type: "rtt", text: byId("text").value }));
      updateRttReady();
    };
    channel.onclose = updateRttReady;
  };
  const updateRttReady = () => {
    const ready = joined && peers.size === 2 && [...peers.values()].every((peer) => peer.channel?.readyState === "open");
    byId("text").disabled = !ready;
    byId("textForm").querySelector("button").disabled = !ready;
  };
  const videoTile = (identifier, stream, own = false) => {
    const tile = document.createElement("div");
    tile.className = "video-tile" + (identifier === interpreterId ? " interpreter" : "");
    const label = node("p", nameFor(identifier) + (own ? " (jij)" : "") + (identifier === interpreterId ? " · Gebarentolk" : ""));
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = own;
    video.srcObject = stream;
    tile.append(label, video);
    const play = button("Beeld / geluid starten", async () => { await video.play(); play.hidden = true; });
    play.hidden = true;
    tile.append(play);
    byId("videos").append(tile);
    video.play().catch(() => { play.hidden = false; });
    return { video, label };
  };
  const connectPeer = async (identifier) => {
    if (peers.has(identifier) || !joined) return;
    const pc = new RTCPeerConnection(rtcConfig);
    const stream = new MediaStream();
    const tile = videoTile(identifier, stream);
    const draft = node("div", "");
    draft.className = "draft";
    byId("drafts").append(draft);
    const peer = { pc, stream, draft, channel: null, candidates: [] };
    peers.set(identifier, peer);
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    if (!localStream.getAudioTracks().length) pc.addTransceiver("audio", { direction: "recvonly" });
    if (!localStream.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (event) => { stream.addTrack(event.track); tile.video.play().catch(() => {}); };
    pc.onicecandidate = (event) => {
      if (event.candidate && joined) void signal(identifier, { type: "candidate", candidate: event.candidate.toJSON() }).catch(fail);
    };
    pc.onconnectionstatechange = () => {
      tile.label.textContent = nameFor(identifier) + (identifier === interpreterId ? " · Gebarentolk" : "") + " · "
        + ({ connected: "Verbonden", connecting: "Verbinden…", disconnected: "Verbinding onderbroken", failed: "Verbinding mislukt: controleer TURN/netwerk" }[pc.connectionState] || "Wachten…");
    };
    pc.ondatachannel = (event) => attachChannel(identifier, event.channel);
    if (accountId < identifier) {
      attachChannel(identifier, pc.createDataChannel("teletyptel-rtt"));
      await pc.setLocalDescription(await pc.createOffer());
      await signal(identifier, { type: "offer", sdp: pc.localDescription.sdp });
    }
  };
  const receiveSignal = async (message) => {
    if (seen.has(message.signal_id)) return;
    const peer = peers.get(message.sender);
    if (!peer) return;
    const payload = JSON.parse(message.payload);
    if (payload.type === "candidate") {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload.candidate);
      else peer.candidates.push(payload.candidate);
    } else {
      if (payload.type === "offer" && accountId < message.sender) throw new Error("Onverwacht verbindingsaanbod.");
      if (payload.type === "answer" && accountId > message.sender) throw new Error("Onverwacht verbindingsantwoord.");
      await peer.pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
      if (payload.type === "offer") {
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await signal(message.sender, { type: "answer", sdp: peer.pc.localDescription.sdp });
      }
      for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
    }
    seen.add(message.signal_id);
  };
  const refreshRoom = async () => {
    const data = await api(null, roomId);
    accountId = data.accountId;
    members = data.members;
    interpreterId = data.room.interpreter_id;
    inlineRoom = Boolean(data.room.call_id);
    byId("session").hidden = false;
    byId("participants").replaceChildren(...members.map((member) => node("p", member.display_name
      + (member.account_id === interpreterId ? " · Tolk" : "") + (Number(member.joined) ? " · Neemt deel" : " · Nog niet deelgenomen"))));
    const states = { waiting: "Tolk zoeken…", ready: "Tolk gevonden. Iedere deelnemer kiest zelf Deelnemen.", active: "Drie deelnemers aanwezig.", ended: "Deze tolksessie is beëindigd." };
    byId("sessionState").textContent = states[data.room.status];
    byId("joinPanel").hidden = joined || !["ready", "active"].includes(data.room.status);
    if (inlineRoom && accountId !== interpreterId) {
      byId("joinPanel").hidden = true;
      status("Deze tolk komt in je lopende Messenger-gesprek. Ga terug naar Messenger.");
      return;
    }
    if (data.room.status === "ended") { stopMedia(); stopped = true; status("Gesprek beëindigd. Ga terug naar Messenger voor een nieuwe aanvraag."); return; }
    status(joined ? "Live tekst wordt rechtstreeks gedeeld; geen opname of chatopslag." : "Camera en microfoon blijven uit totdat je zelf deelneemt.");
    if (acceptedFromDesk && inlineRoom && accountId === interpreterId && !joined) {
      acceptedFromDesk = false;
      byId("joinConsent").checked = true;
      await perform(() => join(true));
      return;
    }
    byId("leave").textContent = inlineRoom ? "Tolkdeelname beëindigen (gesprek gaat door)" : "Gesprek beëindigen voor iedereen";
    if (joined && (!inlineRoom || data.room.status === "active")) {
      for (const member of members) if (member.account_id !== accountId && Number(member.joined)) await connectPeer(member.account_id);
      for (const message of data.signals) await receiveSignal(message);
    }
  };
  const refreshDashboard = async () => {
    const data = await api();
    accountId = data.accountId;
    byId("workspace").hidden = false;
    const profile = data.profile;
    byId("register").hidden = Boolean(profile);
    byId("profileStatus").textContent = profile ? ({ pending: "Je aanmelding wacht op goedkeuring door een beheerder.", enabled: "Je bent goedgekeurd als tolk.", blocked: "Je tolktoegang is geblokkeerd. Neem contact op met de beheerder." }[profile.status]) : "Je hebt nog geen tolkrol.";
    byId("availabilityLabel").hidden = profile?.status !== "enabled";
    byId("available").checked = profile?.status === "enabled" && Number(profile.available) === 1;
    if (byId("available").checked) await action("available", { available: true });
    byId("rooms").replaceChildren();
    for (const room of data.rooms) {
      const card = document.createElement("article");
      card.append(node("h3", room.status === "waiting" ? "Tolk zoeken…" : "Tolk gevonden"));
      if (room.status !== "waiting") {
        const messenger = room.call_id && room.interpreter_id !== accountId;
        const link = node("a", messenger ? "Terug naar Messenger" : "Open besloten tolksessie");
        link.className = "button";
        link.href = messenger ? "../chat.html" : "?room=" + encodeURIComponent(room.room_id);
        card.append(link);
      }
      card.append(button("Annuleren / beëindigen", async () => { await action("leave", { roomId: room.room_id }); await refreshDashboard(); }));
      byId("rooms").append(card);
    }
    if (!data.rooms.length) byId("rooms").append(node("p", "Geen open tolksessies."));
    byId("queue").replaceChildren();
    for (const request of data.queue) {
      const card = document.createElement("article");
      card.append(node("h3", "Nieuwe tolkaanvraag"), node("p", new Date(Number(request.created) * 1000).toLocaleTimeString("nl-NL")));
      if (Number(request.inline_call)) card.append(node("p", "Accepteren start je camera en microfoon en voegt je toe aan hun lopende gesprek, zodra beide deelnemers instemmen. Live tekst wordt gedeeld, niet opgeslagen."));
      for (const [name, label] of [["accept", "Accepteren"], ["decline", "Weigeren"]]) card.append(button(label, async () => {
        await action(name, { roomId: request.room_id });
        if (name === "accept" && Number(request.inline_call)) {
          try { sessionStorage.setItem("teletyptel.interpreter.accepted." + request.room_id, "yes"); } catch {}
          location.assign("?room=" + encodeURIComponent(request.room_id));
          return;
        }
        await refreshDashboard();
      }));
      byId("queue").append(card);
    }
    status("Werkplek bijgewerkt. Tolkcontact is nog niet gekoppeld.");
  };
  const poll = async () => {
    if (polling || busy || stopped) return;
    polling = true;
    try { if (roomId) await refreshRoom(); else await refreshDashboard(); }
    catch (error) { fail(error); if (!joined) { byId("workspace").hidden = true; } }
    finally { polling = false; }
  };
  const join = async (media) => {
    if (!byId("joinConsent").checked) throw new Error("Vink eerst je toestemming voor deelname aan.");
    if (joined) return;
    if (!window.isSecureContext || typeof RTCPeerConnection !== "function") throw new Error("Gebruik HTTPS (of localhost) in een browser met WebRTC.");
    const response = await fetch("../api/rtc-config.php", { cache: "no-store" });
    const config = await response.json();
    if (!response.ok || !config.ok) throw new Error("De verbindingsinstellingen konden niet worden geladen.");
    rtcConfig = { iceServers: config.iceServers, iceTransportPolicy: config.iceTransportPolicy || "all" };
    try {
      localStream = media ? await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }) : new MediaStream();
      await action("join", { consent: true });
      joined = true;
      document.body.classList.add("in-session");
      videoTile(accountId, localStream, true);
      byId("controls").hidden = byId("rttPanel").hidden = false;
      updateRttReady();
      byId("microphone").disabled = byId("camera").disabled = !media;
      await refreshRoom();
    } catch (error) {
      const accepted = joined;
      stopMedia();
      if (accepted) { stopped = true; await action("leave").catch(() => {}); }
      throw error;
    }
  };
  byId("peer").value = query.get("peer") || "";
  byId("requestForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void perform(async () => { await action("request", { provider: "internal", peer: byId("peer").value }); await refreshDashboard(); });
  });
  byId("register").addEventListener("click", () => { void perform(async () => { await action("register"); await refreshDashboard(); }); });
  byId("available").addEventListener("change", () => { void perform(async () => { await action("available", { available: byId("available").checked }); await refreshDashboard(); }); });
  byId("join").addEventListener("click", () => { void perform(() => join(true)); });
  byId("joinText").addEventListener("click", () => { void perform(() => join(false)); });
  byId("leave").addEventListener("click", () => { void perform(async () => {
    stopMedia(); stopped = true; await action("leave"); status("Gesprek beëindigd voor iedereen.");
  }); });
  for (const [id, kind, title] of [["microphone", "audio", "Microfoon"], ["camera", "video", "Camera"]]) byId(id).addEventListener("click", () => {
    const tracks = localStream?.getTracks().filter((track) => track.kind === kind) || [];
    const enabled = !tracks.some((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = enabled; });
    byId(id).setAttribute("aria-pressed", String(enabled));
    byId(id).textContent = title + (enabled ? " aan" : " uit");
  });
  byId("text").addEventListener("input", () => {
    if (rttTimer !== null) return;
    rttTimer = setTimeout(() => {
      rttTimer = null;
      broadcast({ type: "rtt", text: byId("text").value });
    }, 120);
  });
  byId("textForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!joined) return;
    clearTimeout(rttTimer);
    rttTimer = null;
    broadcast({ type: "final", text: byId("text").value });
    appendMessage("Jij", byId("text").value);
    byId("text").value = "";
  });
  window.addEventListener("pagehide", () => {
    if (joined) {
      void fetch("../api/interpreter.php", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ action: "leave", roomId }) }).catch(() => {});
    }
    stopMedia(); stopped = true;
  });
  setInterval(() => { void poll(); }, roomId ? 1000 : 4000);
  void poll();
})();
