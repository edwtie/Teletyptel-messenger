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
    public var id: String { room }
}

@MainActor
public final class NativeGroupModel: ObservableObject {
    @Published public private(set) var rooms: [NativeGroupConversation] = []
    @Published public private(set) var error: String?
    @Published public private(set) var available = false
    private var sender: (any NativeGroupSending)?
    private var owner: String?
    private var generation = UUID()
    private var joins: [String: Task<Void, Never>] = [:]
    private var tokens: [String: UUID] = [:]
    private var sends: [UUID: Task<Void, Never>] = [:]

    public init() {}
    deinit { for task in joins.values { task.cancel() }; for task in sends.values { task.cancel() } }

    func attach(_ sender: any NativeGroupSending, owner: String) {
        if self.sender != nil, self.owner == owner { return }
        if self.owner != owner { disconnect(clear: true) }
        self.owner = owner
        self.sender = sender
        available = true
    }

    func disconnect(clear: Bool) {
        generation = UUID()
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
        }
        if clear { rooms.removeAll(); owner = nil; error = nil }
    }

    public func join(room: String, nickname: String) {
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
                try await sender.joinGroup(room: room, nickname: nickname) { [weak self] event in
                    Task { @MainActor [weak self] in
                        guard let self = self, self.generation == attempt, self.tokens[room] == token else { return }
                        self.receive(event, room: room)
                    }
                }
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

    private func receive(_ event: NativeGroupEvent, room: String) {
        guard let index = rooms.firstIndex(where: { $0.room == room }) else { return }
        switch event {
        case .snapshot(let snapshot):
            guard snapshot.room == room, NativeMUCStream.validNickname(snapshot.nickname), snapshot.participants.count <= 128 else { return }
            rooms[index].snapshot = snapshot; rooms[index].nickname = snapshot.nickname
            rooms[index].joining = false; rooms[index].error = nil
        case .ended(let reason):
            tokens.removeValue(forKey: room)
            joins.removeValue(forKey: room)
            rooms[index].snapshot = nil; rooms[index].joining = false; rooms[index].error = reason
            for message in rooms[index].messages.indices where rooms[index].messages[message].state == .sending {
                rooms[index].messages[message].state = .uncertain
            }
        case .rejected(let identifier):
            if let message = rooms[index].messages.firstIndex(where: { $0.own && $0.identifier == identifier }) {
                rooms[index].messages[message].state = .rejected
            }
        case .message(let text):
            guard text.room == room, NativeChatCodec.validBody(text.body) else { return }
            if rooms[index].messages.contains(where: {
                ($0.archiveID != nil && $0.archiveID == text.archiveID) ||
                ($0.nickname == text.nickname && $0.identifier != nil && $0.identifier == text.identifier)
            }) { return }
            guard makeRoom(index) else { error = NativeGroupFailure.limit.label; return }
            rooms[index].messages.append(text)
        }
    }

    private func makeRoom(_ index: Int) -> Bool {
        guard rooms[index].messages.count >= 200 else { return true }
        guard let oldest = rooms[index].messages.firstIndex(where: { $0.state == .incoming || $0.state == .submitted }) else { return false }
        rooms[index].messages.remove(at: oldest)
        rooms[index].historyLimited = true
        return true
    }
}
