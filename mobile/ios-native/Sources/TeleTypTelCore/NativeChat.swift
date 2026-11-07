import Foundation

public enum NativeChatFailure: Error, Equatable {
    case invalidMessage, disconnected, busy, historyFull
}

public protocol NativeChatSending: Sendable {
    func sendMessage(to jid: String, body: String, identifier: String) async throws
}

public enum NativeMessageState: String, Equatable, Sendable {
    case incoming, sending, submitted, uncertain, rejected

    public var label: String {
        switch self {
        case .incoming: return "Ontvangen"
        case .sending: return "Verzenden…"
        case .submitted: return "Verzonden · ontvangst niet bevestigd"
        case .uncertain: return "Verzending onzeker · niet automatisch opnieuw verzonden"
        case .rejected: return "Bericht geweigerd door de server"
        }
    }
}

public struct NativeChatMessage: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let stanzaID: String?
    public let peer: String
    public let body: String
    public let date: Date
    public var state: NativeMessageState
}

public enum NativeChatEvent: Sendable {
    case message(peer: String, identifier: String?, body: String)
    case rejected(peer: String, identifier: String)
}

enum NativeChatCodec {
    static func bareJID(_ value: String) -> String? {
        guard !value.isEmpty, value.utf8.count <= 1023,
              !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0) }) else { return nil }
        let parts = value.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 1 || !parts[1].isEmpty else { return nil }
        let bare = String(parts[0])
        let address = bare.split(separator: "@", omittingEmptySubsequences: false)
        guard address.count == 2, address.allSatisfy({ !$0.isEmpty }) else { return nil }
        return bare
    }

    static func validBody(_ body: String) -> Bool {
        !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && body.utf8.count <= 8192 &&
        body.unicodeScalars.allSatisfy {
            $0.value == 9 || $0.value == 10 || $0.value == 13 ||
            (0x20...0xD7FF).contains($0.value) || (0xE000...0xFFFD).contains($0.value) ||
            (0x10000...0x10FFFF).contains($0.value)
        }
    }

    static func encode(to jid: String, body: String, identifier: String) throws -> String {
        guard bareJID(jid) == jid, validBody(body), UUID(uuidString: identifier) != nil else {
            throw NativeChatFailure.invalidMessage
        }
        return "<message xmlns='jabber:client' type='chat' to='\(escape(jid))' id='\(identifier)'><body>\(escape(body))</body></message>"
    }

    static func decode(_ root: ProbeElement, owner: String, boundJID: String) -> NativeChatEvent? {
        guard root.name == "message", root.namespace == "jabber:client",
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == boundJID,
              let from = root.attributes["from"], let peer = bareJID(from), peer != owner else { return nil }
        let identifier = root.attributes["id"].flatMap { $0.isEmpty ? nil : $0 }
        if root.attributes["type"] == "error", let identifier = identifier {
            return .rejected(peer: peer, identifier: identifier)
        }
        guard root.attributes["type"] == nil || root.attributes["type"] == "normal" || root.attributes["type"] == "chat" else { return nil }
        let bodies = root.children.filter { $0.name == "body" && $0.namespace == "jabber:client" }
        guard let body = bodies.first(where: { $0.attributes["xml:lang"] == nil }) ?? bodies.first,
              body.children.isEmpty, validBody(body.text) else { return nil }
        return .message(peer: peer, identifier: identifier, body: body.text)
    }

    private static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

public struct NativeChatStore: Equatable {
    public private(set) var messages: [NativeChatMessage] = []
    public private(set) var drafts: [String: String] = [:]
    public private(set) var historyLimited = false
    public var pendingCount: Int { messages.filter { $0.state == .sending }.count }

    public init() {}

    public mutating func setDraft(_ body: String, peer: String) {
        guard NativeChatCodec.bareJID(peer) == peer, body.utf8.count <= 8192,
              drafts[peer] != nil || drafts.count < 100 else { return }
        drafts[peer] = body.isEmpty ? nil : body
    }

    mutating func enqueue(peer: String) throws -> NativeChatMessage {
        let body = drafts[peer] ?? ""
        let identifier = UUID()
        _ = try NativeChatCodec.encode(to: peer, body: body, identifier: identifier.uuidString)
        guard pendingCount < 8 else { throw NativeChatFailure.busy }
        guard makeRoom() else { throw NativeChatFailure.historyFull }
        let message = NativeChatMessage(id: identifier, stanzaID: identifier.uuidString, peer: peer,
                                        body: body, date: Date(), state: .sending)
        messages.append(message)
        drafts.removeValue(forKey: peer)
        return message
    }

    mutating func finish(_ identifier: UUID, submitted: Bool) {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), messages[index].state == .sending else { return }
        messages[index].state = submitted ? .submitted : .uncertain
    }

    mutating func interrupt() {
        for index in messages.indices where messages[index].state == .sending { messages[index].state = .uncertain }
    }

    mutating func receive(_ event: NativeChatEvent) {
        switch event {
        case .message(let peer, let identifier, let body):
            guard NativeChatCodec.bareJID(peer) == peer, NativeChatCodec.validBody(body) else { return }
            if let identifier = identifier, messages.contains(where: { $0.peer == peer && $0.stanzaID == identifier && $0.state == .incoming }) { return }
            guard makeRoom() else { historyLimited = true; return }
            messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: peer, body: body, date: Date(), state: .incoming))
        case .rejected(let peer, let identifier):
            guard let index = messages.firstIndex(where: { $0.peer == peer && $0.stanzaID == identifier && $0.state != .incoming }) else { return }
            messages[index].state = .rejected
        }
    }

    private mutating func makeRoom() -> Bool {
        guard messages.count >= 200 else { return true }
        guard let index = messages.firstIndex(where: { $0.state == .incoming || $0.state == .submitted }) else { return false }
        messages.remove(at: index)
        historyLimited = true
        return true
    }
}
