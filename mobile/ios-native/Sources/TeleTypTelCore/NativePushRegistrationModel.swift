import Foundation
import Combine

struct NativePushScope: Codable, Equatable {
    let origin: String
    let accountID: String
}

struct NativePushRecord: Codable, CustomStringConvertible, CustomDebugStringConvertible {
    let scope: NativePushScope
    let deviceID: UUID
    var consented: Bool
    var pendingRevocation: Bool
    var generation: String?
    var expiresAt: TimeInterval?
    var controlCredential: String?
    var description: String { "NativePushRecord(redacted)" }
    var debugDescription: String { description }
}

@MainActor
protocol NativePushStoring {
    func load() throws -> NativePushRecord?
    func save(_ record: NativePushRecord) throws
    func remove() throws
}

@MainActor
protocol NativePushRegistering: AnyObject {
    var pushCallActive: Bool { get }
    func startPushRegistration(tokenChanged: @escaping (Data?) -> Void) -> Bool
    func stopPushRegistration()
    func confirmPushRevocation()
}

@MainActor
final class NativePushRegistrationModel: ObservableObject {
    @Published private(set) var consented = false
    @Published private(set) var available = false
    @Published private(set) var busy = false
    @Published private(set) var notice = "Achtergrondoproepen zijn nog niet geactiveerd."
    private let enabled: Bool
    private let store: any NativePushStoring
    private weak var driver: (any NativePushRegistering)?
    private var client: (any NativePushRegistryServing)?
    private var scope: NativePushScope?
    private var record: NativePushRecord?
    private var epoch = UUID()
    private var exchange: Task<Void, Never>?
    private var token: Data?
    private var foreground = true

    init(enabled: Bool, store: any NativePushStoring, driver: any NativePushRegistering) {
        self.enabled = enabled; self.store = store; self.driver = driver
    }

    func connect(_ client: (any NativePushRegistryServing)?, scope: NativePushScope?) async {
        guard enabled, let client = client, let scope = scope else { return }
        guard self.scope != scope || self.client == nil || !available else { flushToken(); return }
        if self.scope != nil { logout() }
        epoch = UUID()
        var attempt = epoch
        self.scope = scope; self.client = client
        busy = true
        defer { if epoch == attempt { busy = false } }
        do {
            record = try store.load()
            if let record = record, record.scope != scope {
                notice = "Meld aan met het vorige account om de eerdere oproepregistratie in te trekken."
                return
            }
            if record?.pendingRevocation == true {
                await disable()
                guard self.scope == scope, record == nil else { return }
                attempt = epoch
            }
            let ready = try await client.backgroundAnswerReady()
            guard epoch == attempt else { return }
            available = ready
            guard ready else { notice = "De server heeft nog geen veilige achtergrond-opname en oproepherstel beschikbaar."; return }
            notice = "Oproepmeldingen staan uit. Inschakelen vraagt eerst jouw toestemming."
            if record?.consented == true { await enable(consented: true) }
        } catch {
            guard epoch == attempt else { return }
            available = false
            notice = "Oproepregistratie kan niet veilig worden gecontroleerd. Probeer later opnieuw."
        }
    }

    func enable(consented: Bool) async {
        guard enabled, consented, available, client != nil, let scope = scope, foreground,
              record == nil || (record?.scope == scope && record?.pendingRevocation == false) else { return }
        do {
            var value = record ?? NativePushRecord(scope: scope, deviceID: UUID(), consented: true, pendingRevocation: false)
            value.consented = true; value.pendingRevocation = true; value.controlCredential = nil
            try store.save(value)
            record = value
            self.consented = true
            notice = "Wachten op een beveiligd toestelregistratietoken…"
            guard driver?.startPushRegistration(tokenChanged: { [weak self] data in
                guard let self = self else { return }
                guard let data = data else { self.logout(); return }
                self.token = data; self.flushToken()
            }) == true else {
                await disable()
                return
            }
        } catch {
            driver?.stopPushRegistration()
            self.consented = false
            available = false
            notice = "Veilige opslag is niet beschikbaar. Oproepmeldingen blijven uit."
        }
    }

    func setForeground(_ active: Bool) {
        foreground = active
        if active { flushToken() }
    }

    func flushToken() {
        guard enabled, foreground, consented, driver?.pushCallActive == false,
              let token = token, let value = record, let client = client, value.scope == scope else { return }
        self.token = nil
        let attempt = epoch
        let previous = exchange
        busy = true
        exchange = Task { [weak self] in
            await previous?.value
            guard let self = self, self.epoch == attempt, self.consented else { return }
            defer { if self.epoch == attempt { self.busy = false } }
            do {
                let registered = try await client.register(deviceID: value.deviceID, token: token, consented: true)
                guard self.epoch == attempt, self.consented else { return }
                var saved = value
                saved.pendingRevocation = false; saved.generation = registered.generation
                saved.expiresAt = registered.expiresAt; saved.controlCredential = registered.controlCredential
                try self.store.save(saved)
                self.record = saved
                self.notice = "Oproepregistratie bevestigd. Een echte vergrendelde-schermtest blijft vereist."
            } catch {
                guard self.epoch == attempt else { return }
                self.markRevocation()
                self.notice = "Registratie niet bevestigd. Meldingen staan uit; serverintrekking moet nog worden bevestigd."
            }
        }
    }

    func disable() async {
        let client = client
        let previous = exchange
        markRevocation()
        guard let value = record, value.scope == scope, let client = client else { return }
        let attempt = epoch
        busy = true
        defer { if epoch == attempt { busy = false } }
        await previous?.value
        guard epoch == attempt else { return }
        do {
            try await client.revoke(deviceID: value.deviceID)
            guard epoch == attempt else { return }
            try store.remove()
            record = nil
            driver?.confirmPushRevocation()
            notice = "Oproepmeldingen zijn uitgeschakeld en de serverregistratie is ingetrokken."
        } catch {
            guard epoch == attempt else { return }
            notice = "Lokaal uitgeschakeld. Serverintrekking is nog niet bevestigd; meld opnieuw aan met hetzelfde account."
        }
    }

    func logout() {
        guard enabled else { return }
        markRevocation()
        client = nil; scope = nil; available = false
    }

    private func markRevocation() {
        epoch = UUID(); token = nil; consented = false; busy = false
        driver?.stopPushRegistration()
        guard var value = record else { return }
        value.consented = false; value.pendingRevocation = true; value.controlCredential = nil
        record = value
        do { try store.save(value) }
        catch {
            try? store.remove()
            available = false
        }
        notice = "Oproepmeldingen staan lokaal uit. Serverintrekking is nog niet bevestigd."
    }
}
