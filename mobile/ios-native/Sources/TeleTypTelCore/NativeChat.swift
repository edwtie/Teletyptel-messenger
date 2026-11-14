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
    public var stanzaID: String?
    public let peer: String
    public var body: String
    public var date: Date
    public var state: NativeMessageState
    public var archiveID: String? = nil
    public var hidden = false
    public var retracted = false
    public var edited = false
    public var previousIDs: [String] = []
    public var actionRequestID: String? = nil
    public var actionPending = false
    public var actionNotice: String? = nil
}

public enum NativeChatEvent: Sendable {
    case change(peer: String, identifier: String, change: NativeMessageChange)
    case message(peer: String, identifier: String?, body: String)
    case rejected(peer: String, identifier: String)
    case archivedIdentity(peer: String, identifier: String?, body: String, archiveID: String)
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
        if root.children.contains(where: { $0.name == "x" && $0.namespace == "http://jabber.org/protocol/muc#user" &&
            $0.children.contains(where: { ["invite", "decline"].contains($0.name) && $0.namespace == "http://jabber.org/protocol/muc#user" }) }) { return nil }
        guard root.attributes["type"] == nil || root.attributes["type"] == "normal" || root.attributes["type"] == "chat" else { return nil }
        if NativeMessageActionCodec.hasChange(root) {
            guard let identifier = identifier, NativeMessageActionCodec.validID(identifier),
                  let change = NativeMessageActionCodec.decode(root), identifier != change.target else { return nil }
            return .change(peer: peer, identifier: identifier, change: change)
        }
        let bodies = root.children.filter { $0.name == "body" && $0.namespace == "jabber:client" }
        guard let body = bodies.first(where: { $0.attributes["xml:lang"] == nil }) ?? bodies.first,
              body.children.isEmpty, validBody(body.text) else { return nil }
        if let archiveID = NativeArchiveQuery.trustedArchiveID(root, owner: owner) {
            return .archivedIdentity(peer: peer, identifier: identifier, body: body.text, archiveID: archiveID)
        }
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
    private var retractionTombstones: [String: Set<String>] = [:]
    private var archivedChanges: [NativeArchivedText] = []
    private var retainedActionCount: Int { messages.filter { $0.hidden || $0.retracted || !$0.previousIDs.isEmpty }.count }

    public init() {}

    public mutating func setDraft(_ body: String, peer: String) {
        guard NativeChatCodec.bareJID(peer) == peer, body.utf8.count <= 8192,
              drafts[peer] != nil || drafts.count < 100 else { return }
        drafts[peer] = body.isEmpty ? nil : body
    }

    mutating func enqueue(peer: String) throws -> NativeChatMessage {
        let body = drafts[peer] ?? ""
        let message = try enqueueBody(body, peer: peer)
        drafts.removeValue(forKey: peer)
        return message
    }

    mutating func enqueueBody(_ body: String, peer: String) throws -> NativeChatMessage {
        let identifier = UUID()
        _ = try NativeChatCodec.encode(to: peer, body: body, identifier: identifier.uuidString)
        guard pendingCount < 8 else { throw NativeChatFailure.busy }
        guard makeRoom() else { throw NativeChatFailure.historyFull }
        let message = NativeChatMessage(id: identifier, stanzaID: identifier.uuidString, peer: peer,
                                        body: body, date: Date(), state: .sending)
        messages.append(message)
        return message
    }

