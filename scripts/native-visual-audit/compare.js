"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { screens, variants, exclusions, caseID } = require("./catalogue");
const { pngSize } = require("./import-native");

function orientPixels(image, orientation) {
  if (orientation === 1) return image;
  if (![3, 6, 8].includes(orientation)) throw new Error("Unsupported declared EXIF orientation");
  const width = orientation === 3 ? image.width : image.height;
  const height = orientation === 3 ? image.height : image.width;
  const data = Buffer.alloc(image.data.length);
  for (let sourceY = 0; sourceY < image.height; sourceY += 1) for (let sourceX = 0; sourceX < image.width; sourceX += 1) {
    const targetX = orientation === 3 ? image.width - 1 - sourceX : orientation === 6 ? image.height - 1 - sourceY : sourceY;
    const targetY = orientation === 3 ? image.height - 1 - sourceY : orientation === 6 ? sourceX : image.width - 1 - sourceX;
    const offset = (sourceY * image.width + sourceX) * 4;
    image.data.copy(data, (targetY * width + targetX) * 4, offset, offset + 4);
  }
  return { width, height, data };
}

function comparePixels(reference, actual) {
  for (const image of [reference, actual]) {
    if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0 || image.width * image.height > 20000000 || image.data.length !== image.width * image.height * 4) throw new Error("Invalid or oversized RGBA image");
  }
  if (reference.width !== actual.width || reference.height !== actual.height) return { status: "different-dimensions", reference: { width: reference.width, height: reference.height }, actual: { width: actual.width, height: actual.height }, identical: false };
  let differentPixels = 0;
  let absoluteChannelError = 0;
  let maxChannelError = 0;
  const delta = Buffer.alloc(reference.data.length, 255);
  for (let index = 0; index < reference.data.length; index += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const error = Math.abs(reference.data[index + channel] - actual.data[index + channel]);
      absoluteChannelError += error;
      maxChannelError = Math.max(maxChannelError, error);
      if (error) changed = true;
    }
    if (changed) { differentPixels += 1; delta[index + 1] = 0; delta[index + 2] = 0; }
  }
  return { status: differentPixels ? "pixels-differ" : "pixels-identical", identical: differentPixels === 0, differentPixels, totalPixels: reference.width * reference.height, differentFraction: differentPixels / (reference.width * reference.height), meanAbsoluteChannelError: absoluteChannelError / reference.data.length, maxChannelError, delta };
}

function cropPixels(image, crop) {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > image.width || crop.y + crop.height > image.height) throw new Error("Native viewport must be an explicit in-bounds integer-pixel rectangle");
  const data = Buffer.alloc(crop.width * crop.height * 4);
  for (let row = 0; row < crop.height; row += 1) image.data.copy(data, row * crop.width * 4, ((crop.y + row) * image.width + crop.x) * 4, ((crop.y + row) * image.width + crop.x + crop.width) * 4);
  return { width: crop.width, height: crop.height, data };
}

function pairIssues(reference, actual) {
  const issues = [];
  for (const key of ["screen", "family", "orientation", "theme", "width", "height", "scale", "locale", "timezone", "epoch", "fixtureHash"]) {
    if (reference[key] === undefined || actual[key] === undefined || reference[key] !== actual[key]) issues.push("Different or missing " + key);
  }
  if (!/^[a-f0-9]{64}$/.test(reference.fixtureHash || "")) issues.push("Missing verified shared fixture hash");
  if (reference.stateVerified !== true) issues.push("The requested web screen state has not been verified");
  if (reference.inputVerified !== true) issues.push("The mobile touch input mode has not been verified");
  if (!actual.viewport || actual.viewport.source !== "measured-safe-area") issues.push("Native app viewport has not been measured");
  if (actual.viewport && (actual.viewport.width !== actual.width * actual.scale || actual.viewport.height !== actual.height * actual.scale)) issues.push("Native viewport must cover the entire declared app area at its original pixel scale");
  if (reference.errors?.length || actual.errors?.length) issues.push("Capture has runtime errors");
  if (reference.status === "capture-failed" || actual.status === "capture-failed") issues.push("Capture failed");
  return issues;
}

