import XCTest
@testable import TeleTypTelCore

@MainActor
private final class CallSystemFixture: NativeCallSystem {
    struct Report { let id: UUID; let video: Bool; let completion: (Bool) -> Void }
    struct Start { let id: UUID; let peer: String; let video: Bool; let completion: (Bool) -> Void }
    var reports: [Report] = []
    var starts: [Start] = []
    var connected: [UUID] = []
    var ended: [UUID] = []
    func report(id: UUID, hasVideo: Bool, completion: @escaping (Bool) -> Void) {
        reports.append(Report(id: id, video: hasVideo, completion: completion))
    }
    func start(id: UUID, peer: String, hasVideo: Bool, completion: @escaping (Bool) -> Void) {
        starts.append(Start(id: id, peer: peer, video: hasVideo, completion: completion))
    }
    func connected(id: UUID) { connected.append(id) }
    func end(id: UUID, reason: NativeCallEndReason) { ended.append(id) }
}

@MainActor
private final class CallMediaFixture: NativeCallMediaDriver {
    var handles: [NativeCallHandle] = []
    var callbacks: [(NativeCallMediaEvent) -> Void] = []
    var stopped: [NativeCallHandle] = []
    var activation: [Bool] = []
    var muted: [Bool] = []
    var tones: [String] = []
    var dtmfAccepted = true
    var holds: [Bool] = []
    var holdAccepted = true
    var pauseHold = false
    var pendingHold: CheckedContinuation<Bool, Never>?
    func start(handle: NativeCallHandle, media: NativeCallMedia, event: @escaping (NativeCallMediaEvent) -> Void) {
        handles.append(handle)
        callbacks.append(event)
    }
    func stop(handle: NativeCallHandle) { stopped.append(handle) }
    func audioActivated(_ active: Bool) { activation.append(active) }
    func setMuted(_ muted: Bool) -> Bool { self.muted.append(muted); return true }
    func sendDtmf(_ tone: String) -> Bool { tones.append(tone); return dtmfAccepted }
    func setHeld(_ held: Bool) async -> Bool {
        holds.append(held)
        if pauseHold { return await withCheckedContinuation { pendingHold = $0 } }
        return holdAccepted
    }
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
    func testHoldRequiresConnectedExactCallAndPreservesStateOnRejection() async throws {
        let (coordinator, system, media, _) = fixture()
        let identifier = try ring(coordinator, system)
        let ringing = await coordinator.setHeld(id: identifier, held: true)
        XCTAssertFalse(ringing)
        coordinator.answer(id: identifier) { _ in }
        media.callbacks.last?(.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        let foreign = await coordinator.setHeld(id: UUID(), held: true)
        XCTAssertFalse(foreign)
        let held = await coordinator.setHeld(id: identifier, held: true)
        XCTAssertTrue(held)
        XCTAssertTrue(coordinator.isHeld)
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "1"))
        media.holdAccepted = false
        let rejected = await coordinator.setHeld(id: identifier, held: false)
        XCTAssertFalse(rejected)
        XCTAssertTrue(coordinator.isHeld)
        media.holdAccepted = true
        let resumed = await coordinator.setHeld(id: identifier, held: false)
        XCTAssertTrue(resumed)
        XCTAssertFalse(coordinator.isHeld)
        XCTAssertTrue(coordinator.sendDtmf(id: identifier, tone: "#"))
        _ = coordinator.end(id: identifier)
    }

    @MainActor
    func testLateHoldAfterHangupCannotAffectANewCall() async throws {
        let (coordinator, system, media, _) = fixture()
        let identifier = try ring(coordinator, system)
        coordinator.answer(id: identifier) { _ in }
        media.callbacks.last?(.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        media.pauseHold = true
        let operation = Task { await coordinator.setHeld(id: identifier, held: true) }
        for _ in 0..<100 where media.pendingHold == nil { await Task.yield() }
        XCTAssertNotNil(media.pendingHold)
        XCTAssertTrue(coordinator.holdPending)
        let concurrent = await coordinator.setHeld(id: identifier, held: false)
        XCTAssertFalse(concurrent)
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "1"))
        _ = coordinator.end(id: identifier)
        let next = try ring(coordinator, system)
        media.pendingHold?.resume(returning: true)
        media.pendingHold = nil
        let late = await operation.value
        XCTAssertFalse(late)
        XCTAssertFalse(coordinator.isHeld)
        XCTAssertFalse(coordinator.holdPending)
        _ = coordinator.end(id: next)
    }
    @MainActor
    func testDtmfRequiresTheExactConnectedCallAndAnAcceptedMediaOperation() async throws {
        let (coordinator, system, media, _) = fixture()
        let identifier = try ring(coordinator, system)
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "1"))
        coordinator.answer(id: identifier) { _ in }
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "1"))
        media.callbacks.last?(.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertTrue(coordinator.sendDtmf(id: identifier, tone: "#"))
        XCTAssertFalse(coordinator.sendDtmf(id: UUID(), tone: "1"))
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "12"))
        media.dtmfAccepted = false
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "2"))
        XCTAssertEqual(media.tones, ["#", "2"])
        _ = coordinator.end(id: identifier)
        XCTAssertFalse(coordinator.sendDtmf(id: identifier, tone: "3"))
        XCTAssertEqual(media.tones, ["#", "2"])
    }
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
    func testPushContextIsDeliveredBeforeCallKitReportAndDeclineCleansItWithoutMedia() throws {
        let (coordinator, system, media, _) = fixture()
        let id = UUID()
        var context: UUID?
        var ended: [UUID] = []
        coordinator.invitationReceived = { invitation in
            XCTAssertTrue(system.reports.isEmpty)
            XCTAssertTrue(media.handles.isEmpty)
            context = invitation.id
        }
        coordinator.ended = { handle in
            XCTAssertNil(coordinator.currentHandle)
            XCTAssertEqual(system.ended, [id])
            ended.append(handle.id)
        }
        coordinator.receive(try payload(id: id), registration: coordinator.lifecycle.generation) {}
        XCTAssertEqual(context, id)
        system.reports[0].completion(true)
        XCTAssertTrue(coordinator.end(id: id))
        XCTAssertTrue(media.handles.isEmpty)
        XCTAssertEqual(ended, [id])
        XCTAssertFalse(coordinator.end(id: id))
        XCTAssertEqual(ended, [id])
    }

    @MainActor
    func testCallKitAnswerWaitsForGateAndActualCompleteMediaReadiness() async throws {
        let system = CallSystemFixture(), media = CallMediaFixture(), clock = CallClockFixture()
        let gate = NativeCallMediaGate(media: media)
        let coordinator = NativeCallCoordinator(system: system, media: gate, clock: clock)
        coordinator.configure(account: "fictional-account", consented: true)
        var prepared: CheckedContinuation<Void, Error>?
        gate.prepare = { _, _ in try await withCheckedThrowingContinuation { prepared = $0 } }
        let id = try ring(coordinator, system)
        var answers: [Bool] = []
        coordinator.answer(id: id) { answers.append($0) }
        for _ in 0..<100 { if prepared != nil { break }; await Task.yield() }
        XCTAssertNotNil(prepared)
        XCTAssertTrue(media.handles.isEmpty)
        XCTAssertTrue(answers.isEmpty)
        prepared?.resume(); prepared = nil
        for _ in 0..<100 { if !media.handles.isEmpty { break }; await Task.yield() }
        XCTAssertEqual(media.handles.count, 1)
        XCTAssertTrue(answers.isEmpty)
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertEqual(answers, [true])
        XCTAssertTrue(coordinator.isConnected)
        _ = coordinator.end(id: id)
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

    @MainActor
    func testOutgoingCallWaitsForCallKitAndExactTotalConversationMedia() throws {
        let (coordinator, system, media, _) = fixture()
        var results: [Bool] = []
        let id = try XCTUnwrap(coordinator.startOutgoing(peer: "peer@example.test/phone", sid: "outgoing-session",
                                                         media: .total) { results.append($0) })
        XCTAssertEqual(system.starts.count, 1)
        XCTAssertEqual(system.starts[0].peer, "peer@example.test/phone")
        XCTAssertTrue(system.starts[0].video)
        XCTAssertTrue(media.handles.isEmpty)
        system.starts[0].completion(true)
        XCTAssertEqual(results, [true])
        XCTAssertTrue(coordinator.performStart(id: id))
        XCTAssertEqual(media.handles.count, 1)
        media.callbacks[0](.ready(.video, contents: ["audio", "video"], rttReady: false))
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: false))
        XCTAssertFalse(coordinator.isConnected)
        media.callbacks[0](.ready(.total, contents: ["audio", "video", "rtt"], rttReady: true))
        XCTAssertTrue(coordinator.isConnected)
        XCTAssertEqual(system.connected, [id])
    }

    @MainActor
    func testOutgoingTimeoutAndLateMediaFailClosed() throws {
        let (coordinator, system, media, clock) = fixture()
        var results: [Bool] = []
        let id = try XCTUnwrap(coordinator.startOutgoing(peer: "peer@example.test/tablet", sid: "outgoing-timeout",
                                                         media: .audioRtt) { results.append($0) })
        system.starts[0].completion(true)
        XCTAssertTrue(coordinator.performStart(id: id))
        clock.advance(to: 1015)
        media.callbacks[0](.ready(.audioRtt, contents: ["audio", "rtt"], rttReady: true))
        XCTAssertNil(coordinator.currentHandle)
        XCTAssertFalse(coordinator.isConnected)
        XCTAssertEqual(system.ended, [id])
        XCTAssertEqual(results, [true])
    }

    @MainActor
    func testOutgoingTransactionFailureAndInvalidPeerDoNotStartMedia() {
        let (coordinator, system, media, _) = fixture()
        var invalid: [Bool] = []
        XCTAssertNil(coordinator.startOutgoing(peer: "peer@example.test", sid: "missing-resource",
                                               media: .audio) { invalid.append($0) })
        XCTAssertEqual(invalid, [false])
        var failed: [Bool] = []
        let id = coordinator.startOutgoing(peer: "peer@example.test/phone", sid: "transaction-failure",
                                           media: .audio) { failed.append($0) }
        XCTAssertNotNil(id)
        system.starts[0].completion(false)
        XCTAssertEqual(failed, [false])
        XCTAssertNil(coordinator.currentHandle)
        XCTAssertTrue(media.handles.isEmpty)
    }

    @MainActor
    func testIncomingInvitationCannotReplaceOutgoingCall() throws {
        let (coordinator, system, _, _) = fixture()
        let outgoingID = try XCTUnwrap(coordinator.startOutgoing(peer: "peer@example.test/phone",
                                                                 sid: "active-outgoing", media: .audio) { _ in })
        var completions = 0
        coordinator.receive(try payload(), registration: coordinator.lifecycle.generation) { completions += 1 }
        XCTAssertEqual(system.reports.count, 1)
        XCTAssertEqual(coordinator.currentHandle?.id, outgoingID)
        system.reports[0].completion(true)
        XCTAssertEqual(completions, 1)
        XCTAssertEqual(coordinator.currentHandle?.id, outgoingID)
        XCTAssertFalse(system.ended.contains(outgoingID))
    }
}
