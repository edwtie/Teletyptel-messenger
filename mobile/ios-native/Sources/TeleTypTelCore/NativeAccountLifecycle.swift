import Combine
import Foundation

@MainActor
final class NativeAccountLifecycle: ObservableObject {
    @Published private(set) var busy = false
    @Published private(set) var status: String?
    @Published private(set) var twoFactorEnabled: Bool?
    @Published private(set) var setupSecret: String?
    private var generation = UUID()
    private var setupExpiry: Date?

    static func validPassword(_ password: String) -> Bool {
        password.count >= 10 && password.utf8.count <= 1024 &&
            password == password.trimmingCharacters(in: .whitespacesAndNewlines) &&
            password.range(of: "[a-z]", options: .regularExpression) != nil &&
            password.range(of: "[A-Z]", options: .regularExpression) != nil &&
            password.range(of: "[0-9]", options: .regularExpression) != nil &&
            password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil &&
            !password.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }

    static func registration(configuration: ServerConfiguration, jid: String, name: String, password: String) throws -> Data {
        guard configuration.domain == "localhost", NativeAuthenticatedAccount.validJID(jid, domain: configuration.domain),
              NativeChatCodec.validBody(name), name.utf8.count <= 120,
              !name.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains), validPassword(password) else { throw NativeAccountFailure.rejected }
        return try JSONSerialization.data(withJSONObject: ["action": "create", "jid": jid, "displayName": name,
            "password": password, "rememberPassword": false, "xmppDomain": configuration.domain,
            "xmppWebSocket": configuration.webSocket.absoluteString, "xmppTlsMode": "websocket"])
    }

    func register(configuration: ServerConfiguration, jid: String, name: String, password: String) async {
        let session = NativeAccountWebSession(configuration: configuration)
        _ = await perform {
            let data = try Self.registration(configuration: configuration, jid: jid, name: name, password: password)
            let reply = try await self.fetch(session, body: data)
            guard reply.ok, reply.account?.jid == jid else { throw NativeAccountFailure.invalidResponse }
            return "Account aangemaakt. Sluit dit venster en meld je aan."
        }
        await session.close()
    }

    func requestRecovery(configuration: ServerConfiguration, jid: String) async {
        let session = NativeAccountWebSession(configuration: configuration)
        _ = await perform {
            guard NativeChatCodec.bareJID(jid) == jid, jid.utf8.count <= 255 else { throw NativeAccountFailure.rejected }
            let data = try JSONSerialization.data(withJSONObject: ["action": "request_password_reset", "jid": jid])
            let reply = try await self.fetch(session, body: data)
            guard reply.ok else { throw NativeAccountFailure.rejected }
            return "Verzoek verwerkt. Als herstel beschikbaar is ontvang je een e-mail; rond het herstel af via de beveiligde link."
        }
        await session.close()
    }

    func loadSecurity(session: NativeAccountWebSession, accountID: String, jid: String) async {
        _ = await perform {
            let reply = try await self.fetch(session, accountID: accountID)
            guard reply.ok, reply.account?.accountId == accountID, reply.account?.jid == jid,
                  let enabled = reply.account?.twoFactorEnabled else { throw NativeAccountFailure.invalidResponse }
            self.twoFactorEnabled = enabled
            return enabled ? "Tweestapsverificatie is ingeschakeld." : "Tweestapsverificatie is uitgeschakeld."
        }
    }

    func beginTwoFactor(session: NativeAccountWebSession, accountID: String) async {
        guard twoFactorEnabled == false, setupSecret == nil else { return }
        _ = await perform {
            let data = try JSONSerialization.data(withJSONObject: ["action": "request_two_factor_setup", "accountId": accountID, "method": "authenticator"])
            let reply = try await self.fetch(session, body: data)
            guard reply.ok, reply.method == "authenticator", let secret = reply.manualSecret,
                  secret.range(of: "\\A[A-Z2-7]{16,64}\\z", options: .regularExpression) != nil else { throw NativeAccountFailure.invalidResponse }
            self.setupSecret = secret
            self.setupExpiry = Date().addingTimeInterval(300)
            return "Voeg de sleutel toe aan je authenticator. Bevestig daarna binnen vijf minuten met de zescijferige code."
        }
    }

    func confirmTwoFactor(session: NativeAccountWebSession, accountID: String, code: String) async {
        guard twoFactorEnabled == false, setupExpiry == nil || setupExpiry! > Date(), code.range(of: "\\A[0-9]{6}\\z", options: .regularExpression) != nil else {
            setupSecret = nil; setupExpiry = nil; status = "Verificatie verlopen of code ongeldig. Haal de beveiligingsstatus opnieuw op."; return
        }
        _ = await perform {
            let data = try JSONSerialization.data(withJSONObject: ["action": "confirm_two_factor_setup", "accountId": accountID, "code": code])
            let reply = try await self.fetch(session, body: data)
            guard reply.ok else { throw NativeAccountFailure.rejected }
            self.setupSecret = nil; self.setupExpiry = nil; self.twoFactorEnabled = true
            return "Tweestapsverificatie ingeschakeld."
        }
    }

    func changePassword(session: NativeAccountWebSession, accountID: String, jid: String, current: String, password: String) async -> Bool {
        await perform {
            guard !current.isEmpty, current.utf8.count <= 1024, current != password, Self.validPassword(password) else { throw NativeAccountFailure.rejected }
            let data = try JSONSerialization.data(withJSONObject: ["action": "change_password", "accountId": accountID, "jid": jid,
                "currentPassword": current, "password": password])
            let reply = try await self.fetch(session, body: data)
            guard reply.ok, reply.account?.accountId == accountID, reply.account?.jid == jid else { throw NativeAccountFailure.invalidResponse }
            return "Wachtwoord gewijzigd. Meld opnieuw aan; de oude bewaarde aanmelding wordt verwijderd."
        }
    }

    func detach() { generation = UUID(); busy = false; setupSecret = nil; setupExpiry = nil; twoFactorEnabled = nil; status = nil }

    private func fetch(_ session: NativeAccountWebSession, body: Data? = nil, accountID: String? = nil) async throws -> Reply {
        let attempt = generation
        let data = try await session.request(.account, body: body, accountID: accountID)
        try Task.checkCancellation()
        guard generation == attempt else { throw CancellationError() }
        return try JSONDecoder().decode(Reply.self, from: data)
    }

    private func perform(_ action: () async throws -> String) async -> Bool {
        guard !busy else { return false }
        busy = true; status = nil
        let attempt = generation
        defer { if generation == attempt { busy = false } }
        do {
            let message = try await action()
            guard !Task.isCancelled, generation == attempt else { return false }
            status = message
            return true
        } catch {
            guard !Task.isCancelled, generation == attempt else { return false }
            status = "Niet bevestigd. Controleer je invoer, verbinding en de serverinstellingen. Probeer niet herhaaldelijk zonder de status te controleren."
            return false
        }
    }

    private struct Reply: Decodable {
        let ok: Bool
        let account: Account?
        let method: String?
        let manualSecret: String?
    }
    private struct Account: Decodable { let accountId: String?; let jid: String; let twoFactorEnabled: Bool? }
}
