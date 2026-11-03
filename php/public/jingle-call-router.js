(function (root) {
  "use strict";

  const namespace = "urn:xmpp:jingle:1";
  const disco = "http://jabber.org/protocol/disco#info";
  const feature = profile => `urn:teletyptel:jingle:profile:${profile}:0`;
  const profiles = { audio: "audio", video: "audio,video", total: "audio,video,rtt", "audio-rtt": "audio,rtt" };
  const bare = jid => String(jid || "").split("/")[0];
  const full = jid => typeof jid === "string" && jid.length <= 1024 && /^[^\s/]+\/[^\s]+$/.test(jid);

  function supportedProfiles() {
    if (!root.TeleTypTelJingleMedia || !root.RTCPeerConnection || !root.RTCRtpTransceiver?.prototype.setCodecPreferences) return [];
    const codecs = kind => root.RTCRtpSender?.getCapabilities(kind)?.codecs || [];
    const audio = codecs("audio").some(codec => codec.mimeType.toLowerCase() === "audio/pcmu" && codec.clockRate === 8000);
    const video = codecs("video").some(codec => codec.mimeType.toLowerCase() === "video/vp8" && codec.clockRate === 90000);
    return Object.keys(profiles).filter(profile => audio && (!profiles[profile].includes("video") || video)
      && (!profiles[profile].includes("rtt") || root.TeleTypTelT140));
  }

  function create(options) {
    const supported = supportedProfiles();
    const resources = new Map();
    const agents = new Set();
    let active = null;
    let generation = 0;
    const base = root.TeleTypTelJingleSession.create({
      localJid: options.localJid, send: options.send, timeoutMs: options.discoveryTimeoutMs ?? 2500,
      allowPeer: options.allowPeer, busy: () => Boolean(active || options.busy?.()), supports: () => false,
      features: supported.map(feature)
    });

    function observePresence(presence) {
      const from = presence.getAttribute("from") || "";
      const type = presence.getAttribute("type") || "";
      if (["unavailable", "unsubscribe", "unsubscribed"].includes(type)) {
        for (const jid of resources.keys()) {
          if (jid === from || (!full(from) && bare(jid) === from)) resources.delete(jid);
        }
      } else if (!type && full(from) && options.allowPeer(from)) {
        resources.delete(from);
        resources.set(from, {});
        while (resources.size > 256) resources.delete(resources.keys().next().value);
      }
    }

    async function select(peer, profile) {
      if (!supported.includes(profile)) return null;
      const version = generation;
      const candidates = [...resources.keys()].filter(jid => full(peer) ? jid === peer : bare(jid) === bare(peer)).slice(-8).reverse();
      const results = await Promise.all(candidates.map(async jid => {
        const presence = resources.get(jid);
        try {
          const features = await base.discover(jid);
          return features.has(feature(profile)) && resources.get(jid) === presence && options.allowPeer(jid) ? jid : null;
        } catch { return null; }
      }));
      if (generation !== version) throw new Error("XMPP connection changed during discovery");
      return results.find(Boolean) || null;
    }

    function retire(entry) {
      if (active === entry) active = null;
      if (entry.timer) return;
      entry.timer = setTimeout(() => { agents.delete(entry); entry.adapter.reset(); }, 30000);
    }

    function prepare(peer, profile) {
      if (active || !full(peer) || !supported.includes(profile) || !options.allowPeer(peer) || agents.size >= 16) {
        throw new Error("Jingle peer unavailable or call already active");
      }
      const entry = { peer, profile, sid: null, adapter: null, timer: null };
      entry.adapter = root.TeleTypTelJingleMedia.create({
        ...options.mediaOptions, profile, localJid: options.localJid, send: options.send,
        allowPeer: from => from === peer && options.allowPeer(from), rtcConfig: options.rtcConfig?.(),
        onTrack: track => options.onTrack?.(entry.adapter, track),
        onEvent: event => {
          if (event.session) entry.sid = event.session.sid;
          if (event.event === "ended") retire(entry);
          options.onEvent?.({ ...event, profile, adapter: entry.adapter });
        }
      });
      active = entry;
      agents.add(entry);
      return entry.adapter;
    }

    function release(adapter, reason = "success") {
      const entry = [...agents].find(item => item.adapter === adapter);
      if (!entry || entry.timer) return;
      entry.sid ??= adapter.snapshot()?.sid;
      retire(entry);
      void adapter.end(reason).catch(() => {});
    }

    function handleIq(iq) {
      const children = Array.from(iq.children || []);
      const jingle = children.find(child => child.localName === "jingle" && child.namespaceURI === namespace);
      if (!jingle) {
        if (children.some(child => child.localName === "query" && child.namespaceURI === disco) && iq.getAttribute("type") === "get") {
          return base.handleIq(iq);
        }
        if (base.handleIq(iq)) return true;
        for (const entry of agents) if (entry.adapter.handleIq(iq)) return true;
        return false;
      }
      const from = iq.getAttribute("from");
      const sid = jingle.getAttribute("sid");
      const existing = [...agents].find(entry => entry.peer === from && (entry.adapter.snapshot()?.sid || entry.sid) === sid);
      if (existing) return existing.adapter.handleIq(iq);
      if (jingle.getAttribute("action") !== "session-initiate" || active || options.busy?.()
        || !full(from) || !options.allowPeer(from) || agents.size >= 16) return base.handleIq(iq);
      const kinds = Array.from(jingle.children).filter(child => child.localName === "content").map(content => {
        const description = Array.from(content.children).find(child => child.localName === "description");
        return description?.namespaceURI === "urn:xmpp:jingle:apps:rtp:1" ? description.getAttribute("media")
          : description?.namespaceURI === "urn:xmpp:jingle:apps:rtt-sync:0" ? "rtt" : "unknown";
      }).join(",");
      const profile = supported.find(name => profiles[name] === kinds);
      if (!profile) return base.handleIq(iq);
      const adapter = prepare(from, profile);
      const handled = adapter.handleIq(iq);
      if (!adapter.snapshot()) release(adapter, "cancel");
      return handled;
    }

    function reset() {
      generation++;
      resources.clear();
      base.reset();
      const previousActive = active;
      active = null;
      for (const entry of agents) {
        const hadSession = Boolean(entry.adapter.snapshot());
        entry.adapter.reset();
        if (entry === previousActive && !hadSession) {
          options.onEvent?.({ event: "ended", reason: "disconnected", profile: entry.profile, adapter: entry.adapter });
        }
        clearTimeout(entry.timer);
      }
      agents.clear();
    }

    return Object.freeze({ observePresence, select, prepare, release, handleIq, reset });
  }

  root.TeleTypTelJingleCalls = Object.freeze({ create, feature });
})(typeof window === "undefined" ? globalThis : window);
