import Combine
import Foundation

public struct NativeGroupConversation: Identifiable, Equatable {
    public let room: String
    public var nickname: String
    public var snapshot: NativeGroupSnapshot?
    public var joining = true
    public var error: NativeGroupFailure?
    public var draft = ""
    public var messages: [NativeGroupText] = []
    public var historyLimited = false
    public var subject = ""
    var retractionTombstones: [String: String] = [:]
    public var id: String { room }
    public var unreadCount: Int { messages.filter { !$0.own && $0.locallyRead == false && !$0.hidden && !$0.retracted }.count }
}

@MainActor
public final class NativeGroupModel: ObservableObject {
    public let invitationModel = NativeGroupInvitationModel()
    public let management = NativeGroupManagementModel()
    @Published public private(set) var rooms: [NativeGroupConversation] = [] { didSet { historyChanged?() } }
    var historyChanged: (() -> Void)?
    var acceptedHistoryChange: (([NativeGroupText], [NativeGroupText]) -> Void)?
    var receivedMessage: ((NativeGroupText) -> Void)?
    @Published public private(set) var error: String?
    @Published public private(set) var available = false
    private var sender: (any NativeGroupSending)?
    private var owner: String?
    private var generation = UUID()
    private var joins: [String: Task<Void, Never>] = [:]
    private var tokens: [String: UUID] = [:]
    private var sends: [UUID: Task<Void, Never>] = [:]
    var hasPendingSends: Bool { !sends.isEmpty }

    public init() {}

    public func markRead(room: String, identifiers: [UUID]) {
        guard let index = rooms.firstIndex(where: { $0.room == room }) else { return }
        let visible = Set(identifiers)
        for message in rooms[index].messages.indices where visible.contains(rooms[index].messages[message].id) {
            rooms[index].messages[message].locallyRead = true
        }
    }

    func rememberCloudConversations(_ catalog: [NativeCloudConversation], owner: String) {
        guard NativeChatCodec.bareJID(owner) == owner, self.owner == nil || self.owner == owner else { return }
        var nickname = String(owner.split(separator: "@", maxSplits: 1)[0])
        while nickname.utf8.count > 128 { nickname.removeLast() }
        guard NativeMUCStream.validNickname(nickname) else { return }
        self.owner = owner
        for conversation in catalog where conversation.kind == "group" {
            guard rooms.count < 8 else { break }
            guard NativeChatCodec.bareJID(conversation.peer) == conversation.peer, conversation.peer != owner,
                  !rooms.contains(where: { $0.room == conversation.peer }) else { continue }
            rooms.append(NativeGroupConversation(room: conversation.peer, nickname: nickname, snapshot: nil, joining: false))
        }
    }

    func openCloudConversation(_ conversation: NativeCloudConversation, owner: String) {
        guard conversation.kind == "group", self.owner == owner, NativeChatCodec.bareJID(conversation.peer) == conversation.peer else { return }
        guard reserveRoomSlot(conversation.peer) else { error = NativeGroupFailure.limit.label; return }
        rememberCloudConversations([conversation], owner: owner)
    }

    private func reserveRoomSlot(_ room: String) -> Bool {
        if rooms.contains(where: { $0.room == room }) || rooms.count < 8 { return true }
        guard let replaced = rooms.firstIndex(where: {
            $0.snapshot == nil && !$0.joining && $0.draft.isEmpty && $0.retractionTombstones.isEmpty &&
                $0.messages.allSatisfy { !NativeCloudMerge.protected($0) }
        }) else { return false }
        rooms.remove(at: replaced)
        return true
    }

