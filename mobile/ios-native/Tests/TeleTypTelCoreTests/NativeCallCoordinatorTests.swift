import XCTest
@testable import TeleTypTelCore

@MainActor
private final class CallSystemFixture: NativeCallSystem {
    struct Report { let id: UUID; let video: Bool; let completion: (Bool) -> Void }
    var reports: [Report] = []
    var ended: [UUID] = []
    func report(id: UUID, hasVideo: Bool, completion: @escaping (Bool) -> Void) {
        reports.append(Report(id: id, video: hasVideo, completion: completion))
    }
    func end(id: UUID, reason: NativeCallEndReason) { ended.append(id) }
}

@MainActor
private final class CallMediaFixture: NativeCallMediaDriver {
    var handles: [NativeCallHandle] = []
    var callbacks: [(NativeCallMediaEvent) -> Void] = []
    var stopped: [NativeCallHandle] = []
    var activation: [Bool] = []
    var muted: [Bool] = []
    func start(handle: NativeCallHandle, media: NativeCallMedia, event: @escaping (NativeCallMediaEvent) -> Void) {
        handles.append(handle)
        callbacks.append(event)
    }
    func stop(handle: NativeCallHandle) { stopped.append(handle) }
    func audioActivated(_ active: Bool) { activation.append(active) }
    func setMuted(_ muted: Bool) -> Bool { self.muted.append(muted); return true }
}

@MainActor
private final class CallDeadlineFixture: NativeCallDeadline {
    let at: TimeInterval
    let perform: () -> Void
    var cancelled = false
    init(at: TimeInterval, perform: @escaping () -> Void) { self.at = at; self.perform = perform }
    func cancel() { cancelled = true }
}

@MainActor
private final class CallClockFixture: NativeCallScheduling {
    var now: TimeInterval = 1000
    var deadlines: [CallDeadlineFixture] = []
    func schedule(after seconds: TimeInterval, perform: @escaping () -> Void) -> any NativeCallDeadline {
        let deadline = CallDeadlineFixture(at: now + seconds, perform: perform)
        deadlines.append(deadline)
        return deadline
    }
    func advance(to time: TimeInterval) {
        now = time
        for deadline in deadlines where !deadline.cancelled && deadline.at <= now {
            deadline.cancel()
            deadline.perform()
        }
    }
}

final class NativeCallCoordinatorTests: XCTestCase {
    @MainActor
    private func fixture() -> (NativeCallCoordinator, CallSystemFixture, CallMediaFixture, CallClockFixture) {
        let system = CallSystemFixture()
        let media = CallMediaFixture()
        let clock = CallClockFixture()
        let coordinator = NativeCallCoordinator(system: system, media: media, clock: clock)
        coordinator.configure(account: "fictional-account", consented: true)
        return (coordinator, system, media, clock)
    }

