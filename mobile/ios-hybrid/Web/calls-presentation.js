(function (root) {
  "use strict";

  function mount(document, client) {
    const byID = name => document.getElementById(name);
    const panel = byID("hybridCallPanel");
    const video = byID("hybridVideoSurface");
    const ownText = byID("hybridOwnRtt");
    const remoteText = byID("hybridRemoteRtt");
    const notice = byID("hybridCallNotice");
    const controls = ["hybridCallCamera", "hybridCallMute", "hybridVideoFit", "hybridDtmfToggle", "hybridEndCall"];
    let state = null;
    let currentID = null;
    let pendingRtt = null;
    let rttWork = null;
    let dirty = false;
    let disposed = false;
    let layoutKey = "";
    let layoutFrame = null;
    const pending = new Set();

    const busy = () => state && !["idle", "failed"].includes(state.call.phase);
    const error = text => { notice.textContent = text; };

    function layout() {
      if (layoutFrame != null) return;
      layoutFrame = document.defaultView.requestAnimationFrame(() => {
        layoutFrame = null;
        if (disposed || !busy() || !state.call.id) return;
        const box = video.getBoundingClientRect();
        const frame = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height,
          viewportWidth: innerWidth, viewportHeight: innerHeight };
        const key = JSON.stringify([state.call.id, frame]);
        if (layoutKey === key) return;
        layoutKey = key;
        const id = state.call.id;
        void client.placeVideo(id, frame).catch(() => { if (currentID === id) layoutKey = ""; });
      });
    }

    function render(value) {
      if (disposed) return;
      state = value;
      const call = value.call;
      const active = busy();
      if (currentID !== call.id) {
        currentID = call.id; pendingRtt = null; dirty = false; layoutKey = ""; pending.clear();
        ownText.value = call.ownText; remoteText.textContent = ""; error("");
        byID("hybridDtmf").hidden = true;
        byID("hybridDtmfToggle").setAttribute("aria-expanded", "false");
      }
      panel.hidden = !active;
      document.body.classList.toggle("hybrid-call-active", active);
      byID("hybridConnected").inert = active;
      if (active) byID("hybridConnected").setAttribute("aria-hidden", "true"); else byID("hybridConnected").removeAttribute("aria-hidden");
      if (!active) {
        if (call.phase === "failed") {
          byID("hybridChatNotice").textContent = "Oproep mislukt. Sluit de melding om opnieuw te proberen.";
          byID("hybridCallRetry").hidden = false;
        }
        return;
      }
      byID("hybridCallRetry").hidden = true;
      const contact = value.roster.contacts.find(item => item.jid === call.peer);
      byID("hybridCallTitle").textContent = contact?.name || call.peer;
      byID("hybridRemoteRttName").textContent = contact?.name || "Ander";
      byID("hybridCallStatus").textContent = call.phase === "ringing" ? "Inkomende oproep" : call.phase === "calling" ? "Bellen…" : "Verbonden";
      const hasVideo = ["video", "total"].includes(call.mode);
      const hasRtt = ["audio-rtt", "total"].includes(call.mode);
      const allCamerasOff = !hasVideo || (!call.cameraEnabled && call.remoteCamera === "off");
      panel.classList.toggle("is-rtt-only", hasRtt && allCamerasOff);
      video.hidden = !hasVideo || allCamerasOff;
      byID("hybridCallRtt").hidden = !hasRtt;
      ownText.disabled = !call.rttReady || call.phase !== "active";
      if (!dirty || call.ownText === ownText.value) { ownText.value = call.ownText; dirty = false; }
      if (remoteText.textContent !== call.remoteText) {
        const atBottom = remoteText.scrollHeight - remoteText.scrollTop - remoteText.clientHeight < 40;
        remoteText.textContent = call.remoteText;
        if (atBottom) remoteText.scrollTop = remoteText.scrollHeight;
      }
      byID("hybridAnswerCall").hidden = call.phase !== "ringing";
      byID("hybridAnswerCall").disabled = pending.has("answer");
      byID("hybridSwitchCamera").hidden = !hasVideo;
      byID("hybridSwitchCamera").disabled = !call.canSwitchCamera || pending.has("switchCamera");
      byID("hybridCallCamera").hidden = !hasVideo;
      byID("hybridCallCamera").disabled = call.phase !== "active" || pending.has("camera");
      byID("hybridCallCamera").classList.toggle("is-on", call.cameraEnabled);
      byID("hybridCallCamera").classList.toggle("is-off", !call.cameraEnabled);
      byID("hybridCallCamera").setAttribute("aria-pressed", String(call.cameraEnabled));
      byID("hybridCallMute").disabled = call.phase !== "active" || pending.has("mute");
      byID("hybridCallMute").classList.toggle("is-on", !call.muted);
      byID("hybridCallMute").classList.toggle("is-off", call.muted);
      byID("hybridCallMute").setAttribute("aria-pressed", String(call.muted));
      byID("hybridCallMute").setAttribute("aria-label", call.muted ? "Microfoon inschakelen" : "Microfoon dempen");
      byID("hybridVideoFit").hidden = !hasVideo || allCamerasOff;
      byID("hybridDtmfToggle").disabled = !call.canSendDtmf;
      for (const button of byID("hybridDtmf").querySelectorAll("button")) button.disabled = !call.canSendDtmf;
      for (const name of controls) if (name === "hybridEndCall") byID(name).disabled = pending.has("end");
      layout();
    }

    async function control(action, value) {
      const id = state?.call.id;
      if (!id || pending.has(action)) return;
      pending.add(action); error(""); render(state);
      try { await client.controlCall(id, action, value); }
      catch { error("De gespreksactie kon niet worden uitgevoerd. Probeer opnieuw."); }
      finally { pending.delete(action); if (state) render(state); }
    }

    async function start(mode) {
      const peer = state?.conversation?.peer;
      const epoch = state?.epoch;
      if (!peer || busy() || pending.has("start")) return;
      pending.add("start");
      byID("hybridStartMenu").open = false;
      try {
        await document.defaultView.TeleTypTelHybridChat?.flush();
        await client.startCall(peer, mode, epoch);
      } catch { byID("hybridChatNotice").textContent = "Oproep niet gestart. Controleer de verbinding en gespreksrechten."; }
      finally { pending.delete("start"); }
    }
    byID("hybridStartTotal").onclick = () => { void start("total"); };
    byID("hybridStartAudio").onclick = () => { void start("audio"); };
    byID("hybridStartVideo").onclick = () => { void start("video"); };
    byID("hybridAnswerCall").onclick = () => { void control("answer"); };
    byID("hybridEndCall").onclick = () => { void control("end"); };
    byID("hybridCallCamera").onclick = () => { void control("camera"); };
    byID("hybridCallMute").onclick = () => { void control("mute"); };
    byID("hybridSwitchCamera").onclick = () => { void control("switchCamera"); };
    byID("hybridVideoFit").onclick = () => { void control("fit", state.call.videoFit === "contain" ? "cover" : "contain"); };
    byID("hybridDtmfToggle").onclick = () => {
      byID("hybridDtmf").hidden = !byID("hybridDtmf").hidden;
      byID("hybridDtmfToggle").setAttribute("aria-expanded", String(!byID("hybridDtmf").hidden));
      layoutKey = ""; layout();
    };
    for (const button of byID("hybridDtmf").querySelectorAll("button")) button.onclick = () => { void control("dtmf", button.dataset.tone); };
    byID("hybridCallRetry").onclick = () => {
      void client.resetCallFailure().then(() => { byID("hybridCallRetry").hidden = true; byID("hybridChatNotice").textContent = ""; }).catch(() => {});
    };
    ownText.oninput = () => {
      if (!state?.call.rttReady || !currentID) return;
      if (new TextEncoder().encode(ownText.value).length > 8192) { error("De RTT-tekst is te lang. Je tekst blijft staan."); return; }
      dirty = true;
      pendingRtt = { id: currentID, value: ownText.value };
      if (!rttWork) {
        rttWork = (async () => {
          while (pendingRtt) {
            const value = pendingRtt; pendingRtt = null;
            if (value.id !== currentID) continue;
            await client.controlCall(value.id, "rtt", value.value);
          }
        })().catch(() => error("Realtime tekst nog niet bijgewerkt; je eigen tekst blijft staan.")).finally(() => { rttWork = null; });
      }
    };
    const observer = new ResizeObserver(() => { layoutKey = ""; layout(); });
    observer.observe(video);
    document.defaultView.addEventListener("resize", layout);
    const unsubscribe = client.subscribe(render);
    document.defaultView.addEventListener("pagehide", () => {
      disposed = true; unsubscribe(); observer.disconnect(); pendingRtt = null;
      document.defaultView.removeEventListener("resize", layout);
      ownText.value = ""; remoteText.textContent = "";
    }, { once: true });
  }

  if (typeof module === "object" && module.exports) module.exports = { mount };
  else mount(root.document, root.TeleTypTelNativeSession);
})(typeof window === "undefined" ? globalThis : window);
