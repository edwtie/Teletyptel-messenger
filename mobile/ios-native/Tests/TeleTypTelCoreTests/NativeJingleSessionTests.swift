import XCTest
@testable import TeleTypTelCore

private actor SessionSignallingFixture: NativeJingleSending {
    var sent: [String] = []
    var replies: [NativeJingleRejection?] = []
    var released: [UUID] = []
    var reject = false
    var pause = false
    var pendingExchange: CheckedContinuation<Void, Error>?
    func bindCall(peer: String, sid: String) async throws -> UUID { UUID() }
    func exchangeJingle(binding: UUID, xml: String) async throws {
        if reject { throw NativeJingleFailure.rejected }
        sent.append(xml)
        if pause { try await withCheckedThrowingContinuation { pendingExchange = $0 } }
    }
    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws { replies.append(rejection) }
    func unbindCall(_ binding: UUID) async { released.append(binding) }
    func fail() { reject = true }
    func pauseExchange() { pause = true }
    func finishExchange() { pause = false; pendingExchange?.resume(); pendingExchange = nil }
    func hasPending() -> Bool { pendingExchange != nil }
}

@MainActor
private final class SessionMediaFixture: NativeMediaNegotiating {
    var closed = 0
    var accepted = 0
    var applied = 0
    var fail = false
    var pauseOffer = false
    var pending: CheckedContinuation<NativeJingleMedia, Error>?
    func createOffer() async throws -> NativeJingleMedia {
        if pauseOffer { return try await withCheckedThrowingContinuation { pending = $0 } }
        return try description(answer: false)
    }
    func acceptOffer(_ xml: String) async throws -> NativeJingleMedia {
        if fail { throw NativeJingleFailure.rejected }
        accepted += 1
        return try description(answer: true)
    }
    func applyAnswer(_ xml: String) async throws {
        if fail { throw NativeJingleFailure.rejected }
        applied += 1
    }
    func close() { closed += 1 }
    func description(answer: Bool) throws -> NativeJingleMedia {
        let fingerprint = Array(repeating: "AB", count: 32).joined(separator: ":")
        let lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0", "m=audio 9 UDP/TLS/RTP/SAVPF 0",
            "c=IN IP4 0.0.0.0", "a=mid:audio", "a=sendrecv", "a=rtcp-mux", "a=rtpmap:0 PCMU/8000",
            "a=ice-ufrag:abcd", "a=ice-pwd:abcdefghijklmnopqrstuv", "a=fingerprint:sha-256 \(fingerprint)",
            "a=setup:\(answer ? "active" : "actpass")", "a=candidate:1 1 udp 2122260223 127.0.0.1 50000 typ host generation 0", ""]
        return try NativeJingleMedia.fromSDP(lines.joined(separator: "\r\n"), sid: "call-1",
            action: answer ? "session-accept" : "session-initiate", profile: .audio)
    }
}

@MainActor
private final class JingleClockFixture: NativeCallScheduling {
    final class Deadline: NativeCallDeadline {
        let action: () -> Void
        var cancelled = false
        init(_ action: @escaping () -> Void) { self.action = action }
        func cancel() { cancelled = true }
    }
    var now: TimeInterval = 0
    var timers: [Deadline] = []
    var delays: [TimeInterval] = []
    func schedule(after seconds: TimeInterval, perform: @escaping () -> Void) -> any NativeCallDeadline {
        let timer = Deadline(perform)
        timers.append(timer)
        delays.append(seconds)
        return timer
    }
}

final class NativeJingleSessionTests: XCTestCase {
    private let binding = UUID()
    private let peer = "other@localhost/phone"
    @MainActor
    private func fixture(_ role: NativeJingleSession.Role = .responder, clock: JingleClockFixture? = nil) throws -> (NativeJingleSession, SessionMediaFixture, SessionSignallingFixture) {
        let media = SessionMediaFixture(), signalling = SessionSignallingFixture()
        return (try NativeJingleSession(role: role, binding: binding, peer: peer, sid: "call-1", profile: .audio,
            signalling: signalling, media: media, clock: clock), media, signalling)
    }
    private func request(_ action: String, _ xml: String, wrongPeer: Bool = false, wrongBinding: Bool = false) -> NativeJingleRequest {
        let identifier = UUID().uuidString
        let sender = wrongPeer ? "attacker@localhost/phone" : peer
        let frame = "<iq xmlns='jabber:client' type='set' from='\(sender)' id='\(identifier)'>\(xml)</iq>"
        return NativeJingleRequest(binding: wrongBinding ? UUID() : binding, peer: sender,
            sid: "call-1", action: action, xml: frame, token: UUID(), identifier: identifier)
    }
    private var termination: String { "<jingle xmlns='urn:xmpp:jingle:1' sid='call-1' action='session-terminate'><reason><success/></reason></jingle>" }

    private func holdInfo(_ info: String) -> String {
        "<jingle xmlns='urn:xmpp:jingle:1' sid='call-1' action='session-info'>\(info)</jingle>"
    }

