import Foundation

enum NativeCloudValue: Codable, Sendable, Equatable {
    case string(String), bool(Bool), object([String: NativeCloudValue]), array([NativeCloudValue]), null, number(Double)

    init(from decoder: Decoder) throws {
        guard decoder.codingPath.count <= 64 else { throw NativeCloudHistoryFailure.invalidResponse }
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode(Double.self), value.isFinite { self = .number(value) }
        else if let value = try? container.decode([NativeCloudValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: NativeCloudValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        guard encoder.codingPath.count <= 64 else { throw NativeCloudHistoryFailure.invalidResponse }
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .number(let value):
            guard value.isFinite else { throw NativeCloudHistoryFailure.invalidResponse }
            try container.encode(value)
        }
    }
}

enum NativeCloudHistoryFailure: Error, Equatable, Sendable {
    case unavailable, invalidResponse, conflict, disabled, failed
}

struct NativeCloudMessage: Codable, Sendable, Equatable {
    var fields: [String: NativeCloudValue]
    private let identity: Identity?

    init(fields: [String: NativeCloudValue]) {
        self.fields = fields
        identity = try? Identity(fields: fields)
    }

    init(from decoder: Decoder) throws {
        self.init(fields: try decoder.singleValueContainer().decode([String: NativeCloudValue].self))
    }

    func encode(to encoder: Encoder) throws {
        try validate()
        var container = encoder.singleValueContainer()
        try container.encode(fields)
    }

    var key: String { kind + "\u{0}" + peer + "\u{0}" + messageID }
    var messageID: String { string("messageId") }
    var peer: String { string("conversationPeer") }
    var kind: String { string("conversationKind") }
    var direction: String { string("direction") }
    var sender: String { string("from") }
    var text: String { string("text") }
    var date: Date { Self.parseDate(string("timestamp")) ?? .distantPast }
    var edited: Bool { fields["edited"] == .bool(true) }
    var retracted: Bool { fields["retracted"] == .bool(true) }
    var reactions: [String: [String]] { Self.parseReactions(fields["reactions"]) ?? [:] }
    var deliveryStatus: String { string("deliveryStatus") }
    var version: String? {
        guard case .string(let value) = fields["version"] else { return nil }
        return value
    }

    private func string(_ key: String) -> String {
        guard case .string(let value) = fields[key] else { return "" }
        return value
    }

    func validate(owner: String? = nil, peer: String? = nil, kind: String? = nil,
                  requireVersion: Bool = false) throws {
        guard let identity = identity, try Identity(fields: fields) == identity,
              Self.validIdentifier(messageID, maximum: 150),
              NativeChatCodec.bareJID(self.peer) == self.peer,
              ["contact", "group"].contains(self.kind), ["self", "peer"].contains(direction),
              case .string = fields["text"], text.utf8.count <= 8192,
              text.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) || [9, 10, 13].contains($0.value) }),
              peer == nil || peer == self.peer, kind == nil || kind == self.kind,
              Self.parseReactions(fields["reactions"]) != nil else { throw NativeCloudHistoryFailure.invalidResponse }
        for field in ["edited", "retracted", "stylingDisabled"] {
            if let value = fields[field] {
                guard case .bool = value else { throw NativeCloudHistoryFailure.invalidResponse }
            }
        }
        if let value = fields["deliveryStatus"] {
            guard case .string = value else { throw NativeCloudHistoryFailure.invalidResponse }
        }
        if let version = version {
            guard Self.validVersion(version) else { throw NativeCloudHistoryFailure.invalidResponse }
        } else if requireVersion || (fields["version"] != nil && fields["version"] != .null) {
            throw NativeCloudHistoryFailure.invalidResponse
        }
        if direction == "self", sender.isEmpty { return }
        if self.kind == "contact" {
            guard let from = NativeChatCodec.bareJID(sender),
                  owner == nil || from == (direction == "self" ? owner : self.peer) else {
                throw NativeCloudHistoryFailure.invalidResponse
            }
        } else {
            let parts = sender.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2, String(parts[0]) == self.peer,
                  !parts[1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  parts[1].utf8.count <= 128, !parts[1].contains("/"),
                  !parts[1].unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else { throw NativeCloudHistoryFailure.invalidResponse }
        }
    }

    func hasSameIdentity(as other: Self) -> Bool {
        guard let identity = identity else { return false }
        return identity == other.identity
    }

    static func validVersion(_ value: String) -> Bool {
        value.range(of: #"\A[0-9a-fA-F]{64}\z"#, options: .regularExpression) != nil
    }

    static func validIdentifier(_ value: String, maximum: Int) -> Bool {
        !value.isEmpty && value.utf8.count <= maximum &&
            !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }

    static func parseDate(_ value: String) -> Date? {
        guard value.utf8.count <= 64 else { return nil }
        if value.range(of: #"\A[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?\z"#,
                       options: .regularExpression) != nil {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.isLenient = false
            formatter.dateFormat = value.contains(".") ? "yyyy-MM-dd HH:mm:ss.SSS" : "yyyy-MM-dd HH:mm:ss"
            guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
            return date
        }
        guard value.range(of: #"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})\z"#,
                          options: .regularExpression) != nil,
              parseDate(String(value.prefix(19)).replacingOccurrences(of: "T", with: " ")) != nil else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = value.contains(".") ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private static func parseReactions(_ value: NativeCloudValue?) -> [String: [String]]? {
        guard let value = value, value != .null, value != .array([]) else { return [:] }
        guard case .object(let actors) = value, actors.count <= 64 else { return nil }
        var result: [String: [String]] = [:]
        for (actor, value) in actors {
            guard validIdentifier(actor, maximum: 1023), case .array(let entries) = value, entries.count <= 16 else { return nil }
            var emojis: [String] = []
            for entry in entries {
                guard case .string(let emoji) = entry, NativeInteractionCodec.validReaction(emoji) else { return nil }
                emojis.append(emoji)
            }
            guard Set(emojis).count == emojis.count else { return nil }
            result[actor] = emojis
        }
        return result
    }

    private struct Identity: Sendable, Equatable {
        let values: [String]
        let date: Date

        init(fields: [String: NativeCloudValue]) throws {
            values = try ["messageId", "conversationPeer", "conversationKind", "direction", "from"].map { key in
                guard case .string(let value) = fields[key] else { throw NativeCloudHistoryFailure.invalidResponse }
                return value
            }
            guard case .string(let timestamp) = fields["timestamp"], let parsed = NativeCloudMessage.parseDate(timestamp) else {
                throw NativeCloudHistoryFailure.invalidResponse
            }
            date = parsed
        }
    }
}

struct NativeCloudHistoryPage: Sendable, Equatable {
    let messages: [NativeCloudMessage]
    let nextCursor: String?
    let saveChat: Bool
}

struct NativeCloudConversation: Codable, Sendable, Equatable {
    let peer: String
    let kind: String
    let name: String
}

protocol NativeCloudHistoryServing: Sendable {
    func conversations() async throws -> [NativeCloudConversation]
    func fetch(peer: String, kind: String, before: String?) async throws -> NativeCloudHistoryPage
    func save(_ message: NativeCloudMessage, expectedVersion: String?) async throws -> NativeCloudMessage
}

extension NativeCloudHistoryServing {
    func conversations() async throws -> [NativeCloudConversation] { [] }
}
