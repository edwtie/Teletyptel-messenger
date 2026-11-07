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
    @Published public private(set) var roster: NativeRosterState = .idle
    @Published public private(set) var chat = NativeChatStore()
    @Published public private(set) var chatError: String?
    @Published public private(set) var isBackground = false
    @Published private var sender: (any NativeChatSending)?
    private var resumableAccount: NativeAuthenticatedAccount?
    private var sendTasks: [UUID: Task<Void, Never>] = [:]
    private var earlyMessages: [NativeChatEvent] = []
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

    deinit {
        task?.cancel()
        for send in sendTasks.values { send.cancel() }
    }

    public var canSend: Bool { isConnected && sender != nil && !isBackground }

    public func setDraft(_ body: String, peer: String) {
        guard body.utf8.count <= 8192 else {
            chatError = "Je bericht is te lang (maximaal 8 kB). De eerdere tekst blijft bewaard."
            return
        }
        chat.setDraft(body, peer: peer)
        chatError = nil
    }

    public func sendDraft(to peer: String) {
        guard canSend, let sender = sender,
              case .ready(let contacts) = roster, contacts.contains(where: { $0.jid == peer }) else {
            chatError = "Niet verbonden met dit contact. Je tekst blijft bewaard."
            return
        }
        do {
            let message = try chat.enqueue(peer: peer)
            let attempt = generation
            chatError = nil
            sendTasks[message.id] = Task { [weak self] in
                var submitted = false
                do {
                    try await sender.sendMessage(to: peer, body: message.body, identifier: message.id.uuidString)
                    submitted = true
                } catch { }
                guard let self = self, self.generation == attempt else { return }
                self.chat.finish(message.id, submitted: submitted)
                self.sendTasks.removeValue(forKey: message.id)
            }
        } catch {
            chatError = "Bericht niet gestart. Controleer je tekst (maximaal 8 kB) of wacht tot eerdere verzendingen klaar zijn. Je tekst blijft bewaard."
        }
    }

    public func beginBackground() { isBackground = true }

    public func resume() {
        isBackground = false
        guard phase == .suspended, let account = resumableAccount else { return }
        let attempt = generation
        phase = .checking
        task = Task { [weak self, checker] in
            do {
                _ = try await checker.check(account.configuration)
                guard !Task.isCancelled, self?.advance(attempt, to: .connecting) == true else { return }
                try await self?.runSession(account, attempt: attempt)
            } catch {
                self?.fail(error, attempt: attempt)
            }
        }
    }

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
        task = Task { [weak self, checker, authenticator] in
            do {
                _ = try await checker.check(configuration)
                guard !Task.isCancelled, self?.advance(attempt, to: .authenticating) == true else { return }
                let account = try await authenticator.login(configuration: configuration, jid: jid, password: password)
                guard !Task.isCancelled, self?.generation == attempt else { return }
                guard account.jid == jid, account.configuration == configuration else {
                    throw NativeAccountFailure.invalidResponse
                }
                guard self?.advance(attempt, to: .connecting) == true else { return }
                self?.resumableAccount = account
                try await self?.runSession(account, attempt: attempt)
            } catch {
                self?.fail(error, attempt: attempt)
            }
        }
    }

    private func runSession(_ account: NativeAuthenticatedAccount, attempt: UUID) async throws {
        roster = .loading
        let jid = account.jid
        try await connection.run(account: account, onConnected: { [weak self] fullJID in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt, self.phase == .connecting else { return }
                let parts = fullJID.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
                guard parts.count == 2, parts[0] == jid, !parts[1].isEmpty else {
                    self.invalidate(clearChat: false)
                    self.phase = .failed(.connection(.invalidResponse))
                    return
                }
                self.phase = .connected(jid)
            }
        }, onRoster: { [weak self] roster in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt,
                      self.phase == .connecting || self.isConnected else { return }
                self.roster = roster
                if case .ready = roster {
                    let pending = self.earlyMessages
                    self.earlyMessages.removeAll()
                    for event in pending { self.receiveChat(event) }
                } else if roster == .unavailable {
                    self.earlyMessages.removeAll()
                }
            }
        }, onChat: { [weak self] event in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt,
                      self.phase == .connecting || self.isConnected else { return }
                self.receiveChat(event)
            }
        }, onSender: { [weak self] sender in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt,
                      self.phase == .connecting || self.isConnected else { return }
                self.sender = sender
            }
        })
        throw ConnectionFailure.offline
    }

    private func receiveChat(_ event: NativeChatEvent) {
        if case .ready(let contacts) = roster {
            let peer: String
            switch event {
            case .message(let sender, _, _), .rejected(let sender, _): peer = sender
            }
            guard contacts.contains(where: { $0.jid == peer }) else { return }
            chat.receive(event)
        } else if roster == .loading, earlyMessages.count < 32 {
            earlyMessages.append(event)
        }
    }

    private func fail(_ error: Error, attempt: UUID) {
        guard !Task.isCancelled, generation == attempt else { return }
        invalidate(clearChat: false)
        if let failure = error as? NativeAccountFailure { phase = .failed(.account(failure)) }
        else if let failure = error as? XMPPSessionFailure { phase = .failed(.xmpp(failure)) }
        else { phase = .failed(.connection(ConnectionFailure.classify(error))) }
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
        let keepAccount = isConnected
        invalidate(clearChat: false, keepAccount: keepAccount)
        phase = .suspended
    }

    private func advance(_ attempt: UUID, to phase: Phase) -> Bool {
        guard generation == attempt else { return false }
        self.phase = phase
        return true
    }

    private func invalidate(clearChat: Bool = true, keepAccount: Bool = false) {
        generation = UUID()
        roster = .idle
        earlyMessages.removeAll()
        sender = nil
        isBackground = false
        chat.interrupt()
        if clearChat { chat = NativeChatStore(); chatError = nil }
        if !keepAccount { resumableAccount = nil }
        for send in sendTasks.values { send.cancel() }
        sendTasks.removeAll()
        task?.cancel()
        task = nil
    }
}
