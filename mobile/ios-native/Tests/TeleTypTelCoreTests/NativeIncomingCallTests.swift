import XCTest
@testable import TeleTypTelCore

final class NativeIncomingCallTests: XCTestCase {
    private let now: TimeInterval = 1000

    private func payload(id: UUID = UUID(), media: NativeCallMedia = .total,
                         expires: Double = 1060, changes: [String: Any] = [:]) throws -> Data {
        var values: [String: Any] = ["type": "incoming-call", "callId": id.uuidString,
                                    "sid": "session_one", "expiresAt": expires,
                                    "hasVideo": media.hasVideo, "mediaProfile": media.rawValue]
        values.merge(changes) { _, replacement in replacement }
        return try JSONSerialization.data(withJSONObject: values)
    }

    private func configured() -> NativeCallLifecycle {
        var lifecycle = NativeCallLifecycle()
        lifecycle.configure(account: "fictional-account", consented: true)
        return lifecycle
    }

    private func receive(_ lifecycle: inout NativeCallLifecycle, media: NativeCallMedia = .total) throws -> NativeCallHandle {
        let registration = lifecycle.generation
        return try XCTUnwrap(lifecycle.receive(payload(media: media), registration: registration, now: now))
    }

    func testAllMediaProfilesMatchExistingWireContract() throws {
        for media in NativeCallMedia.allCases {
            let invitation = try XCTUnwrap(NativeCallInvitation.decode(payload(media: media), now: now))
            XCTAssertEqual(invitation.media, media)
            XCTAssertEqual(invitation.media.hasVideo, [NativeCallMedia.video, .total].contains(media))
        }
        XCTAssertEqual(NativeCallMedia.total.contents, ["audio", "video", "rtt"])
        XCTAssertEqual(NativeCallMedia.audioRtt.contents, ["audio", "rtt"])
    }

    func testMalformedExpiredAndOversizedInvitationsAreRejected() throws {
        let invalid: [[String: Any]] = [
            ["type": "chat"], ["callId": "invalid"], ["sid": ""], ["sid": "bad/sid"], ["sid": "session\n"],
            ["sid": String(repeating: "a", count: 129)], ["mediaProfile": "unknown"],
            ["hasVideo": false], ["hasVideo": "true"], ["expiresAt": true],
            ["expiresAt": "1060"], ["expiresAt": 1000], ["expiresAt": 1061],
            ["expiresAt": 1001.5], ["extra": String(repeating: "x", count: 4096)]
        ]
        for values in invalid {
            XCTAssertNil(NativeCallInvitation.decode(try payload(changes: values), now: now))
        }
        XCTAssertNil(NativeCallInvitation.decode(Data("{}".utf8), now: now))
        XCTAssertNil(NativeCallInvitation.decode(try payload(), now: .infinity))
        XCTAssertNil(NativeCallInvitation.decode(try payload(), now: .nan))
    }

    func testConsentAndCurrentRegistrationAreRequired() throws {
        var lifecycle = NativeCallLifecycle()
        let initial = lifecycle.generation
        XCTAssertNil(lifecycle.receive(try payload(), registration: initial, now: now))
        lifecycle.configure(account: "fictional-account", consented: true)
        XCTAssertNil(lifecycle.receive(try payload(), registration: initial, now: now))
        lifecycle.configure(account: "fictional-account", consented: false)
        XCTAssertNil(lifecycle.receive(try payload(), registration: lifecycle.generation, now: now))
        for account in ["", "bad\naccount", String(repeating: "x", count: 97)] {
            lifecycle.configure(account: account, consented: true)
            XCTAssertNil(lifecycle.receive(try payload(), registration: lifecycle.generation, now: now))
        }
    }

    func testReportingFailureAndStaleCallbacksCannotReviveCalls() throws {
        var lifecycle = configured()
        let first = try receive(&lifecycle)
        XCTAssertFalse(lifecycle.requestAnswer(first, now: now))
        XCTAssertFalse(lifecycle.reported(first, succeeded: false, now: now))
        XCTAssertNil(lifecycle.current)
        let second = try receive(&lifecycle)
        XCTAssertFalse(lifecycle.reported(first, succeeded: true, now: now))
        XCTAssertFalse(lifecycle.end(first))
        XCTAssertEqual(lifecycle.current?.handle, second)
        XCTAssertTrue(lifecycle.reported(second, succeeded: true, now: now))
    }

    func testOnlyOneCallAndNoImmediateReplayOfEndedCall() throws {
        var lifecycle = configured()
        let invitation = try payload()
        let registration = lifecycle.generation
        let handle = try XCTUnwrap(lifecycle.receive(invitation, registration: registration, now: now))
        XCTAssertNil(lifecycle.receive(invitation, registration: registration, now: now))
        XCTAssertNil(lifecycle.receive(try payload(), registration: registration, now: now))
        XCTAssertTrue(lifecycle.end(handle))
        XCTAssertNil(lifecycle.receive(invitation, registration: registration, now: now))
        XCTAssertFalse(lifecycle.end(handle))
    }

