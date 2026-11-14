import Combine
import Foundation

struct NativeAccountProfile: Codable, Equatable {
    let accountId: String
    let jid: String
    var displayName: String
    var phoneNumber: String
    var preferredLanguage: String
    var avatarColor: String
    var valid: Bool {
        NativeChatCodec.bareJID(jid) == jid && !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        displayName.utf8.count <= 120 && phoneNumber.utf8.count <= 64 && NativeTranslationModel.languageCodes.contains(preferredLanguage) &&
        avatarColor.range(of: #"\A#[a-fA-F0-9]{6}\z"#, options: .regularExpression) != nil &&
        !(displayName + phoneNumber).unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }
    var update: [String: String] { ["displayName": displayName.trimmingCharacters(in: .whitespacesAndNewlines), "phoneNumber": phoneNumber,
        "preferredLanguage": preferredLanguage, "avatarColor": avatarColor.lowercased()] }
}

@MainActor
final class NativeAccountSettingsModel: ObservableObject {
    @Published private(set) var profile: NativeAccountProfile?
    @Published private(set) var busy = false
    @Published private(set) var status: String?
    private var session: NativeAccountWebSession?
    private var csrf: String?
    private var generation = UUID()
    func detach() { generation = UUID(); profile = nil; session = nil; csrf = nil; busy = false; status = nil }
    func connect(_ session: NativeAccountWebSession?, accountID: String?) async {
        detach()
        guard let session = session, let accountID = accountID else { return }
        busy = true; let attempt = generation
        do {
            let reply = try JSONDecoder().decode(ProfileReply.self, from: await session.request(.profile))
            guard generation == attempt, !Task.isCancelled else { return }
            guard reply.ok, reply.profile.accountId == accountID, reply.profile.valid,
                  reply.csrfToken.range(of: #"\A[0-9a-f]{64}\z"#, options: .regularExpression) != nil else { throw NativeAccountFailure.invalidResponse }
            self.profile = reply.profile; self.session = session; csrf = reply.csrfToken
        } catch {
            guard generation == attempt, !Task.isCancelled else { return }
            status = "Accountinstellingen niet beschikbaar. Controleer of de server de native profiel-API ondersteunt."
        }
        busy = false
    }
    func save(_ requested: NativeAccountProfile) async {
        guard !busy, let existing = profile, requested.accountId == existing.accountId, requested.jid == existing.jid,
              requested.valid, let session = session, let csrf = csrf else { status = "Controleer de profielvelden."; return }
        busy = true; status = nil; let attempt = generation
        do {
            let body = try JSONSerialization.data(withJSONObject: requested.update)
            let reply = try JSONDecoder().decode(ProfileReply.self, from: await session.request(.profile, body: body, csrf: csrf))
            guard generation == attempt, !Task.isCancelled else { return }
            guard reply.ok, reply.profile.accountId == existing.accountId, reply.profile.jid == existing.jid,
                  reply.profile.valid, reply.profile.update == requested.update else { throw NativeAccountFailure.invalidResponse }
            profile = reply.profile; status = "Accountinstellingen opgeslagen. De profieltaal wijzigt niet automatisch de interfacetaal."
        } catch {
            guard generation == attempt, !Task.isCancelled else { return }
            status = "Opslaan niet bevestigd. Haal de instellingen opnieuw op voordat je opnieuw probeert."
        }
        busy = false
    }
    private struct ProfileReply: Decodable { let ok: Bool; let profile: NativeAccountProfile; let csrfToken: String }
}

struct NativeUploadSelection: Equatable, Sendable {
    static let maximumBytes = 20 * 1024 * 1024
    let name: String
    let data: Data
    let mime: String
    init(name: String, data: Data) throws {
        let types = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "heic": "image/heic",
            "pdf": "application/pdf", "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "txt": "text/plain"]
        guard !data.isEmpty, data.count <= Self.maximumBytes, name.utf8.count <= 160, !name.isEmpty,
              !name.contains("/"), !name.contains("\\"), !name.contains("\""),
              !name.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains),
              let mime = types[(name as NSString).pathExtension.lowercased()] else { throw NativeAccountFailure.rejected }
        self.name = name; self.data = data; self.mime = mime
    }
    func chunk(index: Int, identifier: UUID, boundary: String) -> Data {
        let count = (data.count + 262143) / 262144
        var result = Data()
        func line(_ text: String) { result.append(Data(text.utf8)) }
        for (key, value) in [("uploadId", identifier.uuidString), ("chunkIndex", String(index)), ("totalChunks", String(count)),
            ("originalName", name), ("totalSize", String(data.count)), ("mimeType", mime)] {
            line("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n")
        }
        line("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"part\"\r\nContent-Type: application/octet-stream\r\n\r\n")
        let start = index * 262144
        if start < data.count { result.append(data[start..<min(start + 262144, data.count)]) }
        line("\r\n--\(boundary)--\r\n")
        return result
    }
}

struct NativeFileReference: Equatable, Sendable, Identifiable {
    let identifier: String
    let url: URL
    var id: String { identifier }
    static func parse(_ text: String, configuration: ServerConfiguration) -> Self? {
        guard let url = URL(string: text, relativeTo: configuration.origin)?.absoluteURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false), url.scheme == "https",
              url.host == configuration.origin.host, url.port == configuration.origin.port,
              components.user == nil, components.password == nil, components.fragment == nil,
              url.path == configuration.origin.appendingPathComponent("api/file.php").path,
              let items = components.queryItems, items.count == 1, items[0].name == "id", let id = items[0].value,
              id.range(of: #"\A[a-f0-9]{32}\z"#, options: .regularExpression) != nil else { return nil }
        return Self(identifier: id, url: url)
    }
    static func inMessage(_ body: String, configuration: ServerConfiguration) -> Self? {
        guard let last = body.components(separatedBy: "\n").last else { return nil }
        return parse(last, configuration: configuration)
    }
}

@MainActor
final class NativeFileTransferModel: ObservableObject {
    @Published private(set) var progress: Double?
    @Published private(set) var status: String?
    private var generation = UUID()
    func cancel() { generation = UUID(); progress = nil; status = "Gestopt. Een reeds opgeslagen upload wordt niet automatisch verwijderd." }
    func upload(_ selection: NativeUploadSelection, session: NativeAccountWebSession, accountID: String) async -> String? {
        guard progress == nil else { return nil }
        let attempt = generation; progress = 0; status = nil
        defer { if generation == attempt { progress = nil } }
        do {
            let profile = try JSONDecoder().decode(UploadProfile.self, from: await session.request(.profile))
            guard profile.ok, profile.profile.accountId == accountID else { throw NativeAccountFailure.invalidResponse }
            let identifier = UUID(); let count = (selection.data.count + 262143) / 262144
            var uploaded: UploadReply?
            for index in 0..<count {
                try Task.checkCancellation()
                guard generation == attempt else { throw CancellationError() }
                let boundary = UUID().uuidString
                let result = try await session.uploadChunk(selection.chunk(index: index, identifier: identifier, boundary: boundary), boundary: boundary, csrf: profile.csrfToken)
                let reply = try JSONDecoder().decode(UploadReply.self, from: result)
                guard reply.ok, generation == attempt, !Task.isCancelled else { throw NativeAccountFailure.invalidResponse }
                uploaded = reply; progress = Double(index + 1) / Double(count)
            }
            guard let file = uploaded?.file, file.size == selection.data.count,
                  let reference = NativeFileReference.parse(file.url, configuration: session.configuration), reference.identifier == file.id else { throw NativeAccountFailure.invalidResponse }
            status = "Upload opgeslagen; kies zelf wanneer je de link deelt. Iedereen met deze link kan het bestand openen."
            return "Bestand: \(selection.name)\n\(reference.url.absoluteString)"
        } catch {
            guard generation == attempt, !Task.isCancelled else { return nil }
            status = "Upload niet bevestigd. Niet automatisch opnieuw verzonden; probeer bewust opnieuw."
            return nil
        }
    }
    private struct UploadProfile: Decodable { let ok: Bool; let profile: NativeAccountProfile; let csrfToken: String }
    private struct UploadReply: Decodable {
        let ok: Bool; let file: File?
        struct File: Decodable { let id: String; let url: String; let size: Int }
    }
}
