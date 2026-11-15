import Foundation
import Combine

@MainActor
final class NativeAvatarEditor: ObservableObject {
    @Published private(set) var profile: NativePublicAvatar?
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    private var generation = UUID()
    private var session: NativeAccountWebSession?
    private var account: String?
    private var owner: String?
    private struct Reply: Decodable { let ok: Bool; let accountId: String; let profile: NativePublicAvatar; let csrfToken: String }
    func configure(session: NativeAccountWebSession?, account: String?, owner: String?) async {
        detach()
        guard let session = session, let account = account, let owner = owner else { return }
        self.session = session; self.account = account; self.owner = owner
        let attempt = generation; busy = true
        defer { if generation == attempt { busy = false } }
        do {
            let reply = try await read(session)
            guard generation == attempt, !Task.isCancelled else { return }
            guard reply.accountId == account, reply.profile.jid == owner else { throw NativeAccountFailure.invalidResponse }
            profile = reply.profile
        } catch { if generation == attempt { notice = "Profielfoto niet opgehaald. Controleer of de server de foto-API ondersteunt." } }
    }
    private func read(_ session: NativeAccountWebSession) async throws -> Reply {
        let data = try await session.request(.avatar)
        let value = try JSONDecoder().decode(Reply.self, from: data)
        guard value.ok, value.profile.valid, value.csrfToken.range(of: #"\A[a-f0-9]{64}\z"#, options: .regularExpression) != nil else { throw NativeAccountFailure.invalidResponse }
        return value
    }
    func save(_ dataURL: String) async -> Bool {
        guard !busy, profile != nil, let session = session, let account = account, let owner = owner,
              dataURL.utf8.count <= 524288 else { return false }
        if !dataURL.isEmpty {
            let candidate = NativePublicAvatar(jid: owner, displayName: "", avatarColor: "#2563eb", avatarDataUrl: dataURL)
            guard candidate.imageData != nil else { notice = "Kies een geldige PNG- of JPEG-foto."; return false }
        }
        busy = true; notice = nil; let attempt = generation
        defer { if generation == attempt { busy = false } }
        do {
            let challenge = try await read(session)
            guard generation == attempt, !Task.isCancelled else { return false }
            guard challenge.accountId == account, challenge.profile.jid == owner else { throw NativeAccountFailure.invalidResponse }
            let body = try JSONSerialization.data(withJSONObject: ["avatarDataUrl": dataURL], options: [.withoutEscapingSlashes])
            let reply = try JSONDecoder().decode(Reply.self, from: await session.request(.avatar, body: body, csrf: challenge.csrfToken))
            guard generation == attempt, !Task.isCancelled else { return false }
            guard reply.ok, reply.accountId == account, reply.profile.jid == owner, reply.profile.valid, reply.profile.avatarDataUrl == dataURL else { throw NativeAccountFailure.invalidResponse }
            profile = reply.profile; notice = dataURL.isEmpty ? "Profielfoto verwijderd." : "Profielfoto opgeslagen."; return true
        } catch {
            if generation == attempt { notice = "Opslaan niet bevestigd. Haal de foto opnieuw op voordat je opnieuw probeert." }
            return false
        }
    }
    func detach() { generation = UUID(); session = nil; account = nil; owner = nil; profile = nil; busy = false; notice = nil }
}
