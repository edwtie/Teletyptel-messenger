import Combine
import Foundation
import XCTest
@testable import TeleTypTelCore
@testable import TeleTypTelHybridBridge

@MainActor
private final class ExtrasFixture: HybridExtrasPort {
    var state = HybridExtrasState()
    var onStage: ((String, HybridExtrasContext) -> Bool)?
    let subject = PassthroughSubject<HybridExtrasState, Never>()
    var changes: AnyPublisher<HybridExtrasState, Never> { subject.eraseToAnyPublisher() }
    var context: HybridExtrasContext?
    var commands: [String] = []
    func update(_ value: HybridExtrasContext?) { context = value; if value == nil { state = HybridExtrasState() } }
    func command(_ command: String, arguments: [String: String], context: HybridExtrasContext) throws { commands.append(command) }
}

@MainActor
final class HybridFeatureTests: XCTestCase {
    private func command(_ session: HybridSession, _ command: String, _ args: [String: String] = [:], epoch: String? = nil) throws -> HybridReply {
        try session.handle(encoded(command, args, epoch: epoch ?? session.snapshot().epoch), document: URL(string: "capacitor://localhost/chat.html"), mainFrame: true)
    }
    private func eventually(_ predicate: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<300 { if await predicate() { return }; try? await Task.sleep(nanoseconds: 5_000_000) }
        XCTFail("Expected isolated feature state", file: file, line: line)
    }
    private func connected(extras: (any HybridExtrasPort)? = nil) async throws -> (SessionFixture, NativeLoginModel, HybridSession) {
        let fixture = SessionFixture()
        let login = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let configuration = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: login, configuration: configuration, nativeLogout: {}, extras: extras)
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { login.isConnected && login.groups.available }
        await fixture.emitRoster(.ready([NativeContact(jid: "peer@localhost", name: "Fixture", groups: [], subscription: "both")]))
        await eventually { session.snapshot().roster.contacts.count == 1 }
        return (fixture, login, session)
    }

    func testMucUsesExistingNativeGroupSenderAndNoFabricatedReceipts() async throws {
        let (fixture, login, session) = try await connected()
        defer { login.disconnect() }
        _ = try command(session, "groups.join", ["room": "familie", "nickname": "Fixture", "create": "true"])
        await eventually { session.snapshot().groups.first?.joined == true }
        XCTAssertEqual(session.snapshot().conversation?.kind, "group")
        let room = "familie@conference.localhost"
        _ = try command(session, "chat.send", ["peer": room, "kind": "group", "body": "Groepsbericht"])
        await eventually { session.snapshot().conversation?.messages.first?.state == "submitted" }
        XCTAssertEqual(session.snapshot().conversation?.messages.first?.sender, "Fixture")
        XCTAssertEqual(session.snapshot().conversation?.messages.first?.delivery, "unconfirmed")
        XCTAssertFalse(session.snapshot().conversation!.messages[0].canRetract)
        let sent = await fixture.groupBodies; let direct = await fixture.sentBodies
        XCTAssertEqual(sent, ["Groepsbericht"]); XCTAssertTrue(direct.isEmpty)
        XCTAssertThrowsError(try command(session, "chat.send", ["peer": room, "kind": "direct", "body": "Wrong channel"]))
        XCTAssertThrowsError(try command(session, "groups.join", ["room": "other@conference.other.invalid", "nickname": "Fixture", "create": "false"]))
    }

    func testGroupInvitesSubjectAndRoleRequireAJoinedKnownGroupAndServerAuthority() async throws {
        let (fixture, login, session) = try await connected()
        defer { login.disconnect() }
        let room = "familie@conference.localhost"
        _ = try command(session, "groups.join", ["room": room, "nickname": "Fixture", "create": "false"])
        await eventually { session.snapshot().groups.first?.joined == true && login.groups.invitationModel.available }
        _ = try command(session, "groups.subject", ["room": room, "subject": "Nieuw onderwerp"])
        await eventually { session.snapshot().groups.first?.subject == "Nieuw onderwerp" }
        _ = try command(session, "groups.invite", ["room": room, "peer": "peer@localhost"])
        await eventually { await fixture.groupInvites == ["peer@localhost"] }
        _ = try command(session, "groups.role", ["room": room, "nickname": "Peer", "role": "visitor"])
        await eventually { await fixture.groupRoles == ["Peer:visitor"] }
        XCTAssertThrowsError(try command(session, "groups.role", ["room": room, "nickname": "Unknown", "role": "moderator"]))
        _ = try command(session, "groups.leave", ["room": room])
        XCTAssertFalse(session.snapshot().conversation!.canSend)
        XCTAssertThrowsError(try command(session, "chat.send", ["peer": room, "kind": "group", "body": "Niet meer deelnemen"]))
    }

    func testAttachmentOnlyStagesIntoTheCurrentDraftAndOldAccountCallbacksAreRejected() async throws {
        let extras = ExtrasFixture()
        let (fixture, login, session) = try await connected(extras: extras)
        defer { login.disconnect() }
        _ = try command(session, "chat.open", ["peer": "peer@localhost"])
        _ = try command(session, "chat.draft", ["peer": "peer@localhost", "body": "Mijn concept"])
        let context = extras.context!
        _ = try command(session, "files.pick")
        XCTAssertEqual(extras.commands, ["files.pick"])
        XCTAssertTrue(extras.onStage?("Fictieve bijlage", context) == true)
        XCTAssertEqual(session.snapshot().conversation?.draft, "Mijn concept\nFictieve bijlage")
        let bodies = await fixture.sentBodies; XCTAssertTrue(bodies.isEmpty)
        _ = try command(session, "session.logout")
        XCTAssertFalse(extras.onStage?("Late private link", context) == true)
        XCTAssertNil(extras.context)
        XCTAssertTrue(session.snapshot().extras.translations.isEmpty)
    }

    func testTranslationAndFileCommandsNeverAcceptArbitraryBodiesUrlsOrMissingConsent() async throws {
        let epoch = UUID().uuidString
        for (name, args) in [("translation.message", ["id": UUID().uuidString, "text": "Stolen body"]),
                             ("files.open", ["url": "file:///private"]), ("files.pick", ["path": "private.pdf"]),
                             ("translation.settings", ["mode": "automatic", "language": "en", "consent": "false", "liveConsent": "true", "ownLiveConsent": "true"])] {
            XCTAssertThrowsError(try HybridRequest.decode(encoded(name, args, epoch: epoch)))
        }
        let extras = ExtrasFixture()
        let (_, login, session) = try await connected(extras: extras)
        defer { login.disconnect() }
        _ = try command(session, "chat.open", ["peer": "peer@localhost"])
        XCTAssertThrowsError(try command(session, "translation.message", ["id": UUID().uuidString]))
        XCTAssertThrowsError(try command(session, "files.open", ["id": UUID().uuidString]))
        _ = try command(session, "translation.disable")
        XCTAssertEqual(extras.commands, ["translation.disable"])
    }
}
