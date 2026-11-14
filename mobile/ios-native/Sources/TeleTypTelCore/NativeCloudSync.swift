import Combine
import Foundation

struct NativeCloudState: Equatable {
    var loading = false
    var ready = false
    var nextCursor: String?
    var notice: String?
}

@MainActor
final class NativeCloudSync: ObservableObject {
    @Published private(set) var states: [String: NativeCloudState] = [:]
    @Published private(set) var revision = 0
    @Published private(set) var notice: String?
    @Published private(set) var available = false
    @Published private(set) var conversations: [NativeCloudConversation] = []
    var apply: (([NativeCloudMessage], String, String, Bool) throws -> Void)?
    var applyConversations: (([NativeCloudConversation]) -> Void)?
    var unavailable: ((String, String) -> Void)?
    private var client: (any NativeCloudHistoryServing)?
    private var owner: String?
    private var generation = UUID()
    private var reads: [String: Task<Void, Never>] = [:]
    private var readTokens: [String: UUID] = [:]
    private var known: [String: NativeCloudMessage] = [:]
    private var pending: [String: (message: NativeCloudMessage, patch: [String: NativeCloudValue], insertion: Bool, actorChanges: [String: [String]], changed: Bool)] = [:]
    private var policies: [String: Bool] = [:]
    private var writer: Task<Void, Never>?
    private var writingKey: String?
    private var mutations: [String: Int] = [:]
    private var serial = 0
    private var catalogTask: Task<Void, Never>?
    private var savingEnabled = true

    static func key(_ peer: String, _ kind: String) -> String { kind + "\u{0}" + peer }
    static func key(_ message: NativeCloudMessage) -> String { key(message.peer, message.kind) + "\u{0}" + message.messageID }
    func state(peer: String, kind: String) -> NativeCloudState { states[Self.key(peer, kind)] ?? NativeCloudState() }

    func setSavingEnabled(_ enabled: Bool) {
        savingEnabled = enabled
        if !enabled {
            writer?.cancel(); writer = nil; writingKey = nil; pending.removeAll()
            notice = "Nieuwe online opslag vanuit deze app staat uit. Bestaande servergeschiedenis blijft behouden."
        }
    }

    deinit { for task in reads.values { task.cancel() }; writer?.cancel(); catalogTask?.cancel() }

    func configure(_ client: (any NativeCloudHistoryServing)?, owner: String?) {
        stop()
        self.client = client; self.owner = owner
        available = client != nil && owner != nil
        known.removeAll(); states.removeAll(); policies.removeAll(); mutations.removeAll(); notice = nil
        conversations.removeAll()
        guard let client = client else { return }
        let attempt = generation
        catalogTask = Task { [weak self] in
            do {
                let catalog = try await client.conversations()
                try Task.checkCancellation()
                guard let self = self, self.generation == attempt else { return }
                self.conversations = catalog
                self.applyConversations?(catalog)
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.notice = "Online gesprekslijst niet opgehaald. Open een contact om opnieuw te proberen."
            }
        }
    }

    func stop() {
        generation = UUID()
        for task in reads.values { task.cancel() }
        reads.removeAll(); readTokens.removeAll()
        writer?.cancel(); writer = nil
        catalogTask?.cancel(); catalogTask = nil
        if !pending.isEmpty || writingKey != nil { notice = "Online bewaren niet bevestigd. Berichten worden niet automatisch opnieuw verzonden." }
        pending.removeAll()
        writingKey = nil
        client = nil; owner = nil
        available = false
        for key in states.keys { states[key]?.loading = false }
    }

