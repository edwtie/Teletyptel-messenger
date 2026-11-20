"use strict";

function catalog(source) {
  const match = /\bconst smiles = (\[[\s\S]*?\n  \])\.map\(/.exec(source);
  if (!match) throw new Error("Missing pinned smiley catalog.");
  const rows = JSON.parse(match[1]);
  if (!Array.isArray(rows) || !rows.length || rows.length > 64) throw new Error("Invalid smiley catalog size.");
  const names = new Set(); const codes = new Set();
  return rows.map(row => {
    if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== "string" || !/^[a-z0-9_-]{1,40}$/.test(row[0]) || names.has(row[0])
        || typeof row[1] !== "string" || !/^[a-z0-9_-]{1,40}\.(gif|svg)$/.test(row[1]) || !Array.isArray(row[2]) || !row[2].length || row[2].length > 4
        || new Set(row[2]).size !== row[2].length || row[2].some(code => typeof code !== "string" || !code || code.length > 16 || /[\s\u0000-\u001f]/u.test(code) || codes.has(code))) throw new Error("Invalid smiley entry.");
    names.add(row[0]); row[2].forEach(code => codes.add(code));
    return { name: row[0], file: "smileys/" + row[1], codes: row[2] };
  });
}

function resolveCatalog(source, read) {
  return catalog(source).map(value => {
    try { read(value.file); return value; }
    catch (error) {
      if (!value.file.endsWith(".gif")) throw error;
      const file = value.file.replace(/\.gif$/, ".svg");
      read(file); return { ...value, file };
    }
  });
}

module.exports = { catalog, resolveCatalog };
