(function (root) {
  "use strict";
  function renderer(document, catalog) {
    if (!Array.isArray(catalog) || catalog.length > 64 || catalog.some(value => !value || typeof value.name !== "string"
        || !/^[a-z0-9_-]{1,40}$/.test(value.name) || !/^smileys\/[a-z0-9_-]{1,40}\.(gif|svg)$/.test(value.file)
        || !Array.isArray(value.codes) || !value.codes.length || value.codes.length > 4
        || value.codes.some(code => typeof code !== "string" || !code || code.length > 16 || /[\s\u0000-\u001f]/u.test(code)))) throw new Error("Invalid smileys");
    const entries = catalog.flatMap(value => value.codes.map(code => ({ ...value, code }))).sort((left, right) => right.code.length - left.code.length);
    const byCode = new Map(entries.map(value => [value.code, value]));
    const expression = new RegExp(entries.map(value => value.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    function image(value) {
      const element = document.createElement("img"); element.src = value.file; element.alt = value.code || value.codes[0];
      element.className = "smiley-image"; element.title = value.name; element.loading = "lazy"; element.decoding = "async";
      return element;
    }
    function body(container, text) {
      container.replaceChildren();
      let start = 0; let count = 0;
      expression.lastIndex = 0;
      for (let match; entries.length && count < 24 && (match = expression.exec(text)); count += 1) {
        container.append(document.createTextNode(text.slice(start, match.index)), image(byCode.get(match[0])));
        start = expression.lastIndex;
      }
      container.append(document.createTextNode(text.slice(start)));
    }
    function picker(container, insert) {
      for (const value of catalog) {
        const button = document.createElement("button"); button.type = "button"; button.className = "smiley-picker-option";
        button.setAttribute("aria-label", value.name + " " + value.codes[0]); button.title = value.name + " " + value.codes[0];
        button.append(image(value)); button.onclick = () => insert(value.codes[0]); container.append(button);
      }
    }
    return { body, picker };
  }
  if (typeof module === "object" && module.exports) module.exports = { renderer };
  else root.TeleTypTelHybridSmileys = renderer(root.document, root.TeleTypTelSmileyCatalog);
})(typeof window === "undefined" ? globalThis : window);
