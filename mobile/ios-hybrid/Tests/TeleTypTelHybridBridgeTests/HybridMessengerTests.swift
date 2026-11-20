import Combine
import Foundation
import XCTest
@testable import TeleTypTelCore
@testable import TeleTypTelHybridBridge

@MainActor
private final class CallFixture: HybridCallPort {
    var state = HybridCallState()
    let subject = PassthroughSubject<HybridCallState, Never>()
    var changes: AnyPublisher<HybridCallState, Never> { subject.eraseToAnyPublisher() }
    var starts = 0
    var actions: [String] = []
    var placement: HybridVideoPlacement?

    func canCall(peer: String) -> Bool { peer == "peer@localhost" && state.phase == "idle" }
    func start(peer: String, mode: String) throws {
        starts += 1
        state.phase = "active"; state.id = UUID().uuidString.lowercased(); state.peer = peer; state.mode = mode
        state.rttReady = true; state.cameraEnabled = true; state.canSendDtmf = true
        subject.send(state)
    }
    func control(id: String, action: String, value: String?) throws {
        guard state.id == id else { throw HybridFailure.invalidState }
        actions.append(action)
        if action == "rtt" { state.ownText = value! }
        if action == "mute" { state.muted.toggle() }
        if action == "camera" { state.cameraEnabled.toggle() }
        if action == "end" { state = HybridCallState() }
        subject.send(state)
    }
    func placeVideo(id: String, placement: HybridVideoPlacement) throws {
        guard state.id == id else { throw HybridFailure.invalidState }
        self.placement = placement
    }
}

@MainActor
final class HybridMessengerTests: XCTestCase {
    private let document = URL(string: "capacitor://localhost/chat.html")!

    private func command(_ session: HybridSession, _ command: String, _ arguments: [String: String] = [:], epoch: String? = nil) throws -> HybridReply {
        try session.handle(encoded(command, arguments, epoch: epoch ?? session.snapshot().epoch), document: document, mainFrame: true)
    }

    private func eventually(_ predicate: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<400 {
            if await predicate() { return }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
        XCTFail("Expected isolated messenger state", file: file, line: line)
    }

    private func connected(calls: (any HybridCallPort)? = nil) async throws -> (SessionFixture, NativeLoginModel, HybridSession) {
        let fixture = SessionFixture()
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let config = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: model, configuration: config, nativeLogout: {}, calls: calls)
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { model.isConnected && model.canSend }
        await fixture.emitRoster(.ready([NativeContact(jid: "peer@localhost", name: "Fixture Peer", groups: [], subscription: "both", presence: .online)]))
        await eventually { session.snapshot().roster.contacts.count == 1 }
        _ = try command(session, "chat.open", ["peer": "peer@localhost"])
        return (fixture, model, session)
    }

    func testChatSendsThroughTheExistingNativeConnectionAndPreservesUnconfirmedReceipts() async throws {
        let (fixture, model, session) = try await connected()
        defer { model.disconnect() }
        _ = try command(session, "chat.draft", ["peer": "peer@localhost", "body": "Hallo 👋"])
        XCTAssertEqual(session.snapshot().conversation?.draft, "Hallo 👋")
        _ = try command(session, "chat.send", ["peer": "peer@localhost", "body": "Hallo 👋"])
        await eventually { model.chat.messages.first?.state == .submitted }
        XCTAssertEqual(session.snapshot().conversation?.draft, "")
        XCTAssertEqual(session.snapshot().conversation?.messages.first?.body, "Hallo 👋")
        XCTAssertEqual(session.snapshot().conversation?.messages.first?.delivery, "unconfirmed")
        let bodies = await fixture.sentBodies
        let connections = await fixture.connections
        XCTAssertEqual(bodies, ["Hallo 👋"])
        XCTAssertEqual(connections, 1)
        let identifier = model.chat.messages[0].stanzaID!
        await fixture.emitChat(.interaction(peer: "peer@localhost", identifier: "receipt-fixture", value: .receipt(target: identifier, displayed: true)))
        await eventually { session.snapshot().conversation?.messages.first?.delivery == "displayed" }
    }

    func testIncomingMessagesAreNotMarkedReadUntilTheWebViewportAcknowledgesThem() async throws {
        let (fixture, model, session) = try await connected()
        defer { model.disconnect() }
        await fixture.emitChat(.message(peer: "peer@localhost", identifier: "incoming-fixture", body: "Alleen zichtbaar lezen"))
        await eventually { session.snapshot().conversation?.messages.count == 1 }
        let identifier = model.chat.messages[0].id
        XCTAssertNil(model.visibleConversation)
        XCTAssertNotEqual(model.chat.messages[0].locallyRead, true)
        XCTAssertThrowsError(try command(session, "chat.displayed", ["peer": "peer@localhost", "ids": UUID().uuidString]))
        _ = try command(session, "chat.displayed", ["peer": "peer@localhost", "ids": identifier.uuidString])
        XCTAssertEqual(model.chat.messages[0].locallyRead, true)
        _ = try command(session, "chat.hide", ["peer": "peer@localhost", "id": identifier.uuidString])
        XCTAssertEqual(session.snapshot().conversation?.messages.count, 0)
        XCTAssertTrue(model.chat.messages[0].hidden)
    }

