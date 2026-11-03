(function (root) {
  "use strict";

  const NS = Object.freeze({
    jingle: "urn:xmpp:jingle:1",
    rtp: "urn:xmpp:jingle:apps:rtp:1",
    ice: "urn:xmpp:jingle:transports:ice-udp:1",
    dtls: "urn:xmpp:jingle:apps:dtls:0",
    feedback: "urn:xmpp:jingle:apps:rtp:rtcp-fb:0",
    sctp: "urn:xmpp:jingle:transports:dtls-sctp:1",
    channel: "urn:xmpp:jingle:transports:webrtc-datachannel:0",
    rtt: "urn:xmpp:jingle:apps:rtt-sync:0",
    experimental: "urn:teletyptel:jingle:tc:0"
  });
  const profiles = Object.freeze({ audio: ["audio"], video: ["audio", "video"],
    total: ["audio", "video", "rtt"], "audio-rtt": ["audio", "rtt"], rtt: ["rtt"] });
  const feedbackTypes = new Set(["nack", "nack pli", "ccm fir", "goog-remb"]);
  const children = (parent, name, namespace) => Array.from(parent.children)
    .filter(child => child.localName === name && child.namespaceURI === namespace);
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  const token = value => typeof value === "string" && /^[A-Za-z0-9_.+-]{1,64}$/.test(value);
  const iceCredential = (value, minimum) => typeof value === "string"
    && new RegExp(`^[A-Za-z0-9+/]{${minimum},256}$`).test(value);
  const integer = (value, minimum, maximum) => /^\d{1,10}$/.test(String(value))
    && Number(value) >= minimum && Number(value) <= maximum;
  function address(value) {
    if (typeof value !== "string" || value.length > 45) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split(".").every(part => Number(part) <= 255);
    if (!/^[0-9a-f:]+$/i.test(value) || !value.includes(":")) return false;
    try { return new URL(`http://[${value}]/`).hostname.startsWith("["); } catch { return false; }
  }

  function validate(candidate) {
    requireValue(token(candidate.id) && token(candidate.foundation) && candidate.component === "1" && candidate.protocol === "udp"
      && (address(candidate.ip) || (candidate.type === "host" && typeof candidate.ip === "string"
        && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/i.test(candidate.ip))) && integer(candidate.port, 1, 65535)
      && integer(candidate.priority, 1, 4294967295)
      && ["host", "srflx", "prflx", "relay"].includes(candidate.type)
      && candidate.generation === "0", "Unsupported ICE candidate");
    requireValue((candidate["rel-addr"] === undefined && candidate["rel-port"] === undefined)
      || (address(candidate["rel-addr"]) && integer(candidate["rel-port"], 0, 65535)), "Invalid related ICE address");
    return candidate;
  }

  function candidateFromSdp(line, index) {
    const parts = line.slice("a=candidate:".length).split(" ");
    requireValue(parts.length >= 8 && parts[6] === "typ" && parts.length % 2 === 0, "Invalid ICE candidate syntax");
    const candidate = {
      foundation: parts[0], component: parts[1], protocol: parts[2].toLowerCase(),
      priority: parts[3], ip: parts[4], port: parts[5], type: parts[7], generation: "0", id: `candidate-${index}`
    };
    const extensions = new Map();
    for (let offset = 8; offset < parts.length; offset += 2) {
      requireValue(!extensions.has(parts[offset]), "Duplicate ICE extension");
      extensions.set(parts[offset], parts[offset + 1]);
    }
    if (extensions.has("raddr")) candidate["rel-addr"] = extensions.get("raddr");
    if (extensions.has("rport")) candidate["rel-port"] = extensions.get("rport");
    if (extensions.has("generation")) candidate.generation = extensions.get("generation");
    return validate(candidate);
  }

  function single(parent, name, namespace) {
    const found = children(parent, name, namespace);
    requireValue(found.length === 1, `Expected one ${name}`);
    return found[0];
  }

  function append(parent, namespace, name, attributes = {}, text = "") {
    const result = parent.ownerDocument.createElementNS(namespace, name);
    for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
    result.textContent = text;
    parent.appendChild(result);
    return result;
  }

  function validateParameters(parameters, type) {
    requireValue(type === "offer" || type === "answer", "Unsupported description type");
    requireValue(token(parameters.mid) && iceCredential(parameters.ufrag, 4) && iceCredential(parameters.pwd, 22),
      "Invalid media identity or ICE credentials");
    requireValue(/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(parameters.fingerprint), "SHA-256 fingerprint required");
    requireValue(type === "offer" ? parameters.setup === "actpass" : ["active", "passive"].includes(parameters.setup),
      "Invalid DTLS role");
    requireValue(parameters.candidates.length > 0 && parameters.candidates.length <= 64, "Complete ICE candidates required");
    parameters.candidates.forEach(validate);
    return parameters;
  }

  function fromSdp(description, kind = "audio") {
    requireValue(["audio", "video", "rtt"].includes(kind), "Unsupported media kind");
    requireValue(typeof description?.sdp === "string" && description.sdp.length <= 65536, "Invalid SDP");
    const lines = description.sdp.split(/\r?\n/).filter(Boolean);
    requireValue(lines.every(line => !/[\r\x00-\x08\x0b-\x1f]/.test(line)), "Invalid SDP characters");
    const media = lines.filter(line => line.startsWith("m="));
    const match = media[0]?.match(/^m=(audio|video) [1-9]\d* UDP\/TLS\/RTP\/SAVPF (\d+)$/);
    requireValue(media.length === 1 && (kind === "rtt"
      ? /^m=application [1-9]\d* UDP\/DTLS\/SCTP webrtc-datachannel$/.test(media[0])
      : match?.[1] === kind && (kind === "audio" ? match[2] === "0" : integer(match[2], 96, 127))),
      "Unsupported media/codec profile");
    const once = prefix => {
      const matches = lines.filter(line => line.startsWith(prefix));
      requireValue(matches.length === 1, `Expected one ${prefix}`);
      return matches[0].slice(prefix.length);
    };
    requireValue((kind === "rtt" || (lines.includes("a=rtcp-mux") && lines.includes("a=sendrecv")))
      && !lines.some(line => /^a=(?:sendonly|recvonly|inactive|crypto:|ice-lite)/.test(line)), "Unsupported audio security or direction");
    if (kind !== "rtt") requireValue((kind === "audio" ? /^PCMU\/8000(?:\/1)?$/i : /^VP8\/90000$/i)
      .test(once(`a=rtpmap:${match[2]} `)), "Unsupported audio/video codec");
    requireValue(!lines.some(line => line.startsWith("a=fmtp:")), "Unsupported codec parameters");
    const fingerprint = once("a=fingerprint:");
    requireValue(fingerprint.startsWith("sha-256 "), "SHA-256 fingerprint required");
    const parameters = validateParameters({
      mid: once("a=mid:"), ufrag: once("a=ice-ufrag:"), pwd: once("a=ice-pwd:"),
      setup: once("a=setup:"), fingerprint: fingerprint.slice(8),
      candidates: lines.filter(line => line.startsWith("a=candidate:") && / 1 udp /i.test(line))
        .map(candidateFromSdp)
    }, description.type);
    const document = new DOMParser().parseFromString(`<content xmlns="${NS.jingle}"/>`, "application/xml");
    const content = document.documentElement;
    content.setAttribute("creator", "initiator");
    content.setAttribute("name", parameters.mid);
    content.setAttribute("senders", "both");
    if (kind === "rtt") {
      const rtt = append(content, NS.rtt, "description", { profile: "dc-t140" });
      append(rtt, NS.rtt, "datachannel", { subprotocol: "t140", reliability: "reliable", order: "in-order", label: "rtt" });
      append(rtt, NS.rtt, "rtt-sync", { role: "conversation", source: "human", "sync-mode": "co-session" });
    } else {
      const rtp = append(content, NS.rtp, "description", { media: kind });
      const payload = append(rtp, NS.rtp, "payload-type", kind === "audio"
        ? { id: "0", name: "PCMU", clockrate: "8000", channels: "1" }
        : { id: match[2], name: "VP8", clockrate: "90000" });
      if (kind === "video") for (const line of lines.filter(line => line.startsWith(`a=rtcp-fb:${match[2]} `))) {
        const value = line.slice(`a=rtcp-fb:${match[2]} `.length);
        if (!feedbackTypes.has(value)) continue;
        const [type, subtype] = value.split(" ");
        append(payload, NS.feedback, "rtcp-fb", subtype ? { type, subtype } : { type });
      }
      append(rtp, NS.rtp, "rtcp-mux");
    }
    const transport = append(content, NS.ice, "transport", { ufrag: parameters.ufrag, pwd: parameters.pwd });
    append(transport, NS.dtls, "fingerprint", { hash: "sha-256", setup: parameters.setup }, parameters.fingerprint);
    if (kind === "rtt") {
      const port = once("a=sctp-port:");
      requireValue(integer(port, 1, 65535), "Invalid SCTP port");
      append(transport, NS.sctp, "sctpmap", { number: port, protocol: "webrtc-datachannel" });
      append(transport, NS.channel, "channel", { id: "0", negotiated: "true", ordered: "true", protocol: "t140" });
    }
    for (const candidate of parameters.candidates) append(transport, NS.ice, "candidate", candidate);
    return content;
  }

  function toSdp(jingle, type, kind = "audio") {
    requireValue(["audio", "video", "rtt"].includes(kind), "Unsupported media kind");
    requireValue(jingle?.namespaceURI === NS.jingle && jingle.localName === "jingle"
      && new XMLSerializer().serializeToString(jingle).length <= 65536, "Invalid Jingle description");
    const content = single(jingle, "content", NS.jingle);
    requireValue(jingle.children.length === 1 && content.getAttribute("creator") === "initiator"
      && [null, "both"].includes(content.getAttribute("senders")) && !content.hasAttribute("disposition"),
      "Unsupported content semantics");
    const rtp = single(content, "description", kind === "rtt" ? NS.rtt : NS.rtp);
    const transport = single(content, "transport", NS.ice);
    requireValue(content.children.length === 2, "Unsupported content children");
    let payloadId = "0", sctpPort = "";
    const feedback = [];
    if (kind === "rtt") {
      const channel = single(rtp, "datachannel", NS.rtt), sync = single(rtp, "rtt-sync", NS.rtt);
      requireValue(rtp.getAttribute("profile") === "dc-t140" && rtp.children.length === 2
        && channel.children.length === 0 && channel.getAttribute("subprotocol") === "t140"
        && channel.getAttribute("reliability") === "reliable" && channel.getAttribute("order") === "in-order"
        && channel.getAttribute("label") === "rtt" && sync.children.length === 0
        && sync.getAttribute("role") === "conversation" && sync.getAttribute("source") === "human"
        && sync.getAttribute("sync-mode") === "co-session" && !sync.hasAttribute("max-skew"), "Unsupported RTT semantics");
      const sctp = single(transport, "sctpmap", NS.sctp), binding = single(transport, "channel", NS.channel);
      sctpPort = sctp.getAttribute("number");
      requireValue(integer(sctpPort, 1, 65535) && sctp.getAttribute("protocol") === "webrtc-datachannel"
        && sctp.children.length === 0 && binding.children.length === 0
        && binding.getAttribute("id") === "0" && binding.getAttribute("negotiated") === "true"
        && binding.getAttribute("ordered") === "true" && binding.getAttribute("protocol") === "t140"
        && !binding.hasAttribute("maxRetransmits") && !binding.hasAttribute("maxPacketLifeTime"), "Unsupported SCTP channel");
    } else {
      requireValue(rtp.getAttribute("media") === kind, "Wrong RTP media kind");
      const payload = single(rtp, "payload-type", NS.rtp);
      single(rtp, "rtcp-mux", NS.rtp);
      payloadId = payload.getAttribute("id");
      requireValue(rtp.children.length === 2 && [null, "1"].includes(payload.getAttribute("channels"))
        && (kind === "audio" ? payloadId === "0" && payload.getAttribute("name")?.toUpperCase() === "PCMU"
          && payload.getAttribute("clockrate") === "8000" && payload.children.length === 0
          : integer(payloadId, 96, 127) && payload.getAttribute("name")?.toUpperCase() === "VP8"
            && payload.getAttribute("clockrate") === "90000"), "Unsupported RTP payload");
      for (const child of payload.children) {
        const value = [child.getAttribute("type"), child.getAttribute("subtype")].filter(Boolean).join(" ");
        requireValue(child.namespaceURI === NS.feedback && child.localName === "rtcp-fb"
          && !child.children.length && feedbackTypes.has(value) && !feedback.includes(value), "Unsupported RTP feedback");
        feedback.push(value);
      }
    }
    const fingerprint = single(transport, "fingerprint", NS.dtls);
    const candidates = children(transport, "candidate", NS.ice);
    requireValue(fingerprint.getAttribute("hash") === "sha-256" && fingerprint.children.length === 0
      && transport.children.length === candidates.length + (kind === "rtt" ? 3 : 1), "Unsupported secure transport");
    const parameters = validateParameters({
      mid: content.getAttribute("name"), ufrag: transport.getAttribute("ufrag"), pwd: transport.getAttribute("pwd"),
      fingerprint: fingerprint.textContent.trim(), setup: fingerprint.getAttribute("setup"),
      candidates: candidates.map(candidate => {
        requireValue(candidate.children.length === 0, "Invalid candidate content");
        return Object.fromEntries(Array.from(candidate.attributes).filter(attribute => attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/")
          .map(attribute => [attribute.name, attribute.value]));
      })
    }, type);
    const mediaLines = kind === "rtt" ? [`a=sctp-port:${sctpPort}`, "a=max-message-size:4096"]
      : ["a=sendrecv", "a=rtcp-mux", `a=rtpmap:${payloadId} ${kind === "audio" ? "PCMU/8000" : "VP8/90000"}`,
        ...feedback.map(value => `a=rtcp-fb:${payloadId} ${value}`)];
    const lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0",
      kind === "rtt" ? "m=application 9 UDP/DTLS/SCTP webrtc-datachannel" : `m=${kind} 9 UDP/TLS/RTP/SAVPF ${payloadId}`,
      "c=IN IP4 0.0.0.0", `a=mid:${parameters.mid}`, ...mediaLines,
      `a=ice-ufrag:${parameters.ufrag}`, `a=ice-pwd:${parameters.pwd}`,
      `a=fingerprint:sha-256 ${parameters.fingerprint}`, `a=setup:${parameters.setup}`];
    for (const candidate of parameters.candidates) {
      let line = `a=candidate:${candidate.foundation} 1 udp ${candidate.priority} ${candidate.ip} ${candidate.port} typ ${candidate.type}`;
      if (candidate["rel-addr"] !== undefined) line += ` raddr ${candidate["rel-addr"]} rport ${candidate["rel-port"]}`;
      lines.push(`${line} generation 0`);
    }
    lines.push("a=end-of-candidates");
    return { type, sdp: `${lines.join("\r\n")}\r\n` };
  }

  function kindsFor(profile) {
    requireValue(Object.prototype.hasOwnProperty.call(profiles, profile), "Unsupported call profile");
    return profiles[profile];
  }

  function mediaFromSdp(description, profile = "total") {
    const kinds = kindsFor(profile);
    requireValue(typeof description?.sdp === "string" && description.sdp.length <= 65536, "Invalid SDP");
    const sections = description.sdp.split(/(?=^m=)/m), header = sections.shift();
    requireValue(sections.length === kinds.length, "Unexpected media count");
    const contents = sections.map((section, index) => fromSdp({ type: description.type, sdp: header + section }, kinds[index]));
    requireValue(new Set(contents.map(content => content.getAttribute("name"))).size === kinds.length, "Duplicate media identity");
    return contents;
  }

  function mediaToSdp(jingle, type, profile = "total") {
    const kinds = kindsFor(profile), contents = children(jingle, "content", NS.jingle);
    requireValue(contents.length === kinds.length && jingle.children.length === kinds.length
      && new Set(contents.map(content => content.getAttribute("name"))).size === kinds.length, "Unexpected media contents");
    const descriptions = contents.map((content, index) => {
      const singleContent = jingle.cloneNode(false);
      singleContent.appendChild(content.cloneNode(true));
      return toSdp(singleContent, type, kinds[index]).sdp;
    });
    return { type, sdp: descriptions.map((sdp, index) => index ? sdp.slice(sdp.indexOf("m=")) : sdp).join("") };
  }

  function create(options, profile = "audio") {
    requireValue(root.TeleTypTelJingleSession && typeof root.RTCPeerConnection === "function", "Jingle/WebRTC unavailable");
    const kinds = kindsFor(profile), trackKinds = kinds.filter(kind => kind !== "rtt"), hasRtt = kinds.includes("rtt");
    requireValue(!hasRtt || root.TeleTypTelT140, "T.140 adapter unavailable");
    let current = null;
    const notify = (event, detail = {}) => options.onEvent?.({ event, ...detail });
    const check = call => requireValue(current === call, "Audio operation cancelled");
    const agent = root.TeleTypTelJingleSession.create({
      localJid: options.localJid, send: options.send, timeoutMs: options.timeoutMs,
      allowPeer: peer => !current && options.allowPeer?.(peer) === true,
      features: [NS.ice, NS.dtls, ...(trackKinds.length ? [NS.rtp, ...trackKinds.map(kind => `${NS.rtp}:${kind}`)] : []),
        ...(kinds.includes("video") ? [NS.feedback] : []), ...(hasRtt ? [NS.experimental, NS.sctp] : [])],
      supports: jingle => {
        mediaToSdp(jingle, jingle.getAttribute("action") === "session-initiate" ? "offer" : "answer", profile);
        return true;
      },
      supportsTransport: () => false,
      onEvent: event => {
        if (event.event === "incoming") {
          current = { offer: mediaToSdp(event.jingle, "offer", profile), pc: null, stream: null, controller: new AbortController(),
            textContent: hasRtt ? children(event.jingle, "content", NS.jingle)[kinds.indexOf("rtt")].getAttribute("name") : null };
          deadline(current, options.ringingTimeoutMs ?? 60000);
          notify("incoming", { session: event.session, profile });
        } else if (event.event === "session-accept") {
          const call = current;
          if (call?.pc) {
            const answer = mediaToSdp(event.jingle, "answer", profile);
            void wait(call, call.pc.setRemoteDescription(answer)).catch(() => fail(call, "failed-application"));
            deadline(call, options.connectTimeoutMs ?? 30000);
          }
        } else if (event.event === "ended") {
          release();
          notify("ended", { session: event.session, reason: event.reason });
        }
      }
    });

    function release() {
      const call = current;
      current = null;
      if (!call) return;
      call.controller.abort();
      clearTimeout(call.timer);
      call.abortGather?.();
      call.rtt?.close();
      if (call.pc) {
        call.pc.ontrack = null;
        call.pc.ondatachannel = null;
        call.pc.onconnectionstatechange = null;
        call.pc.close();
      }
      call.stream?.getTracks().forEach(track => track.stop());
    }

    async function wait(call, operation) {
      const signal = call.controller.signal;
      const result = await new Promise((resolve, reject) => {
        const aborted = () => reject(new Error("Audio operation cancelled"));
        if (signal.aborted) aborted();
        else signal.addEventListener("abort", aborted, { once: true });
        Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
      });
      check(call);
      return result;
    }

    function fail(call, reason) {
      if (current !== call) return;
      void end(reason).catch(() => {});
    }

    function deadline(call, duration) {
      clearTimeout(call.timer);
      call.timer = setTimeout(() => fail(call, "timeout"), duration);
    }

    function open(call, stream) {
      check(call);
      const tracks = stream?.getTracks?.() || [];
      requireValue(tracks.length === trackKinds.length && trackKinds.every(kind => tracks.filter(track => track.kind === kind).length === 1)
        && tracks.every(track => track.readyState === "live"), "Authorized tracks must match the selected call profile");
      call.codecs = new Map(trackKinds.map(kind => {
        const codecs = root.RTCRtpSender.getCapabilities(kind)?.codecs.filter(codec => kind === "audio"
          ? codec.mimeType.toLowerCase() === "audio/pcmu" && codec.clockRate === 8000 && (codec.channels || 1) === 1
          : codec.mimeType.toLowerCase() === "video/vp8" && codec.clockRate === 90000);
        requireValue(codecs?.length, `${kind} codec unavailable`);
        return [kind, codecs];
      }));
      call.stream = new MediaStream(trackKinds.map(kind => tracks.find(track => track.kind === kind).clone()));
      call.pc = new RTCPeerConnection({ ...options.rtcConfig, bundlePolicy: "max-compat", rtcpMuxPolicy: "require" });
      call.pc.ondatachannel = event => event.channel.close();
      if (hasRtt) {
        call.rtt = root.TeleTypTelT140.create(call.pc.createDataChannel("rtt", {
          negotiated: true, id: 0, ordered: true, protocol: "t140"
        }), {
          isCurrent: () => current === call,
          onStatus: state => notify("rtt-state", { state, sid: agent.snapshot()?.sid, content: call.textContent, syncMode: "co-session" }),
          onText: text => notify("rtt", { ...text, sid: agent.snapshot()?.sid, content: call.textContent, syncMode: "co-session" })
        });
      }
      call.pc.ontrack = event => {
        if (current === call) options.onTrack?.(event.track);
      };
      call.pc.onconnectionstatechange = () => {
        if (current !== call) return;
        const state = call.pc.connectionState;
        if (state === "connected") clearTimeout(call.timer);
        if (state === "failed") fail(call, "failed-transport");
        else if (state === "disconnected") deadline(call, options.connectTimeoutMs ?? 30000);
        notify("connection", { state });
      };
    }

    function attach(call) {
      check(call);
      for (const track of call.stream.getTracks()) {
        const sender = call.pc.addTrack(track, call.stream);
        const transceiver = call.pc.getTransceivers().find(item => item.sender === sender);
        transceiver.direction = "sendrecv";
        transceiver.setCodecPreferences(call.codecs.get(track.kind));
      }
    }

    async function gather(call, description) {
      check(call);
      await wait(call, call.pc.setLocalDescription(description));
      check(call);
      if (call.pc.iceGatheringState !== "complete") await new Promise((resolve, reject) => {
        const finish = error => {
          clearTimeout(timer);
          call.pc.removeEventListener("icegatheringstatechange", changed);
          call.abortGather = null;
          if (error) reject(error); else resolve();
        };
        const changed = () => { if (call.pc.iceGatheringState === "complete") finish(); };
        const timer = setTimeout(() => finish(new Error("ICE gathering timed out")), options.gatherTimeoutMs ?? 10000);
        call.abortGather = () => finish(new Error("Audio operation cancelled"));
        call.pc.addEventListener("icegatheringstatechange", changed);
        changed();
      });
      check(call);
      return mediaFromSdp(call.pc.localDescription, profile);
    }

    async function start(peer, stream, sid) {
      requireValue(!current && !agent.snapshot(), "Audio session busy");
      const call = { pc: null, stream: null, controller: new AbortController() };
      current = call;
      try {
        open(call, stream);
        attach(call);
        const offer = await wait(call, call.pc.createOffer());
        check(call);
        const contents = await gather(call, offer);
        check(call);
        call.textContent = hasRtt ? contents[kinds.indexOf("rtt")].getAttribute("name") : null;
        deadline(call, options.ringingTimeoutMs ?? 60000);
        await agent.initiate(peer, contents, sid);
        check(call);
      } catch (error) {
        fail(call, "failed-application");
        throw error;
      }
    }

    async function accept(stream) {
      const call = current;
      requireValue(call?.offer && !call.pc, "No pending audio offer");
      try {
        open(call, stream);
        await wait(call, call.pc.setRemoteDescription(call.offer));
        check(call);
        attach(call);
        const answer = await wait(call, call.pc.createAnswer());
        check(call);
        const contents = await gather(call, answer);
        check(call);
        deadline(call, options.connectTimeoutMs ?? 30000);
        await agent.accept(contents);
        check(call);
      } catch (error) {
        fail(call, "failed-application");
        throw error;
      }
    }

    function end(reason = "success") {
      try { return agent.terminate(reason); }
      finally { release(); }
    }

    function reset() { release(); agent.reset(); }
    function setTrackEnabled(kind, enabled) {
      const track = current?.stream?.getTracks().find(track => track.kind === kind);
      if (!track || typeof enabled !== "boolean") return false;
      track.enabled = enabled;
      return true;
    }

    async function replaceTrack(track) {
      const call = current;
      requireValue(call?.pc && trackKinds.includes(track?.kind) && track.readyState === "live", "No matching active media track");
      const previous = call.stream.getTracks().find(item => item.kind === track.kind);
      const sender = call.pc.getSenders().find(item => item.track === previous);
      requireValue(sender, "Media sender unavailable");
      call.replacing ??= new Set();
      requireValue(!call.replacing.has(track.kind), "Media replacement already in progress");
      const replacement = track.clone();
      replacement.enabled = previous.enabled;
      call.replacing.add(track.kind);
      try {
        await wait(call, sender.replaceTrack(replacement));
        replacement.enabled = previous.enabled;
        call.stream.removeTrack(previous);
        call.stream.addTrack(replacement);
        previous.stop();
      } catch (error) { replacement.stop(); throw error; }
      finally { call.replacing.delete(track.kind); }
    }

    return Object.freeze({ start, accept, end, reset, handleIq: agent.handleIq, discover: agent.discover,
      snapshot: agent.snapshot, connection: () => current?.pc ?? null,
      stats: () => current?.pc?.getStats() ?? Promise.resolve(new Map()), setTrackEnabled, replaceTrack,
      sendRtt: block => current?.rtt?.sendBlock(block) ?? false,
      setRttText: text => current?.rtt?.setText(text) ?? false });
  }

  root.TeleTypTelJingleAudio = Object.freeze({ create: options => create(options), fromSdp, toSdp, NS });
  root.TeleTypTelJingleMedia = Object.freeze({ create: options => create(options, options.profile ?? "total"),
    fromSdp: mediaFromSdp, toSdp: mediaToSdp, NS });
})(typeof window === "undefined" ? globalThis : window);
