import Foundation

struct NativeCloudHistoryClient: NativeCloudHistoryServing {
    let session: NativeAccountWebSession
    let accountID: String
    let owner: String

    func conversations() async throws -> [NativeCloudConversation] {
        do {
            try Task.checkCancellation()
            try validateScope()
            guard await session.hasSessionCookie else { throw NativeCloudHistoryFailure.unavailable }
            let data = try await session.cloudHistory(accountID: accountID, kind: "conversations")
            let reply = try JSONDecoder().decode(ConversationReply.self, from: data)
            guard reply.ok, reply.accountId == accountID, reply.owner == owner, reply.conversations.count <= 32,
                  Set(reply.conversations.map { $0.kind + "\u{0}" + $0.peer }).count == reply.conversations.count,
                  reply.conversations.allSatisfy({
                      NativeChatCodec.bareJID($0.peer) == $0.peer && ["contact", "group"].contains($0.kind) &&
                          $0.name.utf8.count <= 1024 && !$0.name.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
                  }) else { throw NativeCloudHistoryFailure.invalidResponse }
            try Task.checkCancellation()
            return reply.conversations
        } catch { throw Self.failure(error) }
    }

    func fetch(peer: String, kind: String, before: String?) async throws -> NativeCloudHistoryPage {
        do {
            try Task.checkCancellation()
            try validateScope()
            guard NativeChatCodec.bareJID(peer) == peer, ["contact", "group"].contains(kind), Self.validCursor(before) else {
                throw NativeCloudHistoryFailure.invalidResponse
            }
            guard await session.hasSessionCookie else { throw NativeCloudHistoryFailure.unavailable }
            let data = try await session.cloudHistory(accountID: accountID, peer: peer, kind: kind, before: before)
            let reply = try JSONDecoder().decode(PageReply.self, from: data)
            guard reply.ok, reply.accountId == accountID, reply.owner == owner,
                  reply.messages.count <= 50, Self.validCursor(reply.nextCursor),
                  Set(reply.messages.map(\.key)).count == reply.messages.count else { throw NativeCloudHistoryFailure.invalidResponse }
            for message in reply.messages { try message.validate(owner: owner, peer: peer, kind: kind, requireVersion: true) }
            try Task.checkCancellation()
            return NativeCloudHistoryPage(messages: reply.messages, nextCursor: reply.nextCursor, saveChat: reply.saveChat)
        } catch { throw Self.failure(error) }
    }

    func save(_ message: NativeCloudMessage, expectedVersion: String?) async throws -> NativeCloudMessage {
        do {
            try Task.checkCancellation()
            try validateScope()
            try message.validate(owner: owner)
            guard expectedVersion.map(NativeCloudMessage.validVersion) ?? true,
                  !message.sender.isEmpty || expectedVersion != nil,
                  message.version == nil || message.version == expectedVersion else { throw NativeCloudHistoryFailure.invalidResponse }
            guard await session.hasSessionCookie else { throw NativeCloudHistoryFailure.unavailable }
            let body = try JSONEncoder().encode(SaveRequest(accountId: accountID, message: message, expectedVersion: expectedVersion))
            guard body.count <= 32768 else { throw NativeCloudHistoryFailure.invalidResponse }
            let profile = try JSONDecoder().decode(ProfileReply.self, from: await session.request(.profile))
            guard profile.ok, profile.profile.accountId == accountID, profile.profile.jid == owner,
                  profile.csrfToken.range(of: #"\A[0-9a-f]{64}\z"#, options: .regularExpression) != nil else {
                throw NativeCloudHistoryFailure.invalidResponse
            }
            try Task.checkCancellation()
            let data = try await session.cloudHistory(body: body, accountID: accountID, csrf: profile.csrfToken)
            let reply = try JSONDecoder().decode(SaveReply.self, from: data)
            guard reply.ok, reply.accountId == accountID, reply.owner == owner,
                  message.hasSameIdentity(as: reply.message) else { throw NativeCloudHistoryFailure.invalidResponse }
            try reply.message.validate(owner: owner, peer: message.peer, kind: message.kind, requireVersion: true)
            try Task.checkCancellation()
            return reply.message
        } catch { throw Self.failure(error) }
    }

    private func validateScope() throws {
        guard NativeCloudMessage.validIdentifier(accountID, maximum: 96),
              NativeAuthenticatedAccount.validJID(owner, domain: session.configuration.domain) else { throw NativeCloudHistoryFailure.invalidResponse }
    }

    private static func validCursor(_ value: String?) -> Bool {
        value.map { NativeCloudMessage.validIdentifier($0, maximum: 1024) } ?? true
    }

    private static func failure(_ error: Error) -> Error {
        if error is CancellationError || (error as? URLError)?.code == .cancelled { return CancellationError() }
        if let error = error as? NativeCloudHistoryFailure { return error }
        if error is DecodingError || error is EncodingError || (error as? NativeAccountFailure) == .invalidResponse {
            return NativeCloudHistoryFailure.invalidResponse
        }
        if let error = error as? NativeWebServiceFailure {
            if error.status == 409 { return NativeCloudHistoryFailure.conflict }
            if error.status == 403, ["cloud_history_disabled", "save_disabled", "save-disabled", "save_chat_disabled", "history_disabled"].contains(error.code) {
                return NativeCloudHistoryFailure.disabled
            }
            if error.status == 503, error.code == "cloud_history_unavailable" { return NativeCloudHistoryFailure.unavailable }
            if [404, 405, 410, 501].contains(error.status) { return NativeCloudHistoryFailure.unavailable }
        }
        return NativeCloudHistoryFailure.failed
    }

    private struct PageReply: Decodable {
        let ok: Bool
        let accountId: String
        let owner: String
        let messages: [NativeCloudMessage]
        let nextCursor: String?
        let saveChat: Bool

        private enum CodingKeys: String, CodingKey { case ok, accountId, owner, messages, nextCursor, saveChat }
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            ok = try container.decode(Bool.self, forKey: .ok)
            accountId = try container.decode(String.self, forKey: .accountId)
            owner = try container.decode(String.self, forKey: .owner)
            messages = try container.decode([NativeCloudMessage].self, forKey: .messages)
            nextCursor = try container.decode(String?.self, forKey: .nextCursor)
            saveChat = try container.decode(Bool.self, forKey: .saveChat)
        }
    }

    private struct ConversationReply: Decodable {
        let ok: Bool
        let accountId: String
        let owner: String
        let saveChat: Bool
        let conversations: [NativeCloudConversation]
    }

    private struct SaveRequest: Encodable {
        let accountId: String
        let message: NativeCloudMessage
        let expectedVersion: String?

        private enum CodingKeys: String, CodingKey { case accountId, message, expectedVersion }
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(accountId, forKey: .accountId)
            try container.encode(message, forKey: .message)
            try container.encode(expectedVersion, forKey: .expectedVersion)
        }
    }

    private struct SaveReply: Decodable {
        let ok: Bool
        let accountId: String
        let owner: String
        let message: NativeCloudMessage
    }

    private struct ProfileReply: Decodable {
        let ok: Bool
        let profile: Account
        let csrfToken: String
        struct Account: Decodable { let accountId: String; let jid: String }
    }
}
