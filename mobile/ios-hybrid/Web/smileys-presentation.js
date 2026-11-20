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
    function editor(field) {
      let bookmark = null;
      const selection = () => document.defaultView.getSelection();
      const within = range => range && field.contains(range.commonAncestorContainer);
      function rememberSelection() {
        const current = selection();
        if (current.rangeCount && within(current.getRangeAt(0))) bookmark = current.getRangeAt(0).cloneRange();
      }
      field.addEventListener("focusout", rememberSelection);
      function plain(parent) {
        let result = "";
        for (const child of parent.childNodes) {
          if (child.nodeType === 3) result += child.data;
          else if (child.nodeName === "IMG") result += byCode.has(child.alt) ? child.alt : "";
          else if (child.nodeName === "BR") result += child.nextSibling ? "\n" : "";
          else {
            if (child.nodeName === "DIV" && child.previousSibling) result += "\n";
            result += plain(child);
          }
        }
        return result;
      }
      function insert(text, smiley = false) {
        if (!field.isContentEditable || !text) return false;
        rememberSelection();
        const range = within(bookmark) ? bookmark.cloneRange() : document.createRange();
        if (!within(range)) { range.selectNodeContents(field); range.collapse(false); }
        field.focus();
        const node = smiley && byCode.has(text) ? image(byCode.get(text)) : document.createTextNode(text);
        if (node.nodeName === "IMG") node.draggable = false;
        range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
        const current = selection(); current.removeAllRanges(); current.addRange(range); rememberSelection();
        field.dispatchEvent(new document.defaultView.Event("input", { bubbles: true }));
        return true;
      }
      field.addEventListener("paste", event => { event.preventDefault(); insert(event.clipboardData?.getData("text/plain")); });
      field.addEventListener("drop", event => event.preventDefault());
      for (const type of ["copy", "cut"]) field.addEventListener(type, event => {
        const current = selection();
        if (!current.rangeCount || !within(current.getRangeAt(0)) || current.isCollapsed || !event.clipboardData) return;
        const range = current.getRangeAt(0);
        event.preventDefault(); event.clipboardData.setData("text/plain", plain(range.cloneContents()));
        if (type === "cut" && field.isContentEditable) {
          range.deleteContents(); field.dispatchEvent(new document.defaultView.Event("input", { bubbles: true }));
        }
      });
      return {
        get value() { return plain(field); },
        set value(text) {
          if (!text) { field.replaceChildren(); bookmark = null; }
          else if (plain(field) !== text) { body(field, text); bookmark = null; }
        },
        set disabled(disabled) {
          const editable = String(!disabled);
          if (field.contentEditable !== editable) field.contentEditable = editable;
          field.setAttribute("aria-disabled", String(disabled));
        },
        insert
      };
    }
    return { body, picker, editor };
  }
  if (typeof module === "object" && module.exports) module.exports = { renderer };
  else root.TeleTypTelHybridSmileys = renderer(root.document, root.TeleTypTelSmileyCatalog);
})(typeof window === "undefined" ? globalThis : window);
