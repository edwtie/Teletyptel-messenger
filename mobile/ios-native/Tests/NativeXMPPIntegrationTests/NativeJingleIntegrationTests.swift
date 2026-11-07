import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeJingleIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let trustedPort: Int
        let username: String
        let password: String
    }

    private func account() throws -> NativeAuthenticatedAccount {
        guard let file = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in isolated Jingle test; no real server was contacted")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
            throw ConnectionFailure.configuration
        }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        guard (1024...65535).contains(fixture.trustedPort), fixture.username.hasPrefix("native-test-") else {
            throw ConnectionFailure.configuration
        }
        let configuration = try ServerConfiguration(address: "https://localhost:\(fixture.trustedPort)", domain: "localhost")
        return NativeAuthenticatedAccount(configuration: configuration, jid: fixture.username + "@localhost", password: fixture.password)
    }

    private func connect(_ account: NativeAuthenticatedAccount, endpoint: JingleEndpoint) -> Task<Void, Error> {
        Task {
            try await NativeXMPPConnection().run(account: account, onConnected: { jid in
                Task { await endpoint.setJID(jid) }
            }, onRoster: { _ in }, onChat: { _ in }, onSender: { _ in }, onJingle: { request in
                Task { await endpoint.append(request) }
            }, onJingleSender: { sender in
                Task { await endpoint.setSender(sender) }
            })
        }
    }

    private func ready(_ endpoint: JingleEndpoint) async throws -> (String, any NativeJingleSending) {
        for _ in 0..<1500 {
            if let result = await endpoint.ready { return result }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw ConnectionFailure.timeout
    }

    private func incoming(_ endpoint: JingleEndpoint) async throws -> NativeJingleRequest {
        for _ in 0..<500 {
            if let request = await endpoint.take() { return request }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw ConnectionFailure.timeout
    }

    func testTwoRealResourcesExchangeRejectCancelTimeoutAndDisconnect() async throws {
        let authenticated = try account()
        let left = JingleEndpoint()
        let right = JingleEndpoint()
        let leftConnection = connect(authenticated, endpoint: left)
        let rightConnection = connect(authenticated, endpoint: right)
        defer { leftConnection.cancel(); rightConnection.cancel() }
        let (leftJID, leftSender) = try await ready(left)
        let (rightJID, rightSender) = try await ready(right)
        XCTAssertNotEqual(leftJID, rightJID)
        let sid = "fixture-" + UUID().uuidString
        let leftBinding = try await leftSender.bindCall(peer: rightJID, sid: sid)
        let rightBinding = try await rightSender.bindCall(peer: leftJID, sid: sid)
        let xml = "<jingle xmlns='urn:xmpp:jingle:1' sid='\(sid)' action='session-info'><ringing xmlns='urn:xmpp:jingle:apps:rtp:info:1'/></jingle>"

        let accepted = Task { try await leftSender.exchangeJingle(binding: leftBinding, xml: xml) }
        defer { accepted.cancel() }
        let received = try await incoming(right)
        XCTAssertEqual(received.peer, leftJID)
        XCTAssertEqual(received.binding, rightBinding)
        XCTAssertEqual(received.sid, sid)
        try await rightSender.replyJingle(received, rejection: nil)
        try await accepted.value

        let rejected = Task { try await rightSender.exchangeJingle(binding: rightBinding, xml: xml) }
        defer { rejected.cancel() }
        let rejectedRequest = try await incoming(left)
        try await leftSender.replyJingle(rejectedRequest, rejection: .notAcceptable)
        do { try await rejected.value; XCTFail("IQ error must not be treated as accepted media") }
        catch { XCTAssertEqual(error as? NativeJingleFailure, .rejected) }

        let cancelled = Task { try await leftSender.exchangeJingle(binding: leftBinding, xml: xml) }
        defer { cancelled.cancel() }
        let cancelledRequest = try await incoming(right)
        cancelled.cancel()
        do { try await cancelled.value; XCTFail("Cancelled exchange succeeded") }
        catch { XCTAssertTrue(error is CancellationError) }
        try await rightSender.replyJingle(cancelledRequest, rejection: nil)

        let unanswered = Task { try await leftSender.exchangeJingle(binding: leftBinding, xml: xml) }
        defer { unanswered.cancel() }
        _ = try await incoming(right)
        do { try await unanswered.value; XCTFail("Unanswered exchange succeeded") }
        catch { XCTAssertEqual(error as? NativeJingleFailure, .timedOut) }

        let interrupted = Task { try await leftSender.exchangeJingle(binding: leftBinding, xml: xml) }
        defer { interrupted.cancel() }
        let interruptedRequest = try await incoming(right)
        await leftSender.unbindCall(leftBinding)
        do { try await interrupted.value; XCTFail("Unbound exchange succeeded") }
        catch { XCTAssertEqual(error as? NativeJingleFailure, .staleBinding) }
        try await rightSender.replyJingle(interruptedRequest, rejection: nil)
        await rightSender.unbindCall(rightBinding)
        leftConnection.cancel()
        rightConnection.cancel()
        _ = try? await leftConnection.value
        _ = try? await rightConnection.value
        do {
            _ = try await leftSender.bindCall(peer: rightJID, sid: "next")
            XCTFail("Disconnected transport must not bind a call")
        } catch { XCTAssertEqual(error as? NativeJingleFailure, .disconnected) }
    }
}

private actor JingleEndpoint {
    private var jid: String?
    private var sender: (any NativeJingleSending)?
    private var requests: [NativeJingleRequest] = []

    var ready: (String, any NativeJingleSending)? {
        guard let jid = jid, let sender = sender else { return nil }
        return (jid, sender)
    }

    func setJID(_ value: String) { jid = value }
    func setSender(_ value: any NativeJingleSending) { sender = value }
    func append(_ request: NativeJingleRequest) { requests.append(request) }
    func take() -> NativeJingleRequest? { requests.isEmpty ? nil : requests.removeFirst() }
}
