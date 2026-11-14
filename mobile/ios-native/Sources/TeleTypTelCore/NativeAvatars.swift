import Foundation
import Combine

struct NativePublicAvatar: Decodable, Equatable {
    let jid: String
    let displayName: String
    let avatarColor: String
    let avatarDataUrl: String

    var valid: Bool {
        NativeChatCodec.bareJID(jid) == jid && displayName.utf8.count <= 120 &&
            avatarColor.range(of: #"\A#[a-fA-F0-9]{6}\z"#, options: .regularExpression) != nil && avatarDataUrl.utf8.count <= 524288
    }
    var imageData: Data? {
        let parts = avatarDataUrl.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2, ["data:image/png;base64", "data:image/jpeg;base64"].contains(String(parts[0])),
              let bytes = Data(base64Encoded: String(parts[1])), bytes.count <= 393216 else { return nil }
        if parts[0] == "data:image/png;base64", bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) { return bytes }
        if parts[0] == "data:image/jpeg;base64", bytes.starts(with: [255, 216, 255]) { return bytes }
        return nil
    }
}

@MainActor
final class NativeAvatarCache: ObservableObject {
    @Published private(set) var profiles: [String: NativePublicAvatar] = [:]
    private(set) var owner: String?
    private var allowed = Set<String>()
    private var attempted = Set<String>()
    private var tasks: [String: Task<Void, Never>] = [:]
    private var session: NativeAccountWebSession?
    private var generation = UUID()

    func connect(_ session: NativeAccountWebSession?, owner: String?, contacts: [NativeContact]) {
        if self.session !== session || self.owner != owner { detach() }
        guard let session = session, let owner = owner, NativeChatCodec.bareJID(owner) == owner else { return }
        self.session = session; self.owner = owner
        allowed = Set(contacts.prefix(127).map(\.jid)); allowed.insert(owner)
        attempted.formIntersection(allowed)
        profiles = profiles.filter { allowed.contains($0.key) }
        for jid in Array(tasks.keys) where !allowed.contains(jid) { tasks[jid]?.cancel(); tasks[jid] = nil }
        load(owner)
        for jid in allowed.sorted() { load(jid) }
    }

    func refreshOwner() {
        guard let owner = owner else { return }
        attempted.remove(owner); profiles[owner] = nil; load(owner)
    }

    private func load(_ jid: String) {
        guard let session = session, allowed.contains(jid), !attempted.contains(jid), tasks[jid] == nil, tasks.count < 4 else { return }
        attempted.insert(jid)
        let attempt = generation
        tasks[jid] = Task { [weak self] in
            let reply = try? await session.request(.account, lookupJID: jid)
            guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
            if let reply = reply, let decoded = try? JSONDecoder().decode(Reply.self, from: reply),
               decoded.ok, decoded.profile.jid == jid, decoded.profile.valid, self.allowed.contains(jid) {
                self.profiles[jid] = decoded.profile
            }
            self.tasks[jid] = nil
            for next in self.allowed.sorted() { self.load(next) }
        }
    }

    func detach() {
        generation = UUID(); tasks.values.forEach { $0.cancel() }; tasks.removeAll()
        profiles.removeAll(); allowed.removeAll(); attempted.removeAll(); owner = nil; session = nil
    }
    private struct Reply: Decodable { let ok: Bool; let profile: NativePublicAvatar }
}
