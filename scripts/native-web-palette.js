"use strict";
const fs = require("node:fs");
const path = require("node:path");

function rules(source) {
  const result = new Map();
  for (const match of source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = Object.fromEntries(match[2].split(";").filter(value => value.includes(":"))
      .map(value => [value.slice(0, value.indexOf(":")).trim(), value.slice(value.indexOf(":") + 1).replace(/\s*!important\s*$/, "").trim()]));
    const selectors = [];
    let start = 0;
    let nesting = 0;
    for (let index = 0; index < match[1].length; index += 1) {
      const character = match[1][index];
      if (character === "(" || character === "[") nesting += 1;
      if (character === ")" || character === "]") nesting -= 1;
      if (character === "," && nesting === 0) { selectors.push(match[1].slice(start, index).trim()); start = index + 1; }
    }
    selectors.push(match[1].slice(start).trim());
    for (const selector of selectors) {
      result.set(selector, { ...result.get(selector), ...declarations });
    }
  }
  return result;
}

function rgba(value, variables = {}, depth = 0) {
  if (typeof value !== "string" || depth > 8) throw new Error("Missing or cyclic web palette colour");
  const variable = /^var\((--[a-z-]+)\)$/.exec(value);
  if (variable) return rgba(variables[variable[1]], variables, depth + 1);
  if (value === "transparent") return [0, 0, 0, 0];
  const hexadecimal = /^#([a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.exec(value);
  if (hexadecimal) {
    const expanded = hexadecimal[1].length <= 4 ? [...hexadecimal[1]].map(part => part + part).join("") : hexadecimal[1];
    const channels = expanded.match(/../g).map(part => parseInt(part, 16) / 255);
    return channels.length === 3 ? [...channels, 1] : channels;
  }
  const functional = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
  if (!functional) throw new Error("Unsupported web palette colour: " + value);
  const channels = functional.slice(1, 4).map(Number);
  const alpha = functional[4] === undefined ? 1 : Number(functional[4]);
  if (channels.some(channel => !Number.isFinite(channel) || channel < 0 || channel > 255) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error("Invalid web colour range");
  return [...channels.map(channel => channel / 255), alpha];
}

function palette(clientCSS, controlsCSS) {
  const client = rules(clientCSS);
  const controls = rules(controlsCSS);
  const result = {};
  for (const theme of ["light", "dark"]) {
    const body = `body[data-theme="${theme}"]`;
    const variables = { ...client.get(":root"), ...client.get(body) };
    const read = (selector, property, themed = false) => {
      const declarations = { ...client.get(selector), ...(themed ? client.get(body + " " + selector) : {}) };
      const value = declarations[property];
      if (!value) throw new Error(`Missing web palette property: ${selector} ${property}`);
      return value;
    };
    const border = selector => {
      const value = read(selector, "border");
      const colour = /(?:#[a-f0-9]{3,8}|rgba?\([^)]*\)|var\(--[a-z-]+\)|transparent)$/i.exec(value);
      if (!colour) throw new Error("Unsupported web border: " + selector);
      return colour[0];
    };
    const control = (selector, property) => {
      const value = controls.get(selector)?.[property];
      if (!value) throw new Error("Missing web call-control property: " + selector + " " + property);
      return value;
    };
    const media = "body.call-menu-active #callControlsMenu .call-media-controls > .call-media-icon-button";
    const values = {
      panel: read(".modal-card", "background", true),
      background: read(body, "background-color"),
      panelStrong: read(".modal-header", "background", true),
      header: read(".chat-header", "background", true),
      text: "var(--text)", muted: "var(--muted)", line: "var(--line)",
      input: read("input", "background", true),
      accent: "var(--accent-strong)", link: "var(--accent)",
      button: read(body + " button", "background"), buttonText: read(body + " button", "color"),
      buttonBorder: border("button"),
      logout: read(".logout-icon-button", "background"), logoutText: read(".logout-icon-button", "color"),
      logoutLine: read(".logout-icon-button", "border-color"),
      outgoing: "var(--bubble-self)", incoming: "var(--bubble-peer)",
      outgoingLine: read(".message.self .message-body", "border-color"), incomingLine: border(".message-body"),
      selection: "var(--selection-bg)", selectionBorder: "var(--selection-border)", selectionText: "var(--selection-text)",
      composer: read(".composer-input-row", "background", true),
      composerButton: read(".composer-round-button", "background", true),
      composerButtonText: read(".composer-round-button", "color", true),
      composerSend: read(".composer-send-button", "background", true),
      composerSendText: read(".composer-send-button", "color", true),
      backgroundOverlay: "var(--chat-background-overlay)",
      totalConversation: read("body.compact-chat-header #startTotalCallOption", "background"),
      totalDisabled: read("body.compact-chat-header #startTotalCallOption:disabled", "background"),
      totalDisabledText: read("body.compact-chat-header #startTotalCallOption:disabled", "color"),
      callButton: read(".icon-button.call-mode-button", "background", true),
      callButtonText: read(".icon-button.call-mode-button", "color", true),
      callBackground: read(".call-panel", "background"),
      callLine: read("html body.call-active.tc-call-active #callPanel .tc-text-line", "border-color"),
      rttBackground: read(".tc-text-line", "background"),
      rttLabel: read(".tc-text-line span", "color"), rttText: read(".tc-text-line p", "color"),
      rttPlaceholder: read("#totalConversationLocalText::placeholder", "color"),
      callMenu: control("body.call-menu-active .call-controls-menu:not([hidden])", "background"),
      enabled: control(media, "background"), disabled: control(media + ".selected", "background"),
      enabledLine: control(media, "border-color"), disabledLine: control(media + ".selected", "border-color"),
      unavailableCall: control(media + ":disabled", "background"),
      unavailableCallLine: control(media + ":disabled", "border-color"),
      warning: "var(--warn)", danger: "var(--danger)",
      online: read(".presence-online", "background"), offline: read(".presence-offline", "background"),
      groupPresence: read(".presence-group", "background"),
      receipt: read(".message-receipt", "color"), receiptRead: read(".message-receipt-displayed", "color"),
      dateBackground: read(".message-date-separator span", "background", true),
      dateText: read(".message-date-separator span", "color", true),
      dateLine: client.get(body + " .message-date-separator span")?.["border-color"] ?? border(".message-date-separator span")
    };
    for (const [name, value] of Object.entries(values)) {
      result[name] ??= {};
      result[name][theme] = rgba(value, variables);
    }
  }
  return result;
}

function assets(root) {
  const values = palette(fs.readFileSync(path.join(root, "php/public/chat-client.css"), "utf8"),
    fs.readFileSync(path.join(root, "php/public/call-controls-menu.css"), "utf8"));
  return Object.fromEntries(Object.entries(values).map(([name, themes]) => {
    const assetName = "Web" + name[0].toUpperCase() + name.slice(1);
    const colors = ["light", "dark"].map(theme => ({
      idiom: "universal",
      ...(theme === "dark" ? { appearances: [{ appearance: "luminosity", value: "dark" }] } : {}),
      color: { "color-space": "srgb", components: Object.fromEntries(["red", "green", "blue", "alpha"]
        .map((channel, index) => [channel, String(themes[theme][index])])) }
    }));
    return [`Assets.xcassets/${assetName}.colorset/Contents.json`, JSON.stringify({ colors, info: { author: "xcode", version: 1 } })];
  }));
}

function assertCompiledPalette(output) {
  if (/The color set "Web\w+"[^\n]*unassigned children/.test(output)) {
    throw new Error("Xcode discarded web colour variants; native appearance cannot be accepted");
  }
}

module.exports = { rules, rgba, palette, assets, assertCompiledPalette };