    func mergeCloud(_ records: [NativeCloudMessage], room: String, owner: String, earlier: Bool = false) throws {
        guard records.count <= 50, self.owner == owner, NativeChatCodec.bareJID(owner) == owner,
              NativeChatCodec.bareJID(room) == room, room != owner,
              let index = rooms.firstIndex(where: { $0.room == room }) else { throw NativeGroupFailure.invalidRoom }
        let group = rooms[index]
        var imported: [(NativeCloudMessage, String)] = []
        for record in records {
            guard NativeCloudMerge.valid(record), record.kind == "group", record.peer == room else { throw NativeGroupFailure.invalidRoom }
            let nickname: String
            if record.direction == "self", record.sender.isEmpty {
                nickname = group.nickname
            } else {
                guard record.sender.hasPrefix(room + "/") else { throw NativeGroupFailure.invalidRoom }
                nickname = String(record.sender.dropFirst(room.count + 1))
            }
            guard NativeMUCStream.validNickname(nickname) else { throw NativeGroupFailure.invalidRoom }
            imported.append((record, nickname))
        }
        var merged = group.messages
        var retained = Set<UUID>()
        for (record, nickname) in imported {
            let own = record.direction == "self"
            let matches = merged.indices.filter {
                merged[$0].own == own && (own || merged[$0].nickname == nickname) &&
                (merged[$0].cloudID == record.messageID || merged[$0].identifier == record.messageID)
            }
            guard matches.count <= 1 else { throw NativeGroupFailure.invalidRoom }
            if let message = matches.first {
                retained.insert(merged[message].id)
                if record.retracted {
                    merged[message].body = ""; merged[message].retracted = true; merged[message].reactions.removeAll()
                    merged[message].actionPending = false
                    continue
                }
                if NativeCloudMerge.protected(merged[message]) { continue }
                merged[message].cloudID = merged[message].cloudID ?? record.messageID
                if record.edited || merged[message].identifier == nil { merged[message].body = record.text }
                if record.edited { merged[message].edited = true }
                merged[message].reactions = record.reactions
            } else {
                merged.append(NativeGroupText(id: UUID(), room: room, nickname: nickname, identifier: nil, cloudID: record.messageID,
                    archiveID: nil, body: record.retracted ? "" : record.text, date: record.date, own: own,
                    state: own ? .submitted : .incoming, retracted: record.retracted, edited: record.edited ? true : nil, reactions: record.retracted ? [:] : record.reactions))
                retained.insert(merged[merged.count - 1].id)
            }
        }
        merged = merged.enumerated().sorted {
            $0.element.date == $1.element.date ? $0.offset < $1.offset : $0.element.date < $1.element.date
        }.map(\.element)
        var limited = group.historyLimited
        while merged.count > 200 {
            let eligible = merged.indices.filter { !retained.contains(merged[$0].id) && !NativeCloudMerge.protected(merged[$0]) }
            guard let message = earlier ? eligible.last : eligible.first else { throw NativeGroupFailure.limit }
            merged.remove(at: message)
            limited = true
        }
        rooms[index].messages = merged
        rooms[index].historyLimited = limited
    }
    func restoreHistory(_ histories: [NativeGroupHistory], owner: String) {
        guard histories.count <= 8, !available else { return }
        self.owner = owner; rooms = histories.map(\.conversation)
    }
    func clearLocalHistory() {
        for index in rooms.indices {
            rooms[index].messages.removeAll(); rooms[index].draft = ""; rooms[index].retractionTombstones.removeAll()
        }
    }
    deinit { for task in joins.values { task.cancel() }; for task in sends.values { task.cancel() } }

    func attach(_ sender: any NativeGroupSending, owner: String) {
        if self.sender != nil, self.owner == owner { return }
        if self.owner != owner { disconnect(clear: true) }
        self.owner = owner
        self.sender = sender
        available = true
        if let inviting = sender as? any NativeGroupInviting { invitationModel.attach(inviting, owner: owner) }
        if let managing = sender as? any NativeGroupManaging { management.attach(managing) }
    }

    func updateContacts(_ contacts: [NativeContact], owner: String) {
        if self.owner != owner { disconnect(clear: true); self.owner = owner }
        invitationModel.updateContacts(contacts, owner: owner)
    }

    public func acceptInvitation(_ identifier: UUID, nickname: String) {
        guard let invitation = invitationModel.candidate(identifier, nickname: nickname) else { return }
        join(room: invitation.room, nickname: nickname)
        if rooms.first(where: { $0.room == invitation.room })?.snapshot != nil { invitationModel.accepted(room: invitation.room) }
    }

    public func invite(room: String, peer: String) {
        guard rooms.first(where: { $0.room == room })?.snapshot?.canSpeak == true else {
            error = "Neem eerst deel aan de groep voordat je iemand uitnodigt."; return
        }
        invitationModel.send(room: room, peer: peer)
    }

