const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
function section(start, end) {
  assert.ok(client.includes(start) && client.includes(end));
  return client.slice(client.indexOf(start), client.indexOf(end));
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function track(kind) {
  return { kind, enabled: true, stopped: false, stop() { this.stopped = true; } };
}
function stream(tracks) {
  return { getTracks: () => [...tracks], getVideoTracks: () => tracks.filter(item => item.kind === "video"),
    getAudioTracks: () => tracks.filter(item => item.kind === "audio"),
    addTrack(item) { tracks.push(item); }, removeTrack(item) { tracks.splice(tracks.indexOf(item), 1); } };
}
function fixture() {
  const video = track("video"), audio = track("audio"), replacement = track("video");
  const localStream = stream([video, audio]);
  const sender = { track: video, async replaceTrack(next) { this.track = next; } };
  const call = { localStream, pc: { getSenders: () => [sender] } };
  const state = { call, mediaSettings: { videoMessageFacingMode: "user" } };
  const capture = { calls: 0, async getUserMedia() { this.calls++; return stream([replacement]); } };
  let updates = 0;
  const context = vm.createContext({ state, navigator: { mediaDevices: capture },
    el: { localVideo: {}, callPanel: { hidden: true } },
    createVideoOnlyConstraints: () => ({ audio: false, video: true }),
    createAudioOnlyConstraints: () => ({ audio: true, video: false }),
    markMediaCaptureTransition() {}, watchCallVideoTrack() {}, updateVideoElementSource() {},
    refreshMediaDevices: async () => {}, updateCallUi() { updates++; }, t: (_, fallback) => fallback });
  vm.runInContext(section("  function stopStream(stream)", "  function totalConversationTranscript(call)"), context);
  return { context, state, call, video, audio, replacement, sender, capture, updates: () => updates,
    switch: () => vm.runInContext('replaceLocalMediaTrack("video")', context) };
}

test("iPhone front/back selections are not inverted", () => {
  const context = vm.createContext({ state: { mediaSettings: { videoMessageFacingMode: "user" } }, isAppleMobileBrowser: () => true });
  vm.runInContext(section("  function selectedVideoFacingModeForCapture()", "  function isAppleMobileBrowser()"), context);
  assert.equal(vm.runInContext("selectedVideoFacingModeForCapture()", context), "user");
  context.state.mediaSettings.videoMessageFacingMode = "environment";
  assert.equal(vm.runInContext("selectedVideoFacingModeForCapture()", context), "environment");
});

test("Camera swap preserves microphone, camera-off state and the existing call", async () => {
  const setup = fixture();
  setup.video.enabled = false;
  await setup.switch();
  assert.equal(setup.state.call, setup.call);
  assert.equal(setup.sender.track, setup.replacement);
  assert.equal(setup.replacement.enabled, false);
  assert.equal(setup.video.stopped, true);
  assert.equal(setup.audio.stopped, false);
  assert.equal(setup.call.localStream.getAudioTracks()[0], setup.audio);
});

test("Rejected track replacement releases the new camera and keeps the old stream", async () => {
  const setup = fixture();
  setup.sender.replaceTrack = async () => { throw new Error("replace failed"); };
  await assert.rejects(setup.switch(), /replace failed/);
  assert.equal(setup.replacement.stopped, true);
  assert.equal(setup.video.stopped, false);
  assert.equal(setup.audio.stopped, false);
});

for (const boundary of ["capture", "replace"]) {
  test(`Ending a call during ${boundary} discards late camera results`, async () => {
    const setup = fixture();
    const pending = deferred();
    if (boundary === "capture") setup.capture.getUserMedia = () => pending.promise;
    else setup.sender.replaceTrack = () => pending.promise;
    const switching = setup.switch();
    await Promise.resolve();
    setup.state.call = null;
    pending.resolve(boundary === "capture" ? stream([setup.replacement]) : undefined);
    await switching;
    assert.equal(setup.replacement.stopped, true);
    assert.equal(setup.updates(), 0);
    assert.equal(setup.call.localStream.getVideoTracks()[0], setup.video);
  });
}

test("Rapid camera requests cannot capture competing streams", async () => {
  const setup = fixture();
  const pending = deferred();
  setup.capture.getUserMedia = () => { setup.capture.calls++; return pending.promise; };
  const first = setup.switch();
  const second = setup.switch();
  pending.resolve(stream([setup.replacement]));
  await Promise.all([first, second]);
  assert.equal(setup.capture.calls, 1);
  assert.equal(setup.call.localStream.getVideoTracks().length, 1);
});

test("Denied camera permission keeps the original tracks and permits a retry", async () => {
  const setup = fixture();
  setup.capture.getUserMedia = async () => { throw new Error("permission denied"); };
  await assert.rejects(setup.switch(), /permission denied/);
  assert.equal(setup.video.stopped, false);
  assert.equal(setup.audio.stopped, false);
  setup.capture.getUserMedia = async () => stream([setup.replacement]);
  await setup.switch();
  assert.equal(setup.sender.track, setup.replacement);
});

test("Repeated front/back swaps keep one camera and the same microphone", async () => {
  const setup = fixture();
  const cameras = [setup.video];
  for (let index = 0; index < 6; index++) {
    const next = track("video");
    cameras.push(next);
    setup.capture.getUserMedia = async () => stream([next]);
    await setup.switch();
    assert.equal(setup.sender.track, next);
    assert.deepEqual(setup.call.localStream.getVideoTracks(), [next]);
    assert.equal(setup.audio.stopped, false);
  }
  assert.ok(cameras.slice(0, -1).every(camera => camera.stopped));
  assert.equal(cameras.at(-1).stopped, false);
});

test("Camera disabled while replacement is pending stays disabled", async () => {
  const setup = fixture();
  const pending = deferred();
  setup.sender.replaceTrack = () => pending.promise;
  const switching = setup.switch();
  await Promise.resolve();
  setup.video.enabled = false;
  pending.resolve();
  await switching;
  assert.equal(setup.replacement.enabled, false);
});

test("Failed flip restores the camera selection and persisted preferences", async () => {
  const setup = fixture();
  setup.call.mediaKind = "video";
  setup.context.el.callVideoFacingInput = { value: "user" };
  const statuses = [];
  let saved;
  Object.assign(setup.context, {
    mediaSettingsStorageKey: "fixture-media",
    localStorage: { setItem(_, value) { saved = JSON.parse(value); } },
    setMediaStatus(message) { statuses.push(message); },
    saveMediaSettingsFromControls() {
      setup.state.mediaSettings.videoMessageFacingMode = setup.context.el.callVideoFacingInput.value;
    },
    renderMediaDeviceSelects() {
      setup.context.el.callVideoFacingInput.value = setup.state.mediaSettings.videoMessageFacingMode;
    }
  });
  vm.runInContext(section("  async function toggleCallVideoFacingMode()", "  function mediaControlsForSource(source)")
    + section("  function normalizeVideoFacingMode(value)", "  function isAppleMobileBrowser()")
    + section('  async function handleMediaSettingsChange(kind, source = "main")', "  function saveRemoteVolumeFromControl()"), setup.context);
  setup.capture.getUserMedia = async () => { throw new Error("permission denied"); };
  await vm.runInContext("toggleCallVideoFacingMode()", setup.context);
  assert.equal(setup.context.el.callVideoFacingInput.value, "user");
  assert.equal(saved.videoMessageFacingMode, "user");
  assert.match(statuses.at(-1), /Camera switch failed/);
  assert.equal(setup.video.stopped, false);
});
