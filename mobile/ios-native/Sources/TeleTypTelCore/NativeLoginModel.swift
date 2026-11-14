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
        case awaitingSecondFactor
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
    @Published public private(set) var twoFactorError: String?
    @Published public private(set) var historyStates: [String: NativeHistoryState] = [:]
    public let groups = NativeGroupModel()
    private var historyTask: Task<Void, Never>?
    private var historyRequest = UUID()
    @Published private var sender: (any NativeChatSending)?
    var onJingle: ((NativeJingleRequest, any NativeJingleSending) -> Void)?
    private var resumableAccount: NativeAuthenticatedAccount?
    private var sendTasks: [UUID: Task<Void, Never>] = [:]
    private var earlyMessages: [NativeChatEvent] = []
    private var earlyJingle: [NativeJingleRequest] = []
    private var jingleSender: (any NativeJingleSending)?
    private var generation = UUID()
    private var task: Task<Void, Never>?
    private var secondFactor: (session: any NativeSecondFactorSession, configuration: ServerConfiguration, jid: String?)?
    private var providerSigner: (any NativeProviderSigning)?
    private var secondFactorDeadline: Task<Void, Never>?
    private let checker: any ServerChecking
    private let authenticator: any NativeAccountAuthenticating
    private let connection: any NativeXMPPConnecting

    public init(checker: any ServerChecking = XMPPAvailabilityClient(),
                authenticator: any NativeAccountAuthenticating = NativeTwoFactorAccountClient(),
                connection: any NativeXMPPConnecting = NativeXMPPConnection()) {
        self.checker = checker
        self.authenticator = authenticator
        self.connection = connection
    }

    deinit {
        task?.cancel()
        secondFactorDeadline?.cancel()
        secondFactor?.session.cancel()
        for send in sendTasks.values { send.cancel() }
        historyTask?.cancel()
    }

    public var canSend: Bool { isConnected && sender != nil && !isBackground }
    var activeWebSession: NativeAccountWebSession? { isConnected && !isBackground ? resumableAccount?.webSession : nil }
    var activeAccountID: String? { isConnected ? resumableAccount?.accountID : nil }
    var activeJingleSender: (any NativeJingleSending)? {
        guard isConnected, !isBackground else { return nil }
        return jingleSender
    }

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

    public func beginBackground() {
        isBackground = true
        cancelHistory()
        groups.disconnect(clear: false)
    }

    public func loadHistory(for peer: String, refresh: Bool = false) {
        guard canSend, case .connected(let owner) = phase,
              case .ready(let contacts) = roster, contacts.contains(where: { $0.jid == peer }) else { return }
        guard historyStates[peer] != .loading, refresh || historyStates[peer] != .ready else { return }
        guard historyStates[peer] != nil || historyStates.count < 100 else { return }
        guard let archive = sender as? any NativeArchiveSending else { historyStates[peer] = .unavailable; return }
        historyTask?.cancel()
        for key in Array(historyStates.keys) where historyStates[key] == .loading { historyStates[key] = .idle }
        let attempt = generation
        let request = UUID()
        historyRequest = request
        historyStates[peer] = .loading
        historyTask = Task { [weak self] in
            do {
                let page = try await archive.fetchArchive(peer: peer, before: nil)
                try Task.checkCancellation()
                guard let self = self, self.generation == attempt, self.historyRequest == request,
                      self.isConnected, !self.isBackground else { return }
                guard page.owner == owner, page.peer == peer else { throw NativeArchiveFailure.invalidResponse }
                try self.chat.mergeArchive(page)
                self.historyStates[peer] = .ready
                self.historyTask = nil
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt, self.historyRequest == request else { return }
                self.historyStates[peer] = error as? NativeArchiveFailure == .unavailable ? .unavailable : .failed
                self.historyTask = nil
            }
        }
    }

    public func resume() {
        isBackground = false
        activateGroups()
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

    public var isAwaitingSecondFactor: Bool { phase == .awaitingSecondFactor }
    public var isSecondFactorPending: Bool { secondFactor != nil }

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
                if let challenging = authenticator as? any NativeAccountChallenging {
                    let step = try await challenging.begin(configuration: configuration, jid: jid, password: password)
                    guard !Task.isCancelled, let self = self, self.generation == attempt else {
                        if case .challenge(let challenge) = step { challenge.cancel() }
                        return
                    }
                    switch step {
                    case .authenticated(let account):
                        try await self.completeAuthentication(account, configuration: configuration, jid: jid, attempt: attempt)
                    case .challenge(let challenge):
                        self.stageChallenge(challenge, configuration: configuration, jid: jid, attempt: attempt)
                    }
                } else {
                    let account = try await authenticator.login(configuration: configuration, jid: jid, password: password)
                    try await self?.completeAuthentication(account, configuration: configuration, jid: jid, attempt: attempt)
                }
            } catch {
                self?.fail(error, attempt: attempt)
            }
        }
    }

    func loginSocial(address: String, domain: String, provider: NativeIdentityProvider, signer: any NativeProviderSigning) {
        invalidate()
        let configuration: ServerConfiguration
        do { configuration = try ServerConfiguration(address: address, domain: domain) }
        catch { phase = .failed(.connection(.configuration)); return }
        let attempt = generation
        providerSigner = signer
        phase = .checking
        task = Task { [weak self, checker] in
            do {
                _ = try await checker.check(configuration)
                guard !Task.isCancelled, self?.advance(attempt, to: .authenticating) == true else { return }
                let step = try await NativeSocialAccountClient().login(configuration: configuration, provider: provider, signer: signer)
                guard !Task.isCancelled, let self = self, self.generation == attempt else {
                    if case .challenge(let challenge) = step { challenge.cancel() }
                    return
                }
                self.providerSigner = nil
                switch step {
                case .authenticated(let account):
                    try await self.completeAuthentication(account, configuration: configuration, jid: nil, attempt: attempt)
                case .challenge(let challenge):
                    self.stageChallenge(challenge, configuration: configuration, jid: nil, attempt: attempt)
                }
            } catch { self?.fail(error, attempt: attempt) }
        }
    }

    private func stageChallenge(_ challenge: any NativeSecondFactorSession, configuration: ServerConfiguration,
                                jid: String?, attempt: UUID) {
        secondFactor = (challenge, configuration, jid)
        phase = .awaitingSecondFactor
        secondFactorDeadline = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 300_000_000_000) } catch { return }
            self?.fail(NativeAccountFailure.twoFactorRequired, attempt: attempt)
        }
    }

    public func verifySecondFactor(code: String) {
        guard isAwaitingSecondFactor, !isBackground, let pending = secondFactor else { return }
        guard code.range(of: #"\A[0-9]{6}\z"#, options: .regularExpression) != nil else {
            twoFactorError = "Vul de zes cijfers uit je authenticator-app in."
            return
        }
        let attempt = generation
        twoFactorError = nil
        phase = .authenticating
        task = Task { [weak self] in
            do {
                let account = try await pending.session.verify(code: code)
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.secondFactor = nil
                self.secondFactorDeadline?.cancel()
                self.secondFactorDeadline = nil
                try await self.completeAuthentication(account, configuration: pending.configuration, jid: pending.jid, attempt: attempt)
            } catch NativeSecondFactorFailure.invalidCode {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.twoFactorError = "De code is niet geldig. Controleer je authenticator-app en probeer opnieuw."
                self.phase = .awaitingSecondFactor
            } catch NativeSecondFactorFailure.expired {
                self?.fail(NativeAccountFailure.twoFactorRequired, attempt: attempt)
            } catch {
                self?.fail(error, attempt: attempt)
            }
        }
    }

    private func completeAuthentication(_ account: NativeAuthenticatedAccount, configuration: ServerConfiguration,
                                        jid: String?, attempt: UUID) async throws {
        guard !Task.isCancelled, self.generation == attempt else { return }
        guard (jid == nil || account.jid == jid), account.configuration == configuration else { throw NativeAccountFailure.invalidResponse }
        guard advance(attempt, to: .connecting) else { return }
        resumableAccount = account
        try await runSession(account, attempt: attempt)
    }

    private func runSession(_ account: NativeAuthenticatedAccount, attempt: UUID) async throws {
        roster = .loading
        let jid = account.jid
        let connected: @Sendable (String) -> Void = { [weak self] fullJID in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt, self.phase == .connecting else { return }
                let parts = fullJID.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
                guard parts.count == 2, parts[0] == jid, !parts[1].isEmpty else {
                    self.invalidate(clearChat: false)
                    self.phase = .failed(.connection(.invalidResponse))
                    return
                }
                self.phase = .connected(jid)
                self.activateGroups()
            }
        }
        let rosterChanged: @Sendable (NativeRosterState) -> Void = { [weak self] roster in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt,
                      self.phase == .connecting || self.isConnected else { return }
                self.roster = roster
                if case .ready(let contacts) = roster { self.groups.updateContacts(contacts, owner: jid) }
                else if roster == .unavailable { self.groups.updateContacts([], owner: jid) }
                if case .ready = roster {
                    let pending = self.earlyMessages
                    self.earlyMessages.removeAll()
                    for event in pending { self.receiveChat(event) }
                } else if roster == .unavailable {
                    self.earlyMessages.removeAll()
                }
            }
        }
        let chatReceived: @Sendable (NativeChatEvent) -> Void = { [weak self] event in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt,
                      self.phase == .connecting || self.isConnected else { return }
                self.receiveChat(event)
            }
        }
        let senderReady: @Sendable (any NativeChatSending) -> Void = { [weak self] sender in
            Task { @MainActor [weak self] in
                guard let self = self, self.generation == attempt,
                      self.phase == .connecting || self.isConnected else { return }
                self.sender = sender
                self.activateGroups()
            }
        }
        if let calls = connection as? any NativeJingleXMPPConnecting {
            try await calls.run(account: account, onConnected: connected, onRoster: rosterChanged,
                onChat: chatReceived, onSender: senderReady, onJingle: { [weak self] request in
                    Task { @MainActor [weak self] in self?.receiveJingle(request, attempt: attempt) }
                }, onJingleSender: { [weak self] sender in
                    Task { @MainActor [weak self] in self?.setJingleSender(sender, attempt: attempt) }
                })
        } else {
            try await connection.run(account: account, onConnected: connected, onRoster: rosterChanged,
                                     onChat: chatReceived, onSender: senderReady)
        }
        throw ConnectionFailure.offline
    }

    private func activateGroups() {
        guard canSend, case .connected(let owner) = phase, let sender = sender as? any NativeGroupSending else { return }
        groups.attach(sender, owner: owner)
    }

    private func receiveJingle(_ request: NativeJingleRequest, attempt: UUID) {
        guard generation == attempt, phase == .connecting || isConnected else { return }
        if let sender = jingleSender { onJingle?(request, sender) }
        else if earlyJingle.count < 8 { earlyJingle.append(request) }
    }

    private func setJingleSender(_ sender: any NativeJingleSending, attempt: UUID) {
        guard generation == attempt, phase == .connecting || isConnected else { return }
        jingleSender = sender
        let pending = earlyJingle
        earlyJingle.removeAll()
        for request in pending { onJingle?(request, sender) }
    }

    private func receiveChat(_ event: NativeChatEvent) {
        if case .ready(let contacts) = roster {
            let peer: String
            switch event {
            case .message(let sender, _, _), .rejected(let sender, _), .archivedIdentity(let sender, _, _, _): peer = sender
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
        guard isWorking || isConnected || isAwaitingSecondFactor else { return }
        let keepAccount = isConnected
        invalidate(clearChat: false, keepAccount: keepAccount)
        phase = .suspended
    }

    private func advance(_ attempt: UUID, to phase: Phase) -> Bool {
        guard generation == attempt else { return false }
        self.phase = phase
        return true
    }

    private func cancelHistory() {
        historyRequest = UUID()
        historyTask?.cancel()
        historyTask = nil
        for key in Array(historyStates.keys) where historyStates[key] == .loading { historyStates[key] = .idle }
    }

    private func invalidate(clearChat: Bool = true, keepAccount: Bool = false) {
        generation = UUID()
        cancelHistory()
        groups.disconnect(clear: clearChat)
        providerSigner?.cancel()
        providerSigner = nil
        secondFactor?.session.cancel()
        secondFactor = nil
        secondFactorDeadline?.cancel()
        secondFactorDeadline = nil
        twoFactorError = nil
        roster = .idle
        earlyMessages.removeAll()
        earlyJingle.removeAll()
        jingleSender = nil
        sender = nil
        isBackground = false
        chat.interrupt()
        if clearChat { chat = NativeChatStore(); chatError = nil; historyStates.removeAll() }
        if !keepAccount {
            if let session = resumableAccount?.webSession { Task { await session.close() } }
            resumableAccount = nil
        }
        for send in sendTasks.values { send.cancel() }
        sendTasks.removeAll()
        task?.cancel()
        task = nil
    }
}
