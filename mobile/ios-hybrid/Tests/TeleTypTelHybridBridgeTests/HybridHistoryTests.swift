import Combine
import Foundation
import XCTest
@testable import TeleTypTelCore
@testable import TeleTypTelHybridBridge

@MainActor
private final class HistoryFixture: HybridHistoryPort {
    var state = HybridHistoryState()
    var onOpen: ((String, String) -> Bool)?
    var onArchive: ((String, String) -> Void)?
    let subject = PassthroughSubject<HybridHistoryState, Never>()
    var changes: AnyPublisher<HybridHistoryState, Never> { subject.eraseToAnyPublisher() }
    var commands: [String] = []
    func update(epoch: String, active: Bool) { if active { state.available = true } else { state = HybridHistoryState() } }
    func command(_ name: String, arguments: [String: String]) throws { commands.append(name) }
}

@MainActor
final class HybridHistoryTests: XCTestCase {
    private func command(_ session: HybridSession, _ name: String, _ args: [String: String] = [:], epoch: String? = nil) throws {
        _ = try session.handle(encoded(name, args, epoch: epoch ?? session.snapshot().epoch), document: URL(string: "capacitor://localhost/chat.html"), mainFrame: true)
    }
    private func eventually(_ condition: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<300 { if await condition() { return }; try? await Task.sleep(nanoseconds: 5_000_000) }
        XCTFail("History fixture state not reached", file: file, line: line)
    }
    private func connected(_ history: HistoryFixture, calls: CallFixture? = nil) async throws -> (SessionFixture, NativeLoginModel, HybridSession) {
        let fixture = SessionFixture(); let login = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let configuration = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let session = HybridSession(model: login, configuration: configuration, nativeLogout: {}, calls: calls, history: history)
        try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-only"])
        await eventually { login.isConnected && history.state.available }
        await fixture.emitRoster(.ready([NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both")]))
        await eventually { session.snapshot().roster.contacts.count == 1 }
        return (fixture, login, session)
    }
    func testHistoryOnlyOpensKnownConversationsAndArchivingPreservesTheDraft() async throws {
        let history = HistoryFixture(); let (_, login, session) = try await connected(history); defer { login.disconnect() }
        XCTAssertFalse(history.onOpen?("unknown@localhost", "direct") == true)
        XCTAssertTrue(history.onOpen?("peer@localhost", "direct") == true)
        try command(session, "chat.draft", ["peer": "peer@localhost", "body": "Bewaren"])
        history.onArchive?("peer@localhost", "direct")
        XCTAssertNil(session.snapshot().conversation)
        XCTAssertEqual(login.chat.drafts["peer@localhost"], "Bewaren")
    }
    func testHistoryInspectionNeverMarksVisibleMessagesReadAndLogoutRejectsOldWork() async throws {
        let history = HistoryFixture(); let (fixture, login, session) = try await connected(history); defer { login.disconnect() }
        try command(session, "chat.open", ["peer": "peer@localhost"])
        await fixture.emitChat(.message(peer: "peer@localhost", identifier: "history-incoming", body: "Alleen kijken"))
        await eventually { session.snapshot().conversation?.messages.count == 1 }
        let id = session.snapshot().conversation!.messages[0].id
        history.state.window = HybridHistoryWindow(id: UUID().uuidString, title: "Peer", messages: [], loading: false, hasEarlier: false, canChat: true, notice: nil)
        XCTAssertThrowsError(try command(session, "chat.displayed", ["peer": "peer@localhost", "ids": id]))
        try command(session, "history.search", ["query": "Peer", "archived": "false"])
        XCTAssertEqual(history.commands, ["history.search"])
        let epoch = session.snapshot().epoch; try command(session, "session.logout")
        XCTAssertFalse(session.snapshot().history.available)
        XCTAssertNil(history.state.window)
        XCTAssertThrowsError(try command(session, "history.search", ["query": "", "archived": "false"], epoch: epoch))
    }
    func testCallsAndBackgroundClearHistoricalWindowsWithoutAnotherLogin() async throws {
        let history = HistoryFixture(); let calls = CallFixture(); let (fixture, login, session) = try await connected(history, calls: calls); defer { login.disconnect() }
        history.state.window = HybridHistoryWindow(id: UUID().uuidString, title: "Peer", messages: [], loading: false, hasEarlier: false, canChat: true, notice: nil)
        try command(session, "calls.start", ["peer": "peer@localhost", "mode": "total"])
        XCTAssertFalse(session.snapshot().history.available); XCTAssertNil(history.state.window)
        XCTAssertThrowsError(try command(session, "history.search", ["query": "", "archived": "false"]))
        try command(session, "calls.control", ["id": calls.state.id!, "action": "end"])
        login.beginBackground()
        await eventually { !session.snapshot().history.available }
        let connections = await fixture.connections; XCTAssertEqual(connections, 1)
    }
    func testHistoryProtocolRejectsPathsCursorsUnboundedQueriesAndExtraFields() throws {
        for (name, args) in [("history.open", ["id": "https://private.invalid"]), ("history.open", ["id": UUID().uuidString, "cursor": "private"]),
                             ("history.search", ["query": String(repeating: "x", count: 257), "archived": "true"]),
                             ("history.archive", ["id": UUID().uuidString, "archived": "yes"]), ("history.close", ["peer": "unknown@localhost"])] {
            XCTAssertThrowsError(try HybridRequest.decode(encoded(name, args, epoch: UUID().uuidString)))
        }
    }
}
