import Foundation

public enum NativeChatFailure: Error, Equatable {
    case invalidMessage, disconnected, busy, historyFull
}

public protocol NativeChatSending: Sendable {
    func sendMessage(to jid: String, body: String, identifier: String) async throws
}

public enum NativeMessageState: String, Codable, Equatable, Sendable {
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

public struct NativeChatMessage: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var stanzaID: String?
    public var cloudID: String? = nil
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
    public var delivery = NativeDeliveryStatus.unconfirmed
    public var reactions: [String: [String]] = [:]
    public var reactionUpdatedAt: [String: Date] = [:]
    public var reactionRequest: String? = nil
    public var reactionPending = false
    public var receiptRequested = false
    public var markable = false
    public var deliveryAttempted = false
    public var displayedAttempted = false
    public var statusLabel: String { state == .submitted ? delivery.label : state.label }
    public var cloudMessageID: String? { previousIDs.first ?? cloudID ?? stanzaID }
}

enum NativeCloudMerge {
    static func valid(_ record: NativeCloudMessage) -> Bool {
        guard (try? record.validate()) != nil else { return false }
        return NativeMessageActionCodec.validID(record.messageID) && record.messageID.utf8.count <= 150 &&
        record.date.timeIntervalSince1970.isFinite && (record.retracted || NativeChatCodec.validBody(record.text)) &&
        ["self", "peer"].contains(record.direction) && ["", "sent", "delivered", "displayed"].contains(record.deliveryStatus) &&
        record.reactions.count <= 64 && record.reactions.allSatisfy {
            NativeCloudMessage.validIdentifier($0.key, maximum: 1023) && $0.value.count <= 16 && $0.value.allSatisfy(NativeInteractionCodec.validReaction)
        }
    }

    static func delivery(_ value: String, retaining current: NativeDeliveryStatus) -> NativeDeliveryStatus {
        if current == .displayed || value == "displayed" { return .displayed }
        if current == .delivered || value == "delivered" { return .delivered }
        return .unconfirmed
    }

    static func protected(_ message: NativeChatMessage) -> Bool {
        message.hidden || message.retracted || !message.previousIDs.isEmpty || message.actionPending || message.reactionPending ||
        message.actionRequestID != nil || message.reactionRequest != nil || message.actionNotice != nil ||
        ![.incoming, .submitted].contains(message.state)
    }

    static func protected(_ message: NativeGroupText) -> Bool {
        message.hidden || message.retracted || message.actionPending || message.actionRequestID != nil || message.actionNotice != nil ||
        ![.incoming, .submitted].contains(message.state)
    }
}

