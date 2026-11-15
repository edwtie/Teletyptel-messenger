import XCTest
@testable import TeleTypTelCore

@MainActor
private final class IntentSessionSender: NativeCallRecoverySending {
    var intents: [NativeCallIntent] = []
    var bindings: [(String, String, UUID)] = []
    var unbound: [UUID] = []
    var rejections: [NativeJingleRejection?] = []
    var afterSend: ((NativeCallIntentAction) async throws -> Void)?
    var afterBind: (() -> Void)?
    func observeCallIntents(_ observer: @escaping @Sendable (NativeCallIntent) -> Void) async {}
    func setCallPreferences(enabled: Bool, dnd: Bool, muted: Set<String>) async throws {}
    func proveCallResource(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws {}
    func sendCallIntent(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia?) async throws {
        _ = try NativeCallIntent.frame(action: action, peer: peer, sid: sid, media: media)
        intents.append(NativeCallIntent(action: action, sid: sid, peer: peer, media: media))
        try await afterSend?(action)
    }
    func bindCall(peer: String, sid: String) async throws -> UUID {
        let binding = UUID(); bindings.append((peer, sid, binding)); afterBind?(); return binding
    }
    func exchangeJingle(binding: UUID, xml: String) async throws {}
    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws { rejections.append(rejection) }
    func unbindCall(_ binding: UUID) async { unbound.append(binding) }
}

@MainActor
final class NativeCallIntentSessionTests: XCTestCase {
    private func settle(_ condition: () -> Bool) async {
        for _ in 0..<500 { if condition() { return }; try? await Task.sleep(nanoseconds: 1_000_000) }
        XCTFail("Call intent did not settle")
    }
    private func proposal(_ profile: NativeCallMedia = .total) -> NativeCallIntent {
        NativeCallIntent(action: .propose, sid: "call-1", peer: "alice@localhost/phone", media: profile)
    }
    private func request(binding: UUID, profile: NativeCallMedia = .total) throws -> NativeJingleRequest {
        let offer = try NativeJingleMedia.fromSDP(sdp(profile), sid: "call-1", action: "session-initiate", profile: profile)
        let xml = "<iq xmlns='jabber:client' type='set' from='alice@localhost/phone' to='bob@localhost/tablet' id='offer-1'>\(offer.xml)</iq>"
        return NativeJingleRequest(binding: binding, peer: "alice@localhost/phone", sid: "call-1", action: "session-initiate", xml: xml, token: UUID(), identifier: "offer-1")
    }
    private func sdp(_ profile: NativeCallMedia) -> String {
        var lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0"]
        for kind in ["audio", "video", "rtt"] where profile.contents.contains(kind) {
            lines += [kind == "rtt" ? "m=application 9 UDP/DTLS/SCTP webrtc-datachannel" : "m=\(kind) 9 UDP/TLS/RTP/SAVPF \(kind == "audio" ? "0" : "96")", "c=IN IP4 0.0.0.0", "a=mid:\(kind)"]
            if kind == "rtt" { lines += ["a=sctp-port:5000", "a=max-message-size:262144"] }
            else {
                lines += ["a=sendrecv", "a=rtcp-mux", kind == "audio" ? "a=rtpmap:0 PCMU/8000" : "a=rtpmap:96 VP8/90000"]
                if kind == "video" { lines += ["a=rtcp-fb:96 nack", "a=rtcp-fb:96 nack pli"] }
            }
            lines += ["a=ice-ufrag:abcd", "a=ice-pwd:abcdefghijklmnopqrstuv", "a=fingerprint:sha-256 " + Array(repeating: "AB", count: 32).joined(separator: ":"), "a=setup:actpass",
                "a=candidate:1 1 udp 2122260223 127.0.0.1 50000 typ host generation 0", "a=end-of-candidates"]
        }
        return (lines + [""]).joined(separator: "\r\n")
    }

    func testOutgoingProposesWithoutBindingOrMediaAndLocksFirstMatchingResource() async throws {
        for profile in NativeCallMedia.allCases {
            let sender = IntentSessionSender()
            let intent = try NativeOutgoingCallIntent(owner: "alice@localhost", peer: "bob@localhost", sid: "call-1", profile: profile)
            let operation = Task { try await intent.prepare(sender: sender, validate: {}) }
            await settle { sender.intents.count == 1 }
            XCTAssertEqual(sender.intents[0].action, .propose)
            XCTAssertEqual(sender.intents[0].media, profile)
            XCTAssertTrue(sender.bindings.isEmpty)
            intent.receive(NativeCallIntent(action: .proceed, sid: "wrong", peer: "bob@localhost/phone", media: nil))
            intent.receive(NativeCallIntent(action: .proceed, sid: "call-1", peer: "mallory@localhost/phone", media: nil))
            intent.receive(NativeCallIntent(action: .proceed, sid: "call-1", peer: "bob@localhost", media: nil))
            XCTAssertNil(intent.selectedPeer)
            intent.receive(NativeCallIntent(action: .proceed, sid: "call-1", peer: "bob@localhost/tablet", media: nil))
            intent.receive(NativeCallIntent(action: .proceed, sid: "call-1", peer: "bob@localhost/phone", media: nil))
            let selected = try await operation.value
            XCTAssertEqual(selected, "bob@localhost/tablet")
            XCTAssertTrue(sender.bindings.isEmpty)
            intent.cancel()
            await settle { sender.intents.count == 2 }
            XCTAssertEqual(sender.intents[1].action, .finish)
            XCTAssertEqual(sender.intents[1].peer, selected)
        }
    }

