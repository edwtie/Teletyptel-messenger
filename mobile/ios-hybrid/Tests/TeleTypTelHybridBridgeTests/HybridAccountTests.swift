import Combine
import Foundation
import XCTest
@testable import TeleTypTelCore
@testable import TeleTypTelHybridBridge

@MainActor
private final class AccountFixture: HybridAccountPort {
    var value = HybridAccountState()
    var state: HybridAccountState { value }
    let subject = PassthroughSubject<HybridAccountState, Never>()
    var changes: AnyPublisher<HybridAccountState, Never> { subject.eraseToAnyPublisher() }
    var remember: Bool?
    var commands: [String] = []
    var onSocial: (() -> Void)?
    var logouts = 0
    func update(epoch: String, active: Bool) {
        value.providers = ["google"]; value.rememberAvailable = true; value.entryAvailable = true; value.registrationAvailable = true
        value.owner = active ? "fixture@localhost" : nil
        value.profile = active ? HybridProfile(jid: "fixture@localhost", name: "Fixture", phone: "", language: "nl", color: "#2563eb") : nil
    }
    func prepareLogin(jid: String, password: String, remember: Bool) { self.remember = remember }
    func command(_ name: String, arguments: [String: String]) throws { commands.append(name); if name == "auth.social" { onSocial?() } }
    func cancelAuthentication() { value.busy = false }
    func logout() { logouts += 1; value.profile = nil; value.owner = nil }
}

