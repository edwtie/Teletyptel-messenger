const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function fixture(upload, connected = true) {
  const summary = {};
  const context = vm.createContext({ el: { connectionSummary: summary },
    updateServerSettingsReadonly() {}, t: (_, fallback) => fallback,
    isXmppRttConnected: () => connected, isRelayConnected: () => false,
    uploadChunkSize: 10, uploadFileInChunks: upload, uploadFileDirect: upload });
  vm.runInContext("let uploadStatusOwner = null;"
    + section("  async function runFileUpload(", "  async function uploadFileDirect(")
    + section("  function setConnectionStatus(", "  function appendDebug("), context);
  return { summary, context, run: size => vm.runInContext(`runFileUpload({ size: ${size} })`, context) };
}

test("Direct uploads and final recording chunks restore the actual connection status", async () => {
  for (const size of [1, 20]) {
    const setup = fixture(async (_, progress) => { progress?.("Uploading... 12/12"); return { file: {} }; });
    await setup.run(size);
    assert.equal(setup.summary.textContent, "XMPP connected");
    assert.equal(setup.summary.className, "status-good");
  }
});

test("Failed uploads restore disconnected state and preserve the rejection", async () => {
  const setup = fixture(async () => { throw new Error("Upload failed"); }, false);
  await assert.rejects(setup.run(20), /Upload failed/);
  assert.equal(setup.summary.textContent, "Not connected.");
});

test("Late upload completion cannot overwrite a newer connection error", async () => {
  let finish;
  const setup = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = setup.run(20);
  vm.runInContext('setConnectionStatus("Connection lost", "danger")', setup.context);
  finish({ file: {} });
  await pending;
  assert.equal(setup.summary.textContent, "Connection lost");
});

test("Older parallel uploads cannot clear the newer upload progress", async () => {
  const completions = [];
  const setup = fixture((_, progress) => {
    progress("Uploading... 1/12");
    return new Promise(resolve => completions.push(resolve));
  });
  const first = setup.run(20), second = setup.run(20);
  completions[0]({ file: {} });
  await first;
  assert.equal(setup.summary.textContent, "Uploading... 1/12");
  completions[1]({ file: {} });
  await second;
  assert.equal(setup.summary.textContent, "XMPP connected");
});