public enum NativeChatEvent: Sendable {
    case interaction(peer: String, identifier: String, value: NativeChatInteraction)
    case trackedMessage(peer: String, identifier: String, body: String, receipt: Bool, markable: Bool, archiveID: String?)
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
        return "<message xmlns='jabber:client' type='chat' to='\(escape(jid))' id='\(identifier)'><body>\(escape(body))</body><request xmlns='urn:xmpp:receipts'/><markable xmlns='urn:xmpp:chat-markers:0'/></message>"
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
        if NativeInteractionCodec.hasInteraction(root) {
            guard !NativeMessageActionCodec.hasChange(root), let identifier = identifier, NativeMessageActionCodec.validID(identifier),
                  let value = NativeInteractionCodec.decode(root) else { return nil }
            return .interaction(peer: peer, identifier: identifier, value: value)
        }
        if NativeMessageActionCodec.hasChange(root) {
            guard let identifier = identifier, NativeMessageActionCodec.validID(identifier),
                  let change = NativeMessageActionCodec.decode(root), identifier != change.target else { return nil }
            return .change(peer: peer, identifier: identifier, change: change)
        }
        let bodies = root.children.filter { $0.name == "body" && $0.namespace == "jabber:client" }
        guard let body = bodies.first(where: { $0.attributes["xml:lang"] == nil }) ?? bodies.first,
              body.children.isEmpty, validBody(body.text) else { return nil }
        let receipts = root.children.filter { $0.name == "request" && $0.namespace == NativeInteractionCodec.receipts }
        let markers = root.children.filter { $0.name == "markable" && $0.namespace == NativeInteractionCodec.markers }
        if !receipts.isEmpty || !markers.isEmpty {
            guard let identifier = identifier, NativeMessageActionCodec.validID(identifier), receipts.count <= 1, markers.count <= 1,
                  (receipts + markers).allSatisfy({ $0.children.isEmpty }) else { return nil }
            return .trackedMessage(peer: peer, identifier: identifier, body: body.text, receipt: !receipts.isEmpty, markable: !markers.isEmpty,
                archiveID: NativeArchiveQuery.trustedArchiveID(root, owner: owner))
        }
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

public struct NativeChatStore: Codable, Equatable {
    public private(set) var messages: [NativeChatMessage] = []
    public private(set) var drafts: [String: String] = [:]
    public private(set) var historyLimited = false
    public var preferences = NativeChatPreferences()
    public var pendingCount: Int { messages.filter { $0.state == .sending }.count }
    private var retractionTombstones: [String: Set<String>] = [:]
    private var archivedChanges: [NativeArchivedText] = []
    private var retainedActionCount: Int { messages.filter { $0.hidden || $0.retracted || !$0.previousIDs.isEmpty }.count }

    public init() {}

    mutating func mergeCloud(_ records: [NativeCloudMessage], owner: String, earlier: Bool = false) throws {
        guard records.count <= 50, NativeChatCodec.bareJID(owner) == owner, records.allSatisfy({ record in
            NativeCloudMerge.valid(record) && record.kind == "contact" && NativeChatCodec.bareJID(record.peer) == record.peer &&
            record.peer != owner && NativeChatCodec.bareJID(record.sender) == (record.direction == "self" ? owner : record.peer)
        }) else { throw NativeChatFailure.invalidMessage }
        var candidate = self
        var retained = Set<UUID>()
        for record in records {
            let outgoing = record.direction == "self"
            let matches = candidate.messages.indices.filter {
                let message = candidate.messages[$0]
                return message.peer == record.peer && (message.state != .incoming) == outgoing &&
                    (message.cloudID == record.messageID || message.stanzaID == record.messageID || message.previousIDs.contains(record.messageID))
            }
            guard matches.count <= 1 else { throw NativeChatFailure.invalidMessage }
            if let index = matches.first {
                retained.insert(candidate.messages[index].id)
                if NativeCloudMerge.protected(candidate.messages[index]) { continue }
                candidate.messages[index].cloudID = candidate.messages[index].cloudID ?? record.messageID
                candidate.messages[index].delivery = NativeCloudMerge.delivery(record.deliveryStatus, retaining: candidate.messages[index].delivery)
                if record.retracted {
                    candidate.messages[index].retracted = true
                    candidate.messages[index].body = ""
                    candidate.messages[index].reactions.removeAll()
                } else {
                    if record.edited || (!candidate.messages[index].edited && candidate.messages[index].stanzaID == nil) {
                        candidate.messages[index].body = record.text
                    }
                    candidate.messages[index].edited = candidate.messages[index].edited || record.edited
                    candidate.messages[index].reactions = record.reactions
                }
            } else {
                candidate.messages.append(NativeChatMessage(id: UUID(), stanzaID: nil, cloudID: record.messageID, peer: record.peer,
                    body: record.retracted ? "" : record.text, date: record.date, state: outgoing ? .submitted : .incoming,
                    retracted: record.retracted, edited: record.edited,
                    delivery: NativeCloudMerge.delivery(record.deliveryStatus, retaining: .unconfirmed),
                    reactions: record.retracted ? [:] : record.reactions))
                retained.insert(candidate.messages[candidate.messages.count - 1].id)
            }
        }
        for index in candidate.messages.indices { candidate.applyRememberedRetraction(to: index) }
        candidate.messages = candidate.messages.enumerated().sorted {
            $0.element.date == $1.element.date ? $0.offset < $1.offset : $0.element.date < $1.element.date
        }.map(\.element)
        while candidate.messages.count > 200 {
            let eligible = candidate.messages.indices.filter {
                !retained.contains(candidate.messages[$0].id) && !NativeCloudMerge.protected(candidate.messages[$0])
            }
            guard let index = earlier ? eligible.last : eligible.first else { throw NativeChatFailure.historyFull }
            candidate.messages.remove(at: index)
            candidate.historyLimited = true
        }
        self = candidate
    }

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
        for index in messages.indices where messages[index].reactionPending {
            messages[index].reactionPending = false
            messages[index].actionNotice = "Reactieverzoek onzeker; niet automatisch opnieuw verzonden."
        }
    }

