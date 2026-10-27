"use strict";
window.TeleTypTelXmppTranslation = {
  create({ send, connected }) {
    const namespace = "urn:xmpp:langtrans";
    const pending = new Map();
    let service = "";
    let discovered = false;
    let targets = new Set();
    let discovering = null;
    const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
    const disconnect = () => {
      discovered = false;
      targets = new Set();
      discovering = null;
      for (const request of Array.from(pending.values())) request.reject(new Error("unavailable"));
    };
    const configure = (jid) => {
      if (service !== (jid || "")) disconnect();
      service = jid || "";
    };
    const iq = (content, signal) => new Promise((resolve, reject) => {
      if (!service || !connected() || signal?.aborted) return reject(new Error("unavailable"));
      const id = "translation-" + crypto.randomUUID();
      const finish = (callback, value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        pending.delete(id);
        callback(value);
      };
      const abort = () => finish(reject, new Error("unavailable"));
      const timer = setTimeout(abort, 20000);
      pending.set(id, { service, resolve: (value) => finish(resolve, value), reject: (error) => finish(reject, error) });
      signal?.addEventListener("abort", abort, { once: true });
      if (!send(`<iq xmlns="jabber:client" type="get" id="${id}" to="${escape(service)}">${content}</iq>`)) abort();
    });
    const handleIq = (element) => {
      const request = pending.get(element.getAttribute("id"));
      if (!request || element.getAttribute("from") !== request.service) return false;
      const type = element.getAttribute("type");
      if (!["result", "error"].includes(type)) return false;
      if (type === "error") {
        const code = element.getElementsByTagNameNS("urn:teletyptel:translation:0", "failure")[0]?.getAttribute("code");
        request.reject(new Error(["disabled", "consent_required", "limit_reached", "preferences_changed", "sign_in", "text_too_long"].includes(code) ? code : "unavailable"));
      } else request.resolve(element);
      return true;
    };
    const discover = async () => {
      if (discovered) return;
      if (!discovering) discovering = (async () => {
        const result = await iq('<query xmlns="http://jabber.org/protocol/disco#info"/>');
        const supported = Array.from(result.getElementsByTagNameNS("http://jabber.org/protocol/disco#info", "feature"))
          .some((feature) => feature.getAttribute("var") === namespace);
        if (!supported) throw new Error("unavailable");
        const languages = await iq('<query xmlns="urn:xmpp:langtrans:items"/>');
        targets = new Set(Array.from(languages.getElementsByTagNameNS("urn:xmpp:langtrans:items", "item"))
          .map((item) => item.getAttribute("destination_lang")));
        if (!targets.size) throw new Error("unavailable");
        discovered = true;
      })().finally(() => { discovering = null; });
      await discovering;
    };
    const translate = async (body, signal) => {
      await discover();
      if (!targets.has(body.targetLanguage)) throw new Error("unavailable");
      if (signal?.aborted) throw new Error("unavailable");
      const context = `<context xmlns="urn:teletyptel:translation:0" automatic="${body.automatic === true}" live="${body.liveRtt === true}" direction="${body.liveDirection === "self" ? "self" : "peer"}"/>`;
      const result = await iq(`<x xmlns="${namespace}"><source xml:lang="und">${escape(body.text)}</source><translation destination_lang="${escape(body.targetLanguage)}"/></x>${context}`, signal);
      const payload = Array.from(result.children).find((child) => child.localName === "x" && child.namespaceURI === namespace);
      const translation = payload && Array.from(payload.children).find((child) => child.localName === "translation"
        && child.namespaceURI === namespace && child.getAttribute("destination_lang") === body.targetLanguage);
      if (!translation || !translation.hasAttribute("source_lang") || translation.textContent.length > 100000) throw new Error("failed");
      return { ok: true, translation: { text: translation.textContent, targetLanguage: body.targetLanguage,
        sourceLanguage: translation.getAttribute("source_lang"), provider: translation.getAttribute("engine") || "" } };
    };
    return { configure, disconnect, handleIq, translate, configured: () => Boolean(service) };
  }
};
