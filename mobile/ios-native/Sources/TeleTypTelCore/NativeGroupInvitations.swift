import Combine
import Foundation

public struct NativeGroupInvitation: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let room: String
    public let inviter: String
    public let replyTo: String
    public let requiresPassword: Bool
    public let receivedAt: Date
    var current: Bool { (0.0..<600.0).contains(Date().timeIntervalSince(receivedAt)) }
}

public enum NativeGroupInvitationEvent: Sendable {
    case invited(NativeGroupInvitation)
    case declined(room: String, peer: String)
}

public protocol NativeGroupInviting: NativeGroupSending {
    func observeGroupInvitations(_ observer: @escaping @Sendable (NativeGroupInvitationEvent) -> Void) async
    func inviteToGroup(room: String, peer: String, identifier: String) async throws
    func declineGroupInvitation(_ invitation: NativeGroupInvitation) async throws
}

enum NativeInvitationCodec {
    static let namespace = "http://jabber.org/protocol/muc#user"

    static func isRoom(_ room: String, owner: String) -> Bool {
        NativeChatCodec.bareJID(owner) == owner && NativeChatCodec.bareJID(room) == room &&
            room.components(separatedBy: "@").last == "conference." + owner.components(separatedBy: "@").last!
    }

    static func decode(_ root: ProbeElement, owner: String, boundJID: String) -> NativeGroupInvitationEvent? {
        guard root.name == "message", root.namespace == "jabber:client", [nil, "normal"].contains(root.attributes["type"]),
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == boundJID,
              let room = root.attributes["from"], isRoom(room, owner: owner) else { return nil }
        let extensions = root.children.filter { $0.name == "x" && $0.namespace == namespace }
        guard extensions.count == 1 else { return nil }
        let actions = extensions[0].children.filter { ["invite", "decline"].contains($0.name) && $0.namespace == namespace }
        guard actions.count == 1, let from = actions[0].attributes["from"],
              let peer = NativeChatCodec.bareJID(from), peer != owner,
              !peer.components(separatedBy: "@").last!.hasPrefix("conference.") else { return nil }
        if actions[0].name == "decline" { return .declined(room: room, peer: peer) }
        let password = extensions[0].children.contains { $0.name == "password" && $0.namespace == namespace }
        return .invited(NativeGroupInvitation(id: UUID(), room: room, inviter: peer, replyTo: from,
            requiresPassword: password, receivedAt: Date()))
    }

    static func invite(room: String, peer: String, owner: String, identifier: String) throws -> String {
        guard isRoom(room, owner: owner), NativeChatCodec.bareJID(peer) == peer, peer != owner,
              !peer.components(separatedBy: "@").last!.hasPrefix("conference."), UUID(uuidString: identifier) != nil else {
            throw NativeGroupFailure.invalidRoom
        }
        return "<message xmlns='jabber:client' type='normal' to='\(NativeMUCStream.escape(room))' id='\(identifier)'><x xmlns='\(namespace)'><invite to='\(NativeMUCStream.escape(peer))'/></x></message>"
    }

    static func decline(_ invitation: NativeGroupInvitation, owner: String) throws -> String {
        guard invitation.current, isRoom(invitation.room, owner: owner), invitation.inviter != owner,
              NativeChatCodec.bareJID(invitation.replyTo) == invitation.inviter else { throw NativeGroupFailure.invalidRoom }
        return "<message xmlns='jabber:client' type='normal' to='\(NativeMUCStream.escape(invitation.room))' id='\(UUID().uuidString)'><x xmlns='\(namespace)'><decline to='\(NativeMUCStream.escape(invitation.replyTo))'/></x></message>"
    }
}

public struct NativeGroupInviteAttempt: Identifiable, Equatable {
    public enum State: Equatable {
        case sending, submitted, uncertain, rejected, declined
        public var label: String {
            switch self {
            case .sending: return "Uitnodiging verzenden…"
            case .submitted: return "Uitnodiging verzonden · ontvangst en toegang niet bevestigd"
            case .uncertain: return "Verzending onzeker · niet automatisch opnieuw verzonden"
            case .rejected: return "Uitnodiging geweigerd door de server"
            case .declined: return "Uitnodiging afgewezen door het contact"
            }
        }
    }
    public let id: UUID
    public let room: String
    public let peer: String
    public var state: State
}

@MainActor
public final class NativeGroupInvitationModel: ObservableObject {
    @Published public private(set) var invitations: [NativeGroupInvitation] = []
    @Published public private(set) var attempts: [NativeGroupInviteAttempt] = []
    @Published public private(set) var contacts: [NativeContact] = []
    @Published public private(set) var pending: Set<UUID> = []
    @Published public private(set) var notice: String?
    @Published public private(set) var available = false
    private var owner: String?
    private var sender: (any NativeGroupInviting)?
    private var generation = UUID()
    private var contactsReady = false
    private var early: [NativeGroupInvitationEvent] = []
    private var observerTask: Task<Void, Never>?
    private var tasks: [UUID: Task<Void, Never>] = [:]

    public init() {}
    deinit { observerTask?.cancel(); for task in tasks.values { task.cancel() } }

    func updateContacts(_ contacts: [NativeContact], owner: String) {
        if self.owner != owner { disconnect(clear: true); self.owner = owner }
        self.contacts = Array(contacts.filter {
            NativeChatCodec.bareJID($0.jid) == $0.jid && $0.jid != owner && !$0.jid.components(separatedBy: "@").last!.hasPrefix("conference.")
        }.prefix(100))
        contactsReady = true
        invitations.removeAll { !allowed($0.inviter) || !$0.current }
        let buffered = early; early.removeAll()
        for event in buffered { receive(event) }
    }

