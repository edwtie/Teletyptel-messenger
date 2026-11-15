import Foundation
import XCTest
@testable import TeleTypTelCore

@MainActor
private final class IntentTransportObservation {
    var jid: String?
    var sender: (any NativeCallRecoverySending)?
    var observing = false
    var intents: [NativeCallIntent] = []
    var onIntent: ((NativeCallIntent) -> Void)?
    var onJingle: ((NativeJingleRequest) async -> Void)?
}

@MainActor
final class NativeCallIntentIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let trustedPort: Int
        let username: String
        let archivePeer: String
        let password: String
    }
    private func accounts() throws -> (NativeAuthenticatedAccount, NativeAuthenticatedAccount) {
        guard let file = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in isolated native JMI transport test; no real server contacted")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { throw ConnectionFailure.configuration }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        guard (1024...65535).contains(fixture.trustedPort), fixture.username.hasPrefix("native-test-"),
              fixture.archivePeer == fixture.username + "-archive" else { throw ConnectionFailure.configuration }
        let configuration = try ServerConfiguration(address: "https://localhost:\(fixture.trustedPort)", domain: "localhost")
        return (NativeAuthenticatedAccount(configuration: configuration, jid: fixture.username + "@localhost", password: fixture.password),
                NativeAuthenticatedAccount(configuration: configuration, jid: fixture.archivePeer + "@localhost", password: fixture.password))
    }
    private func connect(_ account: NativeAuthenticatedAccount, observation: IntentTransportObservation) -> Task<Void, Error> {
        Task {
            try await NativeXMPPConnection().run(account: account,
                onConnected: { jid in Task { @MainActor in observation.jid = jid } },
                onRoster: { _ in }, onChat: { _ in }, onSender: { _ in },
                onJingle: { request in Task { @MainActor in await observation.onJingle?(request) } },
                onJingleSender: { sender in
                    Task { @MainActor in
                        guard let calls = sender as? any NativeCallRecoverySending else { return }
                        observation.sender = calls
                        await calls.observeCallIntents { intent in
                            Task { @MainActor in observation.intents.append(intent); observation.onIntent?(intent) }
                        }
                        observation.observing = true
                    }
                })
        }
    }
    private func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<1500 { if condition() { return }; try await Task.sleep(nanoseconds: 10_000_000) }
        throw ConnectionFailure.timeout
    }

    func testNativeJMISelectsNewResourceAndRequiresFreshJingleOverTrustedWSS() async throws {
        let (callerAccount, recipientAccount) = try accounts()
        let left = IntentTransportObservation(), right = IntentTransportObservation()
        var stage = "connecting"
        defer {
            print("Native JMI checkpoint: \(stage); caller actions: \(left.intents.map { $0.action.rawValue }); recipient actions: \(right.intents.map { $0.action.rawValue })")
        }
        let leftConnection = connect(callerAccount, observation: left), rightConnection = connect(recipientAccount, observation: right)
        defer { leftConnection.cancel(); rightConnection.cancel() }
        try await wait { left.observing && right.observing && left.jid != nil && right.jid != nil }
        let callerSender = try XCTUnwrap(left.sender), recipientSender = try XCTUnwrap(right.sender)
        stage = "unsupported-policy-response"
        do {
            try await recipientSender.setCallPreferences(enabled: true, dnd: false, muted: [])
            XCTFail("The unmodified fixture must not claim a recovery-policy module")
        } catch { XCTAssertEqual(error as? NativeCallPolicyFailure, .unsupported) }
        let sid = "fixture-intent-" + UUID().uuidString
        let caller = try NativeOutgoingCallIntent(owner: callerAccount.jid, peer: recipientAccount.jid, sid: sid, profile: .audioRtt)
        left.onIntent = { caller.receive($0) }
        let proposing = Task { try await caller.prepare(sender: callerSender, validate: {}) }
        defer { proposing.cancel(); caller.cancel(); left.onIntent = nil; right.onIntent = nil; right.onJingle = nil }
        stage = "waiting-for-proposal"
        try await wait { right.intents.contains { $0.sid == sid && $0.action == .propose } }
        let proposal = try XCTUnwrap(right.intents.first { $0.sid == sid && $0.action == .propose })
        XCTAssertEqual(proposal.peer, left.jid)
        let recipient = try NativeIncomingCallIntent(proposal: proposal, sender: recipientSender)
        right.onIntent = { recipient.receive($0) }
        right.onJingle = { await recipient.receive($0) }
        let answering = Task { try await recipient.prepare(validate: {}) }
        defer { answering.cancel(); recipient.cancel() }
        stage = "waiting-for-proceed"
        let selectedPeer = try await proposing.value
        XCTAssertEqual(selectedPeer, right.jid)
        let binding = try await callerSender.bindCall(peer: selectedPeer, sid: sid)
        stage = "waiting-for-fresh-offer"
        let offer = try NativeJingleMedia.fromSDP(sdp(), sid: sid, action: "session-initiate", profile: .audioRtt)
        let exchange = Task { try await callerSender.exchangeJingle(binding: binding, xml: offer.xml) }
        defer { exchange.cancel() }
        let received = try await answering.value
        XCTAssertEqual(received.sid, sid)
        XCTAssertEqual(received.peer, left.jid)
        XCTAssertEqual(received.action, "session-initiate")
        _ = try NativeJingleMedia.decode(received.jingleElement(), sid: sid, action: received.action, profile: .audioRtt)
        try await recipientSender.replyJingle(received, rejection: nil)
        try await exchange.value
        stage = "waiting-for-finish"
        var remoteEnded = false
        recipient.remoteEnded = { remoteEnded = true }
        caller.cancel()
        try await wait { remoteEnded }
        recipient.cancel()
        await callerSender.unbindCall(binding)
        stage = "cleanup"
        leftConnection.cancel(); rightConnection.cancel()
        _ = try? await leftConnection.value; _ = try? await rightConnection.value
    }

    private func sdp() -> String {
        var lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0"]
        for kind in ["audio", "rtt"] {
            lines += [kind == "rtt" ? "m=application 9 UDP/DTLS/SCTP webrtc-datachannel" : "m=audio 9 UDP/TLS/RTP/SAVPF 0", "c=IN IP4 0.0.0.0", "a=mid:\(kind)"]
            lines += kind == "rtt" ? ["a=sctp-port:5000", "a=max-message-size:262144"] : ["a=sendrecv", "a=rtcp-mux", "a=rtpmap:0 PCMU/8000"]
            lines += ["a=ice-ufrag:abcd", "a=ice-pwd:abcdefghijklmnopqrstuv", "a=fingerprint:sha-256 " + Array(repeating: "AB", count: 32).joined(separator: ":"), "a=setup:actpass",
                "a=candidate:1 1 udp 2122260223 127.0.0.1 50000 typ host generation 0", "a=end-of-candidates"]
        }
        return (lines + [""]).joined(separator: "\r\n")
    }
}
