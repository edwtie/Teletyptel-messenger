import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeArchiveIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let trustedPort: Int
        let username: String
        let password: String
        let archivePeer: String
    }

    private func fixture() throws -> Fixture {
        guard let file = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in isolated MAM test; no real server was contacted")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
            throw ConnectionFailure.configuration
        }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        guard (1024...65535).contains(fixture.trustedPort), fixture.username.hasPrefix("native-test-"),
              fixture.archivePeer == fixture.username + "-archive" else { throw ConnectionFailure.configuration }
        return fixture
    }

    private func connect(_ account: NativeAuthenticatedAccount, endpoint: ArchiveEndpoint) -> Task<Void, Error> {
        Task {
            try await NativeXMPPConnection().run(account: account, onConnected: { jid in
                Task { await endpoint.setJID(jid) }
            }, onRoster: { _ in }, onChat: { event in
                Task { await endpoint.receive(event) }
            }, onSender: { sender in
                Task { await endpoint.setSender(sender) }
            })
        }
    }

    private func ready(_ endpoint: ArchiveEndpoint) async throws -> any NativeArchiveSending {
        for _ in 0..<1500 {
            if let sender = await endpoint.ready { return sender }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw ConnectionFailure.timeout
    }

    func testRealServerArchivesBothDirectionsAndRestoresAfterReconnect() async throws {
        let fixture = try fixture()
        let configuration = try ServerConfiguration(address: "https://localhost:\(fixture.trustedPort)", domain: "localhost")
        let owner = fixture.username + "@localhost"
        let peer = fixture.archivePeer + "@localhost"
        let account = NativeAuthenticatedAccount(configuration: configuration, jid: owner, password: fixture.password)
        let peerAccount = NativeAuthenticatedAccount(configuration: configuration, jid: peer, password: fixture.password)
        let left = ArchiveEndpoint()
        let right = ArchiveEndpoint()
        let leftConnection = connect(account, endpoint: left)
        let rightConnection = connect(peerAccount, endpoint: right)
        defer { leftConnection.cancel(); rightConnection.cancel() }
        let leftSender = try await ready(left)
        let rightSender = try await ready(right)
        let outgoingID = UUID().uuidString
        let incomingID = UUID().uuidString
        try await leftSender.sendMessage(to: peer, body: "Fictief uitgaand archiefbericht", identifier: outgoingID)
        try await Task.sleep(nanoseconds: 100_000_000)
        try await rightSender.sendMessage(to: owner, body: "Fictief inkomend archiefbericht", identifier: incomingID)
        var page: NativeArchivePage?
        for _ in 0..<30 {
            let result = try await leftSender.fetchArchive(peer: peer, before: nil)
            if result.messages.count == 2 { page = result; break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let archived = try XCTUnwrap(page)
        XCTAssertEqual(archived.owner, owner)
        XCTAssertEqual(archived.peer, peer)
        XCTAssertEqual(archived.messages.map(\.identifier), [outgoingID, incomingID])
        XCTAssertEqual(archived.messages.map(\.outgoing), [true, false])
        XCTAssertEqual(Set(archived.messages.map(\.archiveID)).count, 2)
        let older = try await leftSender.fetchArchive(peer: peer, before: archived.messages[1].archiveID)
        XCTAssertEqual(older.messages.map(\.identifier), [outgoingID])
        let foreign = try await leftSender.fetchArchive(peer: "nobody@localhost", before: nil)
        XCTAssertTrue(foreign.messages.isEmpty)
        leftConnection.cancel()
        _ = try? await leftConnection.value
        let restored = ArchiveEndpoint()
        let restoredConnection = connect(account, endpoint: restored)
        defer { restoredConnection.cancel() }
        let restoredSender = try await ready(restored)
        let restoredPage = try await restoredSender.fetchArchive(peer: peer, before: nil)
        XCTAssertEqual(restoredPage.messages, archived.messages)
        var store = NativeChatStore()
        try store.mergeArchive(restoredPage)
        try store.mergeArchive(restoredPage)
        XCTAssertEqual(store.messages.count, 2)
        XCTAssertEqual(store.messages.first(where: { $0.state != .incoming })?.state, .submitted)
        restoredConnection.cancel()
        rightConnection.cancel()
        _ = try? await restoredConnection.value
        _ = try? await rightConnection.value
        do {
            _ = try await restoredSender.fetchArchive(peer: peer, before: nil)
            XCTFail("Disconnected transport must not fetch history")
        } catch { XCTAssertEqual(error as? NativeChatFailure, .disconnected) }
    }

    func testRealServerRoutesAndArchivesAuthorScopedCorrectionAndRetraction() async throws {
        let fixture = try fixture()
        let configuration = try ServerConfiguration(address: "https://localhost:\(fixture.trustedPort)", domain: "localhost")
        let owner = fixture.username + "@localhost"
        let peer = fixture.archivePeer + "@localhost"
        let left = ArchiveEndpoint(); let right = ArchiveEndpoint()
        let leftConnection = connect(NativeAuthenticatedAccount(configuration: configuration, jid: owner, password: fixture.password), endpoint: left)
        let rightConnection = connect(NativeAuthenticatedAccount(configuration: configuration, jid: peer, password: fixture.password), endpoint: right)
        defer { leftConnection.cancel(); rightConnection.cancel() }
        let sender = try await ready(left)
        _ = try await ready(right)
        let changes = try XCTUnwrap(sender as? any NativeMessageChanging)
        let original = UUID().uuidString; let edit = UUID().uuidString; let retract = UUID().uuidString
        try await sender.sendMessage(to: peer, body: "Fictief origineel voor berichtacties", identifier: original)
        try await changes.changeMessage(to: peer, change: .correct(target: original, body: "Fictief gecorrigeerd"), identifier: edit)
        try await changes.changeMessage(to: peer, change: .retract(target: edit), identifier: retract)
        for _ in 0..<300 {
            if await right.changeCount >= 2 { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        let received = await right.events
        XCTAssertEqual(awaitedChanges(received), [edit, retract])
        var live = NativeChatStore()
        for event in received { live.receive(event) }
        XCTAssertEqual(live.messages.count, 1)
        XCTAssertTrue(live.messages.first?.edited == true)
        XCTAssertTrue(live.messages.first?.retracted == true)
        XCTAssertEqual(live.messages.first?.body, "")
        let rightSender = try await ready(right)
        var archived: NativeArchivePage?
        for _ in 0..<30 {
            let page = try await rightSender.fetchArchive(peer: owner, before: nil)
            if page.messages.contains(where: { $0.identifier == retract && $0.change != nil }) { archived = page; break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let page = try XCTUnwrap(archived)
        print("NATIVE_ACTION_ARCHIVE", page.messages.map { message in
            ["kind": message.change == nil ? (message.retracted ? "tombstone" : "text") : "change",
             "id": message.identifier == original ? "original" : message.identifier == edit ? "edit" : message.identifier == retract ? "retract" : "earlier",
             "outgoing": String(message.outgoing)]
        })
        var restored = NativeChatStore()
        try restored.mergeArchive(page)
        let restoredMessage = restored.messages.first { $0.previousIDs.contains(original) }
        XCTAssertTrue(restoredMessage?.retracted == true)
        XCTAssertEqual(restoredMessage?.body, "")
    }

    private func awaitedChanges(_ events: [NativeChatEvent]) -> [String] {
        events.compactMap { event in if case .change(_, let identifier, _) = event { return identifier }; return nil }
    }
}

private actor ArchiveEndpoint {
    private(set) var events: [NativeChatEvent] = []
    var changeCount: Int { events.reduce(0) { count, event in if case .change = event { return count + 1 }; return count } }
    func receive(_ event: NativeChatEvent) { events.append(event) }
    private var jid: String?
    private var sender: (any NativeArchiveSending)?
    var ready: (any NativeArchiveSending)? { jid == nil ? nil : sender }
    func setJID(_ value: String) { jid = value }
    func setSender(_ value: any NativeChatSending) { sender = value as? any NativeArchiveSending }
}