    private func payload(id: UUID = UUID(), profile: NativeCallMedia = .total) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["type": "incoming-call", "callId": id.uuidString,
            "sid": "fictional-session", "expiresAt": 1060, "hasVideo": profile.hasVideo, "mediaProfile": profile.rawValue])
    }

    @MainActor
    private func ring(_ coordinator: NativeCallCoordinator, _ system: CallSystemFixture,
                      profile: NativeCallMedia = .total) throws -> UUID {
        let id = UUID()
        coordinator.receive(try payload(id: id, profile: profile), registration: coordinator.lifecycle.generation) {}
        system.reports.last?.completion(true)
        return id
    }

    @MainActor
    func testPushReportsImmediatelyBeforeAnyMediaAndCompletesOnce() async throws {
        let (coordinator, system, media, _) = fixture()
        var completions = 0
        coordinator.receive(try payload(), registration: coordinator.lifecycle.generation) { completions += 1 }
        XCTAssertEqual(system.reports.count, 1)
        XCTAssertTrue(system.reports[0].video)
        XCTAssertTrue(media.handles.isEmpty)
        XCTAssertEqual(completions, 0)
        system.reports[0].completion(true)
        system.reports[0].completion(true)
        XCTAssertEqual(completions, 1)
        XCTAssertEqual(coordinator.lifecycle.current?.phase, .ringing)
        XCTAssertTrue(system.ended.isEmpty)
    }

    @MainActor
    func testValidatedJingleInvitationReportsThroughTheSameCallKitGate() throws {
        let (coordinator, system, media, clock) = fixture()
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "jingle-call", expiresAt: 1045,
                                                            media: .audioRtt, now: clock.now))
        var completions = 0
        coordinator.receive(invitation, registration: coordinator.lifecycle.generation) { completions += 1 }
        XCTAssertEqual(system.reports.count, 1)
        XCTAssertFalse(system.reports[0].video)
        XCTAssertTrue(media.handles.isEmpty)
        system.reports[0].completion(true)
        XCTAssertEqual(completions, 1)
        XCTAssertEqual(coordinator.lifecycle.current?.invitation, invitation)
        XCTAssertEqual(coordinator.lifecycle.current?.phase, .ringing)
    }

    @MainActor
    func testInvalidPushStillReportsAndEndsWithoutMedia() async {
        let (coordinator, system, media, _) = fixture()
        var completions = 0
        coordinator.receive(Data("{}".utf8), registration: coordinator.lifecycle.generation) { completions += 1 }
        XCTAssertEqual(system.reports.count, 1)
        system.reports[0].completion(true)
        system.reports[0].completion(true)
        XCTAssertEqual(system.ended, [system.reports[0].id])
        XCTAssertEqual(completions, 1)
        XCTAssertNil(coordinator.lifecycle.current)
        XCTAssertTrue(media.handles.isEmpty)
    }

    @MainActor
    func testDuplicatePushCannotEndActiveCall() async throws {
        let (coordinator, system, _, _) = fixture()
        let id = try ring(coordinator, system)
        coordinator.receive(try payload(id: id), registration: coordinator.lifecycle.generation) {}
        XCTAssertNotEqual(system.reports[1].id, id)
        system.reports[1].completion(true)
        XCTAssertFalse(system.ended.contains(id))
        XCTAssertEqual(coordinator.lifecycle.current?.handle.id, id)
    }

    @MainActor
    func testAnswerWaitsForAllTCMediaButNotAudioActivation() async throws {
        let (coordinator, system, media, _) = fixture()
        let id = try ring(coordinator, system)
        var results: [Bool] = []
        coordinator.answer(id: id) { results.append($0) }
        media.callbacks[0](.ready(.audio, contents: ["audio"], rttReady: false))
        media.callbacks[0](.ready(.total, contents: ["audio", "video"], rttReady: false))
        XCTAssertTrue(results.isEmpty)
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertEqual(results, [true])
        XCTAssertEqual(coordinator.lifecycle.current?.phase, .connected)
        XCTAssertFalse(media.activation.contains(true))
        coordinator.audioActivated(true)
        XCTAssertEqual(media.activation.last, true)
    }

    @MainActor
    func testAnswerTimeoutFailsOnceAndStopsMedia() async throws {
        let (coordinator, system, media, clock) = fixture()
        let id = try ring(coordinator, system)
        var results: [Bool] = []
        coordinator.answer(id: id) { results.append($0) }
        clock.advance(to: 1015)
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertEqual(results, [false])
        XCTAssertEqual(media.stopped.count, 1)
        XCTAssertEqual(system.ended, [id])
        XCTAssertNil(coordinator.lifecycle.current)
    }

    @MainActor
    func testRingingExpiryStopsCallWithoutStartingMedia() async throws {
        let (coordinator, system, media, clock) = fixture()
        let id = try ring(coordinator, system)
        clock.advance(to: 1060)
        XCTAssertEqual(system.ended, [id])
        XCTAssertTrue(media.handles.isEmpty)
        XCTAssertNil(coordinator.lifecycle.current)
    }

    @MainActor
    func testLogoutWhileAnsweringRejectsLateMedia() async throws {
        let (coordinator, system, media, _) = fixture()
        let id = try ring(coordinator, system)
        var results: [Bool] = []
        coordinator.answer(id: id) { results.append($0) }
        coordinator.reset()
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertEqual(results, [false])
        XCTAssertNil(coordinator.lifecycle.current)
        XCTAssertEqual(media.activation.last, false)
    }

    @MainActor
    func testLateCallKitReportCannotRestoreLoggedOutCall() async throws {
        let (coordinator, system, _, _) = fixture()
        var completions = 0
        coordinator.receive(try payload(), registration: coordinator.lifecycle.generation) { completions += 1 }
        coordinator.reset()
        system.reports[0].completion(true)
        XCTAssertNil(coordinator.lifecycle.current)
        XCTAssertEqual(completions, 1)
    }

    @MainActor
    func testMediaFailureEndsConnectedCall() async throws {
        let (coordinator, system, media, _) = fixture()
        let id = try ring(coordinator, system, profile: .audio)
        var results: [Bool] = []
        coordinator.answer(id: id) { results.append($0) }
        media.callbacks[0](.ready(.audio, contents: ["audio"], rttReady: false))
        media.callbacks[0](.failed)
        XCTAssertEqual(results, [true])
        XCTAssertEqual(system.ended, [id])
        XCTAssertNil(coordinator.lifecycle.current)
    }

    @MainActor
    func testMuteAndEndAreBoundToCurrentCall() async throws {
        let (coordinator, system, media, _) = fixture()
        let id = try ring(coordinator, system, profile: .audio)
        XCTAssertFalse(coordinator.setMuted(id: id, muted: true))
        coordinator.answer(id: id) { _ in }
        XCTAssertFalse(coordinator.setMuted(id: UUID(), muted: true))
        XCTAssertTrue(coordinator.setMuted(id: id, muted: true))
        XCTAssertEqual(media.muted, [true])
        XCTAssertFalse(coordinator.end(id: UUID()))
        XCTAssertTrue(coordinator.end(id: id))
        XCTAssertFalse(coordinator.end(id: id))
    }

    @MainActor
    func testReportFailureAndUnknownAnswerFailClosed() async throws {
        let (coordinator, system, media, _) = fixture()
        coordinator.receive(try payload(), registration: coordinator.lifecycle.generation) {}
        system.reports[0].completion(false)
        var results: [Bool] = []
        coordinator.answer(id: system.reports[0].id) { results.append($0) }
        XCTAssertEqual(results, [false])
        XCTAssertTrue(media.handles.isEmpty)
        XCTAssertNil(coordinator.lifecycle.current)
    }

    @MainActor
    func testOldMediaAndDeadlineCannotEndNextCall() async throws {
        let (coordinator, system, media, clock) = fixture()
        let first = try ring(coordinator, system)
        coordinator.answer(id: first) { _ in }
        let oldDeadline = try XCTUnwrap(clock.deadlines.last)
        coordinator.end(id: first)
        let second = try ring(coordinator, system)
        media.callbacks[0](.ended)
        oldDeadline.perform()
        XCTAssertEqual(coordinator.lifecycle.current?.handle.id, second)
        XCTAssertFalse(system.ended.contains(second))
    }
}
