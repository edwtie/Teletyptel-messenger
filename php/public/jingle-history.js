(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TeleTypTelJingleHistory = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NS_JINGLE_HISTORY = "urn:xmpp:jingle-history:0";
  const NS_JINGLE_HISTORY_RECORDING = "urn:xmpp:jingle-history:recording:0";
  const NS_JINGLE_HISTORY_TRANSCRIPT = "urn:xmpp:jingle-history:transcript:0";
  const FEATURE_JINGLE_HISTORY = NS_JINGLE_HISTORY;

  const directions = new Set(["incoming", "outgoing"]);
  const dispositions = new Set(["completed", "missed", "declined", "cancelled", "failed", "busy", "timeout", "replaced", "emergency"]);
  const mediaTypes = new Set(["audio", "video", "rtt", "captions", "screen", "file", "location"]);
  const profiles = new Set(["audio", "video", "total-conversation", "group-call", "emergency", "screen-share", "custom"]);
  const storageStates = new Set(["none", "local", "cloud", "external", "policy-based"]);
  const consentStates = new Set(["none", "initiator", "all-participants", "policy-based"]);
  const emergencyServices = new Set(["112", "911", "999", "custom"]);

  function serializeJingleHistory(event) {
    if (typeof document === "undefined" || !document.createElementNS) {
      throw new Error("serializeJingleHistory requires a DOM document.");
    }

    const normalized = normalizeJingleHistoryEvent(event);
    const element = document.createElementNS(NS_JINGLE_HISTORY, "jingle-history");
    applyJingleHistoryAttributes(element, normalized);
    appendMetadataChildren(element, normalized);
    return element;
  }

  function parseJingleHistory(element) {
    try {
      if (!element || element.namespaceURI !== NS_JINGLE_HISTORY || element.localName !== "jingle-history") {
        return null;
      }

      const sid = safeAttribute(element, "sid");
      const direction = normalizeEnum(safeAttribute(element, "direction"), directions);
      const disposition = normalizeEnum(safeAttribute(element, "disposition"), dispositions);
      const media = normalizeMediaList(safeAttribute(element, "media"));
      if (!sid || !direction || !disposition || media.length === 0) {
        return null;
      }

      const event = {
        sid,
        direction,
        disposition,
        media,
        createdAt: new Date().toISOString()
      };

      const profile = normalizeEnum(safeAttribute(element, "profile"), profiles);
      const started = normalizeIsoTimestamp(safeAttribute(element, "started"));
      const ended = normalizeIsoTimestamp(safeAttribute(element, "ended"));
      const duration = normalizeDuration(safeAttribute(element, "duration"));
      const recording = normalizeEnum(safeAttribute(element, "recording"), storageStates);
      const transcript = normalizeEnum(safeAttribute(element, "transcript"), storageStates);
      const consent = normalizeEnum(safeAttribute(element, "consent"), consentStates);
      const emergencyService = normalizeEnum(safeAttribute(element, "emergency-service"), emergencyServices);
      const participantJids = splitList(safeAttribute(element, "participants"));

      if (profile) event.profile = profile;
      if (started) event.started = started;
      if (ended) event.ended = ended;
      if (typeof duration === "number") event.duration = duration;
      if (recording) event.recording = recording;
      if (transcript) event.transcript = transcript;
      if (safeAttribute(element, "room-jid")) event.roomJid = safeAttribute(element, "room-jid");
      if (safeAttribute(element, "peer-jid")) event.peerJid = safeAttribute(element, "peer-jid");
      if (participantJids.length) event.participantJids = participantJids;
      if (safeAttribute(element, "encrypted")) event.encrypted = parseBoolean(safeAttribute(element, "encrypted"));
      if (consent) event.consent = consent;
      if (safeAttribute(element, "retention")) event.retention = safeAttribute(element, "retention");
      if (safeAttribute(element, "emergency")) event.emergency = parseBoolean(safeAttribute(element, "emergency"));
      if (emergencyService) event.emergencyService = emergencyService;

      parseMetadataChildren(element, event);
      event.extraAttributes = unknownAttributes(element, [
        "sid", "direction", "disposition", "media", "profile", "started", "ended", "duration",
        "recording", "transcript", "room-jid", "peer-jid", "participants", "encrypted",
        "consent", "retention", "emergency", "emergency-service"
      ]);
      return event;
    } catch {
      return null;
    }
  }

  function buildJingleHistoryMessage(event, options) {
    const normalized = normalizeJingleHistoryEvent(event);
    const messageId = cleanToken(options?.id) || createMessageId("jingle-history");
    const type = options?.type === "groupchat" ? "groupchat" : "chat";
    const to = String(options?.to || "").trim();
    if (!to) {
      throw new Error("Jingle history message requires a recipient.");
    }

    const attrs = [
      "xmlns=\"jabber:client\"",
      `type="${escapeXml(type)}"`,
      options?.from ? `from="${escapeXml(options.from)}"` : "",
      `to="${escapeXml(to)}"`,
      `id="${escapeXml(messageId)}"`
    ].filter(Boolean).join(" ");
    const body = String(options?.body || renderJingleHistorySummary(normalized));
    return `<message ${attrs}><body>${escapeXml(body)}</body>${jingleHistoryXml(normalized)}<store xmlns="urn:xmpp:hints"/></message>`;
  }

  function renderJingleHistorySummary(event) {
    const normalized = normalizeJingleHistoryEvent(event);
    const duration = formatCallDuration(normalized.duration);
    const profile = normalized.profile || inferProfile(normalized.media);
    const media = normalized.media;
    const isTotal = profile === "total-conversation" || (media.includes("video") && media.includes("rtt"));
    const isGroup = profile === "group-call" || Boolean(normalized.roomJid);
    const hasVideo = media.includes("video");
    const hasAudio = media.includes("audio");
    const recording = normalized.recording && normalized.recording !== "none";
    const transcript = normalized.transcript && normalized.transcript !== "none";

    let text;
    if (normalized.disposition === "emergency" || normalized.emergency || profile === "emergency") {
      text = isTotal || media.includes("rtt") ? "Emergency Total Conversation call" : "Emergency call";
    } else if (normalized.disposition === "missed") {
      text = isTotal ? "Missed Total Conversation call" : `Missed ${hasVideo ? "video" : "audio"} call`;
    } else if (normalized.disposition === "declined") {
      text = "Call declined";
    } else if (normalized.disposition === "failed") {
      text = "Call failed";
    } else if (normalized.disposition === "busy") {
      text = "Busy call";
    } else if (normalized.disposition === "timeout") {
      text = "Call timed out";
    } else if (normalized.disposition === "cancelled") {
      text = "Call cancelled";
    } else if (isGroup) {
      text = `Group ${hasVideo ? "video" : "audio"} call`;
    } else if (isTotal) {
      text = "Total Conversation call";
    } else if (hasVideo) {
      text = "Video call";
    } else if (hasAudio) {
      text = "Audio call";
    } else {
      text = "Call";
    }

    if (duration && normalized.disposition === "completed") {
      text += ` · ${duration}`;
    }
    if (recording) {
      text += " · Recording available";
    }
    if (transcript) {
      text += " · Transcript available";
    }
    return text;
  }

  function formatCallDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) {
      return "";
    }

    const total = Math.floor(value);
    const sec = total % 60;
    const min = Math.floor(total / 60) % 60;
    const hour = Math.floor(total / 3600);
    if (hour > 0) {
      return `${hour}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${min}:${String(sec).padStart(2, "0")}`;
  }

  function createMissedCallEvent(input) {
    return normalizeJingleHistoryEvent({
      sid: input.sid,
      direction: input.direction,
      disposition: "missed",
      media: input.media,
      peerJid: input.peerJid,
      roomJid: input.roomJid,
      started: normalizeIsoTimestamp(input.started),
      ended: normalizeIsoTimestamp(input.ended),
      duration: calculateDuration(input.started, input.ended),
      recording: "none",
      transcript: "none",
      createdAt: new Date().toISOString()
    });
  }

  function createCompletedCallEvent(input) {
    return normalizeJingleHistoryEvent({
      sid: input.sid,
      direction: input.direction,
      disposition: "completed",
      media: input.media,
      profile: input.profile,
      peerJid: input.peerJid,
      roomJid: input.roomJid,
      started: normalizeIsoTimestamp(input.started),
      ended: normalizeIsoTimestamp(input.ended),
      duration: calculateDuration(input.started, input.ended),
      recording: "none",
      transcript: "none",
      createdAt: new Date().toISOString()
    });
  }

  function createJingleHistorySyncPayload(event, options = {}) {
    const normalized = normalizeJingleHistoryEvent(event);
    if (options.localOnly || normalized.localOnly) {
      return { localOnly: true, event: { ...normalized, localOnly: true }, message: "" };
    }

    return {
      localOnly: false,
      event: normalized,
      message: buildJingleHistoryMessage(normalized, options)
    };
  }

  function storeLocalJingleHistoryEvent(storage, key, event) {
    if (!storage || !key) {
      return [];
    }

    const normalized = normalizeJingleHistoryEvent({ ...event, localOnly: true });
    const current = loadLocalJingleHistoryEvents(storage, key)
      .filter((item) => item.sid !== normalized.sid);
    current.unshift(normalized);
    const next = current.slice(0, 500);
    storage.setItem(key, JSON.stringify(next));
    return next;
  }

  function loadLocalJingleHistoryEvents(storage, key) {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || "[]");
      return Array.isArray(parsed)
        ? parsed.map((item) => {
          try {
            return normalizeJingleHistoryEvent(item);
          } catch {
            return null;
          }
        }).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  function normalizeJingleHistoryEvent(event) {
    if (!event || typeof event !== "object") {
      throw new Error("Jingle history event is required.");
    }

    const sid = cleanToken(event.sid);
    const direction = normalizeEnum(event.direction, directions);
    const disposition = normalizeEnum(event.disposition, dispositions);
    const media = normalizeMediaList(event.media);
    if (!sid || !direction || !disposition || media.length === 0) {
      throw new Error("Jingle history event requires sid, direction, disposition and media.");
    }

    const result = {
      sid,
      direction,
      disposition,
      media,
      createdAt: normalizeIsoTimestamp(event.createdAt) || new Date().toISOString()
    };
    copyOptional(result, "profile", normalizeEnum(event.profile, profiles));
    copyOptional(result, "started", normalizeIsoTimestamp(event.started));
    copyOptional(result, "ended", normalizeIsoTimestamp(event.ended));
    copyOptional(result, "duration", normalizeDuration(event.duration));
    copyOptional(result, "recording", normalizeEnum(event.recording, storageStates) || "none");
    copyOptional(result, "transcript", normalizeEnum(event.transcript, storageStates) || "none");
    copyOptional(result, "roomJid", cleanLongText(event.roomJid));
    copyOptional(result, "peerJid", cleanLongText(event.peerJid));
    if (Array.isArray(event.participantJids)) {
      result.participantJids = event.participantJids.map(cleanLongText).filter(Boolean).slice(0, 64);
    }
    if (typeof event.encrypted === "boolean") result.encrypted = event.encrypted;
    copyOptional(result, "consent", normalizeEnum(event.consent, consentStates));
    copyOptional(result, "retention", cleanToken(event.retention));
    if (typeof event.emergency === "boolean") result.emergency = event.emergency;
    copyOptional(result, "emergencyService", normalizeEnum(event.emergencyService, emergencyServices));
    if (Array.isArray(event.fileReferences)) {
      result.fileReferences = event.fileReferences.map(normalizeFileReference).filter(Boolean).slice(0, 16);
    }
    if (event.localOnly === true) result.localOnly = true;
    if (event.extraAttributes && typeof event.extraAttributes === "object") {
      result.extraAttributes = Object.fromEntries(Object.entries(event.extraAttributes)
        .map(([key, value]) => [cleanToken(key), cleanLongText(value)])
        .filter(([key, value]) => key && value));
    }
    return result;
  }

  function jingleHistoryXml(event) {
    const normalized = normalizeJingleHistoryEvent(event);
    const attrs = jingleHistoryAttributes(normalized)
      .map(([name, value]) => `${name}="${escapeXml(value)}"`)
      .join(" ");
    const children = metadataChildrenXml(normalized);
    return `<jingle-history xmlns="${NS_JINGLE_HISTORY}" ${attrs}>${children}</jingle-history>`;
  }

  function jingleHistoryAttributes(event) {
    const attrs = [
      ["sid", event.sid],
      ["direction", event.direction],
      ["disposition", event.disposition],
      ["media", event.media.join(" ")]
    ];
    pushAttr(attrs, "profile", event.profile);
    pushAttr(attrs, "started", event.started);
    pushAttr(attrs, "ended", event.ended);
    pushAttr(attrs, "duration", typeof event.duration === "number" ? String(event.duration) : "");
    pushAttr(attrs, "recording", event.recording);
    pushAttr(attrs, "transcript", event.transcript);
    pushAttr(attrs, "room-jid", event.roomJid);
    pushAttr(attrs, "peer-jid", event.peerJid);
    pushAttr(attrs, "participants", Array.isArray(event.participantJids) ? event.participantJids.join(" ") : "");
    pushAttr(attrs, "encrypted", typeof event.encrypted === "boolean" ? String(event.encrypted) : "");
    pushAttr(attrs, "consent", event.consent);
    pushAttr(attrs, "retention", event.retention);
    pushAttr(attrs, "emergency", typeof event.emergency === "boolean" ? String(event.emergency) : "");
    pushAttr(attrs, "emergency-service", event.emergencyService);
    return attrs;
  }

  function applyJingleHistoryAttributes(element, event) {
    for (const [name, value] of jingleHistoryAttributes(event)) {
      element.setAttribute(name, value);
    }
  }

  function appendMetadataChildren(element, event) {
    if (event.recording && event.recording !== "none") {
      const recording = element.ownerDocument.createElementNS(NS_JINGLE_HISTORY_RECORDING, "recording");
      recording.setAttribute("storage", event.recording);
      if (typeof event.encrypted === "boolean") recording.setAttribute("encrypted", String(event.encrypted));
      if (event.retention) recording.setAttribute("retention", event.retention);
      if (event.consent) recording.setAttribute("consent", event.consent);
      element.appendChild(recording);
    }
    if (event.transcript && event.transcript !== "none") {
      const transcript = element.ownerDocument.createElementNS(NS_JINGLE_HISTORY_TRANSCRIPT, "transcript");
      transcript.setAttribute("available", "true");
      transcript.setAttribute("storage", event.transcript);
      if (typeof event.encrypted === "boolean") transcript.setAttribute("encrypted", String(event.encrypted));
      element.appendChild(transcript);
    }
  }

  function metadataChildrenXml(event) {
    let xml = "";
    if (event.recording && event.recording !== "none") {
      xml += `<recording xmlns="${NS_JINGLE_HISTORY_RECORDING}" storage="${escapeXml(event.recording)}"${event.encrypted !== undefined ? ` encrypted="${event.encrypted ? "true" : "false"}"` : ""}${event.retention ? ` retention="${escapeXml(event.retention)}"` : ""}${event.consent ? ` consent="${escapeXml(event.consent)}"` : ""}/>`;
    }
    if (event.transcript && event.transcript !== "none") {
      xml += `<transcript xmlns="${NS_JINGLE_HISTORY_TRANSCRIPT}" available="true" storage="${escapeXml(event.transcript)}"${event.encrypted !== undefined ? ` encrypted="${event.encrypted ? "true" : "false"}"` : ""}/>`;
    }
    return xml;
  }

  function parseMetadataChildren(element, event) {
    const recording = element.getElementsByTagNameNS?.(NS_JINGLE_HISTORY_RECORDING, "recording")?.[0];
    if (recording) {
      const storage = normalizeEnum(safeAttribute(recording, "storage"), storageStates);
      if (storage) event.recording = storage;
      if (safeAttribute(recording, "encrypted")) event.encrypted = parseBoolean(safeAttribute(recording, "encrypted"));
      if (safeAttribute(recording, "retention")) event.retention = safeAttribute(recording, "retention");
      const consent = normalizeEnum(safeAttribute(recording, "consent"), consentStates);
      if (consent) event.consent = consent;
    }
    const transcript = element.getElementsByTagNameNS?.(NS_JINGLE_HISTORY_TRANSCRIPT, "transcript")?.[0];
    if (transcript) {
      const storage = normalizeEnum(safeAttribute(transcript, "storage"), storageStates);
      if (storage) event.transcript = storage;
      if (safeAttribute(transcript, "encrypted")) event.encrypted = parseBoolean(safeAttribute(transcript, "encrypted"));
    }
  }

  function normalizeFileReference(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const type = normalizeEnum(value.type, new Set(["recording", "transcript", "thumbnail", "attachment"]));
    if (!type) {
      return null;
    }
    const result = { type };
    copyOptional(result, "mediaType", cleanToken(value.mediaType));
    copyOptional(result, "url", cleanLongText(value.url));
    copyOptional(result, "hash", cleanLongText(value.hash));
    copyOptional(result, "size", normalizeDuration(value.size));
    if (typeof value.encrypted === "boolean") result.encrypted = value.encrypted;
    return result;
  }

  function inferProfile(media) {
    if (media.includes("video") && media.includes("rtt")) return "total-conversation";
    if (media.includes("video")) return "video";
    return "audio";
  }

  function calculateDuration(started, ended) {
    const start = normalizeIsoTimestamp(started);
    const end = normalizeIsoTimestamp(ended);
    if (!start || !end) {
      return undefined;
    }
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  }

  function normalizeMediaList(value) {
    const items = Array.isArray(value) ? value : splitList(value);
    const seen = new Set();
    return items
      .map((item) => cleanToken(item).toLowerCase())
      .filter((item) => item && item.length <= 64)
      .filter((item) => mediaTypes.has(item) || /^[a-z][a-z0-9-]{0,63}$/.test(item))
      .filter((item) => {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function splitList(value) {
    return String(value || "").split(/\s+/).map((item) => item.trim()).filter(Boolean);
  }

  function normalizeEnum(value, allowed) {
    const normalized = cleanToken(value).toLowerCase();
    return allowed.has(normalized) ? normalized : "";
  }

  function normalizeDuration(value) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : undefined;
  }

  function normalizeIsoTimestamp(value) {
    const text = cleanLongText(value);
    if (!text) {
      return "";
    }
    const date = new Date(text);
    return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
  }

  function parseBoolean(value) {
    return ["true", "1", "yes"].includes(String(value || "").toLowerCase());
  }

  function safeAttribute(element, name) {
    try {
      return cleanLongText(element.getAttribute(name) || "");
    } catch {
      return "";
    }
  }

  function unknownAttributes(element, knownNames) {
    const known = new Set(knownNames);
    const result = {};
    for (const attr of Array.from(element.attributes || [])) {
      if (!known.has(attr.name)) {
        result[attr.name] = cleanLongText(attr.value);
      }
    }
    return result;
  }

  function pushAttr(attrs, name, value) {
    if (value !== undefined && value !== null && String(value) !== "") {
      attrs.push([name, String(value)]);
    }
  }

  function copyOptional(target, key, value) {
    if (value !== undefined && value !== null && value !== "") {
      target[key] = value;
    }
  }

  function cleanToken(value) {
    return String(value ?? "").trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 150);
  }

  function cleanLongText(value) {
    return String(value ?? "").trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, 2048);
  }

  function createMessageId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  return {
    NS_JINGLE_HISTORY,
    NS_JINGLE_HISTORY_RECORDING,
    NS_JINGLE_HISTORY_TRANSCRIPT,
    FEATURE_JINGLE_HISTORY,
    serializeJingleHistory,
    parseJingleHistory,
    buildJingleHistoryMessage,
    renderJingleHistorySummary,
    formatCallDuration,
    createMissedCallEvent,
    createCompletedCallEvent,
    createJingleHistorySyncPayload,
    storeLocalJingleHistoryEvent,
    loadLocalJingleHistoryEvents,
    normalizeJingleHistoryEvent,
    jingleHistoryXml
  };
}));
