import Foundation

enum NativeCallPolicyFailure: Error, Equatable { case unsupported, rejected, timedOut, busy }
enum NativeCallPolicyState: Equatable { case idle, synchronizing, ready, unsupported, failed }

struct NativeCallPolicySnapshot: Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    let enabled: Bool
    let dnd: Bool
    let muted: Set<String>
    var description: String { "NativeCallPolicySnapshot(redacted)" }
    var debugDescription: String { description }

    init(owner: String, preferences: NativeChatPreferences) {
        let domain = owner.split(separator: "@").last.map(String.init) ?? ""
        let peers = preferences.mutedPeers.union(preferences.blockedPeers).filter {
            NativeChatCodec.bareJID($0) == $0 && $0.hasSuffix("@" + domain)
        }
        enabled = peers.count <= 256
        dnd = preferences.doNotDisturb || !enabled
        muted = enabled ? Set(peers) : []
    }
}

@MainActor
final class NativeCallPolicySync {
    private(set) var state: NativeCallPolicyState = .idle { didSet { changed?(state) } }
    private(set) var applied: NativeCallPolicySnapshot?
    var changed: ((NativeCallPolicyState) -> Void)?
    private var sender: (any NativeCallIntentSending)?
    private var desired: NativeCallPolicySnapshot?
    private var session: UUID?
    private var epoch = UUID()
    private var task: Task<Void, Never>?
    private var recognized = false
    var usable: Bool { state == .ready && applied == desired && applied?.enabled == true && applied?.dnd == false }

    func configure(sender: (any NativeCallIntentSending)?, owner: String, session: UUID, preferences: NativeChatPreferences) {
        if self.session != session {
            reset()
            self.session = session
            self.sender = sender
        }
        guard self.sender != nil else { state = .unsupported; return }
        update(owner: owner, preferences: preferences)
    }

    func update(owner: String, preferences: NativeChatPreferences) {
        desired = NativeCallPolicySnapshot(owner: owner, preferences: preferences)
        guard sender != nil, state != .unsupported else { return }
        if desired == applied, task == nil { state = .ready; return }
        state = .synchronizing
        guard task == nil else { return }
        let attempt = epoch
        task = Task { [weak self] in
            guard let self = self else { return }
            while !Task.isCancelled, self.epoch == attempt, let value = self.desired, let sender = self.sender {
                do {
                    try await sender.setCallPreferences(enabled: value.enabled, dnd: value.dnd, muted: value.muted)
                    guard !Task.isCancelled, self.epoch == attempt else { return }
                    self.recognized = true
                    self.applied = value
                    if self.desired == value { self.task = nil; self.state = .ready; return }
                } catch {
                    guard !Task.isCancelled, self.epoch == attempt else { return }
                    self.task = nil
                    self.state = !self.recognized && error as? NativeCallPolicyFailure == .unsupported ? .unsupported : .failed
                    return
                }
            }
        }
    }

    func reset() {
        epoch = UUID(); task?.cancel(); task = nil
        sender = nil; session = nil; desired = nil; applied = nil; recognized = false
        state = .idle
    }
}

enum NativeCallControlReply {
    static func decode(_ root: ProbeElement, identifier: String, owner: String, bound: String?) -> Result<Void, NativeCallPolicyFailure>? {
        guard let accepted = NativeContactEditing.response(root, identifier: identifier, owner: owner, bound: bound) else { return nil }
        guard root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        if accepted { return root.children.isEmpty ? .success(()) : nil }
        guard root.children.filter({ $0.name == "error" && $0.namespace == "jabber:client" }).count == 1,
              root.children.allSatisfy({ $0.name == "error" && $0.namespace == "jabber:client" ||
                  $0.namespace == NativeCallIntent.recoveryNamespace && ["preferences", "handoff"].contains($0.name) }) else { return nil }
        let error = root.children.first { $0.name == "error" && $0.namespace == "jabber:client" }
        let conditions = error?.children.filter { $0.namespace == "urn:ietf:params:xml:ns:xmpp-stanzas" && $0.name != "text" } ?? []
        if conditions.count == 1, ["service-unavailable", "feature-not-implemented"].contains(conditions[0].name) { return .failure(.unsupported) }
        return .failure(.rejected)
    }
}