    func load(peer: String, kind: String, earlier: Bool = false, refresh: Bool = false) {
        let key = Self.key(peer, kind)
        guard let client = client, owner != nil, reads[key] == nil, reads.count < 4,
              states[key] != nil || states.count < 32 else { return }
        let state = states[key] ?? NativeCloudState()
        if !earlier && !refresh && state.ready { return }
        if earlier && state.nextCursor == nil { return }
        let cursor = earlier ? state.nextCursor : nil
        let attempt = generation; let token = UUID(); let started = serial
        readTokens[key] = token
        states[key] = NativeCloudState(loading: true, ready: state.ready, nextCursor: state.nextCursor)
        reads[key] = Task { [weak self] in
            do {
                let page = try await client.fetch(peer: peer, kind: kind, before: cursor)
                try Task.checkCancellation()
                guard let self = self, self.generation == attempt, self.readTokens[key] == token else { return }
                let applicable = page.messages.filter { self.pending[Self.key($0)] == nil && self.writingKey != Self.key($0) && (self.mutations[Self.key($0)] ?? 0) <= started }
                try self.apply?(applicable, peer, kind, earlier)
                for message in page.messages {
                    let messageKey = Self.key(message)
                    guard self.writingKey != messageKey else { continue }
                    if (self.mutations[messageKey] ?? 0) <= started ||
                        (self.known[messageKey] == nil && self.pending[messageKey]?.insertion == true) {
                        self.remember(message)
                    }
                }
                self.policies[key] = page.saveChat
                self.states[key] = NativeCloudState(ready: true, nextCursor: page.nextCursor,
                    notice: page.saveChat ? nil : "Online bewaren staat uit in je serverinstellingen.")
                self.revision += 1
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt, self.readTokens[key] == token else { return }
                self.states[key] = NativeCloudState(ready: state.ready, nextCursor: state.nextCursor,
                    notice: "Online geschiedenis niet opgehaald. De lokale kopie blijft behouden; probeer opnieuw.")
                self.pending = self.pending.filter { Self.key($0.value.message.peer, $0.value.message.kind) != key }
                if error as? NativeCloudHistoryFailure == .unavailable { self.unavailable?(peer, kind) }
            }
            guard let self = self, self.generation == attempt, self.readTokens[key] == token else { return }
            self.reads.removeValue(forKey: key); self.readTokens.removeValue(forKey: key)
            self.drain()
        }
    }

    func record(_ message: NativeCloudMessage, previous: NativeCloudMessage?) {
        guard client != nil, owner != nil, savingEnabled else { return }
        let key = Self.key(message)
        guard pending[key] != nil || pending.count < 64 else { notice = "Online wachtrij vol. Bewaren is niet bevestigd."; return }
        if mutations[key] == nil && mutations.count >= 512, let evicted = mutations.keys.first(where: { pending[$0] == nil && writingKey != $0 }) {
            mutations.removeValue(forKey: evicted)
        }
        guard mutations[key] != nil || mutations.count < 512 else { return }
        let mutable = ["text", "edited", "retracted", "deliveryStatus", "status"]
        var patch = pending[key]?.patch ?? [:]
        for field in mutable where previous == nil || previous?.fields[field] != message.fields[field] {
            patch[field] = message.fields[field]
        }
        var actors = pending[key]?.actorChanges ?? [:]
        if let previous = previous {
            for actor in Set(previous.reactions.keys).union(message.reactions.keys) where previous.reactions[actor] != message.reactions[actor] {
                actors[actor] = message.reactions[actor] ?? []
            }
        }
        guard !patch.isEmpty || !actors.isEmpty else { return }
        serial += 1; mutations[key] = serial
        pending[key] = (message, patch, pending[key]?.insertion ?? (previous == nil), actors,
            (pending[key]?.changed ?? false) || previous != nil)
        let conversation = Self.key(message.peer, message.kind)
        if !state(peer: message.peer, kind: message.kind).ready { load(peer: message.peer, kind: message.kind) }
        else if policies[conversation] == false {
            pending.removeValue(forKey: key)
            notice = "Online bewaren staat uit in je serverinstellingen."
        } else { drain() }
    }

    private func remember(_ message: NativeCloudMessage) {
        let key = Self.key(message)
        if known[key] == nil && known.count >= 512, let evicted = known.keys.first(where: { pending[$0] == nil }) {
            known.removeValue(forKey: evicted)
        }
        if known[key] != nil || known.count < 512 { known[key] = message }
    }