    func testAccountChangesAndLogoutInvalidateEveryOldCallback() throws {
        var lifecycle = configured()
        let handle = try receive(&lifecycle)
        lifecycle.configure(account: "second-account", consented: true)
        XCTAssertNil(lifecycle.current)
        XCTAssertNil(lifecycle.receive(try payload(), registration: handle.generation, now: now))
        XCTAssertFalse(lifecycle.reported(handle, succeeded: true, now: now))
        let second = try receive(&lifecycle)
        lifecycle.configure(account: nil, consented: false)
        XCTAssertFalse(lifecycle.end(second))
        XCTAssertNil(lifecycle.current)
    }

    func testTotalConversationRequiresExactMediaAndReadyRtt() throws {
        var lifecycle = configured()
        let handle = try receive(&lifecycle)
        XCTAssertTrue(lifecycle.reported(handle, succeeded: true, now: now))
        XCTAssertTrue(lifecycle.requestAnswer(handle, now: now))
        XCTAssertFalse(lifecycle.mediaReady(handle, negotiated: .video, readyContents: ["audio", "video"], rttReady: true, now: now))
        XCTAssertFalse(lifecycle.mediaReady(handle, negotiated: .total, readyContents: ["audio", "video"], rttReady: true, now: now))
        XCTAssertFalse(lifecycle.mediaReady(handle, negotiated: .total, readyContents: ["audio", "video", "rtt", "rtt"], rttReady: true, now: now))
        XCTAssertFalse(lifecycle.mediaReady(handle, negotiated: .total, readyContents: ["audio", "video", "rtt"], rttReady: false, now: now))
        XCTAssertEqual(lifecycle.current?.phase, .answering)
        XCTAssertTrue(lifecycle.mediaReady(handle, negotiated: .total, readyContents: ["rtt", "video", "audio"], rttReady: true, now: now))
        XCTAssertEqual(lifecycle.current?.phase, .connected)
        XCTAssertNil(lifecycle.current?.deadline)
        XCTAssertFalse(lifecycle.expire(handle, now: 1100))
    }

    func testAudioDoesNotRequireVideoOrRttAndDoubleAnswerIsRejected() throws {
        var lifecycle = configured()
        let handle = try receive(&lifecycle, media: .audio)
        XCTAssertTrue(lifecycle.reported(handle, succeeded: true, now: now))
        XCTAssertTrue(lifecycle.requestAnswer(handle, now: now))
        XCTAssertFalse(lifecycle.requestAnswer(handle, now: now))
        XCTAssertTrue(lifecycle.mediaReady(handle, negotiated: .audio, readyContents: ["audio"], rttReady: false, now: now))
        XCTAssertFalse(lifecycle.mediaReady(handle, negotiated: .audio, readyContents: ["audio"], rttReady: false, now: now))
    }

    func testRingingAndAnswerDeadlinesCannotBeExtended() throws {
        var lifecycle = configured()
        let first = try receive(&lifecycle)
        XCTAssertFalse(lifecycle.reported(first, succeeded: true, now: 1060))
        XCTAssertNil(lifecycle.current)
        let handle = try receive(&lifecycle)
        XCTAssertTrue(lifecycle.reported(handle, succeeded: true, now: now))
        XCTAssertTrue(lifecycle.requestAnswer(handle, now: now))
        XCTAssertEqual(lifecycle.current?.deadline, 1015)
        XCTAssertFalse(lifecycle.expire(handle, now: 1014))
        XCTAssertTrue(lifecycle.expire(handle, now: 1015))
        XCTAssertNil(lifecycle.current)
        let late = try receive(&lifecycle)
        XCTAssertTrue(lifecycle.reported(late, succeeded: true, now: 1058))
        XCTAssertTrue(lifecycle.requestAnswer(late, now: 1059))
        XCTAssertEqual(lifecycle.current?.deadline, 1060)
        XCTAssertFalse(lifecycle.mediaReady(late, negotiated: .total, readyContents: ["audio", "video", "rtt"], rttReady: true, now: 1060))
        XCTAssertNil(lifecycle.current)
    }

    func testRecentCallMemoryIsBoundedAndPrunedAfterExpiry() throws {
        var lifecycle = configured()
        for _ in 0..<32 {
            let handle = try receive(&lifecycle)
            XCTAssertTrue(lifecycle.end(handle))
        }
        let registration = lifecycle.generation
        XCTAssertNil(lifecycle.receive(try payload(), registration: registration, now: now))
        XCTAssertNotNil(lifecycle.receive(try payload(expires: 1120), registration: registration, now: 1060))
    }
}
