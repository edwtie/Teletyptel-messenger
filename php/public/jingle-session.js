(function (root) {
  "use strict";

  const NS = "urn:xmpp:jingle:1";
  const ERRORS = "urn:xmpp:jingle:errors:1";
  const STANZAS = "urn:ietf:params:xml:ns:xmpp-stanzas";
  const CLIENT = "jabber:client";
  const INFO = "urn:xmpp:jingle:apps:rtp:info:1";
  const DISCO = "http://jabber.org/protocol/disco#info";
  const actions = new Set(["session-initiate", "session-accept", "session-info", "transport-info", "session-terminate"]);
  const reasons = new Set(["success", "decline", "busy", "cancel", "timeout", "failed-application", "failed-transport",
    "incompatible-parameters", "unsupported-applications", "unsupported-transports", "security-error", "general-error"]);
  const children = (parent, name, namespace = NS) => Array.from(parent.children || [])
    .filter(child => child.localName === name && child.namespaceURI === namespace);
  const serialize = element => new XMLSerializer().serializeToString(element);
  const validId = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f]/.test(value);
  const fullJid = value => typeof value === "string" && value.length <= 1024 && /^[^\s/]+\/[^\s]+$/.test(value);
  const uniqueId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");

  function element(document, namespace, name, attributes = {}) {
    const result = document.createElementNS(namespace, name);
    for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
    return result;
  }

  function documentForIq(type, id, from, to) {
    const document = new DOMParser().parseFromString(`<iq xmlns="${CLIENT}"/>`, "application/xml");
    for (const [key, value] of Object.entries({ type, id, from, to })) document.documentElement.setAttribute(key, value);
    return document;
  }

  function contentKeys(jingle, descriptions = true) {
    const contents = children(jingle, "content");
    if (!contents.length || contents.length > 8) throw new Error("Invalid content count");
    const keys = new Map();
    for (const content of contents) {
      const name = content.getAttribute("name");
      const creator = content.getAttribute("creator");
      const key = `${creator}:${name}`;
      const senders = content.getAttribute("senders") || "both";
      if (!validId(name) || !["initiator", "responder"].includes(creator) || keys.has(key)
        || !["both", "initiator", "responder", "none"].includes(senders)) throw new Error("Invalid content identity");
      const descriptionsFound = Array.from(content.children).filter(child => child.localName === "description");
      const transports = Array.from(content.children).filter(child => child.localName === "transport");
      if ((descriptions && descriptionsFound.length !== 1) || (!descriptions && descriptionsFound.length)
        || transports.length !== 1 || !transports[0].namespaceURI
        || transports[0].namespaceURI === NS
        || (descriptions && (!descriptionsFound[0].namespaceURI || descriptionsFound[0].namespaceURI === NS))) {
        throw new Error("Invalid application or transport");
      }
      keys.set(key, { application: descriptionsFound[0]?.namespaceURI, transport: transports[0].namespaceURI });
    }
    return keys;
  }

  function create(options) {
    const pending = new Map();
    const replies = new Map();
    const terminated = new Map();
    const timeoutMs = options.timeoutMs ?? 15000;
    const features = Array.isArray(options.features) && options.features.length
      ? [...new Set([NS, ...options.features])] : [];
    let session = null;
    let boundJid = "";
    const notify = (event, detail = {}) => options.onEvent?.({ event, ...detail });
    const localJid = () => typeof options.localJid === "function" ? options.localJid() : options.localJid;
    const snapshot = () => session ? { sid: session.sid, peer: session.peer, role: session.role, state: session.state } : null;
    const publish = event => notify(event, { session: snapshot() });

    function end(current, reason, keepRequestId) {
      if (session !== current) return;
      session = null;
      terminated.set(`${current.peer}\n${current.sid}`, Date.now() + 30000);
      if (terminated.size > 32) terminated.delete(terminated.keys().next().value);
      for (const [id, request] of pending) {
        if (request.current !== current || id === keepRequestId) continue;
        clearTimeout(request.timer);
        pending.delete(id);
        request.reject(new Error(`Jingle session ended: ${reason}`));
      }
      notify("ended", { session: { sid: current.sid, peer: current.peer, state: "ended" }, reason });
    }

    function reset() {
      if (session) end(session, "disconnected");
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Jingle disconnected"));
      }
      pending.clear();
      replies.clear();
      terminated.clear();
      boundJid = "";
    }

    function address() {
      const current = localJid();
      if (!fullJid(current)) throw new Error("Jingle requires a bound full JID");
      if (boundJid && boundJid !== current) reset();
      boundJid = current;
      return current;
    }

    function transmit(xml) {
      if (options.send(xml) === false) throw new Error("Jingle transport unavailable");
    }

    function makeJingle(action, current, payload = []) {
      const id = `jingle-${uniqueId()}`;
      const document = documentForIq("set", id, address(), current.peer);
      const attributes = { action, sid: current.sid };
      if (action === "session-initiate") attributes.initiator = address();
      if (action === "session-accept") attributes.responder = address();
      const jingle = element(document, NS, "jingle", attributes);
      for (const child of payload) jingle.appendChild(document.importNode(child, true));
      document.documentElement.appendChild(jingle);
      if (serialize(document).length > 65536) throw new Error("Jingle stanza too large");
      return { id, document, jingle };
    }

    function request(stanza, current) {
      if (pending.size >= 32) return Promise.reject(new Error("Too many pending Jingle requests"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(stanza.id);
          end(current, "timeout");
          reject(new Error("Jingle IQ acknowledgement timed out"));
        }, timeoutMs);
        pending.set(stanza.id, { peer: current.peer, sid: current.sid, timer, resolve, reject, current });
        try { transmit(serialize(stanza.document)); }
        catch (error) {
          clearTimeout(timer);
          pending.delete(stanza.id);
          end(current, "failed-transport");
          reject(error);
        }
      });
    }

    function terminateSession(current, reason) {
      if (!reasons.has(reason)) throw new Error("Unsupported termination reason");
      const stanza = makeJingle("session-terminate", current);
      const reasonElement = element(stanza.document, NS, "reason");
      reasonElement.appendChild(element(stanza.document, NS, reason));
      stanza.jingle.appendChild(reasonElement);
      const response = request(stanza, current);
      end(current, reason, stanza.id);
      return response;
    }

    function terminate(reason = "success") {
      return session ? terminateSession(session, reason) : Promise.resolve();
    }

    function discover(peer) {
      if (!fullJid(peer)) throw new Error("Discovery requires a full peer JID");
      const id = `jingle-disco-${uniqueId()}`;
      const document = documentForIq("get", id, address(), peer);
      document.documentElement.appendChild(element(document, DISCO, "query"));
      return request({ id, document }, { peer, sid: "" }).then(iq => {
        const query = children(iq, "query", DISCO);
        if (query.length !== 1) throw new Error("Invalid discovery response");
        return new Set(children(query[0], "feature", DISCO).map(feature => feature.getAttribute("var")));
      });
    }

    function initiate(peer, payload, sid = uniqueId()) {
      address();
      if (session || !fullJid(peer) || peer === address() || !validId(sid)) throw new Error("Invalid or busy Jingle session");
      const current = { peer, sid, role: "initiator", state: "pending", acknowledged: false };
      const stanza = makeJingle("session-initiate", current, payload);
      current.contents = contentKeys(stanza.jingle);
      if (children(stanza.jingle, "content").some(content => content.getAttribute("creator") !== "initiator")) {
        throw new Error("Initial contents must belong to initiator");
      }
      session = current;
      publish("pending");
      return request(stanza, current).then(() => {
        if (session === current) current.acknowledged = true;
        return snapshot();
      });
    }

    function validateExisting(jingle, current, descriptions) {
      const keys = contentKeys(jingle, descriptions);
      if ([...keys].some(([key, type]) => !current.contents.has(key)
        || type.transport !== current.contents.get(key).transport
        || (descriptions && type.application !== current.contents.get(key).application))
        || (descriptions && keys.size !== current.contents.size)) throw new Error("Unnegotiated content");
      return keys;
    }

    function accept(payload) {
      if (!session || session.role !== "responder" || session.state !== "pending") throw new Error("Jingle accept out of order");
      const current = session;
      const stanza = makeJingle("session-accept", current, payload);
      validateExisting(stanza.jingle, current, true);
      current.state = "accepting";
      return request(stanza, current).then(() => {
        if (session === current) { current.state = "active"; publish("active"); }
        return snapshot();
      });
    }

    function transportInfo(payload) {
      if (!session) throw new Error("No Jingle session");
      const stanza = makeJingle("transport-info", session, payload);
      validateExisting(stanza.jingle, session, false);
      return request(stanza, session);
    }

    function reply(iq, condition = "", detail = "", cache = true) {
      const document = documentForIq(condition ? "error" : "result", iq.getAttribute("id"), address(), iq.getAttribute("from"));
      if (condition) {
        for (const child of children(iq, "jingle")) document.documentElement.appendChild(document.importNode(child, true));
        const error = element(document, CLIENT, "error", { type: condition === "bad-request" ? "modify" : "cancel" });
        error.appendChild(element(document, STANZAS, condition));
        if (detail) error.appendChild(element(document, ERRORS, detail));
        document.documentElement.appendChild(error);
      }
      const xml = serialize(document);
      if (cache) {
        replies.set(`${iq.getAttribute("from")}\n${iq.getAttribute("id")}`, { input: serialize(iq), xml });
        if (replies.size > 128) replies.delete(replies.keys().next().value);
      }
      transmit(xml);
    }

    function handleIq(iq) {
      if (iq.localName !== "iq" || iq.namespaceURI !== CLIENT) return false;
      const type = iq.getAttribute("type");
      const id = iq.getAttribute("id");
      const from = iq.getAttribute("from");
      const to = iq.getAttribute("to");
      const jingles = children(iq, "jingle");
      const discovery = children(iq, "query", DISCO);
      if (!jingles.length && !pending.has(id) && !(features.length && discovery.length)) return false;
      const own = address();
      if (to && to !== own && to !== own.split("/")[0]) return true;
      if (serialize(iq).length > 65536) return true;
      if (type === "result" || type === "error") {
        const entry = pending.get(id);
        if (!entry || from !== entry.peer) return true;
        clearTimeout(entry.timer);
        pending.delete(id);
        if (type === "result") entry.resolve(iq.cloneNode(true));
        else {
          end(entry.current, "iq-error");
          entry.reject(new Error("Peer rejected Jingle IQ"));
        }
        return true;
      }
      if (!fullJid(from) || !validId(id)) return true;
      if (type === "get" && discovery.length === 1 && !jingles.length && features.length) {
        if (discovery[0].hasAttribute("node")) { reply(iq, "item-not-found"); return true; }
        const document = documentForIq("result", id, own, from);
        const query = element(document, DISCO, "query");
        for (const feature of features) query.appendChild(element(document, DISCO, "feature", { var: feature }));
        document.documentElement.appendChild(query);
        transmit(serialize(document));
        return true;
      }
      if (type !== "set" || jingles.length !== 1) {
        reply(iq, "bad-request", "", false);
        return true;
      }
      const previous = replies.get(`${from}\n${id}`);
      if (previous) {
        if (previous.input === serialize(iq)) transmit(previous.xml);
        else reply(iq, "bad-request", "", false);
        return true;
      }
      const jingle = jingles[0];
      const sid = jingle.getAttribute("sid");
      const action = jingle.getAttribute("action");
      if (!validId(sid) || !action) { reply(iq, "bad-request"); return true; }
      if (action === "session-initiate") {
        if (jingle.hasAttribute("initiator") && jingle.getAttribute("initiator") !== from) {
          reply(iq, "bad-request"); return true;
        }
        let contents;
        try {
          contents = contentKeys(jingle);
          if (children(jingle, "content").some(content => content.getAttribute("creator") !== "initiator")) throw new Error();
        } catch { reply(iq, "bad-request"); return true; }
        if (options.allowPeer?.(from) !== true) { reply(iq, "forbidden"); return true; }
        if (session || options.busy?.()) {
          if (session?.sid === sid && session.peer === from) reply(iq, "unexpected-request", "out-of-order");
          else {
            reply(iq);
            void terminateSession({ sid, peer: from }, "busy").catch(() => notify("request-failed"));
          }
          return true;
        }
        let supported = false;
        try { supported = options.supports?.(jingle.cloneNode(true)) === true; } catch { }
        session = { sid, peer: from, role: "responder", state: "pending", contents };
        reply(iq);
        if (!supported) {
          void terminate("unsupported-applications").catch(() => notify("request-failed"));
        } else {
          notify("incoming", { session: snapshot(), jingle: jingle.cloneNode(true) });
        }
        return true;
      }
      const current = session;
      if (!current || current.sid !== sid || current.peer !== from) {
        if (action === "session-terminate" && terminated.get(`${from}\n${sid}`) > Date.now()) {
          reply(iq); return true;
        }
        reply(iq, "item-not-found", "unknown-session"); return true;
      }
      const initiator = current.role === "initiator" ? own : from;
      const responder = current.role === "responder" ? own : from;
      if ((jingle.hasAttribute("initiator") && jingle.getAttribute("initiator") !== initiator)
        || (jingle.hasAttribute("responder") && jingle.getAttribute("responder") !== responder)) {
        reply(iq, "bad-request"); return true;
      }
      if (!actions.has(action)) { reply(iq, "feature-not-implemented"); return true; }
      if (action === "session-accept") {
        if (current.role !== "initiator" || current.state !== "pending") {
          reply(iq, "unexpected-request", "out-of-order"); return true;
        }
        try { validateExisting(jingle, current, true); } catch { reply(iq, "bad-request"); return true; }
        let supported = false;
        try { supported = options.supports?.(jingle.cloneNode(true)) === true; } catch { }
        if (!supported) {
          reply(iq, "not-acceptable"); return true;
        }
        current.state = "active";
      } else if (action === "transport-info") {
        try { validateExisting(jingle, current, false); } catch { reply(iq, "bad-request"); return true; }
        if (options.supportsTransport) {
          let supported = false;
          try { supported = options.supportsTransport(jingle.cloneNode(true)) === true; } catch { }
          if (!supported) { reply(iq, "not-acceptable"); return true; }
        }
      } else if (action === "session-info") {
        if (Array.from(jingle.children).some(child => child.namespaceURI !== INFO || child.localName !== "ringing")) {
          reply(iq, "feature-not-implemented", "unsupported-info"); return true;
        }
      }
      reply(iq);
      if (action === "session-terminate") end(current, "remote-terminate");
      else notify(action, { session: snapshot(), jingle: jingle.cloneNode(true) });
      return true;
    }

    return { discover, initiate, accept, transportInfo, terminate, handleIq, reset, snapshot };
  }

  root.TeleTypTelJingleSession = Object.freeze({ create, NS });
})(typeof window === "undefined" ? globalThis : window);