    func testOutgoingExpiryCancellationAndAccountChangeRetractWithoutMedia() async throws {
        for reason in ["expired", "cancelled", "account"] {
            let sender = IntentSessionSender()
            var now: TimeInterval = 100, permitted = true
            let intent = try NativeOutgoingCallIntent(owner: "alice@localhost", peer: "bob@localhost", sid: "call-1", profile: .total, now: { now })
            let operation = Task { try await intent.prepare(sender: sender, validate: { if !permitted { throw NativeJingleFailure.staleBinding } }) }
            await settle { sender.intents.count == 1 }
            if reason == "expired" { now = 145 }
            if reason == "cancelled" { operation.cancel() }
            if reason == "account" { permitted = false }
            do { _ = try await operation.value; XCTFail("Stale call succeeded") } catch {}
            await settle { sender.intents.count == 2 }
            XCTAssertEqual(sender.intents[1].action, .retract)
            XCTAssertTrue(sender.bindings.isEmpty)
        }
    }

    func testIncomingWaitsForExplicitAnswerBindsBeforeProceedAndAcceptsExactProfile() async throws {
        for profile in NativeCallMedia.allCases {
            let sender = IntentSessionSender(), proposal = proposal(profile)
            let intent = try NativeIncomingCallIntent(proposal: proposal, sender: sender)
            XCTAssertTrue(sender.bindings.isEmpty)
            XCTAssertTrue(sender.intents.isEmpty)
            sender.afterSend = { action in
                guard action == .proceed else { return }
                XCTAssertEqual(sender.bindings.count, 1)
                await intent.receive(try self.request(binding: sender.bindings[0].2, profile: profile))
            }
            let received = try await intent.prepare(validate: {})
            XCTAssertEqual(received.peer, proposal.peer)
            XCTAssertEqual(received.binding, sender.bindings[0].2)
            XCTAssertEqual(sender.intents.first?.action, .proceed)
            intent.cancel()
            await settle { sender.unbound.count == 1 }
            XCTAssertEqual(sender.intents.last?.action, .finish)
            sender.afterSend = nil
        }
    }

    func testCancellationDuringBindUnbindsNewResourceAndDoesNotProceed() async throws {
        let sender = IntentSessionSender()
        let intent = try NativeIncomingCallIntent(proposal: proposal(), sender: sender)
        sender.afterBind = { intent.cancel() }
        do { _ = try await intent.prepare(validate: {}); XCTFail("Cancelled bind succeeded") } catch {}
        await settle { sender.unbound.count == 1 }
        XCTAssertFalse(sender.intents.contains { $0.action == .proceed })
        XCTAssertEqual(sender.unbound.first, sender.bindings.first?.2)
        sender.afterBind = nil
    }

    func testWrongBindingAndWrongNegotiatedProfileCannotReachMedia() async throws {
        let sender = IntentSessionSender()
        let intent = try NativeIncomingCallIntent(proposal: proposal(), sender: sender)
        sender.afterSend = { action in
            guard action == .proceed else { return }
            await intent.receive(try self.request(binding: UUID()))
            await intent.receive(try self.request(binding: sender.bindings[0].2, profile: .audio))
        }
        do { _ = try await intent.prepare(validate: {}); XCTFail("Wrong profile succeeded") } catch {}
        XCTAssertEqual(sender.rejections.count, 1)
        await settle { sender.unbound.count == 1 }
        sender.afterSend = nil
    }

    func testRemoteRetractionStopsRingingAndLateAnswer() async throws {
        let sender = IntentSessionSender()
        let intent = try NativeIncomingCallIntent(proposal: proposal(), sender: sender)
        var ended = 0
        intent.remoteEnded = { ended += 1 }
        intent.receive(NativeCallIntent(action: .retract, sid: "other", peer: "alice@localhost/phone", media: nil))
        intent.receive(NativeCallIntent(action: .finish, sid: "call-1", peer: "mallory@localhost/phone", media: nil))
        XCTAssertEqual(ended, 0)
        intent.receive(NativeCallIntent(action: .retract, sid: "call-1", peer: "alice@localhost/phone", media: nil))
        XCTAssertEqual(ended, 1)
        do { _ = try await intent.prepare(validate: {}); XCTFail("Ended call answered") } catch {}
        XCTAssertTrue(sender.bindings.isEmpty)
    }
}