    func attach(_ sender: any NativeGroupInviting, owner: String) {
        if self.owner != owner { disconnect(clear: true); self.owner = owner }
        self.sender = sender; available = true
        let attempt = generation
        observerTask?.cancel()
        observerTask = Task { [weak self] in
            await sender.observeGroupInvitations { [weak self] event in
                Task { @MainActor [weak self] in
                    guard let self = self, self.generation == attempt, self.available else { return }
                    self.receive(event)
                }
            }
        }
    }

    func disconnect(clear: Bool) {
        generation = UUID()
        observerTask?.cancel(); observerTask = nil
        for task in tasks.values { task.cancel() }
        tasks.removeAll(); pending.removeAll(); early.removeAll()
        sender = nil; available = false
        for index in attempts.indices where attempts[index].state == .sending { attempts[index].state = .uncertain }
        if clear { invitations.removeAll(); attempts.removeAll(); contacts.removeAll(); owner = nil; contactsReady = false; notice = nil }
    }

    public func dismiss(_ identifier: UUID) { invitations.removeAll { $0.id == identifier } }

    func candidate(_ identifier: UUID, nickname: String) -> NativeGroupInvitation? {
        guard available, let invitation = invitations.first(where: { $0.id == identifier }), invitation.current,
              allowed(invitation.inviter), !invitation.requiresPassword, NativeMUCStream.validNickname(nickname) else {
            notice = "Deelname niet gestart. Controleer je schermnaam en de uitnodiging; wachtwoordgroepen zijn nog niet ondersteund."
            return nil
        }
        notice = nil
        return invitation
    }

    func accepted(room: String) {
        guard invitations.contains(where: { $0.room == room }) else { return }
        invitations.removeAll { $0.room == room }; notice = "Deelname bevestigd door de groep."
    }

    func send(room: String, peer: String) {
        guard available, let sender = sender, let owner = owner, allowed(peer), attempts.count < 16, tasks.count < 8,
              (try? NativeInvitationCodec.invite(room: room, peer: peer, owner: owner, identifier: UUID().uuidString)) != nil else {
            notice = "Uitnodiging niet gestart. Kies een bekend contact of probeer later opnieuw."; return
        }
        notice = nil
        let identifier = UUID(); let attempt = generation
        attempts.append(NativeGroupInviteAttempt(id: identifier, room: room, peer: peer, state: .sending))
        tasks[identifier] = Task { [weak self] in
            var state: NativeGroupInviteAttempt.State = .submitted
            do { try await sender.inviteToGroup(room: room, peer: peer, identifier: identifier.uuidString) } catch { state = .uncertain }
            guard let self = self, self.generation == attempt else { return }
            if let index = self.attempts.firstIndex(where: { $0.id == identifier }), self.attempts[index].state == .sending {
                self.attempts[index].state = state
            }
            self.tasks.removeValue(forKey: identifier)
        }
    }

    public func decline(_ identifier: UUID) {
        guard available, let sender = sender, let invitation = invitations.first(where: { $0.id == identifier }),
              allowed(invitation.inviter), invitation.current, !pending.contains(identifier), tasks.count < 8 else {
            notice = "Afwijzing niet verzonden. Je kunt de uitnodiging ook alleen verbergen."; return
        }
        pending.insert(identifier)
        let attempt = generation
        tasks[identifier] = Task { [weak self] in
            do {
                try await sender.declineGroupInvitation(invitation)
                guard let self = self, self.generation == attempt else { return }
                self.dismiss(identifier); self.notice = "Afwijzing verzonden · ontvangst niet bevestigd."
            } catch {
                guard let self = self, self.generation == attempt else { return }
                self.notice = "Afwijzen is niet gelukt. De uitnodiging blijft beschikbaar."
            }
            guard let self = self, self.generation == attempt else { return }
            self.pending.remove(identifier); self.tasks.removeValue(forKey: identifier)
        }
    }

    func rejected(_ identifier: String, room: String) {
        guard let index = attempts.firstIndex(where: { $0.id.uuidString == identifier && $0.room == room }) else { return }
        attempts[index].state = .rejected
    }

    private func allowed(_ peer: String) -> Bool { contacts.contains { $0.jid == peer } }

    private func receive(_ event: NativeGroupInvitationEvent) {
        guard contactsReady else { if early.count < 16 { early.append(event) }; return }
        switch event {
        case .invited(let invitation):
            guard let owner = owner, NativeInvitationCodec.isRoom(invitation.room, owner: owner), invitation.current,
                  allowed(invitation.inviter), NativeChatCodec.bareJID(invitation.replyTo) == invitation.inviter,
                  invitations.count < 16, !invitations.contains(where: { $0.room == invitation.room && $0.inviter == invitation.inviter }) else { return }
            invitations.append(invitation)
        case .declined(let room, let peer):
            guard let owner = owner, NativeInvitationCodec.isRoom(room, owner: owner), allowed(peer) else { return }
            let matches = attempts.indices.filter { attempts[$0].room == room && attempts[$0].peer == peer && attempts[$0].state != .rejected }
            if matches.count == 1 { attempts[matches[0]].state = .declined }
            else if !matches.isEmpty { notice = "Het contact heeft een uitnodiging voor deze groep afgewezen; het precieze verzendverzoek is niet bevestigd." }
        }
    }
}
