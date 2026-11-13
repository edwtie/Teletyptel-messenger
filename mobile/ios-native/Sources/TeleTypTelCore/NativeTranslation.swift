import Combine
import Foundation

struct NativeTranslationPreferences: Codable, Equatable {
    var targetLanguage = "nl"
    var mode = "off"
    var automaticConsent = false
    var liveRttConsent = false
    var ownLiveRttConsent = false

    var valid: Bool {
        ["off", "manual", "automatic"].contains(mode) &&
        NativeTranslationModel.languageCodes.contains(targetLanguage) &&
        (mode != "automatic" || automaticConsent)
    }
}

struct NativeTranslationResult: Decodable {
    let text: String
    let targetLanguage: String
    let sourceLanguage: String
}

@MainActor
final class NativeTranslationModel: ObservableObject {
    nonisolated static let languageCodes = ["nl", "en", "de", "fr", "es", "it", "pt", "pl", "tr", "ar", "uk", "zh-CN"]
    nonisolated static let languageNames = ["Nederlands", "English", "Deutsch", "Français", "Español", "Italiano", "Português", "Polski", "Türkçe", "العربية", "Українська", "简体中文"]
    @Published private(set) var preferences = NativeTranslationPreferences()
    @Published private(set) var available = false
    @Published private(set) var ready = false
    @Published private(set) var sharingConsent = false
    @Published private(set) var error: String?
    @Published private(set) var results: [String: NativeTranslationResult] = [:]
    private var session: NativeAccountWebSession?
    private var csrf: String?
    private var generation = UUID()
    private var tasks: [String: Task<Void, Never>] = [:]
    private var originals: [String: String] = [:]
    var pendingCount: Int { tasks.count }

    func connect(_ session: NativeAccountWebSession?, accountID: String?) async {
        detach()
        guard let session = session, let accountID = accountID else { return }
        let attempt = generation
        do {
            let data = try await session.request(.translation)
            let reply = try JSONDecoder().decode(SettingsReply.self, from: data)
            guard !Task.isCancelled, generation == attempt else { return }
            guard reply.ok, reply.accountId == accountID, reply.preferences.valid,
                  reply.csrfToken.range(of: #"\A[0-9a-f]{64}\z"#, options: .regularExpression) != nil else {
                throw NativeAccountFailure.invalidResponse
            }
            self.session = session
            csrf = reply.csrfToken
            preferences = reply.preferences
            sharingConsent = reply.preferences.automaticConsent
            available = reply.available
            ready = true
        } catch {
            guard !Task.isCancelled, generation == attempt else { return }
            self.error = "Vertaalinstellingen konden niet worden opgehaald. Het origineel blijft behouden."
        }
    }

    func setSharingConsent(_ consent: Bool) {
        sharingConsent = consent
        if !consent { clearResults() }
    }