    mutating func finish(_ identifier: UUID, submitted: Bool) {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), messages[index].state == .sending else { return }
        messages[index].state = submitted ? .submitted : .uncertain
    }

    mutating func interrupt() {
        for index in messages.indices where messages[index].state == .sending { messages[index].state = .uncertain }
        for index in messages.indices where messages[index].actionPending {
            messages[index].actionPending = false
            messages[index].actionNotice = "Wijzigingsverzoek onzeker; niet automatisch opnieuw verzonden."
        }
    }

    mutating func receive(_ event: NativeChatEvent) {
        switch event {
        case .change(let peer, let identifier, let change):
            guard NativeChatCodec.bareJID(peer) == peer, NativeMessageActionCodec.validID(identifier), NativeMessageActionCodec.validID(change.target) else { return }
            let matches = messages.indices.filter { messages[$0].peer == peer && messages[$0].state == .incoming &&
                (messages[$0].stanzaID == change.target || messages[$0].previousIDs.contains(change.target)) }
            if case .retract = change {
                guard rememberRetraction(peer: peer, target: change.target) else { historyLimited = true; return }
            }
            if matches.isEmpty, case .correct(let target, let body) = change, NativeChatCodec.validBody(body) {
                guard makeRoom() else { historyLimited = true; return }
                messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: peer, body: body, date: Date(),
                    state: .incoming, edited: true, previousIDs: [target]))
                applyRememberedRetraction(to: messages.count - 1)
                return
            }
            guard matches.count == 1, let index = matches.first, !messages[index].retracted else { return }
            guard messages[index].stanzaID != identifier, !messages[index].previousIDs.contains(identifier) else { return }
            apply(change, at: index, identifier: identifier)
        case .message(let peer, let identifier, let body):
            guard NativeChatCodec.bareJID(peer) == peer, NativeChatCodec.validBody(body) else { return }
            if let identifier = identifier, messages.contains(where: { $0.peer == peer && ($0.stanzaID == identifier || $0.previousIDs.contains(identifier)) && $0.state == .incoming }) { return }
            guard makeRoom() else { historyLimited = true; return }
            messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: peer, body: body, date: Date(), state: .incoming))
            applyRememberedRetraction(to: messages.count - 1)
        case .rejected(let peer, let identifier):
            if let index = messages.firstIndex(where: { $0.peer == peer && $0.actionRequestID == identifier && $0.state != .incoming }) {
                messages[index].actionPending = false
                messages[index].actionNotice = "Wijzigingsverzoek geweigerd; verwerking bij de ander is niet bevestigd."
                return
            }
            guard let index = messages.firstIndex(where: { $0.peer == peer && $0.id.uuidString == identifier && $0.state != .incoming }) else { return }
            messages[index].state = .rejected
            messages[index].actionPending = false
        case .archivedIdentity(let peer, let identifier, let body, let archiveID):
            guard NativeChatCodec.bareJID(peer) == peer, NativeChatCodec.validBody(body), NativeArchiveQuery.validID(archiveID) else { return }
            if messages.contains(where: { $0.peer == peer && $0.state == .incoming &&
                ($0.archiveID == archiveID || (identifier != nil && ($0.stanzaID == identifier || $0.previousIDs.contains(identifier!)))) }) { return }
            guard makeRoom() else { historyLimited = true; return }
            messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: peer, body: body,
                                             date: Date(), state: .incoming, archiveID: archiveID))
            applyRememberedRetraction(to: messages.count - 1)
        }
    }

    mutating func mergeArchive(_ page: NativeArchivePage) throws {
        guard page.messages.count <= NativeArchiveQuery.maximum, page.messages.allSatisfy({
            $0.peer == page.peer && ($0.change != nil || $0.retracted || NativeChatCodec.validBody($0.body)) && NativeArchiveQuery.validID($0.archiveID)
        }) else { throw NativeArchiveFailure.invalidResponse }
        var changes = archivedChanges
        for archived in page.messages where archived.change != nil {
            guard let identifier = archived.identifier, NativeMessageActionCodec.validID(identifier),
                  let change = archived.change else { throw NativeArchiveFailure.invalidResponse }
            _ = try NativeMessageActionCodec.encode(to: archived.peer, change: change, identifier: UUID().uuidString)
            if changes.contains(where: { $0.archiveID == archived.archiveID }) { continue }
            guard changes.count < 256 else { throw NativeChatFailure.historyFull }
            changes.append(archived)
        }
        var merged = messages
        for archived in page.messages where archived.change == nil {
            if merged.contains(where: { $0.archiveID == archived.archiveID && ($0.peer != archived.peer || ($0.state != .incoming) != archived.outgoing) }) {
                throw NativeArchiveFailure.invalidResponse
            }
            if let index = merged.firstIndex(where: {
                $0.peer == archived.peer && ($0.state != .incoming) == archived.outgoing &&
                ($0.archiveID == archived.archiveID || (archived.identifier != nil && ($0.stanzaID == archived.identifier || $0.previousIDs.contains(archived.identifier!))))
            }) {
                if archived.retracted { merged[index].body = ""; merged[index].retracted = true }
                if merged[index].retracted || merged[index].hidden { continue }
                guard merged[index].body == archived.body else { continue }
                merged[index].archiveID = archived.archiveID
                merged[index].date = archived.date
            } else {
                merged.append(NativeChatMessage(id: UUID(), stanzaID: archived.identifier, peer: archived.peer,
                    body: archived.retracted ? "" : archived.body, date: archived.date, state: archived.outgoing ? .submitted : .incoming,
                    archiveID: archived.archiveID, retracted: archived.retracted))
            }
        }
        merged = merged.enumerated().sorted {
            $0.element.date == $1.element.date ? $0.offset < $1.offset : $0.element.date < $1.element.date
        }.map(\.element)
        while merged.count > 200 {
            guard let index = merged.firstIndex(where: { !$0.hidden && !$0.retracted && $0.previousIDs.isEmpty && !$0.actionPending && ($0.state == .incoming || $0.state == .submitted) }) else { throw NativeChatFailure.historyFull }
            merged.remove(at: index)
            historyLimited = true
        }
        messages = merged
        archivedChanges = changes.sorted { $0.date < $1.date }
        for archived in archivedChanges {
            guard let change = archived.change, let identifier = archived.identifier else { continue }
            let matches = messages.indices.filter { messages[$0].peer == archived.peer &&
                (messages[$0].state != .incoming) == archived.outgoing &&
                (messages[$0].stanzaID == change.target || messages[$0].previousIDs.contains(change.target)) }
            if matches.isEmpty, case .correct(let target, let body) = change {
                guard !messages.contains(where: { $0.peer == archived.peer && ($0.state != .incoming) == archived.outgoing &&
                    ($0.stanzaID == identifier || $0.previousIDs.contains(identifier)) }) else { continue }
                guard makeRoom() else { historyLimited = true; continue }
                messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: archived.peer, body: body,
                    date: archived.date, state: archived.outgoing ? .submitted : .incoming, archiveID: archived.archiveID,
                    edited: true, previousIDs: [target]))
                continue
            }
            guard matches.count == 1, let index = matches.first, !messages[index].retracted,
                  messages[index].stanzaID != identifier, !messages[index].previousIDs.contains(identifier) else { continue }
            if case .correct = change, messages[index].stanzaID != change.target { continue }
            apply(change, at: index, identifier: identifier)
        }
        for index in messages.indices { applyRememberedRetraction(to: index) }
    }

    public func canCorrect(_ identifier: UUID) -> Bool {
        guard let message = messages.first(where: { $0.id == identifier }), !message.hidden, !message.retracted,
              !message.actionPending, message.state == .submitted, message.previousIDs.count < 16,
              message.stanzaID.map(NativeMessageActionCodec.validID) == true else { return false }
        return messages.last(where: { $0.peer == message.peer && $0.state != .incoming })?.id == identifier
    }

    public func canRetract(_ identifier: UUID) -> Bool {
        guard let message = messages.first(where: { $0.id == identifier }) else { return false }
        return !message.hidden && !message.retracted && !message.actionPending && message.state == .submitted &&
            message.stanzaID.map(NativeMessageActionCodec.validID) == true
    }

    mutating func hide(_ identifier: UUID) throws {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), !messages[index].actionPending,
              messages[index].state != .sending, retainedActionCount < 128 || messages[index].hidden || messages[index].retracted else { throw NativeChatFailure.busy }
        messages[index].hidden = true
        messages[index].body = ""
    }

    mutating func beginChange(_ identifier: UUID, correctedBody: String?) throws -> (NativeChatMessage, NativeMessageChange, String) {
        guard correctedBody == nil ? canRetract(identifier) : canCorrect(identifier),
              let index = messages.firstIndex(where: { $0.id == identifier }), let current = messages[index].stanzaID,
              retainedActionCount < 128 || messages[index].edited else { throw NativeChatFailure.invalidMessage }
        let target = correctedBody == nil ? (messages[index].previousIDs.first ?? current) : current
        let change: NativeMessageChange = correctedBody.map { .correct(target: target, body: $0) } ?? .retract(target: target)
        let request = UUID().uuidString
        _ = try NativeMessageActionCodec.encode(to: messages[index].peer, change: change, identifier: request)
        messages[index].actionRequestID = request
        messages[index].actionPending = true
        messages[index].actionNotice = "Wijzigingsverzoek wordt verzonden…"
        return (messages[index], change, request)
    }

    mutating func finishChange(_ identifier: UUID, change: NativeMessageChange, request: String, submitted: Bool) {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), messages[index].actionRequestID == request,
              messages[index].actionPending else { return }
        messages[index].actionPending = false
        if submitted {
            apply(change, at: index, identifier: request)
            messages[index].actionNotice = "Wijzigingsverzoek verzonden; verwerking bij de ander niet bevestigd."
        } else { messages[index].actionNotice = "Wijzigingsverzoek onzeker; niet automatisch opnieuw verzonden." }
    }

    private mutating func apply(_ change: NativeMessageChange, at index: Int, identifier: String) {
        switch change {
        case .correct(_, let body):
            guard NativeChatCodec.validBody(body), messages[index].previousIDs.count < 16 else { return }
            if let previous = messages[index].stanzaID { messages[index].previousIDs.append(previous) }
            messages[index].stanzaID = identifier
            if !messages[index].hidden { messages[index].body = body }
            messages[index].edited = true
        case .retract:
            messages[index].body = ""; messages[index].retracted = true
        }
    }

    private mutating func rememberRetraction(peer: String, target: String) -> Bool {
        if retractionTombstones[peer]?.contains(target) == true { return true }
        guard retractionTombstones.values.reduce(0, { $0 + $1.count }) < 256 else { return false }
        retractionTombstones[peer, default: []].insert(target)
        return true
    }

    private mutating func applyRememberedRetraction(to index: Int) {
        let identifiers = messages[index].previousIDs + (messages[index].stanzaID.map { [$0] } ?? [])
        if messages[index].state == .incoming,
           identifiers.contains(where: { retractionTombstones[messages[index].peer]?.contains($0) == true }) {
            messages[index].body = ""; messages[index].retracted = true
        }
    }

    private mutating func makeRoom() -> Bool {
        guard messages.count >= 200 else { return true }
        guard let index = messages.firstIndex(where: { !$0.hidden && !$0.retracted && $0.previousIDs.isEmpty && !$0.actionPending && ($0.state == .incoming || $0.state == .submitted) }) else { return false }
        messages.remove(at: index)
        historyLimited = true
        return true
    }
}
