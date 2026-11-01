(function (root) {
  "use strict";

  const framing = "urn:ietf:params:xml:ns:xmpp-framing";
  const streams = "http://etherx.jabber.org/streams";
  const sasl = "urn:ietf:params:xml:ns:xmpp-sasl";
  const escapeXml = value => value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  const loopback = hostname => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

  function startProbe({ url, domain, timeoutMs = 8000, WebSocket = root.WebSocket } = {}) {
    let cancel;
    const promise = new Promise(resolve => {
      let socket;
      let timer;
      let settled = false;
      let sentOpen = false;
      let receivedOpen = false;
      let receivedBytes = 0;
      const now = () => root.performance ? root.performance.now() : Date.now();
      const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 8000) : 8000;
      const deadline = now() + duration;
      const finish = available => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        if (socket) {
          for (const [name, listener] of Object.entries(listeners)) socket.removeEventListener(name, listener);
          try {
            if (sentOpen && socket.readyState === 1) socket.send(`<close xmlns="${framing}"/>`);
          } catch (_) {}
          try { socket.close(); } catch (_) {}
        }
        resolve(available);
      };
      const listeners = {
        open() {
          if (settled) return;
          if (now() >= deadline || socket.protocol !== "xmpp") return finish(false);
          try {
            socket.send(`<open xmlns="${framing}" to="${escapeXml(domain)}" version="1.0"/>`);
            sentOpen = true;
          } catch (_) { finish(false); }
        },
        message(event) {
          if (settled) return;
          if (now() >= deadline || !sentOpen || typeof event.data !== "string") return finish(false);
          if (event.data.length > 65536 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(event.data)) return finish(false);
          try {
            receivedBytes += new root.TextEncoder().encode(event.data).byteLength;
            if (receivedBytes > 65536) return finish(false);
            const xml = new root.DOMParser().parseFromString(
              `<probe xmlns="jabber:client" xmlns:stream="${streams}">${event.data}</probe>`, "application/xml");
            if (xml.getElementsByTagNameNS("*", "parsererror").length) return finish(false);
            let available = false;
            for (const element of xml.documentElement.childNodes) {
              if (element.nodeType === 3 && !element.textContent.trim()) continue;
              if (element.nodeType !== 1) return finish(false);
              if (!receivedOpen && element.localName === "open" && element.namespaceURI === framing
                  && !element.children.length && !element.textContent.trim()) {
                receivedOpen = true;
              } else if (receivedOpen && !available && element.localName === "features" && element.namespaceURI === streams) {
                available = Array.from(element.children).some(child => child.localName === "mechanisms"
                  && child.namespaceURI === sasl && Array.from(child.children).some(mechanism =>
                    mechanism.localName === "mechanism" && mechanism.namespaceURI === sasl
                    && !mechanism.children.length && /^[A-Z0-9_-]{1,20}$/.test(mechanism.textContent.trim())));
                if (!available) return finish(false);
              } else {
                return finish(false);
              }
            }
            if (available) finish(now() < deadline);
          } catch (_) { finish(false); }
        },
        error() { finish(false); },
        close() { finish(false); }
      };
      cancel = () => finish(false);
      try {
        const endpoint = new root.URL(url);
        const localDevelopment = root.location?.protocol === "http:"
          && loopback(root.location.hostname) && loopback(endpoint.hostname);
        if ((endpoint.protocol !== "wss:" && !(endpoint.protocol === "ws:" && localDevelopment))
            || endpoint.username || endpoint.password || endpoint.hash
            || typeof domain !== "string" || !domain || domain.length > 253 || /\s|[\x00-\x1f]/.test(domain)
            || !WebSocket || !root.DOMParser || !root.TextEncoder) return finish(false);
        timer = root.setTimeout(() => finish(false), duration);
        socket = new WebSocket(endpoint.href, "xmpp");
        for (const [name, listener] of Object.entries(listeners)) socket.addEventListener(name, listener);
      } catch (_) { finish(false); }
    });
    return { promise, cancel };
  }

  function create({ translate, WebSocket = root.WebSocket } = {}) {
    let overlay;
    let status;
    let retryButton;
    let observer;
    let pending;
    let state = "hidden";
    let retry;
    let waitingForBody = false;
    const inertStates = new Map();
    const text = (key, fallback) => {
      try {
        const value = translate?.(key, fallback);
        return typeof value === "string" && value.trim() && value !== key ? value : fallback;
      } catch (_) { return fallback; }
    };
    const blockBackground = () => {
      for (const element of root.document.body.children) {
        if (element === overlay) continue;
        if (!inertStates.has(element)) inertStates.set(element, element.getAttribute("inert"));
        element.setAttribute("inert", "");
      }
    };
    function render() {
      const document = root.document;
      if (!document || state === "hidden") return;
      if (!document.body) {
        if (!waitingForBody) {
          waitingForBody = true;
          document.addEventListener("DOMContentLoaded", onBodyReady, { once: true });
        }
        return;
      }
      if (!overlay) {
        overlay = document.createElement("dialog");
        overlay.className = "xmpp-availability";
        overlay.setAttribute("aria-label", "TeleTypTel");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("closedby", "none");
        overlay.addEventListener("cancel", event => event.preventDefault());
        overlay.addEventListener("keydown", event => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
          }
        });
        const panel = document.createElement("div");
        panel.className = "xmpp-availability__panel";
        const brand = document.createElement("strong");
        brand.className = "xmpp-availability__brand";
        brand.textContent = "TeleTypTel";
        status = document.createElement("p");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
        status.tabIndex = -1;
        retryButton = document.createElement("button");
        retryButton.type = "button";
        retryButton.addEventListener("click", async () => {
          if (state !== "offline" || retryButton.disabled || typeof retry !== "function") return;
          retryButton.disabled = true;
          try { await retry(); } catch (_) {}
          if (state === "offline") retryButton.disabled = typeof retry !== "function";
        });
        panel.append(brand, status, retryButton);
        overlay.append(panel);
        document.body.append(overlay);
      }
      const wasHidden = !overlay.open;
      overlay.dataset.state = state;
      status.textContent = state === "offline"
        ? text("status.xmpp_server_offline", "De chatserver is niet online of niet bereikbaar. Probeer het later opnieuw.")
        : text("status.xmpp_server_checking", "De bereikbaarheid van de chatserver wordt gecontroleerd…");
      retryButton.textContent = text("status.xmpp_server_retry", "Opnieuw proberen");
      retryButton.hidden = state !== "offline";
      retryButton.disabled = typeof retry !== "function";
      blockBackground();
      if (!observer && root.MutationObserver) {
        observer = new root.MutationObserver(blockBackground);
        observer.observe(document.body, { childList: true });
      }
      if (wasHidden) {
        if (typeof overlay.showModal === "function") overlay.showModal();
        else overlay.setAttribute("open", "");
        status.focus({ preventScroll: true });
      }
    }
    function onBodyReady() {
      waitingForBody = false;
      render();
    }
    function show(nextState, nextRetry) {
      state = nextState;
      retry = nextRetry;
      render();
    }
    function hideView() {
      state = "hidden";
      retry = undefined;
      observer?.disconnect();
      observer = undefined;
      if (waitingForBody) root.document.removeEventListener("DOMContentLoaded", onBodyReady);
      waitingForBody = false;
      if (overlay?.open) {
        if (typeof overlay.close === "function") overlay.close();
        else overlay.removeAttribute("open");
      }
      for (const [element, previous] of inertStates) {
        if (previous === null) element.removeAttribute("inert");
        else element.setAttribute("inert", previous);
      }
      inertStates.clear();
    }
    function cancelPending() {
      const previous = pending;
      pending = undefined;
      previous?.cancel();
    }
    const controller = {
      check({ url, domain, retry: onRetry } = {}) {
        if (pending && pending.url === url && pending.domain === domain) return pending.promise;
        cancelPending();
        const retryCheck = onRetry || (() => controller.check({ url, domain }));
        show("checking", retryCheck);
        const request = { ...startProbe({ url, domain, WebSocket }), url, domain };
        pending = request;
        request.promise = request.promise.then(available => {
          if (pending !== request) return false;
          pending = undefined;
          if (available) hideView();
          else show("offline", retryCheck);
          return available;
        });
        return request.promise;
      },
      connecting() { cancelPending(); show("checking"); },
      unavailable(onRetry) { cancelPending(); show("offline", onRetry); },
      ready() { cancelPending(); hideView(); },
      hide() { cancelPending(); hideView(); }
    };
    return controller;
  }

  root.TeleTypTelXmppAvailability = { create, probe: options => startProbe(options).promise };
})(typeof window === "undefined" ? globalThis : window);
