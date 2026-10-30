(function (root) {
  "use strict";
  if (root.location.protocol !== "capacitor:" || root.location.hostname !== "localhost") return;
  const server = new URL(root.teletyptelServer);
  if (server.protocol !== "https:" || server.username || server.password || server.search || server.hash || server.pathname !== "/chat.html") {
    throw new Error("A secure TeleTypTel server is required.");
  }
  const browserFetch = root.fetch.bind(root);
  const bridge = () => {
    const plugin = root.Capacitor?.Plugins?.TeleTypTelServer;
    if (!plugin) throw new Error("The native server connection is unavailable. Update the app.");
    return plugin;
  };
  const local = url => url.protocol === "capacitor:" && url.hostname === "localhost" && !url.port;
  const serverPath = value => {
    const url = new URL(value, root.location.href);
    if (url.username || url.password || !(local(url) || url.origin === server.origin)) return null;
    return url.pathname + url.search;
  };
  const apiPath = value => /^\/api\/(?:[a-z-]+\.php|auth\/(?:public-config\.php|google\/native\.php))$/.test(value.split("?")[0])
    || /^\/config\/(?:account-profile\.json|google-maps\.json|providers\/[a-zA-Z0-9_-]+\.json)$/.test(value.split("?")[0]);
  const publicUrl = value => {
    const url = new URL(value, root.location.href);
    return local(url) ? new URL(url.pathname + url.search + url.hash, server).href : url.href;
  };
  const filePath = value => {
    const pathname = serverPath(value);
    return pathname?.split("?")[0] === "/api/file.php" ? pathname : null;
  };
  root.TeleTypTelApp = Object.freeze({
    serverUrl: server.href,
    publicUrl,
    mediaUrl(value) {
      const pathname = filePath(value);
      return pathname ? "teletyptel-media://localhost" + pathname : publicUrl(value);
    },
    download(value, name) {
      const pathname = filePath(value);
      return pathname ? bridge().shareFile({ path: pathname, name: String(name || "download") }) : null;
    }
  });
  const encode = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return root.btoa(binary);
  };
  const requestId = () => {
    if (root.crypto.randomUUID) return root.crypto.randomUUID();
    const bytes = root.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  root.fetch = async (input, options) => {
    const inputUrl = input instanceof Request ? input.url : String(input);
    const pathname = serverPath(inputUrl);
    if (!pathname || !apiPath(pathname)) return browserFetch(input, options);
    const effective = new Request(input instanceof Request ? input : publicUrl(inputUrl), options);
    effective.signal.throwIfAborted();
    const identifier = requestId();
    const headers = Object.fromEntries(effective.headers.entries());
    const body = ["GET", "HEAD"].includes(effective.method) ? "" : encode(await effective.arrayBuffer());
    effective.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        effective.signal.removeEventListener("abort", abort);
        callback(value);
      };
      const abort = () => {
        void bridge().cancel({ id: identifier }).catch(() => {});
        finish(reject, effective.signal.reason || new DOMException("Aborted", "AbortError"));
      };
      effective.signal.addEventListener("abort", abort, { once: true });
      bridge().request({ id: identifier, path: pathname, method: effective.method, headers, body,
        omitCookies: effective.credentials === "omit" }).then(result => {
        try {
          const bytes = Uint8Array.from(root.atob(result.body || ""), character => character.charCodeAt(0));
          const response = new Response([204, 205, 304].includes(result.status) || effective.method === "HEAD" ? null : bytes,
            { status: result.status, headers: result.headers });
          Object.defineProperty(response, "url", { value: publicUrl(inputUrl) });
          finish(resolve, response);
        } catch (error) { finish(reject, error); }
      }, error => finish(reject, error));
    });
  };
})(window);
