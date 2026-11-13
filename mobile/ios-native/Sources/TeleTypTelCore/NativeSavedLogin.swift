import Combine
import Foundation

struct NativeSavedLogin: Codable, CustomStringConvertible, CustomDebugStringConvertible {
    let address: String
    let domain: String
    let jid: String
    let password: String

    init(address: String, domain: String, jid: String, password: String) throws {
        let configuration = try ServerConfiguration(address: address, domain: domain)
        guard NativeAuthenticatedAccount.validJID(jid, domain: configuration.domain),
              !password.isEmpty, password.utf8.count <= 1024,
              !password.unicodeScalars.contains(where: { $0.value == 0 }) else {
            throw NativeAccountFailure.invalidCredentials
        }
        self.address = configuration.origin.absoluteString
        self.domain = configuration.domain
        self.jid = jid
        self.password = password
    }

    static func decode(_ data: Data) throws -> Self {
        guard data.count <= 8192 else { throw NativeAccountFailure.invalidResponse }
        let value = try JSONDecoder().decode(Self.self, from: data)
        return try Self(address: value.address, domain: value.domain, jid: value.jid, password: value.password)
    }

    var description: String { "NativeSavedLogin(redacted)" }
    var debugDescription: String { description }
}

@MainActor
protocol NativeLoginVault: AnyObject {
    var containsLogin: Bool { get }
    func save(_ login: NativeSavedLogin) async throws
    func load() async throws -> NativeSavedLogin
    func remove() throws
    func cancel()
}

@MainActor
final class NativeSavedLoginModel: ObservableObject {
    @Published private(set) var hasSavedLogin: Bool
    @Published private(set) var isWorking = false
    @Published private(set) var notice: String?
    private var candidate: NativeSavedLogin?
    private var generation = UUID()
    private var task: Task<Void, Never>?
    private let vault: any NativeLoginVault

    init(vault: any NativeLoginVault) {
        self.vault = vault
        hasSavedLogin = vault.containsLogin
    }

    func prepare(address: String, domain: String, jid: String, password: String, consented: Bool) {
        cancel()
        notice = nil
        if consented {
            candidate = try? NativeSavedLogin(address: address, domain: domain, jid: jid, password: password)
        }
    }

    func connected(jid: String) {
        guard let value = candidate else { return }
        candidate = nil
        guard value.jid == jid else { return }
        let attempt = generation
        isWorking = true
        task = Task { [weak self, vault] in
            do {
                try await vault.save(value)
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.hasSavedLogin = true
                self.notice = "Aanmelding bewaard met Face ID of Touch ID, alleen op dit apparaat."
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.notice = "Aanmelding niet bewaard. Je huidige verbinding blijft actief; handmatig aanmelden blijft mogelijk."
            }
            guard let self = self, self.generation == attempt else { return }
            self.isWorking = false
            self.task = nil
        }
    }

    func unlock(_ completion: @escaping (NativeSavedLogin) -> Void) {
        guard hasSavedLogin, !isWorking else { return }
        cancel()
        let attempt = generation
        isWorking = true
        notice = nil
        task = Task { [weak self, vault] in
            do {
                let value = try await vault.load()
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.isWorking = false
                self.task = nil
                completion(value)
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.hasSavedLogin = vault.containsLogin
                self.notice = "Bewaarde aanmelding niet ontgrendeld. Probeer opnieuw of meld handmatig aan."
                self.isWorking = false
                self.task = nil
            }
        }
    }

    func forget() {
        cancel()
        do {
            try vault.remove()
            hasSavedLogin = false
            notice = "Bewaarde aanmelding verwijderd."
        } catch {
            notice = "Verwijderen is niet gelukt. Probeer ‘Bewaarde aanmelding verwijderen’ opnieuw."
        }
    }

    func cancel() {
        generation = UUID()
        candidate = nil
        task?.cancel()
        task = nil
        vault.cancel()
        isWorking = false
    }
}