    @MainActor func testHoldWaitsForIQResultRejectsConcurrentAndKeepsRejectedState() async throws {
        let (session, media, signalling) = try fixture()
        do { try await session.setHeld(true); XCTFail("held before negotiation") } catch {}
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        try await session.accept()
        await signalling.pauseExchange()
        let operation = Task { try await session.setHeld(true) }
        for _ in 0..<100 { if await signalling.hasPending() { break }; await Task.yield() }
        XCTAssertFalse(session.isLocallyHeld)
        do { try await session.setHeld(false); XCTFail("concurrent hold") } catch {}
        await signalling.finishExchange()
        try await operation.value
        XCTAssertTrue(session.isLocallyHeld)
        let sent = await signalling.sent
        XCTAssertEqual(sent.last, holdInfo("<hold xmlns='urn:xmpp:jingle:apps:rtp:info:1'/>"))
        await signalling.fail()
        do { try await session.setHeld(false); XCTFail("rejected resume accepted") } catch {}
        XCTAssertTrue(session.isLocallyHeld)
        XCTAssertEqual(session.phase, .negotiated)
        await session.stop()
    }

    @MainActor func testRemoteHoldValidatesPayloadAndPreservesIndependentLocalHold() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        try await session.accept()
        let hold = holdInfo("<hold xmlns='urn:xmpp:jingle:apps:rtp:info:1'/>")
        await session.receive(request("session-info", hold, wrongPeer: true))
        XCTAssertFalse(session.isRemotelyHeld)
        await session.receive(request("session-info", hold.replacingOccurrences(of: "info:1", with: "info:fake")))
        XCTAssertFalse(session.isRemotelyHeld)
        await session.receive(request("session-info", hold))
        XCTAssertTrue(session.isRemotelyHeld)
        try await session.setHeld(true)
        await session.receive(request("session-info", holdInfo("<unhold xmlns='urn:xmpp:jingle:apps:rtp:info:1'/>")))
        XCTAssertFalse(session.isRemotelyHeld)
        XCTAssertTrue(session.isLocallyHeld)
        await session.receive(request("session-info", holdInfo("<hold xmlns='urn:xmpp:jingle:apps:rtp:info:1' name='audio'/>")))
        XCTAssertFalse(session.isRemotelyHeld)
        let replies = await signalling.replies
        XCTAssertEqual(replies.last!, .featureNotImplemented)
        await session.stop()
    }

    @MainActor func testLateHoldAcknowledgementAfterSessionEndCannotRestoreState() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        try await session.accept()
        await signalling.pauseExchange()
        let operation = Task { try await session.setHeld(true) }
        for _ in 0..<100 { if await signalling.hasPending() { break }; await Task.yield() }
        await session.stop()
        await signalling.finishExchange()
        do { try await operation.value; XCTFail("late hold accepted") } catch {}
        XCTAssertEqual(session.phase, .ended)
        XCTAssertFalse(session.isLocallyHeld)
    }

    @MainActor func testIncomingAcknowledgmentDoesNotStartMedia() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        XCTAssertEqual(session.phase, .ringing)
        XCTAssertEqual(media.accepted, 0)
        let replies = await signalling.replies
        XCTAssertEqual(replies.count, 1)
        XCTAssertNil(replies[0])
        try await session.accept()
        XCTAssertEqual(media.accepted, 1)
        XCTAssertEqual(session.phase, .negotiated)
        let sent = await signalling.sent
        XCTAssertEqual(sent.count, 1)
        XCTAssertTrue(sent[0].contains("session-accept"))
    }

    @MainActor func testOutgoingIQResultDoesNotMeanConnected() async throws {
        let (session, media, _) = try fixture(.initiator)
        try await session.start()
        XCTAssertEqual(session.phase, .waiting)
        XCTAssertEqual(media.applied, 0)
        await session.receive(request("session-accept", try media.description(answer: true).xml))
        XCTAssertEqual(session.phase, .negotiated)
        XCTAssertEqual(media.applied, 1)
    }

    @MainActor func testForeignPeerAndBindingCannotControlSession() async throws {
        let (session, media, signalling) = try fixture()
        let offer = try media.description(answer: false).xml
        await session.receive(request("session-initiate", offer, wrongPeer: true))
        await session.receive(request("session-initiate", offer, wrongBinding: true))
        await session.receive(request("session-terminate", termination, wrongPeer: true))
        XCTAssertEqual(session.phase, .idle)
        XCTAssertEqual(media.closed, 0)
        let replies = await signalling.replies
        XCTAssertEqual(replies, [.unexpectedRequest, .unexpectedRequest, .unexpectedRequest])
    }

    @MainActor func testMalformedOfferAndWrongProfileDoNotRing() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-initiate", "<jingle/>"))
        await session.receive(request("session-initiate", try media.description(answer: false).xml.replacingOccurrences(of: "media='audio'", with: "media='video'")))
        XCTAssertEqual(session.phase, .idle)
        let replies = await signalling.replies
        XCTAssertEqual(replies, [.notAcceptable, .notAcceptable])
    }

    @MainActor func testDuplicateOfferAndUnsupportedActionAreRejected() async throws {
        let (session, media, signalling) = try fixture()
        let offer = request("session-initiate", try media.description(answer: false).xml)
        await session.receive(offer)
        await session.receive(offer)
        await session.receive(request("transport-replace", "<jingle/>"))
        let replies = await signalling.replies
        XCTAssertEqual(replies, [nil, .unexpectedRequest, .featureNotImplemented])
        XCTAssertEqual(session.phase, .ringing)
    }

    @MainActor func testTerminationClosesOnceAndReleasesBinding() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-terminate", termination))
        await session.stop()
        XCTAssertEqual(session.phase, .ended)
        XCTAssertEqual(media.closed, 1)
        let released = await signalling.released
        XCTAssertEqual(released, [binding])
        do { try await session.accept(); XCTFail("ended session accepted") } catch {}
    }

    @MainActor func testMalformedTerminationCannotCloseCall() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-terminate", termination.replacingOccurrences(of: "<success/>", with: "<success/><cancel/>")))
        XCTAssertEqual(media.closed, 0)
        let replies = await signalling.replies
        XCTAssertEqual(replies, [.badRequest])
    }

    @MainActor func testLateOfferAfterLogoutCannotSignal() async throws {
        let (session, media, signalling) = try fixture(.initiator)
        media.pauseOffer = true
        let operation = Task { try await session.start() }
        for _ in 0..<100 where media.pending == nil { await Task.yield() }
        XCTAssertNotNil(media.pending)
        await session.stop()
        media.pending?.resume(returning: try media.description(answer: false))
        media.pending = nil
        do { try await operation.value; XCTFail("late offer sent") } catch {}
        let sent = await signalling.sent
        XCTAssertTrue(sent.isEmpty)
        XCTAssertEqual(media.closed, 1)
        XCTAssertEqual(session.phase, .ended)
    }

    @MainActor func testMediaFailureNeverNegotiatesAndReleasesBinding() async throws {
        let (session, media, signalling) = try fixture()
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        media.fail = true
        do { try await session.accept(); XCTFail("media failure ignored") } catch {}
        XCTAssertEqual(session.phase, .ended)
        XCTAssertEqual(media.closed, 1)
        let released = await signalling.released
        XCTAssertEqual(released.count, 1)
    }

    @MainActor func testSignallingFailureStopsPeer() async throws {
        let (session, media, signalling) = try fixture(.initiator)
        await signalling.fail()
        do { try await session.start(); XCTFail("signalling rejection ignored") } catch {}
        XCTAssertEqual(session.phase, .ended)
        XCTAssertEqual(media.closed, 1)
    }

    @MainActor func testLocalHangupSendsBoundedTermination() async throws {
        let (session, media, signalling) = try fixture()
        await session.stop(notifyPeer: true)
        let sent = await signalling.sent
        XCTAssertEqual(sent, [termination])
        XCTAssertEqual(media.closed, 1)
    }

    @MainActor func testUnansweredOutgoingCallExpiresAndReleases() async throws {
        let clock = JingleClockFixture()
        let (session, media, signalling) = try fixture(.initiator, clock: clock)
        try await session.start()
        XCTAssertEqual(clock.delays, [20, 45])
        XCTAssertTrue(clock.timers[0].cancelled)
        clock.timers.last!.action()
        for _ in 0..<100 where session.phase != .ended { await Task.yield() }
        XCTAssertEqual(session.phase, .ended)
        XCTAssertEqual(media.closed, 1)
        await session.stop()
        for _ in 0..<100 { if await signalling.released.count == 1 { break }; await Task.yield() }
        let released = await signalling.released
        XCTAssertEqual(released, [binding])
    }

    @MainActor func testRingingDeadlineDoesNotCaptureAndCannotRevive() async throws {
        let clock = JingleClockFixture()
        let (session, media, _) = try fixture(clock: clock)
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        clock.timers.last!.action()
        for _ in 0..<100 where session.phase != .ended { await Task.yield() }
        XCTAssertEqual(session.phase, .ended)
        XCTAssertEqual(media.accepted, 0)
        do { try await session.accept(); XCTFail("expired invitation accepted") } catch {}
    }

    @MainActor func testOldTimersCannotEndNegotiatedCall() async throws {
        let clock = JingleClockFixture()
        let (session, media, _) = try fixture(clock: clock)
        await session.receive(request("session-initiate", try media.description(answer: false).xml))
        try await session.accept()
        for timer in clock.timers { XCTAssertTrue(timer.cancelled); timer.action() }
        for _ in 0..<20 { await Task.yield() }
        XCTAssertEqual(session.phase, .negotiated)
        XCTAssertEqual(media.closed, 0)
        await session.stop()
    }
}
