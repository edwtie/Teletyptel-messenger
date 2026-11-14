import XCTest
import CryptoKit
@testable import TeleTypTelCore

final class NativeHistoryTests: XCTestCase {
    private func scope(_ owner: String = "owner@localhost", address: String = "https://localhost") throws -> NativeHistoryScope {
        try NativeHistoryScope(configuration: ServerConfiguration(address: address, domain: "localhost"), owner: owner)
    }
    private func snapshot(_ scope: NativeHistoryScope) throws -> NativeHistorySnapshot {
        var chat = NativeChatStore()
        chat.receive(.message(peer: "peer@localhost", identifier: "one", body: "Private fictieve tekst 👋"))
        chat.setDraft("Niet verzonden concept", peer: "peer@localhost")
        return NativeHistorySnapshot(scope: scope, chat: chat, contacts: [], groups: [])
    }
    func testEncryptedHistoryRoundTripsDraftsAndMessagesWithoutPlaintext() throws {
        let scope = try scope()
        let value = try snapshot(scope)
        let key = SymmetricKey(size: .bits256)
        let bytes = try NativeHistoryCrypto.seal(value, key: key)
        XCTAssertNil(bytes.range(of: Data("Private fictieve tekst".utf8)))
        XCTAssertEqual(try NativeHistoryCrypto.open(bytes, scope: scope, key: key), value)
        XCTAssertNotEqual(try NativeHistoryCrypto.seal(value, key: key), bytes)
    }
    func testAccountServerKeyAndTamperIsolation() throws {
        let scope = try scope()
        let key = SymmetricKey(size: .bits256)
        let bytes = try NativeHistoryCrypto.seal(snapshot(scope), key: key)
        XCTAssertThrowsError(try NativeHistoryCrypto.open(bytes, scope: self.scope("other@localhost"), key: key))
        XCTAssertThrowsError(try NativeHistoryCrypto.open(bytes, scope: self.scope(address: "https://other.localhost"), key: key))
        XCTAssertThrowsError(try NativeHistoryCrypto.open(bytes, scope: scope, key: SymmetricKey(size: .bits256)))
        var changed = bytes; changed[changed.count / 2] ^= 1
        XCTAssertThrowsError(try NativeHistoryCrypto.open(changed, scope: scope, key: key))
        XCTAssertThrowsError(try NativeHistoryCrypto.open(bytes.prefix(12), scope: scope, key: key))
        XCTAssertNotEqual(scope.filename, try self.scope("other@localhost").filename)
    }
    func testPendingSendsAreRestoredUncertainAndNeverResent() throws {
        let scope = try scope()
        var value = try snapshot(scope)
        let pending = try value.chat.enqueueBody("Pending", peer: "peer@localhost")
        let (_, request) = try value.chat.beginReaction(value.chat.messages[0].id)
        let key = SymmetricKey(size: .bits256)
        let restored = try NativeHistoryCrypto.open(NativeHistoryCrypto.seal(value, key: key), scope: scope, key: key)
        XCTAssertEqual(restored.chat.messages.first { $0.id == pending.id }?.state, .uncertain)
        XCTAssertFalse(restored.chat.messages[0].reactionPending)
        XCTAssertEqual(restored.chat.messages[0].reactionRequest, request)
        XCTAssertEqual(restored.chat.pendingCount, 0)
    }
    func testDisablingHistoryRetainsPreferencesButNotMessageContent() throws {
        let scope = try scope()
        var value = try snapshot(scope)
        value.chat.preferences.keepHistory = false
        value.chat.preferences.sendDisplayed = true
        let key = SymmetricKey(size: .bits256)
        let restored = try NativeHistoryCrypto.open(NativeHistoryCrypto.seal(value, key: key), scope: scope, key: key)
        XCTAssertTrue(restored.chat.messages.isEmpty)
        XCTAssertTrue(restored.chat.drafts.isEmpty)
        XCTAssertTrue(restored.chat.preferences.sendDisplayed)
        XCTAssertFalse(restored.chat.preferences.keepHistory)
    }
    func testLocalDeletionRemainsDeletedAfterRestartAndArchiveRefresh() throws {
        let scope = try scope()
        var value = try snapshot(scope)
        try value.chat.hide(value.chat.messages[0].id)
        let key = SymmetricKey(size: .bits256)
        var restored = try NativeHistoryCrypto.open(NativeHistoryCrypto.seal(value, key: key), scope: scope, key: key)
        try restored.chat.mergeArchive(NativeArchivePage(owner: scope.owner, peer: "peer@localhost", messages: [
            NativeArchivedText(archiveID: "archived", identifier: "one", peer: "peer@localhost", body: "Private fictieve tekst 👋", date: Date(), outgoing: false)
        ], first: "archived", hasEarlier: false))
        XCTAssertTrue(restored.chat.messages[0].hidden)
        XCTAssertEqual(restored.chat.messages[0].body, "")
    }
    func testInvalidOrOversizedSnapshotsAreRejected() throws {
        let scope = try scope()
        var value = try snapshot(scope)
        value.contacts = Array(repeating: NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both"), count: 129)
        XCTAssertThrowsError(try NativeHistoryCrypto.seal(value, key: SymmetricKey(size: .bits256)))
        XCTAssertThrowsError(try NativeHistoryCrypto.open(Data(repeating: 0, count: NativeHistoryCrypto.maximum + 29), scope: scope, key: SymmetricKey(size: .bits256)))
        XCTAssertThrowsError(try NativeHistoryCrypto.seal(snapshot(scope), key: SymmetricKey(size: .bits128)))
    }
}
