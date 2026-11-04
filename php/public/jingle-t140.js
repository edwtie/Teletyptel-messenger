(function (root) {
  "use strict";

  const maxBlockBytes = 4096;
  const maxTextPoints = 32768;
  const maxBufferedBytes = 65536;
  const encoder = new TextEncoder();
  function validUnicode(value) {
    if (typeof value !== "string") return false;
    for (const point of value) {
      const code = point.codePointAt(0);
      if (code >= 0xd800 && code <= 0xdfff) return false;
    }
    return true;
  }

  function apply(previous, block) {
    if (!validUnicode(block)) throw new Error("Invalid T.140 Unicode");
    const points = Array.from(previous.text);
    let carriageReturn = previous.carriageReturn;
    for (const point of block) {
      if (point === "\ufeff") continue;
      if (point === "\n" && carriageReturn) { carriageReturn = false; continue; }
      carriageReturn = false;
      if (point === "\b") points.pop();
      else if (point === "\r") { points.push("\n"); carriageReturn = true; }
      else if (point === "\n" || point === "\u2028") points.push("\n");
      else if (!/[\x00-\x1f\x7f-\x9f]/.test(point)) points.push(point);
      if (points.length > maxTextPoints) throw new Error("T.140 text limit exceeded");
    }
    return { text: points.join(""), carriageReturn };
  }

  function create(channel, options = {}) {
    if (channel.label !== "rtt" || channel.protocol !== "t140" || !channel.ordered
      || !channel.negotiated || channel.id !== 0 || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) {
      channel.close();
      throw new Error("Expected the negotiated reliable, ordered T.140 channel");
    }
    let closed = false;
    let received = { text: "", carriageReturn: false };
    let sent = { text: "", carriageReturn: false };
    let pendingText = null;
    const active = () => !closed && options.isCurrent?.() !== false;
    const status = state => { if (active()) options.onStatus?.(state); };
    channel.binaryType = "arraybuffer";
    const opened = () => { flushPending(); status("open"); };
    const drained = () => {
      if (pendingText !== null && flushPending()) status("open");
    };
    channel.bufferedAmountLowThreshold = maxBufferedBytes / 2;
    const ended = () => { status("unavailable"); close(); };
    const message = event => {
      if (!active()) return;
      try {
        let block;
        if (typeof event.data === "string") {
          if (!validUnicode(event.data) || encoder.encode(event.data).length > maxBlockBytes) throw new Error();
          block = event.data;
        } else {
          if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > maxBlockBytes) throw new Error();
          block = new TextDecoder("utf-8", { fatal: true }).decode(event.data);
        }
        received = apply(received, block);
        options.onText?.({ text: received.text, block });
      } catch { status("invalid-text"); close(); }
    };
    channel.addEventListener("open", opened);
    channel.addEventListener("close", ended);
    channel.addEventListener("error", ended);
    channel.addEventListener("message", message);
    channel.addEventListener("bufferedamountlow", drained);

    function sendBlock(block) {
      if (!active() || channel.readyState !== "open" || !validUnicode(block)) return false;
      const bytes = encoder.encode(block);
      if (bytes.length > maxBlockBytes || bytes.length + channel.bufferedAmount > maxBufferedBytes) return false;
      let next;
      try { next = apply(sent, block); channel.send(bytes); } catch { return false; }
      sent = next;
      return true;
    }

    function flushPending() {
      if (!active()) { pendingText = null; return false; }
      if (channel.readyState !== "open") return false;
      if (pendingText === null) return true;
      const next = Array.from(pendingText), previous = Array.from(sent.text);
      let common = 0;
      while (common < previous.length && common < next.length && previous[common] === next[common]) common += 1;
      const operations = [...Array(previous.length - common).fill("\b"),
        ...next.slice(common).map(point => point === "\n" ? "\r\n" : point)];
      let block = "", length = 0;
      for (const operation of operations) {
        const size = encoder.encode(operation).length;
        if (length + size > maxBlockBytes) {
          if (!sendBlock(block)) return false;
          block = ""; length = 0;
        }
        block += operation; length += size;
      }
      if (block && !sendBlock(block)) return false;
      pendingText = null;
      return true;
    }

    function setText(text) {
      if (!active() || channel.readyState !== "open") return false;
      if (!validUnicode(text) || /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f-\x9f\ufeff]/.test(text)) return false;
      const normalized = text.replace(/\r\n?/g, "\n").replace(/\u2028/g, "\n");
      if (Array.from(normalized).length > maxTextPoints) return false;
      pendingText = normalized;
      return flushPending();
    }

    function close() {
      if (closed) return;
      closed = true;
      channel.removeEventListener("open", opened);
      channel.removeEventListener("close", ended);
      channel.removeEventListener("error", ended);
      channel.removeEventListener("message", message);
      channel.removeEventListener("bufferedamountlow", drained);
      pendingText = null;
      channel.close();
      received = { text: "", carriageReturn: false };
      sent = { text: "", carriageReturn: false };
    }

    return Object.freeze({ sendBlock, setText, close });
  }

  root.TeleTypTelT140 = Object.freeze({ create, apply });
})(typeof window === "undefined" ? globalThis : window);
