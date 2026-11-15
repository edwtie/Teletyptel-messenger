import Foundation
import Combine

enum NativeContactFailure: Error { case invalid, unavailable, rejected, timedOut }

protocol NativeContactManaging: Sendable {
    func setBlocked(jid: String, blocked: Bool) async throws
    func removeContact(jid: String) async throws
    func setDoNotDisturb(_ enabled: Bool) async throws
    func addContact(jid: String, name: String, requestPresence: Bool) async throws
    func observeContactRequests(_ observer: @escaping @Sendable ([String]) -> Void) async
    func respondToContactRequest(jid: String, allow: Bool) async throws
}

extension NativeContactManaging {
    func setBlocked(jid: String, blocked: Bool) async throws { throw NativeContactFailure.unavailable }
    func removeContact(jid: String) async throws { throw NativeContactFailure.unavailable }
    func setDoNotDisturb(_ enabled: Bool) async throws { throw NativeContactFailure.unavailable }
    func observeContactRequests(_ observer: @escaping @Sendable ([String]) -> Void) async { observer([]) }
    func respondToContactRequest(jid: String, allow: Bool) async throws { throw NativeContactFailure.unavailable }
}

enum NativeContactEditing {
    static func blockRequest(jid: String, blocked: Bool, owner: String, identifier: String) throws -> String {
        guard valid(jid: jid, name: "", owner: owner), NativeMessageActionCodec.validID(identifier) else { throw NativeContactFailure.invalid }
        let action = blocked ? "block" : "unblock"
        return "<iq xmlns='jabber:client' type='set' id='\(NativeMUCStream.escape(identifier))'><\(action) xmlns='urn:xmpp:blocking'><item jid='\(NativeMUCStream.escape(jid))'/></\(action)></iq>"
    }
    static func removalRequest(jid: String, owner: String, identifier: String) throws -> String {
        guard valid(jid: jid, name: "", owner: owner), NativeMessageActionCodec.validID(identifier) else { throw NativeContactFailure.invalid }
        return "<iq xmlns='jabber:client' type='set' id='\(NativeMUCStream.escape(identifier))'><query xmlns='jabber:iq:roster'><item jid='\(NativeMUCStream.escape(jid))' subscription='remove'/></query></iq>"
    }
    static func canAdd(_ jid: String, roster: NativeRosterState) -> Bool {
        guard case .ready(let contacts) = roster, contacts.count < 100 else { return false }
        return !contacts.contains { $0.jid.caseInsensitiveCompare(jid) == .orderedSame }
    }
    static func valid(jid: String, name: String, owner: String) -> Bool {
        NativeChatCodec.bareJID(owner) == owner && NativeChatCodec.bareJID(jid) == jid && NativeChatCodec.validBody(jid) && jid.caseInsensitiveCompare(owner) != .orderedSame && name.utf8.count <= 120 &&
            (name.isEmpty || NativeChatCodec.validBody(name)) &&
            !name.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }
    static func request(jid: String, name: String, owner: String, identifier: String) throws -> String {
        guard valid(jid: jid, name: name, owner: owner), NativeMessageActionCodec.validID(identifier) else { throw NativeContactFailure.invalid }
        return "<iq xmlns='jabber:client' type='set' id='\(NativeMUCStream.escape(identifier))'><query xmlns='jabber:iq:roster'><item jid='\(NativeMUCStream.escape(jid))' name='\(NativeMUCStream.escape(name))'/></query></iq>"
    }
    static func response(_ root: ProbeElement, identifier: String, owner: String, bound: String?) -> Bool? {
        let server = owner.components(separatedBy: "@").last ?? ""
        guard root.name == "iq", root.namespace == "jabber:client", root.attributes["id"] == identifier,
              root.attributes["from"] == nil || root.attributes["from"] == owner || root.attributes["from"] == server,
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == bound else { return nil }
        if root.attributes["type"] == "error" { return false }
        return root.attributes["type"] == "result" ? true : nil
    }
    static func subscriptionRequest(_ root: ProbeElement, owner: String, bound: String?) -> String? {
        guard root.name == "presence", root.namespace == "jabber:client", root.attributes["type"] == "subscribe",
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == bound,
              let sender = root.attributes["from"], valid(jid: sender, name: "", owner: owner) else { return nil }
        return sender
    }
}

@MainActor
final class NativeContactRequests: ObservableObject {
    @Published private(set) var peers: [String] = []
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    private var generation = UUID()
    private var sender: (any NativeContactManaging)?
    private var task: Task<Void, Never>?
    func configure(_ sender: (any NativeContactManaging)?) {
        detach(); self.sender = sender
        let attempt = generation
        task = Task { [weak self] in
            guard !Task.isCancelled else { return }
            await sender?.observeContactRequests { [weak self] peers in
                Task { @MainActor in
                    guard let self = self, self.generation == attempt else { return }
                    self.peers = Array(peers.prefix(32))
                }
            }
        }
    }
    func respond(_ peer: String, allow: Bool) async {
        guard !busy, peers.contains(peer), let sender = sender else { return }
        busy = true; notice = nil; let attempt = generation
        defer { if generation == attempt { busy = false } }
        do {
            try await sender.respondToContactRequest(jid: peer, allow: allow)
            guard generation == attempt, !Task.isCancelled else { return }
            peers.removeAll { $0 == peer }; notice = "Antwoord verstuurd."
        } catch { if generation == attempt { notice = "Antwoord niet bevestigd. Probeer bewust opnieuw." } }
    }
    func detach() { generation = UUID(); task?.cancel(); task = nil; sender = nil; peers = []; busy = false; notice = nil }
    deinit { task?.cancel() }
}

@MainActor
final class NativeContactEditor: ObservableObject {
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    @Published private(set) var saved = false
    private var generation = UUID()
    private var operation: Task<Void, Never>?
    func add(jid: String, name: String, requestPresence: Bool, owner: String, sender: (any NativeContactManaging)?) {
        guard !busy, !saved else { return }
        guard let sender = sender, NativeContactEditing.valid(jid: jid, name: name, owner: owner) else {
            notice = "Controleer het XMPP-adres en je verbinding."; return
        }
        busy = true; notice = nil
        let attempt = generation
        operation = Task { [weak self] in
            do {
                try await sender.addContact(jid: jid, name: name, requestPresence: requestPresence)
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.saved = true; self.busy = false
                self.notice = requestPresence ? "Contact opgeslagen. Online status is pas beschikbaar nadat de ander toestemming geeft." : "Contact opgeslagen. Er is geen statusverzoek verstuurd."
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.busy = false
                self.notice = "Niet bevestigd. Het contact kan al opgeslagen zijn; controleer eerst je contactenlijst. Er wordt niets automatisch opnieuw verstuurd."
            }
        }
    }
    func detach() {
        generation = UUID(); operation?.cancel(); operation = nil
        busy = false; saved = false; notice = nil
    }
    deinit { operation?.cancel() }
}