    func disconnect(clear: Bool) {
        generation = UUID()
        invitationModel.disconnect(clear: clear)
        management.disconnect()
        for task in joins.values { task.cancel() }
        for task in sends.values { task.cancel() }
        joins.removeAll(); sends.removeAll(); tokens.removeAll()
        if let sender = sender {
            for room in rooms { Task { await sender.leaveGroup(room: room.room) } }
        }
        sender = nil
        available = false
        for index in rooms.indices {
            rooms[index].joining = false
            rooms[index].snapshot = nil
            rooms[index].error = .disconnected
            for message in rooms[index].messages.indices where rooms[index].messages[message].state == .sending {
                rooms[index].messages[message].state = .uncertain
            }
            for message in rooms[index].messages.indices where rooms[index].messages[message].actionPending {
                rooms[index].messages[message].actionPending = false
                rooms[index].messages[message].actionNotice = "Intrekverzoek onzeker; niet automatisch opnieuw verzonden."
            }
        }
        if clear { rooms.removeAll(); owner = nil; error = nil }
    }

    public func join(room: String, nickname: String, create: Bool = false) {
        guard available, let sender = sender, let owner = owner else { error = NativeGroupFailure.disconnected.label; return }
        do { _ = try NativeMUCStream(room: room, nickname: nickname, boundJID: owner + "/validation") }
        catch { self.error = NativeGroupFailure.invalidRoom.label; return }
        guard rooms.first(where: { $0.room == room })?.snapshot == nil, joins[room] == nil else { return }
        guard reserveRoomSlot(room) else { error = NativeGroupFailure.limit.label; return }
        if let index = rooms.firstIndex(where: { $0.room == room }) {
            rooms[index].joining = true; rooms[index].error = nil; rooms[index].nickname = nickname
        } else { rooms.append(NativeGroupConversation(room: room, nickname: nickname)) }
        let attempt = generation
        let token = UUID()
        tokens[room] = token
        error = nil
        joins[room] = Task { [weak self] in
            do {
                let callback: @Sendable (NativeGroupEvent) -> Void = { [weak self] event in
                    Task { @MainActor [weak self] in
                        guard let self = self, self.generation == attempt, self.tokens[room] == token else { return }
                        self.receive(event, room: room)
                    }
                }
                if create {
                    guard let managing = sender as? any NativeGroupManaging else { throw NativeGroupFailure.unavailable }
                    try await managing.createGroup(room: room, nickname: nickname, onEvent: callback)
                } else { try await sender.joinGroup(room: room, nickname: nickname, onEvent: callback) }
                guard let self = self, self.generation == attempt, self.tokens[room] == token else { return }
                self.joins.removeValue(forKey: room)
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt, self.tokens[room] == token else { return }
                self.receive(.ended(error as? NativeGroupFailure ?? .unavailable), room: room)
                self.joins.removeValue(forKey: room)
            }
        }
    }

    public func leave(room: String) {
        tokens.removeValue(forKey: room)
        joins.removeValue(forKey: room)?.cancel()
        if let sender = sender { Task { await sender.leaveGroup(room: room) } }
        receive(.ended(nil), room: room)
    }

    public func setDraft(_ text: String, room: String) {
        guard text.utf8.count <= 8192, let index = rooms.firstIndex(where: { $0.room == room }) else { return }
        rooms[index].draft = text
    }

    public func setSubject(_ subject: String, room: String) {
        guard let sender = sender as? any NativeGroupManaging, available, subject.utf8.count <= 512,
              rooms.first(where: { $0.room == room })?.snapshot?.canSpeak == true, sends.count < 8 else { error = NativeGroupFailure.denied.label; return }
        let identifier = UUID(); let attempt = generation
        sends[identifier] = Task { [weak self] in
            do {
                try await sender.setGroupSubject(room: room, subject: subject)
                guard let self = self, self.generation == attempt else { return }
                self.error = "Onderwerp verzonden; de server bepaalt of het wordt toegepast."
            } catch {
                guard let self = self, self.generation == attempt else { return }
                self.error = "Onderwerp niet bevestigd. Controleer je groepsrechten."
            }
            guard let self = self, self.generation == attempt else { return }
            self.sends.removeValue(forKey: identifier)
        }
    }