    mutating func receive(_ event: NativeChatEvent) {
        switch event {
        case .trackedMessage(let peer, let identifier, let body, let receipt, let markable, let archiveID):
            if let archive = archiveID { receive(.archivedIdentity(peer: peer, identifier: identifier, body: body, archiveID: archive)) }
            else { receive(.message(peer: peer, identifier: identifier, body: body)) }
            if let index = messages.firstIndex(where: { $0.peer == peer && $0.state == .incoming && $0.stanzaID == identifier }) {
                messages[index].receiptRequested = receipt; messages[index].markable = markable
            }
        case .interaction(let peer, _, let value):
            applyInteraction(value, peer: peer, actor: peer)
        case .change(let peer, let identifier, let change):
            guard NativeChatCodec.bareJID(peer) == peer, NativeMessageActionCodec.validID(identifier), NativeMessageActionCodec.validID(change.target) else { return }
            let matches = messages.indices.filter { messages[$0].peer == peer && messages[$0].state == .incoming &&
                (messages[$0].stanzaID == change.target || messages[$0].previousIDs.contains(change.target) || messages[$0].cloudID == change.target) }
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
            if case .correct = change, messages[index].stanzaID == nil, messages[index].cloudID == change.target {
                messages[index].previousIDs.append(change.target)
            }
            apply(change, at: index, identifier: identifier)
        case .message(let peer, let identifier, let body):
            guard NativeChatCodec.bareJID(peer) == peer, NativeChatCodec.validBody(body) else { return }
            if enrichIncoming(peer: peer, identifier: identifier, archiveID: nil) { return }
            guard makeRoom() else { historyLimited = true; return }
            messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: peer, body: body, date: Date(), state: .incoming))
            applyRememberedRetraction(to: messages.count - 1)
        case .rejected(let peer, let identifier):
            if let index = messages.firstIndex(where: { $0.peer == peer && $0.reactionRequest == identifier }) {
                messages[index].reactionPending = false; messages[index].actionNotice = "Reactieverzoek geweigerd."; return
            }
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
            if enrichIncoming(peer: peer, identifier: identifier, archiveID: archiveID) { return }
            guard makeRoom() else { historyLimited = true; return }
            messages.append(NativeChatMessage(id: UUID(), stanzaID: identifier, peer: peer, body: body,
                                             date: Date(), state: .incoming, archiveID: archiveID))
            applyRememberedRetraction(to: messages.count - 1)
        }
    }

    private mutating func enrichIncoming(peer: String, identifier: String?, archiveID: String?) -> Bool {
        let trustedID = identifier.flatMap { NativeMessageActionCodec.validID($0) ? $0 : nil }
        let matches = messages.indices.filter {
            let message = messages[$0]
            return message.peer == peer && message.state == .incoming &&
                ((archiveID != nil && message.archiveID == archiveID) ||
                 (identifier != nil && (message.stanzaID == identifier || message.previousIDs.contains(identifier!))) ||
                 (trustedID != nil && message.cloudID == trustedID))
        }
        guard !matches.isEmpty else { return false }
        guard matches.count == 1, let index = matches.first else { return true }
        if messages[index].stanzaID == nil { messages[index].stanzaID = trustedID }
        if let archiveID = archiveID, messages[index].archiveID == nil { messages[index].archiveID = archiveID }
        applyRememberedRetraction(to: index)
        return true
    }

    mutating func mergeArchive(_ page: NativeArchivePage) throws {
        guard page.messages.count <= NativeArchiveQuery.maximum, page.messages.allSatisfy({
            $0.peer == page.peer && $0.date.timeIntervalSince1970.isFinite && ($0.change != nil || $0.interaction != nil || $0.retracted || NativeChatCodec.validBody($0.body)) && NativeArchiveQuery.validID($0.archiveID)
        }) else { throw NativeArchiveFailure.invalidResponse }
        var changes = archivedChanges
        for archived in page.messages where archived.change != nil || archived.interaction != nil {
            guard let identifier = archived.identifier, NativeMessageActionCodec.validID(identifier),
                  archived.change != nil || archived.interaction != nil else { throw NativeArchiveFailure.invalidResponse }
            if let change = archived.change { _ = try NativeMessageActionCodec.encode(to: archived.peer, change: change, identifier: UUID().uuidString) }
            if let interaction = archived.interaction { _ = try NativeInteractionCodec.encode(to: archived.peer, interaction: interaction, identifier: UUID().uuidString) }
            if changes.contains(where: { $0.archiveID == archived.archiveID }) { continue }
            guard changes.count < 256 else { throw NativeChatFailure.historyFull }
            changes.append(archived)
        }
        var merged = messages
        for archived in page.messages where archived.change == nil && archived.interaction == nil {
            if merged.contains(where: { $0.archiveID == archived.archiveID && ($0.peer != archived.peer || ($0.state != .incoming) != archived.outgoing) }) {
                throw NativeArchiveFailure.invalidResponse
            }
            let matches = merged.indices.filter {
                let message = merged[$0]
                return message.peer == archived.peer && (message.state != .incoming) == archived.outgoing &&
                    (message.archiveID == archived.archiveID || (archived.identifier != nil &&
                        (message.stanzaID == archived.identifier || message.previousIDs.contains(archived.identifier!) ||
                         (NativeMessageActionCodec.validID(archived.identifier!) && message.cloudID == archived.identifier))))
            }
            guard matches.count <= 1 else { throw NativeArchiveFailure.invalidResponse }
            if let index = matches.first {
                let compatible = merged[index].body == archived.body || merged[index].retracted || archived.retracted
                if compatible, merged[index].stanzaID == nil, let identifier = archived.identifier, NativeMessageActionCodec.validID(identifier) {
                    merged[index].stanzaID = identifier
                }
                if compatible, merged[index].archiveID == nil { merged[index].archiveID = archived.archiveID }
                if archived.retracted { merged[index].body = ""; merged[index].retracted = true; merged[index].reactions.removeAll() }
                if merged[index].retracted || merged[index].hidden { continue }
                guard merged[index].body == archived.body else { continue }
                merged[index].archiveID = archived.archiveID
                merged[index].date = archived.date
                merged[index].markable = merged[index].markable || archived.markable
            } else {
                merged.append(NativeChatMessage(id: UUID(), stanzaID: archived.identifier, peer: archived.peer,
                    body: archived.retracted ? "" : archived.body, date: archived.date, state: archived.outgoing ? .submitted : .incoming,
                    archiveID: archived.archiveID, retracted: archived.retracted, markable: archived.markable))
            }
        }
        merged = merged.enumerated().sorted {
            $0.element.date == $1.element.date ? $0.offset < $1.offset : $0.element.date < $1.element.date
        }.map(\.element)
        var limited = historyLimited
        while merged.count > 200 {
            guard let index = merged.firstIndex(where: { !NativeCloudMerge.protected($0) }) else { throw NativeChatFailure.historyFull }
            merged.remove(at: index)
            limited = true
        }
        messages = merged
        historyLimited = limited
        archivedChanges = changes.sorted { $0.date < $1.date }
        for archived in archivedChanges {
            if let interaction = archived.interaction { applyInteraction(interaction, peer: archived.peer, actor: archived.outgoing ? page.owner : archived.peer, archivedAt: archived.date); continue }
            guard let change = archived.change, let identifier = archived.identifier else { continue }
            let matches = messages.indices.filter { messages[$0].peer == archived.peer &&
                (messages[$0].state != .incoming) == archived.outgoing &&
                (messages[$0].stanzaID == change.target || messages[$0].previousIDs.contains(change.target) || messages[$0].cloudID == change.target) }
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
            if case .correct = change, messages[index].stanzaID != change.target {
                guard messages[index].stanzaID == nil, messages[index].cloudID == change.target else { continue }
                messages[index].previousIDs.append(change.target)
            }
            apply(change, at: index, identifier: identifier)
        }
        for index in messages.indices { applyRememberedRetraction(to: index) }
    }

    public func canCorrect(_ identifier: UUID) -> Bool {
        guard let message = messages.first(where: { $0.id == identifier }), !message.hidden, !message.retracted,
              !message.actionPending, !message.reactionPending, message.state == .submitted, message.previousIDs.count < 16,
              message.stanzaID.map(NativeMessageActionCodec.validID) == true else { return false }
        return messages.last(where: { $0.peer == message.peer && $0.state != .incoming })?.id == identifier
    }

    public func canRetract(_ identifier: UUID) -> Bool {
        guard let message = messages.first(where: { $0.id == identifier }) else { return false }
        return !message.hidden && !message.retracted && !message.actionPending && !message.reactionPending && message.state == .submitted &&
            message.stanzaID.map(NativeMessageActionCodec.validID) == true
    }

    mutating func hide(_ identifier: UUID) throws {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), !messages[index].actionPending, !messages[index].reactionPending,
              messages[index].state != .sending, retainedActionCount < 128 || messages[index].hidden || messages[index].retracted else { throw NativeChatFailure.busy }
        messages[index].hidden = true
        messages[index].body = ""
        messages[index].reactions.removeAll()
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
            messages[index].body = ""; messages[index].retracted = true; messages[index].reactions.removeAll()
        }
    }

    private mutating func rememberRetraction(peer: String, target: String) -> Bool {
        if retractionTombstones[peer]?.contains(target) == true { return true }
        guard retractionTombstones.values.reduce(0, { $0 + $1.count }) < 256 else { return false }
        retractionTombstones[peer, default: []].insert(target)
        return true
    }

    private mutating func applyRememberedRetraction(to index: Int) {
        let identifiers = messages[index].previousIDs + (messages[index].stanzaID.map { [$0] } ?? []) +
            (messages[index].cloudID.map { [$0] } ?? [])
        if messages[index].state == .incoming,
           identifiers.contains(where: { retractionTombstones[messages[index].peer]?.contains($0) == true }) {
            messages[index].body = ""; messages[index].retracted = true; messages[index].reactions.removeAll()
        }
    }

    private mutating func makeRoom() -> Bool {
        guard messages.count >= 200 else { return true }
        guard let index = messages.firstIndex(where: { !NativeCloudMerge.protected($0) }) else { return false }
        messages.remove(at: index)
        historyLimited = true
        return true
    }

    mutating func applyInteraction(_ value: NativeChatInteraction, peer: String, actor: String, archivedAt: Date? = nil) {
        let matches = messages.indices.filter { messages[$0].peer == peer &&
            (messages[$0].stanzaID == value.target || messages[$0].previousIDs.contains(value.target)) }
        guard matches.count == 1, let index = matches.first, !messages[index].hidden, !messages[index].retracted else { return }
        switch value {
        case .reactions(_, let values):
            guard values.count <= 16, values.allSatisfy(NativeInteractionCodec.validReaction),
                  messages[index].reactionUpdatedAt[actor] != nil || messages[index].reactionUpdatedAt.count < 64 else { return }
            if let archivedAt = archivedAt, let latest = messages[index].reactionUpdatedAt[actor], archivedAt < latest { return }
            messages[index].reactionUpdatedAt[actor] = archivedAt ?? Date()
            messages[index].reactions[actor] = values.isEmpty ? nil : Array(Set(values)).sorted()
        case .receipt(_, let displayed):
            guard messages[index].state != .incoming, actor == peer else { return }
            for message in messages.indices where messages[message].peer == peer && messages[message].state != .incoming &&
                (message == index || (displayed && message < index && messages[message].state == .submitted)) {
                if displayed { messages[message].delivery = .displayed }
                else if messages[message].delivery == .unconfirmed { messages[message].delivery = .delivered }
                if message == index, messages[message].state == .uncertain { messages[message].state = .submitted }
            }
        }
    }

    mutating func beginReaction(_ identifier: UUID) throws -> (NativeChatMessage, String) {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), !messages[index].hidden, !messages[index].retracted,
              !messages[index].reactionPending, !messages[index].actionPending, [.incoming, .submitted].contains(messages[index].state),
              messages[index].stanzaID.map(NativeMessageActionCodec.validID) == true else { throw NativeChatFailure.invalidMessage }
        let request = UUID().uuidString
        messages[index].reactionRequest = request; messages[index].reactionPending = true
        return (messages[index], request)
    }

    mutating func finishReaction(_ identifier: UUID, request: String, actor: String, values: [String], submitted: Bool) {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), messages[index].reactionRequest == request,
              messages[index].reactionPending else { return }
        messages[index].reactionPending = false
        if submitted, let target = messages[index].stanzaID { applyInteraction(.reactions(target: target, values: values), peer: messages[index].peer, actor: actor) }
        else { messages[index].actionNotice = "Reactie niet bevestigd; niet automatisch opnieuw verzonden." }
    }

    mutating func takeReceipt(_ identifier: UUID, displayed: Bool) -> (String, String)? {
        guard let index = messages.firstIndex(where: { $0.id == identifier }), messages[index].state == .incoming,
              !messages[index].hidden, !messages[index].retracted, let target = messages[index].stanzaID,
              NativeMessageActionCodec.validID(target) else { return nil }
        if displayed {
            guard preferences.sendDisplayed, messages[index].markable, !messages[index].displayedAttempted else { return nil }
            messages[index].displayedAttempted = true
        } else {
            guard preferences.sendDelivery, messages[index].receiptRequested, !messages[index].deliveryAttempted else { return nil }
            messages[index].deliveryAttempted = true
        }
        return (messages[index].peer, target)
    }

    var validHistory: Bool {
        messages.count <= 200 && Set(messages.map(\.id)).count == messages.count && drafts.count <= 100 && archivedChanges.count <= 256 &&
        retractionTombstones.values.reduce(0, { $0 + $1.count }) <= 256 && drafts.allSatisfy { NativeChatCodec.bareJID($0.key) == $0.key && $0.value.utf8.count <= 8192 } &&
        messages.allSatisfy { message in
            NativeChatCodec.bareJID(message.peer) == message.peer && message.previousIDs.count <= 16 &&
            message.date.timeIntervalSince1970.isFinite && message.reactions.count <= 64 && message.reactionUpdatedAt.count <= 64 && message.reactionUpdatedAt.values.allSatisfy { $0.timeIntervalSince1970.isFinite } && message.reactions.values.allSatisfy { $0.count <= 16 && $0.allSatisfy(NativeInteractionCodec.validReaction) } &&
            ((message.hidden || message.retracted) ? message.body.isEmpty : NativeChatCodec.validBody(message.body))
        }
    }
}
