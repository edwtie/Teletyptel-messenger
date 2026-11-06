import Combine
import Foundation

public enum NativeLoginFailure: Equatable {
    case account(NativeAccountFailure)
    case connection(ConnectionFailure)
    case xmpp(XMPPSessionFailure)
}

@MainActor
public final class NativeLoginModel: ObservableObject {
    public enum Phase: Equatable {
        case idle
        case checking
        case authenticating
        case connecting
        case connected(String)
        case failed(NativeLoginFailure)
        case signedOut
        case suspended
    }

    @Published public private(set) var phase: Phase = .idle
    private var generation = UUID()
    private var task: Task<Void, Never>?
    private let checker: any ServerChecking
    private let authenticator: any NativeAccountAuthenticating
    private let connection: any NativeXMPPConnecting

    public init(checker: any ServerChecking = XMPPAvailabilityClient(),
                authenticator: any NativeAccountAuthenticating = NativeAccountClient(),
                connection: any NativeXMPPConnecting = NativeXMPPConnection()) {
        self.checker = checker
        self.authenticator = authenticator
        self.connection = connection
    }

    deinit { task?.cancel() }

    public var isWorking: Bool {
        phase == .checking || phase == .authenticating || phase == .connecting
    }

    public var isConnected: Bool {
        if case .connected = phase { return true }
        return false
    }

    public func login(address: String, domain: String, jid: String, password: String) {
        invalidate()
        let attempt = generation
        let configuration: ServerConfiguration
        do { configuration = try ServerConfiguration(address: address, domain: domain) }
        catch { phase = .failed(.connection(.configuration)); return }
        guard NativeAuthenticatedAccount.validJID(jid, domain: configuration.domain),
              !password.isEmpty, password.utf8.count <= 1024,
              !password.unicodeScalars.contains(where: { $0.value == 0 }) else {
            phase = .failed(.account(.invalidCredentials))
            return
        }
        phase = .checking
        task = Task { [weak self, checker, authenticator, connection] in
            do {
                _ = try await checker.check(configuration)
                guard !Task.isCancelled, self?.advance(attempt, to: .authenticating) == true else { return }
                let account = try await authenticator.login(configuration: configuration, jid: jid, password: password)
                guard !Task.isCancelled, self?.generation == attempt else { return }
                guard account.jid == jid, account.configuration == configuration else {
                    throw NativeAccountFailure.invalidResponse
                }
                guard self?.advance(attempt, to: .connecting) == true else { return }
                try await connection.run(account: account) { [weak self] fullJID in
                    Task { @MainActor [weak self] in
                        guard let self = self, self.generation == attempt, self.phase == .connecting else { return }
                        let parts = fullJID.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
                        guard parts.count == 2, parts[0] == jid, !parts[1].isEmpty else {
                            self.invalidate()
                            self.phase = .failed(.connection(.invalidResponse))
                            return
                        }
                        self.phase = .connected(jid)
                    }
                }
                throw ConnectionFailure.offline
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.invalidate()
                if let failure = error as? NativeAccountFailure { self.phase = .failed(.account(failure)) }
                else if let failure = error as? XMPPSessionFailure { self.phase = .failed(.xmpp(failure)) }
                else { self.phase = .failed(.connection(ConnectionFailure.classify(error))) }
            }
        }
    }

    public func reset() {
        invalidate()
        phase = .idle
    }

    public func disconnect() {
        invalidate()
        phase = .signedOut
    }

    public func suspend() {
        guard isWorking || isConnected else { return }
        invalidate()
        phase = .suspended
    }

    private func advance(_ attempt: UUID, to phase: Phase) -> Bool {
        guard generation == attempt else { return false }
        self.phase = phase
        return true
    }

    private func invalidate() {
        generation = UUID()
        task?.cancel()
        task = nil
    }
}