    public func send(room: String) {
        guard available, let sender = sender, let index = rooms.firstIndex(where: { $0.room == room }),
              let snapshot = rooms[index].snapshot, snapshot.canSpeak,
              NativeChatCodec.validBody(rooms[index].draft), sends.count < 8 else { error = NativeGroupFailure.denied.label; return }
        guard makeRoom(index) else { error = NativeGroupFailure.limit.label; return }
        let identifier = UUID()
        let text = rooms[index].draft
        rooms[index].messages.append(NativeGroupText(id: identifier, room: room, nickname: snapshot.nickname,
            identifier: identifier.uuidString, archiveID: nil, body: text, date: Date(), own: true, state: .sending))
        rooms[index].draft = ""
        let attempt = generation
        error = nil
        sends[identifier] = Task { [weak self] in
            var submitted = false
            do { try await sender.sendGroup(room: room, body: text, identifier: identifier.uuidString); submitted = true } catch { }
            guard let self = self, self.generation == attempt else { return }
            if let roomIndex = self.rooms.firstIndex(where: { $0.room == room }),
               let messageIndex = self.rooms[roomIndex].messages.firstIndex(where: { $0.id == identifier }),
               self.rooms[roomIndex].messages[messageIndex].state == .sending {
                let before = self.rooms[roomIndex].messages
                self.rooms[roomIndex].messages[messageIndex].state = submitted ? .submitted : .uncertain
                if submitted { self.acceptedHistoryChange?(before, self.rooms[roomIndex].messages) }
            }
            self.sends.removeValue(forKey: identifier)
        }
    }

    public func canReact(room: String, identifier: UUID) -> Bool {
        guard available, sender is any NativeGroupReacting, let group = rooms.first(where: { $0.room == room }),
              group.snapshot?.canSpeak == true, group.snapshot?.supportsReactions == true,
              let message = group.messages.first(where: { $0.id == identifier }) else { return false }
        return !message.hidden && !message.retracted && !message.actionPending && message.archiveID != nil && [.incoming, .submitted].contains(message.state)
    }

    public func react(room: String, identifier: UUID, emoji: String) {
        guard canReact(room: room, identifier: identifier), sends.count < 8, NativeInteractionCodec.picker.contains(emoji),
              let sender = sender as? any NativeGroupReacting, let index = rooms.firstIndex(where: { $0.room == room }),
              let message = rooms[index].messages.firstIndex(where: { $0.id == identifier }),
              let target = rooms[index].messages[message].archiveID, let actor = rooms[index].snapshot?.ownOccupantID else { return }
        var values = rooms[index].messages[message].reactions[actor] ?? []
        if values.contains(emoji) { values.removeAll { $0 == emoji } } else if values.count < 16 { values.append(emoji) }
        let request = UUID().uuidString; let attempt = generation
        rooms[index].messages[message].actionPending = true; rooms[index].messages[message].actionRequestID = request
        sends[identifier] = Task { [weak self] in
            var submitted = false
            do { try await sender.reactGroup(room: room, target: target, values: values, identifier: request); submitted = true } catch { }
            guard let self = self, self.generation == attempt, let index = self.rooms.firstIndex(where: { $0.room == room }),
                  let message = self.rooms[index].messages.firstIndex(where: { $0.id == identifier }),
                  self.rooms[index].messages[message].actionRequestID == request else { return }
            self.rooms[index].messages[message].actionPending = false
            if !submitted { self.rooms[index].messages[message].actionNotice = "Reactie onzeker; niet automatisch opnieuw verzonden." }
            self.sends[identifier] = nil
        }
    }

    public func hideMessage(room: String, identifier: UUID) {
        guard let index = rooms.firstIndex(where: { $0.room == room }),
              let message = rooms[index].messages.firstIndex(where: { $0.id == identifier }),
              !rooms[index].messages[message].actionPending, rooms[index].messages[message].state != .sending,
              rooms[index].messages.filter({ $0.hidden || $0.retracted }).count < 128 else { return }
        rooms[index].messages[message].hidden = true
        rooms[index].messages[message].body = ""
        rooms[index].messages[message].reactions.removeAll()
    }

    public func canRetract(room: String, identifier: UUID) -> Bool {
        guard available, sender is any NativeGroupMessageChanging,
              let group = rooms.first(where: { $0.room == room }), group.snapshot?.canSpeak == true,
              group.snapshot?.supportsRetraction == true, let message = group.messages.first(where: { $0.id == identifier }) else { return false }
        return message.own && message.state == .submitted && !message.hidden && !message.retracted && !message.actionPending &&
            message.archiveID != nil && message.occupantID != nil
    }

    public func canCorrect(room: String, identifier: UUID) -> Bool {
        guard available, sender is any NativeGroupCorrecting, let group = rooms.first(where: { $0.room == room }),
              let snapshot = group.snapshot, snapshot.canSpeak, let target = snapshot.lastOwnLiveID, let occupant = snapshot.ownOccupantID,
              let message = group.messages.first(where: { $0.id == identifier }), message.identifier == target else { return false }
        return message.own && message.nickname == snapshot.nickname && message.occupantID == occupant &&
            message.state == .submitted && !message.hidden && !message.retracted && !message.actionPending
    }

