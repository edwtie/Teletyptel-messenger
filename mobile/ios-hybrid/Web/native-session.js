(function (root) {
  "use strict";

  const phases = new Set(["idle", "checking", "authenticating", "awaitingSecondFactor", "connecting", "connected", "failed", "signedOut", "suspended"]);
  const errors = new Set(["certificate", "timeout", "configuration", "offline", "serverResponse", "invalidCredentials", "secondFactorRequired", "accountRejected", "connectionLost", "invalidSecondFactor"]);
  const failures = new Set(["invalidRequest", "untrustedDocument", "replayedRequest", "sessionBusy", "invalidState", "unavailable"]);
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  function secureID(cryptoValue) {
    if (typeof cryptoValue?.randomUUID === "function") return cryptoValue.randomUUID();
    if (typeof cryptoValue?.getRandomValues !== "function") throw new Error("nativeUnavailable");
    const bytes = cryptoValue.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  }

  function safeState(value) {
    const keys = ["version", "sequence", "epoch", "phase", "errorCode", "chatAvailable", "callsAvailable", "socialLoginAvailable", "settingsAvailable", "roster", "conversation", "call", "groups", "groupsAvailable", "groupNotice", "extras", "account", "history", "groupAdministration"];
    if (!value || typeof value !== "object" || Array.isArray(value)
        || Object.keys(value).some(key => !keys.includes(key)) || value.version !== 1
        || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !phases.has(value.phase)
        || (value.epoch !== undefined && (typeof value.epoch !== "string" || !uuidPattern.test(value.epoch)))
        || (value.errorCode != null && !errors.has(value.errorCode))
        || (value.phase === "failed" && (value.errorCode == null || value.errorCode === "invalidSecondFactor"))
        || (value.phase !== "failed" && value.errorCode != null
          && !(value.phase === "awaitingSecondFactor" && value.errorCode === "invalidSecondFactor"))
        || typeof value.chatAvailable !== "boolean" || typeof value.callsAvailable !== "boolean" || typeof value.socialLoginAvailable !== "boolean"
        || (value.phase !== "connected" && (value.chatAvailable || value.callsAvailable))
        || (value.settingsAvailable !== undefined && typeof value.settingsAvailable !== "boolean")) {
      throw new Error("invalidNativeReply");
    }
    const roster = safeRoster(value.roster, value.phase);
    const account = safeAccount(value.account, roster, value.phase);
    if (value.socialLoginAvailable !== (account.providers.length > 0)) throw new Error("invalidNativeReply");
    const groups = safeGroups(value.groups ?? []);
    const extras = safeExtras(value.extras);
    if ((value.groupsAvailable !== undefined && typeof value.groupsAvailable !== "boolean") || !safeText(value.groupNotice ?? "")
        || (value.phase !== "connected" && (groups.length || value.groupsAvailable || extras.ready || extras.attachmentAvailable))) throw new Error("invalidNativeReply");
    const call = safeCall(value.call);
    const conversation = safeConversation(value.conversation, roster, groups);
    if ((value.phase !== "connected" && (conversation || call.phase !== "idle"))
        || (!value.chatAvailable && conversation) || (!value.callsAvailable && !["idle", "failed"].includes(call.phase))) throw new Error("invalidNativeReply");
    return Object.freeze({ version: 1, sequence: value.sequence, epoch: value.epoch ?? null, phase: value.phase, errorCode: value.errorCode ?? null,
      chatAvailable: value.chatAvailable, callsAvailable: value.callsAvailable, socialLoginAvailable: value.socialLoginAvailable,
      settingsAvailable: value.settingsAvailable === true, roster, conversation, call, groups,
      groupsAvailable: value.groupsAvailable === true, groupNotice: value.groupNotice ?? null, extras, account, history: safeHistory(value.history, value.phase),
      groupAdministration: safeAdministration(value.groupAdministration, conversation, groups) });
  }

  function safeAdministration(value, conversation, groups) {
    if (value == null) return null;
    const fields = ["room", "busy", "canConfigure", "canManageMembers", "configuration", "affiliation", "members"];
    if (!value || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)) || typeof value.room !== "string" || value.room !== conversation?.peer || conversation?.kind !== "group"
        || !groups.some(group => group.room === value.room && group.joined)
        || ["busy", "canConfigure", "canManageMembers"].some(key => typeof value[key] !== "boolean")
        || (value.canConfigure && !value.canManageMembers) || (value.affiliation != null && (!["member", "admin", "outcast"].includes(value.affiliation) || !value.canManageMembers))
        || !Array.isArray(value.members) || value.members.length > 128 || (value.members.length && (!value.affiliation || value.busy))
        || value.members.some(peer => typeof peer !== "string" || !peer || peer.length > 1023 || /[\s/\u0000-\u001f]/u.test(peer))) throw new Error("invalidNativeReply");
    if (value.configuration != null) {
      const form = value.configuration; const booleans = ["membersOnly", "moderated", "publicRoom", "persistent", "allowInvites"];
      const editable = ["name", "description", ...booleans];
      if (!value.canConfigure || value.busy || !form || Object.keys(form).sort().join(",") !== ["token", "editableFields", ...editable].sort().join(",")
          || !uuidPattern.test(form.token) || !safeText(form.name, 120) || !safeText(form.description, 1024)
          || booleans.some(key => typeof form[key] !== "boolean") || !Array.isArray(form.editableFields) || form.editableFields.length > 7
          || new Set(form.editableFields).size !== form.editableFields.length || form.editableFields.some(key => !editable.includes(key))) throw new Error("invalidNativeReply");
    }
    return Object.freeze({ ...value, members: Object.freeze([...value.members]), configuration: value.configuration == null ? null
      : Object.freeze({ ...value.configuration, editableFields: Object.freeze([...value.configuration.editableFields]) }) });
  }

  function safeHistory(value, phase) {
    const empty = { available: false, query: "", archivedOnly: false, entries: [], archived: [], window: null, notice: null };
    if (value === undefined) value = empty;
    if (!value || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(empty, key))) throw new Error("invalidNativeReply");
    const result = { ...empty, ...value };
    const peer = value => typeof value === "string" && value.length > 0 && value.length <= 1023 && !/[\s/\u0000-\u001f\u007f-\u009f]/u.test(value);
    const time = value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e12;
    const kind = value => ["direct", "group"].includes(value);
    const keys = (value, required, optional = []) => value && typeof value === "object" && !Array.isArray(value)
      && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
    if (typeof result.available !== "boolean" || typeof result.archivedOnly !== "boolean" || !safeText(result.query, 256)
        || !Array.isArray(result.entries) || result.entries.length > 200 || !Array.isArray(result.archived) || result.archived.length > 512
        || (result.notice !== null && !safeText(result.notice))
        || ((!result.available || phase !== "connected") && (result.available || result.entries.length || result.archived.length || result.window))) throw new Error("invalidNativeReply");
    const ids = new Set();
    result.entries = result.entries.map(entry => {
      if (!keys(entry, ["id", "peer", "kind", "name", "preview", "archived"], ["timestamp"]) || !uuidPattern.test(entry.id) || ids.has(entry.id)
          || !peer(entry.peer) || !kind(entry.kind) || !safeText(entry.name, 240) || !safeText(entry.preview, 512)
          || typeof entry.archived !== "boolean" || (entry.timestamp != null && !time(entry.timestamp))) throw new Error("invalidNativeReply");
      ids.add(entry.id); return Object.freeze({ ...entry });
    });
    result.archived = result.archived.map(entry => {
      if (!keys(entry, ["peer", "kind"]) || !peer(entry.peer) || !kind(entry.kind)) throw new Error("invalidNativeReply");
      return Object.freeze({ ...entry });
    });
    if (result.window !== null) {
      const window = result.window; const messageIDs = new Set();
      if (!keys(window, ["id", "title", "messages", "loading", "hasEarlier", "canChat"], ["notice"]) || !uuidPattern.test(window.id) || !safeText(window.title, 240)
          || ["loading", "hasEarlier", "canChat"].some(key => typeof window[key] !== "boolean") || (window.notice != null && !safeText(window.notice))
          || !Array.isArray(window.messages) || window.messages.length > 200) throw new Error("invalidNativeReply");
      const messages = window.messages.map(message => {
        if (!keys(message, ["id", "body", "outgoing", "timestamp"], ["sender"]) || !uuidPattern.test(message.id) || messageIDs.has(message.id)
            || !safeText(message.body) || typeof message.outgoing !== "boolean" || !time(message.timestamp) || (message.sender != null && !safeText(message.sender, 128))) throw new Error("invalidNativeReply");
        messageIDs.add(message.id); return Object.freeze({ ...message });
      });
      result.window = Object.freeze({ ...window, messages: Object.freeze(messages) });
    }
    return Object.freeze({ ...result, entries: Object.freeze(result.entries), archived: Object.freeze(result.archived) });
  }

  function safeAccount(value, roster, phase) {
    const empty = { providers: [], entryAvailable: false, registrationAvailable: false, rememberAvailable: false, savedLogin: false,
      busy: false, contactsAvailable: false, nativePanels: false, sipContactsAvailable: false, sipContacts: [], presentation: false, blocked: [], doNotDisturb: false, owner: null, requests: [], profile: null, avatars: {}, notice: null };
    if (value === undefined) value = empty;
    const validJid = jid => typeof jid === "string" && jid.length > 0 && new TextEncoder().encode(jid).length <= 1023 && !/[\s/\u0000-\u001f\u007f-\u009f]/u.test(jid);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(empty, key))) throw new Error("invalidNativeReply");
    const result = { ...empty, ...value };
    if (["entryAvailable", "registrationAvailable", "rememberAvailable", "savedLogin", "busy", "contactsAvailable", "nativePanels", "sipContactsAvailable", "presentation", "doNotDisturb"].some(key => typeof result[key] !== "boolean")
        || !Array.isArray(result.providers) || result.providers.length > 2 || new Set(result.providers).size !== result.providers.length || result.providers.some(name => !["google", "facebook"].includes(name))
        || (result.owner !== null && !validJid(result.owner)) || !Array.isArray(result.requests) || result.requests.length > 32 || result.requests.some(jid => !validJid(jid))
        || (result.notice !== null && !safeText(result.notice)) || !result.avatars || typeof result.avatars !== "object" || Array.isArray(result.avatars)
        || !Array.isArray(result.blocked) || result.blocked.length > 100 || result.blocked.some(jid => !roster.contacts.some(contact => contact.jid === jid))
        || Object.keys(result.avatars).length > 101 || (phase !== "connected" && (result.owner || result.profile || result.contactsAvailable || result.requests.length || result.blocked.length || result.doNotDisturb || Object.keys(result.avatars).length))) throw new Error("invalidNativeReply");
    if (!Array.isArray(result.sipContacts) || result.sipContacts.length > 100
        || (result.sipContactsAvailable && phase !== "connected")
        || (result.sipContacts.length > 0 && !result.sipContactsAvailable)) throw new Error("invalidNativeReply");
    const sipIDs = new Set();
    const sipContacts = result.sipContacts.map(contact => {
      if (!contact || Object.keys(contact).sort().join(",") !== "destination,id,name"
          || typeof contact.id !== "string" || !uuidPattern.test(contact.id) || sipIDs.has(contact.id.toLowerCase())
          || !safeText(contact.name, 120) || !contact.name.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(contact.name)
          || !safeText(contact.destination, 254)
          || !/^(?:\+?[0-9]{2,20}|[A-Za-z0-9._+%-]{1,128}@[A-Za-z0-9.-]+)$/.test(contact.destination)) throw new Error("invalidNativeReply");
      sipIDs.add(contact.id.toLowerCase());
      return Object.freeze({ ...contact });
    });
    if (result.profile !== null) {
      const profile = result.profile;
      if (!profile || typeof profile !== "object" || Object.keys(profile).sort().join(",") !== "color,jid,language,name,phone" || profile.jid !== result.owner
          || !safeText(profile.name, 120) || !safeText(profile.phone, 64) || !["nl", "en", "de", "fr", "es", "it", "pt", "pl", "tr", "ar", "uk", "zh-CN"].includes(profile.language)
          || typeof profile.color !== "string" || !/^#[a-f0-9]{6}$/i.test(profile.color)) throw new Error("invalidNativeReply");
      result.profile = Object.freeze({ ...profile });
    }
    let bytes = 0;
    for (const [jid, image] of Object.entries(result.avatars)) {
      if (!(jid === result.owner || roster.contacts.some(contact => contact.jid === jid)) || typeof image !== "string" || image.length > 32768
          || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image) || (bytes += image.length) > 786432) throw new Error("invalidNativeReply");
    }
    return Object.freeze({ ...result, providers: Object.freeze([...result.providers]), requests: Object.freeze([...result.requests]), blocked: Object.freeze([...result.blocked]), avatars: Object.freeze({ ...result.avatars }), sipContacts: Object.freeze(sipContacts) });
  }

  function safeRoster(value, phase) {
    if (value === undefined) return Object.freeze({ status: "hidden", contacts: Object.freeze([]) });
    if (!value || typeof value !== "object" || Array.isArray(value)
        || Object.keys(value).sort().join(",") !== "contacts,status"
        || !["hidden", "loading", "ready", "unavailable"].includes(value.status)
        || !Array.isArray(value.contacts) || value.contacts.length > 100
        || (value.status !== "ready" && value.contacts.length !== 0)
        || (phase !== "connected" && value.status !== "hidden")) throw new Error("invalidNativeReply");
    const identifiers = new Set();
    const contacts = value.contacts.map(contact => {
      if (!contact || typeof contact !== "object" || Array.isArray(contact)
          || Object.keys(contact).some(key => !["jid", "name", "presence", "canCall"].includes(key))
          || typeof contact.jid !== "string" || !contact.jid || new TextEncoder().encode(contact.jid).length > 1023
          || /[\s\u0000-\u001f\u007f-\u009f/]/u.test(contact.jid) || identifiers.has(contact.jid)
          || typeof contact.name !== "string" || !contact.name || new TextEncoder().encode(contact.name).length > 4096
          || /[\u0000-\u001f\u007f-\u009f]/u.test(contact.name)
          || (contact.canCall !== undefined && typeof contact.canCall !== "boolean")
          || !["unknown", "offline", "online", "away", "extendedAway", "busy"].includes(contact.presence)) throw new Error("invalidNativeReply");
      identifiers.add(contact.jid);
      return Object.freeze({ jid: contact.jid, name: contact.name, presence: contact.presence, canCall: contact.canCall === true });
    });
    return Object.freeze({ status: value.status, contacts: Object.freeze(contacts) });
  }

  function safeText(value, maximumBytes = 8192) {
    return typeof value === "string" && new TextEncoder().encode(value).length <= maximumBytes
      && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(value);
  }

  function safeRttText(value) {
    return safeText(value, 131072) && Array.from(value).length <= 32768;
  }

  function safeGroups(value) {
    if (!Array.isArray(value) || value.length > 8) throw new Error("invalidNativeReply");
    const rooms = new Set();
    return Object.freeze(value.map(group => {
      const fields = ["room", "name", "joined", "joining", "canSpeak", "subject", "participants", "canModerate"];
      if (!group || Object.keys(group).sort().join(",") !== fields.sort().join(",") || typeof group.room !== "string"
          || !group.room || group.room.length > 1023 || /[\s/\u0000-\u001f]/u.test(group.room) || rooms.has(group.room)
          || !safeText(group.name) || !safeText(group.subject) || !Array.isArray(group.participants) || group.participants.length > 200
          || group.participants.some(name => !safeText(name) || new TextEncoder().encode(name).length > 128)
          || ["joined", "joining", "canSpeak", "canModerate"].some(key => typeof group[key] !== "boolean")) throw new Error("invalidNativeReply");
      rooms.add(group.room);
      return Object.freeze({ ...group, participants: Object.freeze([...group.participants]) });
    }));
  }

  function safeExtras(value) {
    const empty = { ready: false, available: false, mode: "off", language: "nl", consent: false, liveConsent: false, ownLiveConsent: false,
      busy: false, attachmentAvailable: false, fileMessages: [], translations: {}, ownRtt: null, remoteRtt: null, notice: null };
    if (value === undefined) value = empty;
    if (!value || Object.keys(value).some(key => !Object.hasOwn(empty, key))) throw new Error("invalidNativeReply");
    const result = { ...empty, ...value };
    if (["ready", "available", "consent", "liveConsent", "ownLiveConsent", "busy", "attachmentAvailable"].some(key => typeof result[key] !== "boolean")
        || !["off", "manual", "automatic"].includes(result.mode)
        || !["nl", "en", "de", "fr", "es", "it", "pt", "pl", "tr", "ar", "uk", "zh-CN"].includes(result.language)
        || !Array.isArray(result.fileMessages) || result.fileMessages.length > 100 || result.fileMessages.some(id => typeof id !== "string" || !uuidPattern.test(id))
        || !result.translations || typeof result.translations !== "object" || Array.isArray(result.translations) || Object.keys(result.translations).length > 100
        || Object.entries(result.translations).some(([id, text]) => !uuidPattern.test(id) || !safeText(text, 65536))
        || [result.ownRtt, result.remoteRtt, result.notice].some(text => text !== null && !safeText(text, 65536))
        || ((result.mode === "off" || !result.consent || !result.ready || !result.available) && (Object.keys(result.translations).length || result.ownRtt || result.remoteRtt))
        || (!result.liveConsent && result.remoteRtt) || (!result.ownLiveConsent && result.ownRtt)) throw new Error("invalidNativeReply");
    return Object.freeze({ ...result, translations: Object.freeze({ ...result.translations }), fileMessages: Object.freeze([...result.fileMessages]) });
  }

  function safeConversation(value, roster, groups = []) {
    if (value == null) return null;
    const keys = ["peer", "draft", "messages", "history", "canSend", "canChange", "kind"];
    const kind = value.kind ?? "direct";
    if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))
        || !["direct", "group"].includes(kind) || !(kind === "group" ? groups.some(group => group.room === value.peer) : roster.contacts.some(contact => contact.jid === value.peer)) || !safeText(value.draft)
        || !Array.isArray(value.messages) || value.messages.length > 100 || typeof value.canSend !== "boolean" || typeof value.canChange !== "boolean"
        || !["idle", "loading", "ready", "unavailable", "failed"].includes(value.history)) throw new Error("invalidNativeReply");
    const identifiers = new Set();
    const messages = value.messages.map(message => {
      const fields = ["id", "body", "outgoing", "timestamp", "state", "delivery", "edited", "retracted", "reactions"];
      if (!message || typeof message !== "object" || Object.keys(message).some(key => ![...fields, "sender", "canRetract", "canReact", "canEdit"].includes(key))
          || (message.sender !== undefined && message.sender !== null && !safeText(message.sender))
          || ["canRetract", "canReact", "canEdit"].some(key => message[key] !== undefined && typeof message[key] !== "boolean")
          || !uuidPattern.test(message.id) || identifiers.has(message.id) || !safeText(message.body)
          || typeof message.outgoing !== "boolean" || !Number.isFinite(message.timestamp) || Math.abs(message.timestamp) > 8640000000000
          || !["incoming", "sending", "submitted", "uncertain", "rejected"].includes(message.state)
          || !["unconfirmed", "delivered", "displayed"].includes(message.delivery)
          || typeof message.edited !== "boolean" || typeof message.retracted !== "boolean"
          || !Array.isArray(message.reactions) || message.reactions.length > 16
          || (message.outgoing === (message.state === "incoming"))) throw new Error("invalidNativeReply");
      identifiers.add(message.id);
      const reactions = message.reactions.map(reaction => {
        if (!reaction || Object.keys(reaction).sort().join(",") !== "count,emoji" || typeof reaction.emoji !== "string"
            || !safeText(reaction.emoji) || new TextEncoder().encode(reaction.emoji).length > 32
            || !Number.isSafeInteger(reaction.count) || reaction.count < 1 || reaction.count > 10000) throw new Error("invalidNativeReply");
        return Object.freeze({ emoji: reaction.emoji, count: reaction.count });
      });
      return Object.freeze({ ...message, reactions: Object.freeze(reactions), canEdit: message.canEdit ?? (value.canChange && message.outgoing && !message.retracted), canRetract: message.canRetract ?? (value.canChange && message.outgoing && !message.retracted),
        canReact: message.canReact ?? (value.canSend && !message.retracted) });
    });
    return Object.freeze({ peer: value.peer, kind, draft: value.draft, history: value.history,
      canSend: value.canSend, canChange: value.canChange, messages: Object.freeze(messages) });
  }

  function safeCall(value) {
    const empty = { phase: "idle", id: null, peer: null, mode: null, muted: false, cameraEnabled: false, remoteCamera: "unknown",
      rttReady: false, canSwitchCamera: false, canSendDtmf: false, ownText: "", remoteText: "", videoFit: "contain",
      interpreter: "unavailable", interpreterVideo: false, interpreterText: "" };
    if (value === undefined) return Object.freeze(empty);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(empty, key))) throw new Error("invalidNativeReply");
    const result = { ...empty, ...value };
    if (!["unavailable", "available", "consent", "waiting", "connected"].includes(result.interpreter)
        || (result.phase !== "active" && result.interpreter !== "unavailable")
        || typeof result.interpreterVideo !== "boolean" || !safeRttText(result.interpreterText)
        || (result.interpreter !== "connected" && (result.interpreterVideo || result.interpreterText))) throw new Error("invalidNativeReply");
    if (!["idle", "calling", "ringing", "active", "failed"].includes(result.phase)
        || ["muted", "cameraEnabled", "rttReady", "canSwitchCamera", "canSendDtmf"].some(key => typeof result[key] !== "boolean")
        || !["unknown", "on", "off"].includes(result.remoteCamera) || !["contain", "cover"].includes(result.videoFit)
        || !safeRttText(result.ownText) || !safeRttText(result.remoteText)) throw new Error("invalidNativeReply");
    if (["idle", "failed"].includes(result.phase)) {
      if (result.id || result.peer || result.mode || result.ownText || result.remoteText) throw new Error("invalidNativeReply");
    } else if (!uuidPattern.test(result.id || "") || typeof result.peer !== "string" || !result.peer
        || new TextEncoder().encode(result.peer).length > 1023 || /[\s/\u0000-\u001f]/u.test(result.peer)
        || !["audio", "video", "audio-rtt", "total"].includes(result.mode)) throw new Error("invalidNativeReply");
    return Object.freeze(result);
  }

  function createClient(options) {
    const { postMessage, makeID, setTimer = setTimeout, clearTimer = clearTimeout, timeout = 10000 } = options;
    let latest = null;
    let disposed = false;
    let pendingCount = 0;
    const pending = new Set();
    const listeners = new Set();

    function receive(value) {
      if (disposed) return;
      const state = safeState(value);
      if (latest && state.sequence <= latest.sequence) return;
      latest = state;
      for (const listener of listeners) {
        try { listener(state); } catch { }
      }
    }

    function request(command, argumentsValue = {}, expectedEpoch = latest?.epoch) {
      if (disposed) return Promise.reject(new Error("bridgeClosed"));
      if (pendingCount >= 8) return Promise.reject(new Error("bridgeBusy"));
      const id = makeID();
      if (!uuidPattern.test(id)) return Promise.reject(new Error("invalidRequest"));
      const scoped = ["session.cancel", "session.logout", "session.verifySecondFactor"].includes(command) || ["chat.", "calls.", "groups.", "files.", "translation.", "auth.", "account.", "contacts.", "history."].some(prefix => command.startsWith(prefix));
      if (scoped && (!expectedEpoch || expectedEpoch !== latest?.epoch)) return Promise.reject(new Error("invalidState"));
      const body = JSON.stringify({ version: 1, id, command, arguments: argumentsValue, ...(scoped ? { epoch: expectedEpoch } : {}) });
      if (new TextEncoder().encode(body).length > 262144) return Promise.reject(new Error("invalidRequest"));
      pendingCount += 1;
      return new Promise((resolve, reject) => {
        let finished = false;
        let timer;
        const finish = (error, result) => {
          if (finished) return;
          finished = true;
          pendingCount -= 1;
          pending.delete(cancel);
          clearTimer(timer);
          if (error) reject(error); else resolve(result);
        };
        const cancel = () => finish(new Error("bridgeClosed"));
        pending.add(cancel);
        timer = setTimer(() => finish(new Error("bridgeTimeout")), timeout);
        Promise.resolve().then(() => postMessage(body)).then(reply => {
          if (finished || disposed) return;
          try {
            if (!reply || typeof reply !== "object" || Array.isArray(reply)
                || Object.keys(reply).sort().join(",") !== "id,snapshot,version"
                || reply.version !== 1 || typeof reply.id !== "string" || reply.id.toLowerCase() !== id.toLowerCase()) {
              throw new Error("invalidNativeReply");
            }
            receive(reply.snapshot);
            finish(null, latest);
          } catch { finish(new Error("invalidNativeReply")); }
        }, error => {
          const message = typeof error === "string" ? error : error?.message;
          finish(new Error(failures.has(message) ? message : "nativeUnavailable"));
        });
      });
    }

    return Object.freeze({
      snapshot: () => request("session.snapshot"),
      login: (jid, password, remember = false) => {
        if (typeof jid !== "string" || typeof password !== "string" || !jid || !password
            || new TextEncoder().encode(jid).length > 1023 || new TextEncoder().encode(password).length > 1024
            || /[\u0000-\u001f\u007f]/.test(jid) || password.includes("\u0000")) {
          return Promise.reject(new Error("invalidRequest"));
        }
        if (typeof remember !== "boolean") return Promise.reject(new Error("invalidRequest"));
        return request("session.login", { jid, password, ...(remember ? { remember: "true" } : {}) });
      },
      accountCommand: (name, args = {}, epoch) => request(name, Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])), epoch),
      historyCommand: (action, args = {}, epoch) => request("history." + action, Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])), epoch),
      verifySecondFactor: code => typeof code === "string" && /^[0-9]{6}$/.test(code)
        ? request("session.verifySecondFactor", { code }) : Promise.reject(new Error("invalidRequest")),
      cancel: () => request("session.cancel"),
      logout: () => request("session.logout"),
      openSettings: () => request("app.openSettings"),
      openChat: (peer, epoch, kind = "direct") => request("chat.open", { peer, kind }, epoch),
      closeChat: epoch => request("chat.close", {}, epoch),
      setDraft: (peer, body, epoch, kind = latest?.conversation?.kind ?? "direct") => safeText(body) ? request("chat.draft", { peer, body, kind }, epoch) : Promise.reject(new Error("invalidRequest")),
      sendMessage: (peer, body, epoch, kind = latest?.conversation?.kind ?? "direct") => safeText(body) && body.trim() ? request("chat.send", { peer, body, kind }, epoch) : Promise.reject(new Error("invalidRequest")),
      displayed: (peer, ids) => request("chat.displayed", { peer, ids: ids.join(","), kind: latest?.conversation?.kind ?? "direct" }),
      editMessage: (peer, id, body) => request("chat.edit", { peer, id, body, kind: latest?.conversation?.kind ?? "direct" }),
      hideMessage: (peer, id) => request("chat.hide", { peer, id, kind: latest?.conversation?.kind ?? "direct" }),
      retractMessage: (peer, id) => request("chat.retract", { peer, id, kind: latest?.conversation?.kind ?? "direct" }),
      forwardMessage: (peer, id, target) => request("chat.forward", { peer, id, target, kind: latest?.conversation?.kind ?? "direct" }),
      reactMessage: (peer, id, emoji) => request("chat.react", { peer, id, emoji, kind: latest?.conversation?.kind ?? "direct" }),
      joinGroup: (room, nickname, create) => request("groups.join", { room, nickname, create: String(create) }),
      groupAction: (action, argumentsValue) => request("groups." + action, argumentsValue),
      pickAttachment: epoch => request("files.pick", {}, epoch),
      openAttachment: id => request("files.open", { id }),
      translateMessage: id => request("translation.message", { id }),
      disableTranslation: () => request("translation.disable"),
      translationSettings: settings => request("translation.settings", Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)]))),
      startCall: (peer, mode, epoch) => request("calls.start", { peer, mode }, epoch),
      startGroupCall: (room, epoch) => request("groups.call", { room }, epoch),
      resetCallFailure: () => request("calls.reset"),
      controlCall: (id, action, value) => action === "rtt" && !safeRttText(value) ? Promise.reject(new Error("invalidRequest"))
        : request("calls.control", { id, action, ...(value === undefined ? {} : { value }) }),
      placeVideo: (id, frame) => request("calls.layout", { id, ...Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, String(value)])) }),
      receive,
      subscribe: listener => {
        if (disposed || typeof listener !== "function") throw new Error("bridgeClosed");
        listeners.add(listener);
        if (latest) listener(latest);
        return () => listeners.delete(listener);
      },
      dispose: () => {
        disposed = true;
        for (const cancel of [...pending]) cancel();
        listeners.clear();
        latest = null;
      }
    });
  }

  function install(windowValue) {
    if (windowValue.top !== windowValue || windowValue.location.href !== "capacitor://localhost/chat.html"
        || typeof windowValue.webkit?.messageHandlers?.teletyptelNative?.postMessage !== "function") {
      throw new Error("untrustedDocument");
    }
    if (windowValue.TeleTypTelNativeSession) throw new Error("bridgeAlreadyInstalled");
    const blocked = function () { throw new Error("nativeEngineRequired"); };
    for (const name of ["WebSocket", "RTCPeerConnection", "webkitRTCPeerConnection", "XMLHttpRequest", "EventSource"]) {
      Object.defineProperty(windowValue, name, { value: blocked, writable: false, configurable: false });
    }
    const originalFetch = windowValue.fetch?.bind(windowValue);
    Object.defineProperty(windowValue, "fetch", { writable: false, configurable: false, value: function (input, options) {
      const address = new URL(typeof input === "string" ? input : input?.url, windowValue.location.href);
      if (!originalFetch || address.protocol !== "capacitor:" || address.hostname !== "localhost" || address.port
          || address.username || address.password || address.search || address.hash
          || !/^(?:\/lang\/[a-z]+\.lng|\/(?:assets\/(?:brand|backgrounds|icons)|smileys)\/[a-zA-Z0-9_@./-]+\.(?:png|svg|gif|jpg|webp))$/.test(address.pathname)
          || (options?.method && options.method.toUpperCase() !== "GET")
          || (typeof input !== "string" && input?.method && input.method.toUpperCase() !== "GET")) {
        return Promise.reject(new Error("nativeEngineRequired"));
      }
      return originalFetch(input, { ...options, redirect: "error", credentials: "omit" });
    } });
    if (windowValue.navigator.mediaDevices) {
      for (const name of ["getUserMedia", "getDisplayMedia"]) {
        Object.defineProperty(windowValue.navigator.mediaDevices, name, { value: blocked, writable: false, configurable: false });
      }
    }
    for (const name of ["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia", "sendBeacon"]) {
      Object.defineProperty(windowValue.navigator, name, { value: blocked, writable: false, configurable: false });
    }
    const handler = windowValue.webkit.messageHandlers.teletyptelNative;
    const client = createClient({ postMessage: body => handler.postMessage(body), makeID: () => secureID(windowValue.crypto) });
    const receive = event => { try { client.receive(event.detail); } catch { } };
    windowValue.addEventListener("teletyptel:native-state", receive);
    windowValue.addEventListener("pagehide", () => {
      windowValue.removeEventListener("teletyptel:native-state", receive);
      client.dispose();
    }, { once: true });
    Object.defineProperty(windowValue, "TeleTypTelNativeSession", { value: client, writable: false, configurable: false });
    return client;
  }

  if (typeof module === "object" && module.exports) module.exports = { createClient, safeState, install, secureID, safeRoster, safeCall, safeConversation, safeText, safeGroups, safeExtras, safeAccount, safeHistory, safeAdministration };
  else install(root);
})(typeof window === "undefined" ? globalThis : window);