    func save(_ requested: NativeTranslationPreferences, consent: Bool) async {
        var preferences = requested
        if preferences.mode != "automatic" { preferences.automaticConsent = false }
        if preferences.mode == "off" { preferences.liveRttConsent = false; preferences.ownLiveRttConsent = false }
        guard preferences.valid, preferences.mode != "automatic" || consent,
              ready, let session = session, let csrf = csrf else {
            error = "Controleer je vertaalinstellingen en toestemming."
            return
        }
        clearResults()
        let attempt = generation
        self.preferences = NativeTranslationPreferences()
        sharingConsent = consent
        do {
            var input = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences)) as! [String: Any]
            input["action"] = "preferences"
            let data = try await session.request(.translation, body: JSONSerialization.data(withJSONObject: input), csrf: csrf)
            let reply = try JSONDecoder().decode(PreferencesReply.self, from: data)
            guard !Task.isCancelled, generation == attempt else { return }
            guard reply.ok, reply.preferences == preferences else { throw NativeAccountFailure.invalidResponse }
            self.preferences = reply.preferences
            error = nil
        } catch {
            guard !Task.isCancelled, generation == attempt else { return }
            self.error = "Vertaalvoorkeur niet opgeslagen. Vertaling blijft lokaal uitgeschakeld."
        }
    }

    func translate(_ text: String, key: String, automatic: Bool = false, liveDirection: String? = nil) {
        guard ready, available, preferences.mode != "off", sharingConsent, !text.isEmpty,
              text.count <= 5000, text.utf8.count <= 20000, key.utf8.count <= 200,
              let session = session, let csrf = csrf else { return }
        guard !automatic || (preferences.mode == "automatic" && preferences.automaticConsent) else { return }
        if let direction = liveDirection {
            guard direction == "self" || direction == "peer",
                  direction == "self" ? preferences.ownLiveRttConsent : preferences.liveRttConsent else { return }
        }
        if originals[key] == text { return }
        tasks[key]?.cancel()
        tasks[key] = nil
        results[key] = nil
        guard tasks.count < 4 else { return }
        originals[key] = text
        if originals.count > 128 { clearResults(); originals[key] = text }
        let attempt = generation
        let target = preferences.targetLanguage
        tasks[key] = Task { [weak self] in
            do {
                if liveDirection != nil { try await Task.sleep(nanoseconds: 800_000_000) }
                try Task.checkCancellation()
                var input: [String: Any] = ["action": "translate", "text": text, "targetLanguage": target,
                    "consent": true, "automatic": automatic]
                if let direction = liveDirection { input["liveRtt"] = true; input["liveDirection"] = direction }
                let data = try await session.request(.translation, body: JSONSerialization.data(withJSONObject: input), csrf: csrf)
                let reply = try JSONDecoder().decode(TranslationReply.self, from: data)
                guard !Task.isCancelled, let self = self, self.generation == attempt,
                      self.originals[key] == text, self.sharingConsent, self.preferences.mode != "off" else { return }
                guard reply.ok, reply.translation.targetLanguage == target,
                      reply.translation.text.utf8.count <= 65536 else { throw NativeAccountFailure.invalidResponse }
                if !Self.sameLanguage(reply.translation.sourceLanguage, target),
                   reply.translation.text.trimmingCharacters(in: .whitespacesAndNewlines) != text.trimmingCharacters(in: .whitespacesAndNewlines) {
                    self.results[key] = reply.translation
                }
                self.tasks[key] = nil
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt, self.originals[key] == text else { return }
                self.tasks[key] = nil
                self.originals[key] = nil
                if !automatic { self.error = "Vertaling niet beschikbaar. Het origineel blijft behouden." }
            }
        }
    }

    func automaticallyTranslate(_ messages: [NativeChatMessage]) async {
        for message in messages {
            guard !Task.isCancelled, preferences.mode == "automatic", sharingConsent else { return }
            let key = message.id.uuidString
            translate(message.body, key: key, automatic: true)
            await tasks[key]?.value
        }
    }

    nonisolated static func sameLanguage(_ left: String, _ right: String) -> Bool {
        guard !left.isEmpty, !right.isEmpty else { return false }
        return left.lowercased().split(separator: "-").first == right.lowercased().split(separator: "-").first
    }

    func clearResults() {
        generation = UUID()
        for task in tasks.values { task.cancel() }
        tasks.removeAll()
        originals.removeAll()
        results.removeAll()
    }

    func detach() {
        clearResults()
        session = nil
        csrf = nil
        ready = false
        available = false
        sharingConsent = false
        preferences = NativeTranslationPreferences()
        error = nil
    }

    private struct SettingsReply: Decodable {
        let ok: Bool; let accountId: String; let csrfToken: String; let available: Bool
        let preferences: NativeTranslationPreferences
    }
    private struct PreferencesReply: Decodable { let ok: Bool; let preferences: NativeTranslationPreferences }
    private struct TranslationReply: Decodable { let ok: Bool; let translation: NativeTranslationResult }
}