    public func retract(room: String, identifier: UUID) {
        change(room: room, identifier: identifier, body: nil)
    }

    public func correct(room: String, identifier: UUID, body: String) {
        change(room: room, identifier: identifier, body: body)
    }

    private func change(room: String, identifier: UUID, body: String?) {
        guard sends.count < 8, sends[identifier] == nil,
              let index = rooms.firstIndex(where: { $0.room == room }),
              let message = rooms[index].messages.firstIndex(where: { $0.id == identifier }) else { return }
        let submit: (String) async throws -> Void
        if let body {
            guard canCorrect(room: room, identifier: identifier), NativeChatCodec.validBody(body),
                  let target = rooms[index].messages[message].identifier, let sender = sender as? any NativeGroupCorrecting else { return }
            submit = { try await sender.correctGroupMessage(room: room, target: target, body: body, identifier: $0) }
        } else {
            guard canRetract(room: room, identifier: identifier), let target = rooms[index].messages[message].archiveID,
                  let sender = sender as? any NativeGroupMessageChanging else { return }
            submit = { try await sender.retractGroupMessage(room: room, target: target, identifier: $0) }
        }
        let request = UUID().uuidString
        rooms[index].messages[message].actionPending = true
        rooms[index].messages[message].actionRequestID = request
        let label = body == nil ? "Intrekverzoek" : "Wijziging"
        rooms[index].messages[message].actionNotice = label + " wordt verzonden…"
        let attempt = generation
        sends[identifier] = Task { [weak self] in
            var submitted = false
            do { try await submit(request); submitted = true } catch { }
            guard let self = self, self.generation == attempt,
                  let index = self.rooms.firstIndex(where: { $0.room == room }),
                  let message = self.rooms[index].messages.firstIndex(where: { $0.id == identifier }),
                  self.rooms[index].messages[message].actionPending else { self?.sends[identifier] = nil; return }
            self.rooms[index].messages[message].actionPending = false
            self.rooms[index].messages[message].actionNotice = label + (submitted ? " verzonden; verwerking door de groep niet bevestigd." : " onzeker; niet automatisch opnieuw verzonden.")
            self.sends[identifier] = nil
        }
    }

