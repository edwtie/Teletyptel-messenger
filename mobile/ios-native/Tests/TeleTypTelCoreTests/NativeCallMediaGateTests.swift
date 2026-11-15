import XCTest
@testable import TeleTypTelCore

@MainActor
private final class GatedMediaFixture: NativeCallMediaDriver {
    var starts = 0
    var stops = 0
    var audio: [Bool] = []
    var callback: ((NativeCallMediaEvent) -> Void)?
    func start(handle: NativeCallHandle, media: NativeCallMedia, event: @escaping (NativeCallMediaEvent) -> Void) {
        starts += 1; callback = event
    }
    func stop(handle: NativeCallHandle) { stops += 1 }
    func audioActivated(_ active: Bool) { audio.append(active) }
    func setMuted(_ muted: Bool) -> Bool { true }
}

@MainActor
final class NativeCallMediaGateTests: XCTestCase {
    private func handle() -> NativeCallHandle { NativeCallHandle(id: UUID(), sid: "call-1", generation: UUID()) }

    func testCaptureWaitsForPreparationAndReadinessStillComesFromMedia() async throws {
        let media = GatedMediaFixture(), gate = NativeCallMediaGate(media: media)
        var continuation: CheckedContinuation<Void, Error>?
        var events = 0
        let call = handle()
        gate.prepare = { _, _ in try await withCheckedThrowingContinuation { continuation = $0 } }
        gate.start(handle: call, media: .total) { _ in events += 1 }
        await settle { continuation != nil }
        gate.audioActivated(true)
        XCTAssertEqual(media.starts, 0)
        XCTAssertEqual(events, 0)
        XCTAssertFalse(gate.setMuted(true))
        continuation?.resume(); continuation = nil
        await settle { media.starts == 1 }
        XCTAssertEqual(events, 0)
        media.callback?(.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertEqual(events, 1)
        XCTAssertEqual(media.audio, [true])
        gate.stop(handle: call)
        XCTAssertEqual(media.stops, 1)
        media.callback?(.failed)
        XCTAssertEqual(events, 1)
    }

    func testStoppedPreparationCannotStartMediaOrNotifyANewerCall() async throws {
        let media = GatedMediaFixture(), gate = NativeCallMediaGate(media: media)
        var continuation: CheckedContinuation<Void, Error>?
        var events = 0
        var released = 0
        let first = handle(), second = handle()
        gate.released = { _ in released += 1 }
        gate.prepare = { _, _ in try await withCheckedThrowingContinuation { continuation = $0 } }
        gate.start(handle: first, media: .audio) { _ in events += 1 }
        await settle { continuation != nil }
        gate.stop(handle: first)
        gate.prepare = { _, _ in }
        gate.start(handle: second, media: .audio) { _ in events += 1 }
        await settle { media.starts == 1 }
        continuation?.resume(); continuation = nil
        for _ in 0..<20 { await Task.yield() }
        XCTAssertEqual(media.starts, 1)
        XCTAssertEqual(events, 0)
        XCTAssertEqual(released, 1)
        gate.stop(handle: second)
        XCTAssertEqual(media.stops, 1)
    }

    func testMissingOrRejectedPreparationNeverStartsCapture() async {
        for configured in [false, true] {
            let media = GatedMediaFixture(), gate = NativeCallMediaGate(media: media)
            var events = 0
            let call = handle()
            if configured { gate.prepare = { _, _ in throw NativeJingleFailure.rejected } }
            gate.start(handle: call, media: .total) { _ in events += 1 }
            await settle { events == 1 }
            XCTAssertEqual(media.starts, 0)
            gate.stop(handle: call)
            XCTAssertEqual(media.stops, 0)
        }
    }

    private func settle(_ ready: () -> Bool) async {
        for _ in 0..<200 {
            if ready() { return }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTFail("Media preparation did not settle")
    }
}
