import Foundation
import CryptoKit

public struct NativeHistoryScope: Codable, Equatable, Sendable {
    public let origin: String
    public let domain: String
    public let owner: String
    init(configuration: ServerConfiguration, owner: String) throws {
        guard NativeAuthenticatedAccount.validJID(owner, domain: configuration.domain) else { throw NativeAccountFailure.invalidResponse }
        origin = configuration.origin.absoluteString; domain = configuration.domain; self.owner = owner
    }
    var identity: Data { Data((origin + "\u{0}" + domain + "\u{0}" + owner).utf8) }
    var filename: String { SHA256.hash(data: identity).map { String(format: "%02x", $0) }.joined() }
}

public struct NativeGroupHistory: Codable, Equatable {
    let room: String
    let nickname: String
    let draft: String
    let subject: String
    var messages: [NativeGroupText]
    let tombstones: [String: String]
    init(_ room: NativeGroupConversation) {
        self.room = room.room; nickname = room.nickname; draft = room.draft; subject = room.subject
        messages = room.messages; tombstones = room.retractionTombstones
    }
    var conversation: NativeGroupConversation {
        var restored = NativeGroupConversation(room: room, nickname: nickname, snapshot: nil, joining: false)
        restored.draft = draft; restored.subject = subject; restored.messages = messages
        restored.retractionTombstones = tombstones
        for index in restored.messages.indices {
            if restored.messages[index].state == .sending { restored.messages[index].state = .uncertain }
            restored.messages[index].actionPending = false
        }
        return restored
    }
}

public struct NativeHistorySnapshot: Codable, Equatable {
    let version: Int
    let scope: NativeHistoryScope
    var chat: NativeChatStore
    var contacts: [NativeContact]
    var groups: [NativeGroupHistory]
    init(scope: NativeHistoryScope, chat: NativeChatStore, contacts: [NativeContact], groups: [NativeGroupHistory]) {
        version = 1; self.scope = scope; self.chat = chat; self.contacts = contacts; self.groups = groups
    }
    var valid: Bool {
        version == 1 && chat.validHistory && contacts.count <= 128 &&
        Set(contacts.map(\.jid)).count == contacts.count && contacts.allSatisfy { NativeChatCodec.bareJID($0.jid) == $0.jid && $0.name.utf8.count <= 256 } &&
        groups.count <= 8 && Set(groups.map(\.room)).count == groups.count && groups.allSatisfy { group in
            NativeMUCStream.validNickname(group.nickname) && NativeChatCodec.bareJID(group.room) == group.room &&
            group.draft.utf8.count <= 8192 && group.subject.utf8.count <= 512 && group.messages.count <= 200 && group.tombstones.count <= 128 &&
            group.messages.allSatisfy { $0.room == group.room && NativeMUCStream.validNickname($0.nickname) &&
                $0.reactions.count <= 64 && $0.reactions.values.allSatisfy { $0.count <= 16 && $0.allSatisfy(NativeInteractionCodec.validReaction) } &&
                (($0.hidden || $0.retracted) ? $0.body.isEmpty : NativeChatCodec.validBody($0.body)) }
        }
    }
    var storageValue: Self {
        var result = self
        result.chat.interrupt()
        if !chat.preferences.keepHistory {
            result.chat = NativeChatStore(); result.chat.preferences = chat.preferences
            result.contacts = []; result.groups = []
        }
        return result
    }
}

@MainActor
public protocol NativeHistoryStoring: AnyObject {
    func load(_ scope: NativeHistoryScope) throws -> NativeHistorySnapshot?
    func save(_ snapshot: NativeHistorySnapshot) throws
    func remove(_ scope: NativeHistoryScope) throws
}

enum NativeHistoryCrypto {
    static let maximum = 16 * 1024 * 1024
    static func seal(_ snapshot: NativeHistorySnapshot, key: SymmetricKey) throws -> Data {
        let value = snapshot.storageValue
        guard value.valid, key.bitCount == 256 else { throw NativeAccountFailure.invalidResponse }
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= maximum, let sealed = try AES.GCM.seal(bytes, using: key, authenticating: value.scope.identity).combined else { throw NativeAccountFailure.invalidResponse }
        return sealed
    }
    static func open(_ bytes: Data, scope: NativeHistoryScope, key: SymmetricKey) throws -> NativeHistorySnapshot {
        guard bytes.count <= maximum + 28, key.bitCount == 256 else { throw NativeAccountFailure.invalidResponse }
        let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key, authenticating: scope.identity)
        let snapshot = try JSONDecoder().decode(NativeHistorySnapshot.self, from: plaintext)
        guard snapshot.scope == scope, snapshot.valid else { throw NativeAccountFailure.invalidResponse }
        return snapshot.storageValue
    }
}
