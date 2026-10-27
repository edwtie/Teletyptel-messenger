"use strict";
window.TeleTypTelInterpreter = {
  create({ selectedPeer, getCall, startCall, selfJid, conversationPeer, mediaChanged, translate }) {
    const byId = (id) => document.getElementById(id);
    const button = byId("interpreterButton");
    const banner = byId("interpreterBanner");
    const status = byId("interpreterStatus");
    const allow = byId("interpreterAllow");
    const cancelButton = byId("interpreterCancel");
    const tile = byId("interpreterTile");
    const video = byId("interpreterVideo");
    const draft = byId("interpreterText");
    const previous = byId("interpreterPreviousText");
    const bare = (jid) => String(jid || "").split("/")[0].toLowerCase();
    let csrf = "", accountId = "", agreed = "", startingSid = "", interpreterName = "";
    let room = null, pc = null, channel = null, sharedStream = null, extraCamera = null, timer = null;
    let joined = false, busy = false, polling = false;
    let generation = 0;
    let candidates = [], seen = new Set();
    const label = (key, fallback) => translate("interpreter." + key, fallback);
    const show = (message) => { banner.hidden = false; status.textContent = message; };
    const api = async (body, identifier = "") => {
      const response = await fetch("api/interpreter.php" + (identifier ? "?room=" + encodeURIComponent(identifier) : ""), {
        method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(8000),
        headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {}, body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || label("failed", "De tolkverbinding is mislukt. Je oorspronkelijke gesprek blijft behouden."));
      csrf = data.csrfToken;
      return data;
    };
    const matches = (candidate) => {
      const call = getCall();
      const other = candidate.requester === accountId ? candidate.peer_jid : candidate.requester_jid;
      return call && candidate.call_id === call.sid && bare(other) === bare(call.peer);
    };
    const ready = () => {
      const call = getCall();
      return room && matches(room) && !call.incomingOffer && call.localStream
        && (call.pc?.connectionState === "connected" || ["connected", "completed"].includes(call.pc?.iceConnectionState));
    };
    const dispose = () => {
      generation += 1;
      clearTimeout(timer); timer = null;
      channel?.close(); pc?.close();
      channel = pc = sharedStream = null;
      extraCamera?.getTracks().forEach((track) => track.stop());
      extraCamera = null;
      byId("interpreterCameraPreview").srcObject = null;
      byId("interpreterCameraPreview").hidden = byId("interpreterCameraToggle").hidden = true;
      video.srcObject = null; tile.hidden = true;
      byId("callPanel").classList.remove("has-interpreter");
      draft.textContent = previous.textContent = "";
      byId("interpreterBadge").hidden = true;
      joined = false; room = null; agreed = ""; startingSid = "";
      candidates = []; seen = new Set();
      allow.hidden = cancelButton.hidden = true;
      mediaChanged();
    };
    const stop = (message, notify = true) => {
      const identifier = room?.room_id;
      dispose(); show(message);
      if (identifier && notify) void api({ action: "leave", roomId: identifier }).catch(() => {});
    };
    const fail = (error) => stop(error.message || label("failed", "Tolkverbinding mislukt. Het oorspronkelijke gesprek blijft behouden."));
    const sendText = (text, final = false) => {
      if (!room || !matches(room) || bare(conversationPeer()) !== bare(getCall()?.peer) || channel?.readyState !== "open") return;
      if (typeof text !== "string" || text.length > 5000 || channel.bufferedAmount > 65536) return;
      channel.send(JSON.stringify({ type: final ? "final" : "rtt", text }));
    };
    const attachChannel = (connection) => {
      if (connection.label !== "teletyptel-rtt") { connection.close(); return; }
      channel = connection;
      connection.onmessage = (event) => {
        if (typeof event.data !== "string" || event.data.length > 30000) return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (!["rtt", "final"].includes(data.type) || typeof data.text !== "string" || data.text.length > 5000) return;
        if (data.type === "final") { previous.textContent = data.text; draft.textContent = ""; }
        else draft.textContent = data.text;
      };
    };
    const connect = async () => {
      const current = generation, identifier = room.room_id, recipient = room.interpreter_id;
      const configResponse = await fetch("api/rtc-config.php", { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const config = await configResponse.json();
      if (current !== generation) return;
      if (!configResponse.ok || !config.ok) throw new Error(label("failed", "Verbindingsinstellingen niet beschikbaar."));
      const connection = new RTCPeerConnection({ iceServers: config.iceServers, iceTransportPolicy: config.iceTransportPolicy || "all" });
      pc = connection;
      const incoming = new MediaStream();
      video.srcObject = incoming;
      const send = (payload) => api({ action: "signal", roomId: identifier, recipient, payload });
      for (const track of sharedStream.getTracks()) connection.addTrack(track, sharedStream);
      if (!sharedStream.getVideoTracks().length) connection.addTransceiver("video", { direction: "recvonly" });
      if (!sharedStream.getAudioTracks().length) connection.addTransceiver("audio", { direction: "recvonly" });
      connection.onicecandidate = (event) => {
        if (current === generation && event.candidate) void send({ type: "candidate", candidate: event.candidate.toJSON() }).catch((error) => { if (current === generation) fail(error); });
      };
      connection.ontrack = (event) => {
        if (current !== generation) return;
        incoming.addTrack(event.track); tile.hidden = false;
        byId("callPanel").classList.add("has-interpreter");
        byId("interpreterName").textContent = interpreterName;
        banner.hidden = true; mediaChanged();
        video.play().catch(() => { byId("interpreterPlay").hidden = false; });
      };
      connection.onconnectionstatechange = () => {
        if (current !== generation) return;
        if (connection.connectionState === "failed") fail(new Error(label("failed", "Tolkverbinding mislukt. Je oorspronkelijke gesprek blijft behouden.")));
        else if (connection.connectionState === "disconnected") show(label("reconnecting", "Tolkverbinding onderbroken…"));
        else if (connection.connectionState === "connected") banner.hidden = true;
      };
      connection.ondatachannel = (event) => attachChannel(event.channel);
      if (accountId < recipient) {
        attachChannel(connection.createDataChannel("teletyptel-rtt"));
        await connection.setLocalDescription(await connection.createOffer());
        if (current === generation) await send({ type: "offer", sdp: connection.localDescription.sdp });
      }
    };
    const accept = async () => {
      if (!room || !ready() || !["ready", "active"].includes(room.status)) return;
      const current = generation, identifier = room.room_id, call = getCall();
      let camera = null;
      if (room.requester === accountId && !call.localStream.getVideoTracks().length) camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (current !== generation || !matches(room)) { camera?.getTracks().forEach((track) => track.stop()); return; }
      extraCamera = camera;
      sharedStream = new MediaStream([...call.localStream.getTracks(), ...(camera?.getTracks() || [])]);
      if (camera) {
        byId("interpreterCameraPreview").srcObject = camera;
        byId("interpreterCameraPreview").hidden = byId("interpreterCameraToggle").hidden = false;
      }
      await api({ action: "join", roomId: identifier, callId: call.sid, consent: true });
      if (current === generation) joined = true;
    };
    const refresh = async () => {
      if (polling || busy) return;
      polling = true;
      const current = generation;
      try {
        if (room && !matches(room)) { stop(label("call_ended", "Tolkaanvraag gestopt: het bijbehorende gesprek is afgelopen.")); return; }
        if (!room) {
          const data = await api();
          if (current !== generation) return;
          if (bare(data.jid) !== bare(selfJid())) return;
          accountId = data.accountId;
          const found = data.rooms.find((candidate) => candidate.call_id && matches(candidate));
          if (!found) return;
          room = found;
        }
        const data = await api(null, room.room_id);
        if (current !== generation) return;
        if (data.accountId !== accountId) throw new Error(label("sign_in", "Meld je opnieuw aan."));
        room = { ...room, ...data.room };
        if (!matches(room)) { stop(label("call_ended", "Tolkaanvraag gestopt: het gesprek is gewijzigd.")); return; }
        if (room.status === "ended") { stop(label("left", "De tolk is vertrokken of de aanvraag is verlopen. Je gesprek gaat verder."), false); return; }
        cancelButton.hidden = false;
        allow.hidden = agreed === room.room_id;
        allow.disabled = Boolean(getCall()?.incomingOffer);
        if (!joined) {
          show(agreed !== room.room_id
            ? label("permission", "Je gesprekspartner vraagt een gebarentolk. Mag de tolk je horen, zien en live tekst ontvangen?")
            : room.status === "waiting" ? label("searching", "Tolk zoeken… Je gesprek gaat gewoon verder.")
            : label("waiting_participants", "Tolk gevonden. Wachten op deelname en toestemming van je gesprekspartner…"));
          if (agreed === room.room_id) await accept();
          if (current !== generation) return;
        }
        if (joined && room.status === "active") {
          interpreterName = label("name", "Gebarentolk") + ": " + (data.members.find((member) => member.account_id === room.interpreter_id)?.display_name || "");
          if (!pc) await connect();
          if (current !== generation || !pc) return;
          for (const message of data.signals) {
            if (seen.has(message.signal_id) || message.sender !== room.interpreter_id) continue;
            const payload = JSON.parse(message.payload);
            if (payload.type === "candidate") {
              if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate);
              else candidates.push(payload.candidate);
            } else {
              if ((payload.type === "offer") !== (accountId > room.interpreter_id)) throw new Error("Onverwacht verbindingsbericht.");
              await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
              if (payload.type === "offer") {
                await pc.setLocalDescription(await pc.createAnswer());
                if (current !== generation) return;
                await api({ action: "signal", roomId: room.room_id, recipient: room.interpreter_id, payload: { type: "answer", sdp: pc.localDescription.sdp } });
              }
              for (const candidate of candidates.splice(0)) await pc.addIceCandidate(candidate);
            }
            if (current !== generation) return;
            seen.add(message.signal_id);
          }
        }
      } catch (error) { if (current === generation && room) fail(error); }
      finally { polling = false; }
    };
    button.addEventListener("click", async () => {
      if (room) { banner.hidden = !banner.hidden; return; }
      if (busy) return;
      busy = true; button.disabled = true;
      const current = generation;
      show(label("searching", "Tolk zoeken…")); cancelButton.hidden = false;
      try {
        const data = await api();
        if (current !== generation) return;
        if (bare(data.jid) !== bare(selfJid())) throw new Error(label("sign_in", "Meld je met hetzelfde Messenger-account aan."));
        accountId = data.accountId;
        if (!getCall()) {
          if (!selectedPeer()) throw new Error(label("select_contact", "Kies eerst een gesprekspartner."));
          await startCall();
        }
        if (current !== generation) return;
        const call = getCall();
        if (!call || call.incomingOffer || !call.sid) throw new Error(label("answer_first", "Start of beantwoord eerst het gesprek."));
        startingSid = call.sid;
        const result = await api({ action: "request", provider: "internal", peer: bare(call.peer), callId: call.sid });
        if (current !== generation || getCall()?.sid !== startingSid) { void api({ action: "leave", roomId: result.roomId }).catch(() => {}); return; }
        room = { room_id: result.roomId, call_id: call.sid, requester: accountId, requester_jid: data.jid, peer_jid: bare(call.peer), status: "waiting" };
        agreed = room.room_id;
      } catch (error) { if (current === generation) fail(error); }
      finally { busy = false; button.disabled = false; void refresh(); }
    });
    allow.addEventListener("click", () => { if (room && !getCall()?.incomingOffer) { agreed = room.room_id; allow.hidden = true; void refresh(); } });
    cancelButton.addEventListener("click", () => stop(label("cancelled", "Tolkaanvraag geannuleerd. Je gesprek blijft behouden.")));
    byId("interpreterDismiss").addEventListener("click", () => { banner.hidden = true; });
    byId("interpreterRemove").addEventListener("click", () => stop(label("removed", "Tolk verwijderd. Je gesprek blijft behouden.")));
    byId("interpreterPlay").addEventListener("click", () => { void video.play().then(() => { byId("interpreterPlay").hidden = true; }).catch(() => {}); });
    byId("interpreterCameraToggle").addEventListener("click", () => {
      const enabled = !extraCamera?.getVideoTracks().some((track) => track.enabled);
      extraCamera?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
      byId("interpreterCameraToggle").setAttribute("aria-pressed", String(enabled));
    });
    byId("messageInput").addEventListener("input", () => {
      if (timer !== null) return;
      timer = setTimeout(() => { timer = null; sendText(byId("messageInput").value); }, 120);
    });
    window.addEventListener("pagehide", () => {
      const identifier = room?.room_id;
      dispose();
      if (identifier) void fetch("api/interpreter.php", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ action: "leave", roomId: identifier }) }).catch(() => {});
    });
    setInterval(() => { if (room || getCall()) void refresh(); }, 1000);
    return {
      hasMedia: () => !tile.hidden,
      endCall: (sid) => { if (room?.call_id === sid || startingSid === sid) stop(label("call_ended", "Tolkaanvraag beëindigd met het gesprek.")); },
      final: (text) => { clearTimeout(timer); timer = null; sendText(text, true); },
      volume: (volume, muted) => { video.volume = volume; video.muted = muted; }
    };
  }
};
