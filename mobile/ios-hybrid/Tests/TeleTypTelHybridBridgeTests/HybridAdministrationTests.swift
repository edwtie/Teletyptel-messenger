import Foundation
import XCTest
@testable import TeleTypTelCore
@testable import TeleTypTelHybridBridge

@MainActor
final class HybridAdministrationTests: XCTestCase {
    private let room = "familie@conference.localhost"
    private func command(_ session: HybridSession, _ name: String, _ args: [String: String]) throws {
        _ = try session.handle(encoded(name, args, epoch: session.snapshot().epoch), document: URL(string: "capacitor://localhost/chat.html"), mainFrame: true)
    }
    private func eventually(_ condition: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<300 { if await condition() { return }; try? await Task.sleep(nanoseconds: 5_000_000) }
        XCTFail("Native group state not reached", file: file, line: line)
    }
    private func joined(_ affiliation: String) async throws -> (SessionFixture, NativeLoginModel, HybridSession) {
        let fixture = SessionFixture(); await fixture.setGroupAffiliation(affiliation)
        let login = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let configuration = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: login, configuration: configuration, nativeLogout: {})
        try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-only"])
        await eventually { login.isConnected && login.groups.available }
        await fixture.emitRoster(.ready([NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both")]))
        await eventually { session.snapshot().roster.contacts.count == 1 }
        try command(session, "groups.join", ["room": room, "nickname": "Fixture", "create": "false"])
        await eventually { session.snapshot().groups.first?.joined == true }
        return (fixture, login, session)
    }
    private func save(_ token: String) -> [String: String] {
        ["room": room, "token": token, "name": "Nieuwe familie", "description": "Besloten", "membersOnly": "true", "moderated": "false",
         "publicRoom": "false", "persistent": "true", "allowInvites": "true", "confirmed": "true"]
    }
    func testOnlyOwnersConfigureAndUnknownServerFieldsRemainNative() async throws {
        let (fixture, login, session) = try await joined("owner"); defer { login.disconnect() }
        try command(session, "groups.configuration", ["room": room])
        await eventually { session.snapshot().groupAdministration?.configuration != nil }
        let configuration = session.snapshot().groupAdministration!.configuration!
        XCTAssertEqual(configuration.editableFields, ["membersOnly", "name"])
        let projected = String(decoding: try JSONEncoder().encode(session.snapshot()), as: UTF8.self)
        XCTAssertFalse(projected.contains("custom-server-field")); XCTAssertFalse(projected.contains("preserve-me"))
        var unsupported = save(configuration.token); unsupported["publicRoom"] = "true"
        XCTAssertThrowsError(try command(session, "groups.configure", unsupported))
        var unconfirmed = save(configuration.token); unconfirmed["confirmed"] = "false"
        XCTAssertThrowsError(try command(session, "groups.configure", unconfirmed))
        try command(session, "groups.configure", save(configuration.token))
        XCTAssertNil(session.snapshot().groupAdministration?.configuration)
        await eventually { await fixture.configurationSaves.count == 1 }
        let saved = await fixture.configurationSaves[0]
        XCTAssertEqual(saved.name, "Nieuwe familie"); XCTAssertEqual(saved.fields["custom-server-field"], ["preserve-me"])
        XCTAssertThrowsError(try command(session, "groups.configure", save(configuration.token)))
    }
    func testRoleLossAndNavigationInvalidateTheConfigurationLease() async throws {
        let (fixture, login, session) = try await joined("owner"); defer { login.disconnect() }
        try command(session, "groups.configuration", ["room": room])
        await eventually { session.snapshot().groupAdministration?.configuration != nil }
        let token = session.snapshot().groupAdministration!.configuration!.token
        try command(session, "chat.open", ["peer": "peer@localhost"])
        try command(session, "chat.open", ["peer": room, "kind": "group"])
        XCTAssertThrowsError(try command(session, "groups.configure", save(token)))
        await fixture.setGroupAffiliation("member", room: room)
        await eventually { session.snapshot().groupAdministration?.canConfigure == false }
        XCTAssertThrowsError(try command(session, "groups.configuration", ["room": room]))
        XCTAssertThrowsError(try command(session, "groups.members", ["room": room, "affiliation": "member"]))
    }
    func testMembershipRequiresKnownTargetsConfirmationAndServerAuthority() async throws {
        let (fixture, login, session) = try await joined("admin"); defer { login.disconnect() }
        XCTAssertThrowsError(try command(session, "groups.configuration", ["room": room]))
        var args = ["room": room, "peer": "member@localhost", "affiliation": "none", "confirmed": "true"]
        XCTAssertThrowsError(try command(session, "groups.affiliation", args))
        try command(session, "groups.members", ["room": room, "affiliation": "member"])
        await eventually { session.snapshot().groupAdministration?.members == ["member@localhost"] }
        args["affiliation"] = "admin"
        XCTAssertThrowsError(try command(session, "groups.affiliation", args))
        args["peer"] = "fixture@localhost"; args["affiliation"] = "none"
        XCTAssertThrowsError(try command(session, "groups.affiliation", args))
        args["peer"] = "member@localhost"; args["confirmed"] = "false"
        XCTAssertThrowsError(try command(session, "groups.affiliation", args))
        args["confirmed"] = "true"; try command(session, "groups.affiliation", args)
        await eventually { await fixture.affiliationSaves == ["member@localhost:none"] }
        XCTAssertTrue(session.snapshot().groupAdministration!.members.isEmpty)
    }
}
