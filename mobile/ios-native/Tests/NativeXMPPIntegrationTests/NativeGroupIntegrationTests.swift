import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeGroupIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let trustedPort: Int
        let username: String
        let archivePeer: String
        let groupOutsider: String
        let groupRoom: String
        let password: String
    }
    private func fixture() throws -> Fixture {
        guard let path = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in isolated private MUC test; no real server contacted")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { throw ConnectionFailure.configuration }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        guard (1024...65535).contains(fixture.trustedPort), fixture.username.hasPrefix("native-test-"),
              fixture.archivePeer == fixture.username + "-archive", fixture.groupOutsider == fixture.username + "-outsider",
              fixture.groupRoom == fixture.username + "-room" else { throw ConnectionFailure.configuration }
        return fixture
    }
    private func connect(_ account: NativeAuthenticatedAccount, endpoint: GroupEndpoint) -> Task<Void, Error> {
        Task {
            try await NativeXMPPConnection().run(account: account, onConnected: { _ in }, onRoster: { _ in },
                onChat: { _ in Task { await endpoint.recordDirect() } },
                onSender: { sender in Task { await endpoint.setSender(sender) } })
        }
    }
    private func ready(_ endpoint: GroupEndpoint) async throws -> any NativeGroupSending {
        for _ in 0..<1500 {
            if let sender = await endpoint.sender { return sender }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw ConnectionFailure.timeout
    }
    func testPrivateRoomMembersExchangeTextAndOutsiderIsDenied() async throws {
        let fixture = try fixture()
        let configuration = try ServerConfiguration(address: "https://localhost:\(fixture.trustedPort)", domain: "localhost")
        func account(_ user: String) -> NativeAuthenticatedAccount {
            NativeAuthenticatedAccount(configuration: configuration, jid: user + "@localhost", password: fixture.password)
        }
        let left = GroupEndpoint(); let right = GroupEndpoint(); let outsider = GroupEndpoint()
        let leftConnection = connect(account(fixture.username), endpoint: left)
        let rightConnection = connect(account(fixture.archivePeer), endpoint: right)
        let outsiderConnection = connect(account(fixture.groupOutsider), endpoint: outsider)
        defer { leftConnection.cancel(); rightConnection.cancel(); outsiderConnection.cancel() }
        let leftSender = try await ready(left); let rightSender = try await ready(right); let outsiderSender = try await ready(outsider)
        let room = fixture.groupRoom + "@conference.localhost"
        try await leftSender.joinGroup(room: room, nickname: "Left") { event in Task { await left.append(event) } }
        try await rightSender.joinGroup(room: room, nickname: "Right") { event in Task { await right.append(event) } }
        do {
            try await outsiderSender.joinGroup(room: room, nickname: "Outsider") { event in Task { await outsider.append(event) } }
            XCTFail("A non-member entered the private room")
        } catch { XCTAssertTrue([NativeGroupFailure.denied, .unavailable].contains(error as? NativeGroupFailure ?? .invalidRoom)) }
        do {
            try await leftSender.joinGroup(room: "missing@conference.localhost", nickname: "NoCreation") { _ in }
            XCTFail("Unknown rooms must not be created by joining")
        } catch { XCTAssertEqual(error as? NativeGroupFailure, .unavailable) }
        let identifier = UUID().uuidString
        try await leftSender.sendGroup(room: room, body: "Fictieve tekst voor leden", identifier: identifier)
        var received: NativeGroupText?
        for _ in 0..<500 {
            if let text = await right.message(identifier) { received = text; break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        let text = try XCTUnwrap(received)
        XCTAssertEqual(text.room, room); XCTAssertEqual(text.nickname, "Left"); XCTAssertFalse(text.own)
        XCTAssertEqual(text.body, "Fictieve tekst voor leden")
        let snapshot = await right.snapshot
        XCTAssertTrue(snapshot?.supportsReactions == true)
        let reactor = try XCTUnwrap(rightSender as? any NativeGroupReacting)
        let target = try XCTUnwrap(text.archiveID)
        try await reactor.reactGroup(room: room, target: target, values: ["👍"], identifier: UUID().uuidString)
        for _ in 0..<300 {
            if await left.reactionTarget == target { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        let reflectedTarget = await left.reactionTarget
        let reflectedValues = await left.reactionValues
        XCTAssertEqual(reflectedTarget, target); XCTAssertEqual(reflectedValues, ["👍"])
        let outsiderCount = await outsider.messageCount
        let directCount = await right.directCount
        XCTAssertEqual(outsiderCount, 0); XCTAssertEqual(directCount, 0)
        await rightSender.leaveGroup(room: room)
        do {
            try await rightSender.sendGroup(room: room, body: "No longer joined", identifier: UUID().uuidString)
            XCTFail("Sending after leave must fail")
        } catch { XCTAssertEqual(error as? NativeGroupFailure, .disconnected) }
        await leftSender.leaveGroup(room: room)
        leftConnection.cancel(); rightConnection.cancel(); outsiderConnection.cancel()
        _ = try? await leftConnection.value; _ = try? await rightConnection.value; _ = try? await outsiderConnection.value
    }
}

private actor GroupEndpoint {
    private(set) var snapshot: NativeGroupSnapshot?
    private(set) var reactionTarget: String?
    private(set) var reactionValues: [String] = []
    private(set) var sender: (any NativeGroupSending)?
    private var messages: [NativeGroupText] = []
    private(set) var directCount = 0
    var messageCount: Int { messages.count }
    func setSender(_ sender: any NativeChatSending) { self.sender = sender as? any NativeGroupSending }
    func recordDirect() { directCount += 1 }
    func append(_ event: NativeGroupEvent) {
        if case .message(let text) = event { messages.append(text) }
        if case .snapshot(let value) = event { snapshot = value }
        if case .reactions(let target, _, let values) = event { reactionTarget = target; reactionValues = values }
    }
    func message(_ identifier: String) -> NativeGroupText? { messages.first { $0.identifier == identifier } }
}
