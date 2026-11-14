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
}

@MainActor
public final class NativeGroupModel: ObservableObject {
    public let invitationModel = NativeGroupInvitationModel()
    public let management = NativeGroupManagementModel()
    @Published public private(set) var rooms: [NativeGroupConversation] = [] { didSet { historyChanged?() } }
    var historyChanged: (() -> Void)?
    @Published public private(set) var error: String?
    @Published public private(set) var available = false
    private var sender: (any NativeGroupSending)?
    private var owner: String?
    private var generation = UUID()
    private var joins: [String: Task<Void, Never>] = [:]
    private var tokens: [String: UUID] = [:]
    private var sends: [UUID: Task<Void, Never>] = [:]

    public init() {}
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
        guard rooms.contains(where: { $0.room == room }) || rooms.count < 8 else { error = NativeGroupFailure.limit.label; return }
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
                self.rooms[roomIndex].messages[messageIndex].state = submitted ? .submitted : .uncertain
            }
            self.sends.removeValue(forKey: identifier)
        }
    }

    public func hideMessage(room: String, identifier: UUID) {
        guard let index = rooms.firstIndex(where: { $0.room == room }),
              let message = rooms[index].messages.firstIndex(where: { $0.id == identifier }),
              !rooms[index].messages[message].actionPending, rooms[index].messages[message].state != .sending,
              rooms[index].messages.filter({ $0.hidden || $0.retracted }).count < 128 else { return }
        rooms[index].messages[message].hidden = true
        rooms[index].messages[message].body = ""
    }

    public func canRetract(room: String, identifier: UUID) -> Bool {
        guard available, sender is any NativeGroupMessageChanging,
              let group = rooms.first(where: { $0.room == room }), group.snapshot?.canSpeak == true,
              group.snapshot?.supportsRetraction == true, let message = group.messages.first(where: { $0.id == identifier }) else { return false }
        return message.own && message.state == .submitted && !message.hidden && !message.retracted && !message.actionPending &&
            message.archiveID != nil && message.occupantID != nil
    }

    public func retract(room: String, identifier: UUID) {
        guard canRetract(room: room, identifier: identifier), sends.count < 8,
              let sender = sender as? any NativeGroupMessageChanging,
              let index = rooms.firstIndex(where: { $0.room == room }),
              let message = rooms[index].messages.firstIndex(where: { $0.id == identifier }),
              let target = rooms[index].messages[message].archiveID else { return }
        let request = UUID().uuidString
        rooms[index].messages[message].actionPending = true
        rooms[index].messages[message].actionRequestID = request
        rooms[index].messages[message].actionNotice = "Intrekverzoek wordt verzonden…"
        let attempt = generation
        sends[identifier] = Task { [weak self] in
            var submitted = false
            do { try await sender.retractGroupMessage(room: room, target: target, identifier: request); submitted = true } catch { }
            guard let self = self, self.generation == attempt,
                  let index = self.rooms.firstIndex(where: { $0.room == room }),
                  let message = self.rooms[index].messages.firstIndex(where: { $0.id == identifier }),
                  self.rooms[index].messages[message].actionPending else { self?.sends[identifier] = nil; return }
            self.rooms[index].messages[message].actionPending = false
            self.rooms[index].messages[message].actionNotice = submitted ? "Intrekverzoek verzonden; verwerking door de groep niet bevestigd." : "Intrekverzoek onzeker; niet automatisch opnieuw verzonden."
            self.sends[identifier] = nil
        }
    }

    private func receive(_ event: NativeGroupEvent, room: String) {
        guard let index = rooms.firstIndex(where: { $0.room == room }) else { return }
        switch event {
        case .retracted(let target, let occupant):
            let matches = rooms[index].messages.indices.filter { rooms[index].messages[$0].archiveID == target }
            if !matches.isEmpty {
                guard matches.count == 1, let message = matches.first,
                      rooms[index].messages[message].occupantID == occupant else { return }
                rooms[index].messages[message].body = ""; rooms[index].messages[message].retracted = true
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
            if let message = rooms[index].messages.firstIndex(where: { $0.own && $0.actionRequestID == identifier }) {
                rooms[index].messages[message].actionPending = false
                rooms[index].messages[message].actionNotice = "Intrekverzoek geweigerd door de groep."
                return
            }
            if let message = rooms[index].messages.firstIndex(where: { $0.own && $0.identifier == identifier }) {
                rooms[index].messages[message].state = .rejected
            }
        case .message(let text):
            guard text.room == room, NativeChatCodec.validBody(text.body) else { return }
            if text.own, let message = rooms[index].messages.firstIndex(where: { $0.own && $0.identifier != nil && $0.identifier == text.identifier }) {
                rooms[index].messages[message].archiveID = text.archiveID
                rooms[index].messages[message].occupantID = text.occupantID
                if rooms[index].messages[message].state == .sending { rooms[index].messages[message].state = .submitted }
                return
            }
            if rooms[index].messages.contains(where: {
                ($0.archiveID != nil && $0.archiveID == text.archiveID) ||
                ($0.nickname == text.nickname && $0.identifier != nil && $0.identifier == text.identifier)
            }) { return }
            guard makeRoom(index) else { error = NativeGroupFailure.limit.label; return }
            rooms[index].messages.append(text)
            if let archive = text.archiveID, let occupant = text.occupantID, rooms[index].retractionTombstones[archive] == occupant {
                let message = rooms[index].messages.count - 1
                rooms[index].messages[message].body = ""; rooms[index].messages[message].retracted = true
            }
        }
    }

    private func makeRoom(_ index: Int) -> Bool {
        guard rooms[index].messages.count >= 200 else { return true }
        guard let oldest = rooms[index].messages.firstIndex(where: { !$0.hidden && !$0.retracted && !$0.actionPending && ($0.state == .incoming || $0.state == .submitted) }) else { return false }
        rooms[index].messages.remove(at: oldest)
        rooms[index].historyLimited = true
        return true
    }
}