@MainActor
final class HybridAccountTests: XCTestCase {
    private let document = URL(string: "capacitor://localhost/chat.html")!
    private func command(_ session: HybridSession, _ name: String, _ args: [String: String] = [:], epoch: String? = nil) throws -> HybridReply {
        try session.handle(encoded(name, args, epoch: epoch ?? session.snapshot().epoch), document: document, mainFrame: true)
    }
    private func eventually(_ predicate: () -> Bool) async {
        for _ in 0..<200 { if predicate() { return }; try? await Task.sleep(nanoseconds: 5_000_000) }
        XCTFail("Expected isolated account state")
    }
    func testProviderCapabilityAndSingleExistingLoginMotorWithoutExposingTheProof() async throws {
        let fixture = SessionFixture(); let account = AccountFixture()
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let config = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: model, configuration: config, nativeLogout: {}, account: account)
        defer { model.disconnect() }
        account.onSocial = { model.login(address: config.origin.absoluteString, domain: config.domain, jid: "fixture@localhost", password: "fixture-password") }
        XCTAssertTrue(session.snapshot().socialLoginAvailable)
        XCTAssertThrowsError(try command(session, "auth.social", ["provider": "facebook"]))
        let oldEpoch = session.snapshot().epoch
        _ = try command(session, "auth.social", ["provider": "google"])
        await eventually { model.isConnected }
        XCTAssertEqual(account.commands, ["auth.social"])
        let connections = await fixture.connections; XCTAssertEqual(connections, 1)
        XCTAssertThrowsError(try command(session, "session.logout", epoch: oldEpoch))
        let text = String(data: try JSONEncoder().encode(session.snapshot()), encoding: .utf8)!
        XCTAssertFalse(text.contains("fixture-password")); XCTAssertFalse(text.contains("csrfToken"))
        _ = try command(session, "session.logout")
        XCTAssertNil(session.snapshot().account.profile); XCTAssertEqual(account.logouts, 1)
    }
    func testRememberIsExplicitAndConnectedProfileCommandsCannotRunBeforeLogin() async throws {
        let fixture = SessionFixture(); let account = AccountFixture()
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let config = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: model, configuration: config, nativeLogout: {}, account: account)
        defer { model.disconnect() }
        XCTAssertThrowsError(try command(session, "account.refresh"))
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password", "remember": "true"])
        XCTAssertEqual(account.remember, true)
        await eventually { model.isConnected }
        _ = try command(session, "account.save", ["name": "Changed", "phone": "", "language": "en", "color": "#123456"])
        XCTAssertEqual(account.commands, ["account.save"])
    }
    func testSIPContactsAreScopedToAccountAndServerAndNormalizeBothTargetKinds() throws {
        let suite = "SIP-contacts-test-" + UUID().uuidString
        let storage = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { storage.removePersistentDomain(forName: suite) }
        let directory = HybridSIPDirectory(storage: storage)
        let origin = try XCTUnwrap(URL(string: "https://fixture.test"))
        let otherOrigin = try XCTUnwrap(URL(string: "https://other.test"))
        let uri = try HybridSIPContact(id: UUID(), name: "Tolk", destination: "sip:Naam@Provider.TEST")
        let number = try HybridSIPContact(id: UUID(), name: "Test", destination: "+31 (70) 123-4567")
        XCTAssertEqual(uri.destination, "Naam@provider.test")
        XCTAssertEqual(number.destination, "+31701234567")
        for invalid in ["https://provider.test", "abc", "x@bad..test", "x@host.test?header=private", "12\n34"] {
            XCTAssertThrowsError(try HybridSIPContact(id: UUID(), name: "Niet geldig", destination: invalid))
        }
        try directory.save(uri, origin: origin, account: "owner-one")
        try directory.save(number, origin: origin, account: "owner-one")
        XCTAssertEqual(HybridSIPDirectory(storage: storage).contacts(origin: origin, account: "owner-one"), [uri, number])
        XCTAssertTrue(directory.contacts(origin: origin, account: "owner-two").isEmpty)
        XCTAssertTrue(directory.contacts(origin: otherOrigin, account: "owner-one").isEmpty)
        try directory.remove(uri.id, origin: origin, account: "owner-one")
        XCTAssertEqual(directory.contacts(origin: origin, account: "owner-one"), [number])
    }

    func testAccountProtocolRejectsArbitraryURLsTokensAndMissingConsent() {
        let epoch = UUID().uuidString
        for (name, args) in [("auth.social", ["provider": "google", "token": "fake"]), ("account.avatar", ["url": "file:///private"]),
                             ("auth.register", ["jid": "fixture@localhost", "name": "Fixture", "password": "Fixture123!", "consent": "false"]),
                             ("contacts.add", ["jid": "peer@localhost", "name": "Peer", "presence": "1"]),
                             ("account.sip.save", ["id": "", "name": "Test", "destination": "https://example.test"]),
                             ("account.sip.save", ["id": "", "name": "Test", "destination": "600", "accountId": "other"]),
                             ("account.save", ["accountId": "other", "name": "Name", "phone": "", "language": "nl", "color": "#123456"])] {
            XCTAssertThrowsError(try HybridRequest.decode(encoded(name, args, epoch: epoch)))
        }
        for name in ["session.logout", "session.cancel", "auth.biometric", "account.refresh"] {
            XCTAssertThrowsError(try HybridRequest.decode(encoded(name)))
        }
    }

    func testNativePresentationCannotMarkCoveredChatMessagesRead() async throws {
        let fixture = SessionFixture(); let account = AccountFixture()
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let config = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: model, configuration: config, nativeLogout: {}, account: account)
        defer { model.disconnect() }
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { model.isConnected }
        await fixture.emitRoster(.ready([NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both")]))
        await eventually { session.snapshot().roster.contacts.count == 1 }
        _ = try command(session, "chat.open", ["peer": "peer@localhost"])
        await fixture.emitChat(.message(peer: "peer@localhost", identifier: "covered-fixture", body: "Achter een native venster"))
        await eventually { model.chat.messages.count == 1 }
        let identifier = model.chat.messages[0].id.uuidString
        account.value.presentation = true
        XCTAssertThrowsError(try command(session, "chat.displayed", ["peer": "peer@localhost", "ids": identifier]))
        XCTAssertNotEqual(model.chat.messages[0].locallyRead, true)
        account.value.presentation = false
        _ = try command(session, "chat.displayed", ["peer": "peer@localhost", "ids": identifier])
        XCTAssertEqual(model.chat.messages[0].locallyRead, true)
    }
}