    func testOwnMessageCorrectionReactionAndRetractionReuseNativePolicies() async throws {
        let (_, model, session) = try await connected()
        defer { model.disconnect() }
        _ = try command(session, "chat.send", ["peer": "peer@localhost", "body": "Voor wijziging"])
        await eventually { model.chat.messages.first?.state == .submitted }
        let identifier = model.chat.messages[0].id.uuidString
        _ = try command(session, "chat.edit", ["peer": "peer@localhost", "id": identifier, "body": "Na wijziging"])
        await eventually { model.chat.messages.first?.edited == true }
        XCTAssertEqual(session.snapshot().conversation?.messages.first?.body, "Na wijziging")
        _ = try command(session, "chat.react", ["peer": "peer@localhost", "id": identifier, "emoji": "👍"])
        await eventually { session.snapshot().conversation?.messages.first?.reactions.count == 1 }
        _ = try command(session, "chat.retract", ["peer": "peer@localhost", "id": identifier])
        await eventually { session.snapshot().conversation?.messages.first?.retracted == true }
        XCTAssertEqual(session.snapshot().conversation?.messages.first?.body, "Bericht verwijderd")
    }

    func testCallAndRttControlsNeverSendChatMessagesAndStaleCallIDsFail() async throws {
        let calls = CallFixture()
        let (fixture, model, session) = try await connected(calls: calls)
        defer { model.disconnect() }
        XCTAssertTrue(session.snapshot().roster.contacts[0].canCall)
        _ = try command(session, "chat.draft", ["peer": "peer@localhost", "body": "Concept blijft"])
        _ = try command(session, "calls.start", ["peer": "peer@localhost", "mode": "total"])
        let identifier = calls.state.id!
        XCTAssertNil(session.snapshot().conversation)
        XCTAssertNil(model.visibleConversation)
        XCTAssertThrowsError(try command(session, "chat.send", ["peer": "peer@localhost", "body": "Niet tijdens TC"]))
        for (action, value) in [("rtt", "Live tekst"), ("dtmf", "#"), ("mute", nil), ("camera", nil)] as [(String, String?)] {
            var args = ["id": identifier, "action": action]
            if let value = value { args["value"] = value }
            _ = try command(session, "calls.control", args)
        }
        XCTAssertEqual(calls.state.ownText, "Live tekst")
        XCTAssertEqual(calls.actions, ["rtt", "dtmf", "mute", "camera"])
        XCTAssertTrue(model.chat.messages.isEmpty)
        _ = try command(session, "calls.layout", ["id": identifier, "x": "0", "y": "55", "width": "390", "height": "300", "viewportWidth": "390", "viewportHeight": "844"])
        XCTAssertEqual(calls.placement?.height, 300)
        _ = try command(session, "calls.control", ["id": identifier, "action": "end"])
        XCTAssertEqual(session.snapshot().conversation?.draft, "Concept blijft")
        XCTAssertThrowsError(try command(session, "calls.control", ["id": identifier, "action": "rtt", "value": "Oud gesprek"]))
        let connectionCount = await fixture.connections
        XCTAssertEqual(connectionCount, 1)
    }

    func testDelayedPreviousAccountCommandsAndUnknownPeersCannotMutateTheNewAccount() async throws {
        let (_, model, session) = try await connected()
        defer { model.disconnect() }
        let oldEpoch = session.snapshot().epoch
        _ = try command(session, "session.logout")
        XCTAssertNotEqual(oldEpoch, session.snapshot().epoch)
        XCTAssertThrowsError(try command(session, "chat.draft", ["peer": "peer@localhost", "body": "Privé vorig account"], epoch: oldEpoch))
        XCTAssertNil(session.snapshot().conversation)
        XCTAssertTrue(model.chat.messages.isEmpty)
        XCTAssertThrowsError(try command(session, "chat.open", ["peer": "unknown@localhost"]))
    }

    func testProtocolBoundsRejectUnscopedCommandsInvalidTonesAndOffscreenNativeVideo() throws {
        let epoch = UUID().uuidString
        XCTAssertThrowsError(try HybridRequest.decode(encoded("chat.send", ["peer": "peer@localhost", "body": "test"])))
        for args in [["id": UUID().uuidString, "action": "dtmf", "value": "AB"], ["id": UUID().uuidString, "action": "mute", "value": "true"]] {
            XCTAssertThrowsError(try HybridRequest.decode(encoded("calls.control", args, epoch: epoch)))
        }
        XCTAssertThrowsError(try HybridRequest.decode(encoded("chat.draft", ["peer": "peer@localhost", "body": String(repeating: "a", count: 8193)], epoch: epoch)))
        XCTAssertThrowsError(try HybridRequest.decode(Data(repeating: 32, count: 65537)))
        XCTAssertNoThrow(try HybridRequest.decode(encoded("chat.send", ["peer": "peer@localhost", "body": String(repeating: "\n", count: 8191) + "x"], epoch: epoch)))
        XCTAssertThrowsError(try HybridVideoPlacement(arguments: ["x": "390", "y": "0", "width": "100", "height": "100", "viewportWidth": "390", "viewportHeight": "844"]))
        XCTAssertThrowsError(try HybridVideoPlacement(arguments: ["x": "nan", "y": "0", "width": "100", "height": "100", "viewportWidth": "390", "viewportHeight": "844"]))
    }
}