    private func receive(_ event: NativeGroupEvent, room: String) {
        guard let index = rooms.firstIndex(where: { $0.room == room }) else { return }
        let before: [NativeGroupText]?
        switch event {
        case .message, .reactions, .retracted, .corrected: before = rooms[index].messages
        default: before = nil
        }
        defer {
            if let before = before, before != rooms[index].messages { acceptedHistoryChange?(before, rooms[index].messages) }
        }
        switch event {
        case .corrected(let target, let nickname, let occupant, let body, let request):
            let matches = rooms[index].messages.indices.filter {
                let message = rooms[index].messages[$0]
                return message.identifier == target && message.nickname == nickname && message.occupantID == occupant
            }
            guard matches.count == 1, let message = matches.first, NativeChatCodec.validBody(body),
                  !rooms[index].messages[message].hidden, !rooms[index].messages[message].retracted else { return }
            rooms[index].messages[message].body = body
            rooms[index].messages[message].edited = true
            if let request, rooms[index].messages[message].own, rooms[index].messages[message].actionRequestID == request {
                rooms[index].messages[message].actionPending = false
                rooms[index].messages[message].actionRequestID = nil
                rooms[index].messages[message].actionNotice = nil
            }
        case .reactions(let target, let occupant, let values):
            guard rooms[index].snapshot?.supportsReactions == true, NativeMessageActionCodec.validID(occupant),
                  values.count <= 16, values.allSatisfy(NativeInteractionCodec.validReaction) else { return }
            let matches = rooms[index].messages.indices.filter { rooms[index].messages[$0].archiveID == target }
            guard matches.count == 1, let message = matches.first, !rooms[index].messages[message].hidden, !rooms[index].messages[message].retracted,
                  rooms[index].messages[message].reactions[occupant] != nil || rooms[index].messages[message].reactions.count < 64 else { return }
            rooms[index].messages[message].reactions[occupant] = values.isEmpty ? nil : Array(Set(values)).sorted()
        case .retracted(let target, let occupant):
            let matches = rooms[index].messages.indices.filter { rooms[index].messages[$0].archiveID == target }
            if !matches.isEmpty {
                guard matches.count == 1, let message = matches.first,
                      rooms[index].messages[message].occupantID == occupant else { return }
                rooms[index].messages[message].body = ""; rooms[index].messages[message].retracted = true
                rooms[index].messages[message].reactions.removeAll()
                rooms[index].messages[message].actionPending = false
                rooms[index].messages[message].actionNotice = "Intrekking door de groepsserver doorgestuurd; externe kopieën kunnen blijven bestaan."
            }
            if rooms[index].retractionTombstones.count < 128 || rooms[index].retractionTombstones[target] == occupant {
                rooms[index].retractionTombstones[target] = occupant
            }
        case .subject(let subject):
            if subject.utf8.count <= 512 { rooms[index].subject = subject }
        case .snapshot(let snapshot):
            guard snapshot.room == room, NativeMUCStream.validNickname(snapshot.nickname), snapshot.participants.count <= 128 else { return }
            rooms[index].snapshot = snapshot; rooms[index].nickname = snapshot.nickname
            rooms[index].joining = false; rooms[index].error = nil
            invitationModel.accepted(room: room)
        case .ended(let reason):
            tokens.removeValue(forKey: room)
            joins.removeValue(forKey: room)
            rooms[index].snapshot = nil; rooms[index].joining = false; rooms[index].error = reason
            for message in rooms[index].messages.indices where rooms[index].messages[message].state == .sending {
                rooms[index].messages[message].state = .uncertain
            }
            for message in rooms[index].messages.indices where rooms[index].messages[message].actionPending {
                rooms[index].messages[message].actionPending = false
                rooms[index].messages[message].actionNotice = "Intrekverzoek onzeker; deelname aan de groep is beëindigd."
            }
        case .rejected(let identifier):
            invitationModel.rejected(identifier, room: room)
            if let message = rooms[index].messages.firstIndex(where: { $0.actionRequestID == identifier }) {
                rooms[index].messages[message].actionPending = false
                rooms[index].messages[message].actionNotice = "Berichtactie geweigerd door de groep."
                return
            }
            if let message = rooms[index].messages.firstIndex(where: { $0.own && $0.identifier == identifier }) {
                rooms[index].messages[message].state = .rejected
            }
        case .message(let text):
            guard text.room == room, NativeChatCodec.validBody(text.body) else { return }
            let matches = rooms[index].messages.indices.filter {
                let message = rooms[index].messages[$0]
                return message.own == text.own &&
                    ((message.archiveID != nil && message.archiveID == text.archiveID) ||
                     ((message.own || message.nickname == text.nickname) && text.identifier != nil &&
                      (message.identifier == text.identifier ||
                       (text.identifier.map(NativeMessageActionCodec.validID) == true && message.cloudID == text.identifier))))
            }
            guard matches.count <= 1 else { return }
            if let message = matches.first {
                if rooms[index].messages[message].identifier == nil { rooms[index].messages[message].identifier = text.identifier }
                if let archive = text.archiveID { rooms[index].messages[message].archiveID = archive }
                if let occupant = text.occupantID { rooms[index].messages[message].occupantID = occupant }
                if text.own, rooms[index].messages[message].state == .sending { rooms[index].messages[message].state = .submitted }
                applyRememberedRetraction(index, message: message)
                return
            }
            guard makeRoom(index) else { error = NativeGroupFailure.limit.label; return }
            rooms[index].messages.append(text)
            applyRememberedRetraction(index, message: rooms[index].messages.count - 1)
            if let message = rooms[index].messages.last, !message.own, message.locallyRead == false, !message.hidden, !message.retracted {
                receivedMessage?(message)
            }
        }
    }

    private func applyRememberedRetraction(_ index: Int, message: Int) {
        if let archive = rooms[index].messages[message].archiveID, let occupant = rooms[index].messages[message].occupantID,
           rooms[index].retractionTombstones[archive] == occupant {
            rooms[index].messages[message].body = ""; rooms[index].messages[message].retracted = true
            rooms[index].messages[message].reactions.removeAll()
        }
    }

    private func makeRoom(_ index: Int) -> Bool {
        guard rooms[index].messages.count >= 200 else { return true }
        guard let oldest = rooms[index].messages.firstIndex(where: { !NativeCloudMerge.protected($0) }) else { return false }
        rooms[index].messages.remove(at: oldest)
        rooms[index].historyLimited = true
        return true
    }
}