    private func drain() {
        guard writer == nil, savingEnabled, let client = client else { return }
        let attempt = generation
        writer = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self, self.generation == attempt, self.savingEnabled,
                      let entry = self.pending.first(where: { self.policies[Self.key($0.value.message.peer, $0.value.message.kind)] == true && self.reads[Self.key($0.value.message.peer, $0.value.message.kind)] == nil }) else { break }
                let key = entry.key; let change = entry.value
                self.pending.removeValue(forKey: key)
                let base = self.known[key]
                if change.insertion, let base = base {
                    if change.changed || (base.text != change.message.text && !base.retracted) {
                        self.notice = "Online versie verschilt. Niet overschreven; haal de geschiedenis opnieuw op."
                    }
                    continue
                }
                if !change.insertion && base?.version == nil {
                    self.notice = "Online versie ontbreekt. Niet als nieuw bericht opgeslagen; haal de geschiedenis opnieuw op."
                    continue
                }
                var message = base ?? change.message
                for (field, value) in change.patch { message.fields[field] = value }
                if !change.actorChanges.isEmpty {
                    var reactions = message.reactions
                    for (actor, values) in change.actorChanges { reactions[actor] = values.isEmpty ? nil : values }
                    message.fields["reactions"] = .object(reactions.mapValues { .array($0.map { .string($0) }) })
                }
                self.writingKey = key
                do {
                    let saved = try await client.save(message, expectedVersion: base?.version)
                    try Task.checkCancellation()
                    guard self.generation == attempt else { return }
                    self.remember(saved)
                    self.notice = "Berichten online bewaard. De lokale opslag is alleen een cache."
                } catch {
                    guard !Task.isCancelled, self.generation == attempt else { return }
                    self.pending.removeValue(forKey: key)
                    if error as? NativeCloudHistoryFailure == .disabled {
                        let conversation = Self.key(message.peer, message.kind)
                        self.policies[conversation] = false
                        self.pending = self.pending.filter { Self.key($0.value.message.peer, $0.value.message.kind) != conversation }
                        self.states[conversation]?.notice = "Online bewaren staat uit in je serverinstellingen."
                        self.notice = "Online bewaren is door de server uitgeschakeld."
                    } else {
                        self.notice = error as? NativeCloudHistoryFailure == .conflict
                            ? "Online versie is inmiddels gewijzigd. Niet overschreven; haal de geschiedenis opnieuw op."
                            : "Online bewaren niet bevestigd. De lokale kopie blijft behouden; geen automatische herverzending."
                    }
                }
                self.writingKey = nil
            }
            guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
            self.writer = nil
        }
    }
}

enum NativeCloudRecordFactory {
    static func direct(_ message: NativeChatMessage, owner: String, includingPending: Bool = false) -> NativeCloudMessage? {
        guard !message.hidden, includingPending || (!message.actionPending && !message.reactionPending),
              [.incoming, .submitted].contains(message.state),
              let identifier = message.cloudID ?? message.previousIDs.first ?? message.stanzaID else { return nil }
        return make(identifier: identifier, peer: message.peer, kind: "contact", name: message.peer,
                    sender: message.state == .incoming ? message.peer : owner, own: message.state != .incoming,
                    body: message.body, date: message.date, edited: message.edited, retracted: message.retracted,
                    reactions: message.reactions, delivery: message.delivery)
    }

    static func group(_ message: NativeGroupText, includingPending: Bool = false) -> NativeCloudMessage? {
        guard !message.hidden, includingPending || !message.actionPending, [.incoming, .submitted].contains(message.state),
              let identifier = message.cloudID ?? message.identifier else { return nil }
        return make(identifier: identifier, peer: message.room, kind: "group", name: message.room,
                    sender: message.room + "/" + message.nickname, own: message.own,
                    body: message.body, date: message.date, edited: false, retracted: message.retracted,
                    reactions: message.reactions, delivery: .unconfirmed)
    }

    private static func make(identifier: String, peer: String, kind: String, name: String, sender: String,
                             own: Bool, body: String, date: Date, edited: Bool, retracted: Bool,
                             reactions: [String: [String]], delivery: NativeDeliveryStatus) -> NativeCloudMessage? {
        guard !identifier.isEmpty, identifier.utf8.count <= 150, NativeChatCodec.bareJID(peer) == peer,
              retracted || NativeChatCodec.validBody(body) else { return nil }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return NativeCloudMessage(fields: ["messageId": .string(identifier), "conversationPeer": .string(peer),
            "conversationName": .string(name), "conversationKind": .string(kind), "direction": .string(own ? "self" : "peer"),
            "from": .string(sender), "text": .string(retracted ? "" : body), "status": .string(retracted ? "retracted" : own ? "sent" : "received"),
            "timestamp": .string(formatter.string(from: date)), "edited": .bool(edited), "retracted": .bool(retracted),
            "reactions": .object(reactions.mapValues { .array($0.map { .string($0) }) }),
            "deliveryStatus": .string(delivery == .displayed ? "read" : delivery == .delivered ? "delivered" : "sent"),
            "attachment": .null, "location": .null, "callInfo": .null, "jingleHistory": .null, "retraction": .null,
            "stylingDisabled": .bool(false)])
    }
}