function completeness(entries) {
  const matrix = [];
  const known = new Map();
  for (const entry of entries) {
    if (known.has(entry.id)) throw new Error("Duplicate visual case: " + entry.id);
    known.set(entry.id, entry);
  }
  for (const screen of screens) for (const variant of variants) {
    const id = caseID(screen.id, variant);
    matrix.push(known.get(id) || { id, screen: screen.id, ...variant, status: "not-compared", identical: false });
    known.delete(id);
  }
  if (known.size) throw new Error("Unexpected cases cannot substitute for missing screens: " + [...known.keys()].join(", "));
  const proven = matrix.filter(entry => entry.status === "pixels-identical" && entry.identical === true && entry.acceptanceEligible === true).length;
  return { total: matrix.length, proven, complete: proven === matrix.length, matrix };
}

function escaped(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function evidencePath(directory, file) {
  if (typeof file !== "string" || !/^[a-zA-Z0-9_.-]+\.png$/.test(file)) throw new Error("Evidence must be a local PNG basename");
  const resolved = path.resolve(directory, file);
  if (!fs.existsSync(resolved)) throw new Error("Evidence image is missing: " + file);
  return resolved;
}

function compareLayout(reference, actual) {
  if (actual?.geometry?.units !== "points" || actual.viewport?.source !== "measured-safe-area" || ![actual.viewport.x, actual.viewport.y, actual.scale].every(Number.isFinite) || actual.scale <= 0) return [];
  const mappings = [["messenger-brand-header", ".topbar"], ["chat-header", ".conversation-header"],
    ["chat-draft", "#messageInput"], ["main-menu-grid", "#mobileActionsPanel"],
    ["conversation-menu-panel", "#chatMorePanel"], ["smiley-picker", "#smileyPickerPanel"]];
  const fields = ["x", "y", "width", "height"];
  return mappings.flatMap(([identifier, selector]) => {
    const nativeFrame = actual.geometry.elements?.find(element => element.id === identifier);
    const webFrame = reference?.geometry?.[selector]?.[0];
    if (!nativeFrame || !webFrame || !fields.every(field => Number.isFinite(nativeFrame[field]) && Number.isFinite(webFrame[field]))) return [];
    const native = { x: nativeFrame.x - actual.viewport.x / actual.scale, y: nativeFrame.y - actual.viewport.y / actual.scale, width: nativeFrame.width, height: nativeFrame.height };
    const web = Object.fromEntries(fields.map(field => [field, webFrame[field]]));
    const delta = Object.fromEntries(fields.map(field => [field, native[field] - web[field]]));
    return [{ identifier, selector, units: "CSS pixels / native points relative to measured app viewport", web, native, delta }];
  });
}

function renderReport(report, output) {
  const image = (file, label) => file ? '<figure><figcaption>' + label + '</figcaption><img loading="lazy" src="' + escaped(path.relative(output, file).replace(/\\/g, "/")) + '" alt="' + label + '"></figure>' : "";
  const renderCase = entry => {
    const review = entry.reviewMetrics ? '<p>Diagnostische pixelverschillen: ' + (entry.reviewMetrics.differentFraction * 100).toFixed(2) + '%. De testinhoud is niet gelijk; dit is geen acceptatiescore.</p>' : "";
    const original = entry.nativeViewportFile ? '<p><a href="' + escaped(path.relative(output, entry.nativeFile).replace(/\\/g, "/")) + '">Originele native screenshot inclusief systeemranden</a></p>' : "";
    const layout = entry.layout?.length ? '<h3>Gemeten UI-vlakken (diagnostisch)</h3><p>Coördinaten binnen het appvenster; CSS-pixels tegenover native punten. Dit is geen pixelacceptatie.</p><table><tr><th>Onderdeel</th><th>Web x/y/b/h</th><th>Native x/y/b/h</th><th>Verschil x/y/b/h</th></tr>' + entry.layout.map(row => '<tr><td>' + escaped(row.identifier) + '</td>' + [row.web, row.native, row.delta].map(frame => '<td>' + ["x", "y", "width", "height"].map(field => Number(frame[field]).toFixed(2)).join(" / ") + '</td>').join("") + '</tr>').join("") + '</table>' : "";
    return '<details><summary>' + escaped(entry.id) + ' — ' + escaped(entry.status) + '</summary><p>' + escaped(entry.issues?.join("; ") || "") + '</p>' + review + layout + original + '<div class="images">' + image(entry.webFile, "Webreferentie") + image(entry.nativeViewportFile || entry.nativeFile, entry.nativeViewportFile ? "Native appvenster — gemeten uitsnede" : "Native simulator") + image(entry.deltaFile, "Pixelverschillen (rood)") + '</div></details>';
  };
  return '<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TeleTypTel visuele vergelijking</title><style>body{font:16px/1.5 system-ui;margin:24px;max-width:1500px;color:#0f172a;background:#f8fafc}h1{font-size:28px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:8px;text-align:left;border:1px solid #cbd5e1}summary{cursor:pointer;padding:12px;font-weight:bold}details{background:white;margin:12px 0;border:1px solid #cbd5e1}.images{display:flex;flex-wrap:wrap;gap:16px;padding:16px}figure{margin:0;max-width:46%;min-width:180px}img{max-width:100%;max-height:700px;object-fit:contain;object-position:top;outline:1px solid #94a3b8}figcaption{font-weight:bold}.warning{border-left:5px solid #b45309;background:#fff7ed;padding:16px}code{overflow-wrap:anywhere}</style><h1>TeleTypTel: web ↔ native iOS</h1><p class="warning">' + report.coverage.proven + ' van ' + report.coverage.total + ' gevallen aantoonbaar pixelgelijk. <strong>' + (report.coverage.complete ? "Volledige catalogus bewezen." : "Volledige pixelgelijkheid NIET bewezen.") + '</strong> Ontbrekende beelden, afwijkende testinhoud en niet-gemeten uitsneden tellen nooit als geslaagd.</p><p>Webreferentie: <code>' + escaped(report.webRevision) + '</code>. Native bron: <code>' + escaped(report.nativeRevision || "niet aangeleverd") + '</code>. Strikte vergelijking: elk RGBA-kanaal gelijk; geen tolerantiedrempel, schalen, automatische uitlijning of genegeerde appgebieden.</p><p>De onderstaande beelden zijn echte renders. Beoordelingsbeelden zonder identieke fixture blijven diagnostisch en zijn geen bewijs van pixelgelijkheid.</p><h2>Afbakening</h2><ul>' + exclusions.map(item => '<li>' + escaped(item) + '</li>').join("") + '</ul><h2>Schermdekking</h2><table><tr><th>Scherm</th><th>Webbeelden</th><th>Native beelden</th><th>Bewezen</th></tr>' + screens.map(screen => {
    const cases = report.coverage.matrix.filter(entry => entry.screen === screen.id);
    return '<tr><td>' + escaped(screen.title) + '</td><td>' + cases.filter(entry => entry.webFile).length + '/8</td><td>' + cases.filter(entry => entry.nativeFile).length + '/8</td><td>' + cases.filter(entry => entry.acceptanceEligible && entry.identical).length + '/8</td></tr>';
  }).join("") + '</table><h2>Vergelijkingsbeelden en afwijkingen</h2>' + report.coverage.matrix.filter(entry => entry.webFile || entry.nativeFile).map(renderCase).join("") + '</html>';
}

function audit({ webDirectory, nativeDirectory, output, pngModule, diagnostic = false }) {
  if (!output || fs.existsSync(output)) throw new Error("Use a new report directory");
  const web = JSON.parse(fs.readFileSync(path.join(webDirectory, "web-manifest.json"), "utf8"));
  const native = nativeDirectory ? JSON.parse(fs.readFileSync(path.join(nativeDirectory, "native-manifest.json"), "utf8")) : { captures: [] };
  const actualCases = new Map();
  for (const entry of native.captures) {
    if (actualCases.has(entry.id)) throw new Error("Duplicate native capture");
    actualCases.set(entry.id, entry);
  }
  const referenceCases = new Map();
  for (const entry of web.captures) {
    if (referenceCases.has(entry.id)) throw new Error("Duplicate web capture");
    referenceCases.set(entry.id, entry);
  }
  fs.mkdirSync(output, { recursive: true });
  let PNG;
  const entries = [];
  for (const screen of screens) for (const variant of variants) {
    const id = caseID(screen.id, variant);
    const reference = referenceCases.get(id);
    const actual = actualCases.get(id);
    const entry = { id, screen: screen.id, ...variant, status: "not-compared", identical: false, acceptanceEligible: false };
    if (reference?.file) entry.webFile = evidencePath(webDirectory, reference.file);
    if (actual?.file) entry.nativeFile = evidencePath(nativeDirectory, actual.file);
    if (reference?.status === "capture-failed") { entry.status = "web-capture-failed"; entry.issues = [reference.error]; }
    else if (!entry.webFile || !entry.nativeFile) entry.status = entry.webFile ? "web-only" : entry.nativeFile ? "native-only" : "not-compared";
    else {
      entry.layout = compareLayout(reference, actual);
      entry.issues = pairIssues({ ...web, ...reference }, { ...native, ...actual });
      if (entry.issues.length) entry.status = "not-comparable";
      const measuredViewport = actual.viewport?.source === "measured-safe-area" && actual.viewport.width === variant.width * variant.scale && actual.viewport.height === variant.height * variant.scale;
      if (!entry.issues.length || (diagnostic && measuredViewport)) {
        PNG ||= require(pngModule || "pngjs").PNG;
        const referenceBytes = fs.readFileSync(entry.webFile);
        const actualBytes = fs.readFileSync(entry.nativeFile);
        const referenceInfo = pngSize(referenceBytes);
        const nativeInfo = pngSize(actualBytes);
        if (referenceInfo.width !== reference.width * reference.scale || referenceInfo.height !== reference.height * reference.scale) throw new Error("Reference PNG does not cover the entire declared app viewport at the original scale: " + id);
        const referenceImage = orientPixels(PNG.sync.read(referenceBytes), referenceInfo.orientation);
        const actualImage = cropPixels(orientPixels(PNG.sync.read(actualBytes), nativeInfo.orientation), actual.viewport);
        const comparison = comparePixels(referenceImage, actualImage);
        const { delta, ...metrics } = comparison;
        if (!entry.issues.length) Object.assign(entry, metrics, { acceptanceEligible: true });
        else { entry.reviewMetrics = metrics; entry.status = "diagnostic-only"; }
        Object.assign(entry, { exifOrientation: { reference: referenceInfo.orientation, native: nativeInfo.orientation }, referenceSha256: crypto.createHash("sha256").update(referenceBytes).digest("hex"), nativeSha256: crypto.createHash("sha256").update(actualBytes).digest("hex") });
        entry.nativeViewportFile = path.join(output, id + "-native-viewport.png");
        fs.writeFileSync(entry.nativeViewportFile, PNG.sync.write(actualImage));
        if (delta) {
          entry.deltaFile = path.join(output, id + "-diff.png");
          fs.writeFileSync(entry.deltaFile, PNG.sync.write({ width: referenceImage.width, height: referenceImage.height, data: delta }));
        }
      }
    }
    entries.push(entry);
  }
  const report = { schema: 1, webRevision: web.sourceMode === "working-tree" ? "Uncommitted local web files on base " + web.revision : web.revision, webSourceMode: web.sourceMode || "committed", webRenderer: web.renderer, webCaveat: web.caveat, webSourceFiles: web.files, nativeRevision: native.revision, exclusions, coverage: completeness(entries) };
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, "index.html"), renderReport(report, output));
  return report;
}

if (require.main === module) {
  try {
    const report = audit({ webDirectory: path.resolve(process.argv[2]), nativeDirectory: process.argv[3] === "-" ? undefined : path.resolve(process.argv[3]), output: path.resolve(process.argv[4]), pngModule: process.env.VISUAL_PNG_MODULE, diagnostic: process.env.VISUAL_DIAGNOSTIC === "1" });
    console.log(JSON.stringify({ total: report.coverage.total, proven: report.coverage.proven, complete: report.coverage.complete }));
    if (!report.coverage.complete) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { comparePixels, cropPixels, orientPixels, pairIssues, compareLayout, completeness, renderReport, audit };
