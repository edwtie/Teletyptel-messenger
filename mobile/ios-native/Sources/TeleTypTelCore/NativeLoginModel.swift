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
    @Published public private(set) var chat = NativeChatStore() { didSet { scheduleHistory(); synchronizeCallPolicy() } }
    @Published private(set) var callPolicyState: NativeCallPolicyState = .idle
    private let callPolicy = NativeCallPolicySync()
    private var callIntentObservation: Task<Void, Never>?
    private var earlyCallIntents: [(intent: NativeCallIntent, received: TimeInterval)] = []
    var onCallIntent: ((NativeCallIntent, any NativeCallRecoverySending) -> Void)?
    @Published public private(set) var historyNotice: String?
    @Published public private(set) var cachedContacts: [NativeContact] = []
    private let history: (any NativeHistoryStoring)?
    private var historyScope: NativeHistoryScope?
    private var historySave: Task<Void, Never>?
    private var restoringHistory = false
    private var receiptsInFlight = 0
    @Published public private(set) var chatError: String?
    @Published public private(set) var contactActionBusy = false
    @Published public private(set) var contactActionNotice: String?
    private var contactActionTask: Task<Void, Never>?
    public var onIncomingMessage: ((NativeChatMessage) -> Void)?
    public var visibleConversation: String?
    @Published public private(set) var isBackground = false
    @Published public private(set) var reconnectAttempt = 0
    public var isReconnecting: Bool { reconnectAttempt > 0 && isWorking }
    private let reconnectWait: @Sendable (Int) async throws -> Void
    private var stableConnection: Task<Void, Never>?
    @Published public private(set) var twoFactorError: String?
    @Published public private(set) var historyStates: [String: NativeHistoryState] = [:]
    public let groups = NativeGroupModel()
    let cloudHistory = NativeCloudSync()
    private var cloudAccountID: String?
    private var historyTask: Task<Void, Never>?
    private var historyRequest = UUID()
    @Published private var sender: (any NativeChatSending)?
    var onJingle: ((NativeJingleRequest, any NativeJingleSending) -> Void)?
    private var resumableAccount: NativeAuthenticatedAccount?
    private var callAuthorization = UUID()
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
    var contactManager: (any NativeContactManaging)? { canSend ? sender as? any NativeContactManaging : nil }

    public init(checker: any ServerChecking = XMPPAvailabilityClient(),
                authenticator: any NativeAccountAuthenticating = NativeTwoFactorAccountClient(),
                connection: any NativeXMPPConnecting = NativeXMPPConnection(), history: (any NativeHistoryStoring)? = nil,
                reconnectWait: @escaping @Sendable (Int) async throws -> Void = { attempt in
                    try await Task.sleep(nanoseconds: UInt64(1 << min(attempt - 1, 4)) * 1_000_000_000)
                }) {
        self.checker = checker
        self.authenticator = authenticator
        self.connection = connection
        self.history = history
        self.reconnectWait = reconnectWait
        callPolicy.changed = { [weak self] state in
            self?.callPolicyState = state
            if state == .ready { self?.flushCallIntents() }
        }
        groups.receivedMessage = { [weak self] message in
            guard let self = self, !self.chat.preferences.doNotDisturb,
                  !self.chat.preferences.mutedPeers.contains(message.room) else { return }
            self.onIncomingMessage?(NativeChatMessage(id: message.id, stanzaID: message.identifier, peer: message.room,
                body: message.body, date: message.date, state: .incoming))
        }
        groups.historyChanged = { [weak self] in self?.scheduleHistory() }
        groups.acceptedHistoryChange = { [weak self] previous, current in
            guard let self = self, self.canSend else { return }
            let old = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
            for message in current where old[message.id] != message {
                if let record = NativeCloudRecordFactory.group(message) {
                    self.cloudHistory.record(record, previous: old[message.id].flatMap { NativeCloudRecordFactory.group($0, includingPending: true) })
                }
            }
        }
    }

    deinit {
        historySave?.cancel()
        task?.cancel()
        secondFactorDeadline?.cancel()
        stableConnection?.cancel()
        contactActionTask?.cancel()
        secondFactor?.session.cancel()
        for send in sendTasks.values { send.cancel() }
        historyTask?.cancel()
    }

    public var canSend: Bool { isConnected && sender != nil && !isBackground }
    public var canReadCachedHistory: Bool { historyScope != nil && (!chat.messages.isEmpty || !groups.rooms.isEmpty) }
    var currentOwner: String? { historyScope?.owner ?? resumableAccount?.jid }
    var activeWebSession: NativeAccountWebSession? { isConnected && !isBackground ? resumableAccount?.webSession : nil }
    var activeAccountID: String? { isConnected ? resumableAccount?.accountID : nil }
    var warmCallLease: NativeWarmCallLease? {
        guard isConnected || phase == .suspended || phase == .checking || phase == .connecting,
              let account = resumableAccount,
              account.accountID != nil, account.webSession != nil else { return nil }
        return NativeWarmCallLease(account: account, authorization: callAuthorization)
    }
    func permitsWarmCall(_ lease: NativeWarmCallLease) -> Bool {
        lease.authorization == callAuthorization && resumableAccount?.jid == lease.account.jid
            && resumableAccount?.accountID == lease.account.accountID
            && resumableAccount?.webSession === lease.account.webSession
    }
    var activeJingleSender: (any NativeJingleSending)? {
        guard isConnected, !isBackground else { return nil }
        return jingleSender
    }
    var activeCallIntentSender: (any NativeCallRecoverySending)? {
        guard canSend, callPolicy.usable else { return nil }
        return jingleSender as? any NativeCallRecoverySending
    }
    func usesCallIntents(for peer: String) -> Bool {
        guard let owner = resumableAccount?.jid, activeCallIntentSender != nil,
              NativeChatCodec.bareJID(peer) == peer else { return false }
        return peer.components(separatedBy: "@").last == owner.components(separatedBy: "@").last
    }
    func permitsLegacyCall(to peer: String) -> Bool {
        guard canSend, !isBlocked(peer), !chat.preferences.doNotDisturb,
              !chat.preferences.mutedPeers.contains(peer) else { return false }
        if callPolicyState == .unsupported { return true }
        guard callPolicy.usable, let owner = resumableAccount?.jid else { return false }
        return peer.components(separatedBy: "@").last != owner.components(separatedBy: "@").last
    }
    func callIntentLease(for peer: String) -> NativeCallIntentLease? {
        guard usesCallIntents(for: peer), let sender = activeCallIntentSender,
              let owner = resumableAccount?.jid else { return nil }
        return NativeCallIntentLease(sender: sender, owner: owner, epoch: generation)
    }
    func permitsCallIntent(_ lease: NativeCallIntentLease, peer: String) -> Bool {
        isConnected && generation == lease.epoch && resumableAccount?.jid == lease.owner && callPolicy.usable &&
            !isBlocked(peer) && !chat.preferences.mutedPeers.contains(peer)
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
        guard canSend, !isBlocked(peer), let sender = sender,
              case .ready(let contacts) = roster, contacts.contains(where: { $0.jid == peer }) else {
            chatError = "Niet verbonden met dit contact. Je tekst blijft bewaard."
            return
        }
        do {
            let message = try chat.enqueue(peer: peer)
            submit(message, sender: sender)
        } catch {
            chatError = "Bericht niet gestart. Controleer je tekst (maximaal 8 kB) of wacht tot eerdere verzendingen klaar zijn. Je tekst blijft bewaard."
        }
    }

    public func forwardMessage(_ body: String, to peer: String) -> Bool {
        guard canSend, !isBlocked(peer), let sender = sender, case .ready(let contacts) = roster,
              contacts.contains(where: { $0.jid == peer }), NativeChatCodec.validBody(body) else { return false }
        do { submit(try chat.enqueueBody("Doorgestuurd:\n" + body, peer: peer), sender: sender); return true }
        catch { chatError = "Doorsturen niet gestart. Controleer de lengte en wacht op eerdere verzendingen."; return false }
    }

    private func submit(_ message: NativeChatMessage, sender: any NativeChatSending) {
        let attempt = generation
        chatError = nil
        sendTasks[message.id] = Task { [weak self] in
            var submitted = false
            do { try await sender.sendMessage(to: message.peer, body: message.body, identifier: message.id.uuidString); submitted = true } catch { }
            guard let self = self, self.generation == attempt else { return }
            let previous = self.chat.messages
            self.chat.finish(message.id, submitted: submitted)
            if submitted { self.queueCloudChanges(previous) }
            self.sendTasks.removeValue(forKey: message.id)
        }
    }

    public var canChangeMessages: Bool { canSend && sender is any NativeMessageChanging }
    var connectedConfiguration: ServerConfiguration? { isConnected ? resumableAccount?.configuration : nil }

    public func hideMessage(_ identifier: UUID) {
        do { try chat.hide(identifier); chatError = nil }
        catch { chatError = "Verwijderen niet gestart. Wacht op de verzending of de sessielimiet is bereikt." }
    }

    public func setChatPreferences(_ preferences: NativeChatPreferences) {
        chat.preferences = preferences
        cloudHistory.setSavingEnabled(preferences.saveOnlineHistory)
        flushHistory()
    }

    public func isBlocked(_ peer: String) -> Bool {
        let bare = NativeChatCodec.bareJID(peer) ?? peer
        return chat.preferences.blockedPeers.contains { $0.caseInsensitiveCompare(bare) == .orderedSame }
    }

    public func setMuted(_ peer: String, muted: Bool) {
        guard NativeChatCodec.bareJID(peer) == peer, chat.preferences.mutedPeers.count < 256 || !muted else { return }
        var preferences = chat.preferences
        if muted { preferences.mutedPeers.insert(peer) } else { preferences.mutedPeers.remove(peer) }
        setChatPreferences(preferences)
    }

    public func setBlocked(_ peer: String, blocked: Bool) {
        guard chat.preferences.blockedPeers.count < 256 || !blocked else { return }
        performContactAction { manager in try await manager.setBlocked(jid: peer, blocked: blocked) } accepted: { model in
            var preferences = model.chat.preferences
            if blocked { preferences.blockedPeers.insert(peer) } else { preferences.blockedPeers.remove(peer) }
            model.setChatPreferences(preferences)
        }
    }

    public func removeContact(_ peer: String) {
        performContactAction { manager in try await manager.removeContact(jid: peer) } accepted: { _ in }
    }

    public func renameContact(_ peer: String, name: String) {
        guard case .ready(let contacts) = roster, let contact = contacts.first(where: { $0.jid == peer }) else { return }
        performContactAction { manager in try await manager.renameContact(jid: peer, name: name, groups: contact.groups) } accepted: { _ in }
    }

    public func setDoNotDisturb(_ enabled: Bool) {
        performContactAction { manager in try await manager.setDoNotDisturb(enabled) } accepted: { model in
            var preferences = model.chat.preferences
            preferences.doNotDisturb = enabled
            model.setChatPreferences(preferences)
        }
    }

    private func performContactAction(_ action: @escaping @Sendable (any NativeContactManaging) async throws -> Void,
                                      accepted: @escaping @MainActor (NativeLoginModel) -> Void) {
        guard !contactActionBusy, let manager = contactManager else { return }
        contactActionBusy = true
        contactActionNotice = nil
        let attempt = generation
        contactActionTask = Task { [weak self] in
            do {
                try await action(manager)
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                accepted(self)
                self.contactActionNotice = "Wijziging bevestigd."
            } catch {
                guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
                self.contactActionNotice = "Wijziging niet bevestigd. Controleer de verbinding en probeer bewust opnieuw."
            }
            guard let self = self, self.generation == attempt else { return }
            self.contactActionBusy = false
            self.contactActionTask = nil
        }
    }

    public func clearLocalHistory() {
        guard sendTasks.isEmpty, chat.pendingCount == 0, !groups.hasPendingSends else { historyNotice = "Wacht tot lopende verzendingen klaar zijn."; return }
        if let history = history {
            guard let account = resumableAccount, let scope = try? NativeHistoryScope(configuration: account.configuration, owner: account.jid),
                  isConnected else { historyNotice = "Meld eerst aan bij dit account om de lokale kopie veilig te wissen."; return }
            do { try history.remove(scope); historyScope = scope }
            catch { historyNotice = "Lokale geschiedenis niet gewist. Ontgrendel het apparaat en probeer opnieuw."; return }
        }
        let preferences = chat.preferences
        restoringHistory = true; chat = NativeChatStore(); chat.preferences = preferences; groups.clearLocalHistory(); restoringHistory = false
        flushHistory()
    }

    public func react(_ identifier: UUID, emoji: String) {
        guard let target = chat.messages.first(where: { $0.id == identifier }), !isBlocked(target.peer) else { return }
        guard canSend, let sender = sender as? any NativeChatInteracting, sendTasks.count < 8,
              let owner = historyScope?.owner ?? resumableAccount?.jid, NativeInteractionCodec.picker.contains(emoji) else { return }
        do {
            let (message, request) = try chat.beginReaction(identifier)
            guard let target = message.previousIDs.first ?? message.stanzaID else { throw NativeChatFailure.invalidMessage }
            var values = message.reactions[owner] ?? []
            if values.contains(emoji) { values.removeAll { $0 == emoji } } else if values.count < 16 { values.append(emoji) }
            let interaction = NativeChatInteraction.reactions(target: target, values: values)
            let attempt = generation
            sendTasks[identifier] = Task { [weak self] in
                var submitted = false
                do { try await sender.interact(to: message.peer, interaction: interaction, identifier: request); submitted = true } catch { }
                guard let self = self, self.generation == attempt else { return }
                let previous = self.chat.messages
                self.chat.finishReaction(identifier, request: request, actor: owner, values: values, submitted: submitted)
                if submitted { self.queueCloudChanges(previous) }
                self.sendTasks[identifier] = nil
            }
        } catch { chatError = "Reactie niet gestart. Controleer de verbinding en het bericht." }
    }

    public func displayed(_ identifiers: [UUID]) {
        guard !isBackground else { return }
        chat.markRead(identifiers)
        guard canSend, chat.preferences.sendDisplayed else { return }
        let visible = Set(identifiers)
        if let message = chat.messages.last(where: { visible.contains($0.id) && $0.state == .incoming && $0.markable && !$0.displayedAttempted }) {
            sendReceipt(message.id, displayed: true)
        }
    }

    private func sendReceipt(_ identifier: UUID, displayed: Bool) {
        guard let message = chat.messages.first(where: { $0.id == identifier }), !isBlocked(message.peer) else { return }
        guard canSend, receiptsInFlight < 8, let sender = sender as? any NativeChatInteracting,
              let (peer, target) = chat.takeReceipt(identifier, displayed: displayed) else { return }
        receiptsInFlight += 1
        let attempt = generation
        Task { [weak self] in
            guard let self = self else { return }
            defer { if self.generation == attempt { self.receiptsInFlight = max(0, self.receiptsInFlight - 1) } }
            guard self.generation == attempt,
                  displayed ? self.chat.preferences.sendDisplayed : self.chat.preferences.sendDelivery else { return }
            do { try await sender.interact(to: peer, interaction: .receipt(target: target, displayed: displayed), identifier: UUID().uuidString) } catch { }
        }
    }

    private func restoreHistory(_ account: NativeAuthenticatedAccount) {
        guard let history = history, let scope = try? NativeHistoryScope(configuration: account.configuration, owner: account.jid), historyScope != scope else { return }
        historyScope = scope; restoringHistory = true; defer { restoringHistory = false }
        do {
            if let snapshot = try history.load(scope) {
                chat = snapshot.chat; chat.interrupt(); cachedContacts = snapshot.contacts.map { contact in var value = contact; value.presence = .unknown; value.callEndpoint = nil; return value }
                groups.restoreHistory(snapshot.groups, owner: scope.owner)
            }
            historyNotice = nil
        } catch { historyNotice = "Lokale geschiedenis niet ontgrendeld of beschadigd. Het bestaande bestand wordt niet automatisch overschreven."; historyScope = nil }
    }

    private func scheduleHistory() {
        guard !restoringHistory, historyScope != nil, history != nil else { return }
        historySave?.cancel()
        historySave = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 400_000_000) } catch { return }
            self?.flushHistory()
        }
    }

    public func flushHistory() {
        historySave?.cancel(); historySave = nil
        guard !restoringHistory, let history = history, let scope = historyScope else { return }
        if case .ready(let contacts) = roster { cachedContacts = Array(contacts.prefix(128)) }
        do {
            try history.save(NativeHistorySnapshot(scope: scope, chat: chat, contacts: cachedContacts, groups: groups.rooms.map(NativeGroupHistory.init)))
            historyNotice = chat.preferences.keepHistory ? "Geschiedenis versleuteld op dit apparaat bewaard." : "Lokale berichtopslag uitgeschakeld."
        } catch { historyNotice = "Lokale geschiedenis niet opgeslagen. Het eerdere bestand blijft behouden; controleer opslagruimte en apparaatontgrendeling." }
    }

    public func changeMessage(_ identifier: UUID, correctedBody: String? = nil) {
        guard let target = chat.messages.first(where: { $0.id == identifier }), !isBlocked(target.peer) else { return }
        guard canSend, let sender = sender as? any NativeMessageChanging, sendTasks.count < 8 else {
            chatError = "Niet verbonden; het wijzigingsverzoek is niet verstuurd."; return
        }
        do {
            let (message, change, request) = try chat.beginChange(identifier, correctedBody: correctedBody)
            let attempt = generation
            chatError = nil
            sendTasks[message.id] = Task { [weak self] in
                var submitted = false
                do { try await sender.changeMessage(to: message.peer, change: change, identifier: request); submitted = true } catch { }
                guard let self = self, self.generation == attempt else { return }
                let previous = self.chat.messages
                self.chat.finishChange(message.id, change: change, request: request, submitted: submitted)
                if submitted { self.queueCloudChanges(previous) }
                self.sendTasks.removeValue(forKey: message.id)
            }
        } catch { chatError = "Wijziging niet gestart. Alleen eigen verzonden berichten kunnen worden ingetrokken; bewerken geldt voor je laatste bericht." }
    }

    public func beginBackground() {
        isBackground = true
        cloudHistory.stop(); cloudAccountID = nil
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
        configureCloudHistory()
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
                self.stableConnection?.cancel()
                self.stableConnection = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: 30_000_000_000)
                    guard !Task.isCancelled, let self = self, self.generation == attempt, self.isConnected else { return }
                    self.reconnectAttempt = 0
                }
                self.restoreHistory(account)
                self.configureCloudHistory()
                self.activateGroups()
                self.synchronizeCallPolicy()
                if self.chat.preferences.doNotDisturb, let manager = self.sender as? any NativeContactManaging {
                    try? await manager.setDoNotDisturb(true)
                }
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
                    self.configureCloudHistory()
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

    private func configureCloudHistory() {
        guard isConnected, !isBackground, case .ready = roster, let account = resumableAccount,
              let accountID = account.accountID, let session = account.webSession, cloudAccountID != accountID else { return }
        cloudAccountID = accountID
        cloudHistory.configure(NativeCloudHistoryClient(session: session, accountID: accountID, owner: account.jid), owner: account.jid)
        cloudHistory.setSavingEnabled(chat.preferences.saveOnlineHistory)
        let owner = account.jid
        cloudHistory.applyConversations = { [weak self] catalog in
            guard let self = self, self.isConnected, !self.isBackground, self.resumableAccount?.jid == owner,
                  self.cloudAccountID == accountID else { return }
            self.groups.rememberCloudConversations(catalog, owner: owner)
        }
        cloudHistory.unavailable = { [weak self] peer, kind in
            guard kind == "contact" else { return }
            self?.loadHistory(for: peer, refresh: true)
        }
        cloudHistory.apply = { [weak self] records, peer, kind, earlier in
            guard let self = self, self.isConnected, !self.isBackground, self.resumableAccount?.jid == owner,
                  self.cloudAccountID == accountID else { throw CancellationError() }
            if kind == "contact" {
                guard case .ready(let contacts) = self.roster,
                      contacts.contains(where: { $0.jid == peer }) || self.cloudHistory.conversations.contains(where: { $0.peer == peer && $0.kind == "contact" }) else { throw NativeArchiveFailure.invalidResponse }
                var copy = self.chat
                try copy.mergeCloud(records, owner: owner, earlier: earlier)
                self.chat = copy
                if !earlier { self.loadHistory(for: peer, refresh: true) }
            } else {
                try self.groups.mergeCloud(records, room: peer, owner: owner, earlier: earlier)
            }
        }
    }

    func loadCloudHistory(peer: String, kind: String, earlier: Bool = false, refresh: Bool = false) {
        guard isConnected, !isBackground else { return }
        if kind == "contact" {
            guard case .ready(let contacts) = roster,
                  contacts.contains(where: { $0.jid == peer }) || cloudHistory.conversations.contains(where: { $0.peer == peer && $0.kind == "contact" }) else { return }
        } else {
            guard kind == "group", groups.rooms.contains(where: { $0.room == peer }) else { return }
        }
        configureCloudHistory()
        if earlier { cancelHistory() }
        cloudHistory.load(peer: peer, kind: kind, earlier: earlier, refresh: refresh)
    }

    func openCloudGroup(_ room: String) {
        guard isConnected, !isBackground, let owner = resumableAccount?.jid,
              let conversation = cloudHistory.conversations.first(where: { $0.kind == "group" && $0.peer == room }) else { return }
        groups.openCloudConversation(conversation, owner: owner)
    }

    private func queueCloudChanges(_ previous: [NativeChatMessage]) {
        guard isConnected, !isBackground, let owner = resumableAccount?.jid else { return }
        let old = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
        for message in chat.messages where old[message.id] != message {
            if let record = NativeCloudRecordFactory.direct(message, owner: owner) {
                cloudHistory.record(record, previous: old[message.id].flatMap { NativeCloudRecordFactory.direct($0, owner: owner, includingPending: true) })
            }
        }
    }

    private func receiveJingle(_ request: NativeJingleRequest, attempt: UUID) {
        guard generation == attempt, phase == .connecting || isConnected else { return }
        if request.action == "session-initiate", isBlocked(request.peer) || chat.preferences.doNotDisturb ||
            chat.preferences.mutedPeers.contains(NativeChatCodec.bareJID(request.peer) ?? "") {
            if let sender = jingleSender { Task { try? await sender.replyJingle(request, rejection: .serviceUnavailable) } }
            return
        }
        if let sender = jingleSender { onJingle?(request, sender) }
        else if earlyJingle.count < 8 { earlyJingle.append(request) }
    }

    private func setJingleSender(_ sender: any NativeJingleSending, attempt: UUID) {
        guard generation == attempt, phase == .connecting || isConnected else { return }
        jingleSender = sender
        synchronizeCallPolicy()
        if let calls = sender as? any NativeCallRecoverySending {
            callIntentObservation?.cancel()
            callIntentObservation = Task { [weak self] in
                await calls.observeCallIntents { [weak self] intent in
                    Task { @MainActor in self?.receiveCallIntent(intent, attempt: attempt) }
                }
            }
        }
        let pending = earlyJingle
        earlyJingle.removeAll()
        for request in pending { onJingle?(request, sender) }
    }

    private func synchronizeCallPolicy() {
        guard isConnected, let owner = resumableAccount?.jid, let sender = jingleSender else { return }
        callPolicy.configure(sender: sender as? any NativeCallIntentSending, owner: owner,
            session: generation, preferences: chat.preferences)
    }

    private func receiveCallIntent(_ intent: NativeCallIntent, attempt: UUID) {
        guard generation == attempt, phase == .connecting || isConnected,
              let calls = jingleSender as? any NativeCallRecoverySending else { return }
        if phase == .connecting {
            if earlyCallIntents.count < 8 { earlyCallIntents.append((intent, Date().timeIntervalSince1970)) }
            return
        }
        if intent.action == .propose {
            guard !isBackground, !isBlocked(intent.peer), !chat.preferences.doNotDisturb,
                  !chat.preferences.mutedPeers.contains(NativeChatCodec.bareJID(intent.peer) ?? "") else {
                Task { try? await calls.sendCallIntent(action: .reject, peer: intent.peer, sid: intent.sid, media: nil) }
                return
            }
            if callPolicyState == .synchronizing {
                if earlyCallIntents.count < 8 { earlyCallIntents.append((intent, Date().timeIntervalSince1970)) }
                return
            }
            guard callPolicy.usable else { return }
        }
        onCallIntent?(intent, calls)
    }

    private func flushCallIntents() {
        let pending = earlyCallIntents; earlyCallIntents.removeAll()
        let now = Date().timeIntervalSince1970
        for entry in pending where now >= entry.received && now - entry.received <= 5 {
            receiveCallIntent(entry.intent, attempt: generation)
        }
    }

    private func receiveChat(_ event: NativeChatEvent) {
        if case .ready(let contacts) = roster {
            let peer: String
            switch event {
            case .message(let sender, _, _), .rejected(let sender, _), .archivedIdentity(let sender, _, _, _), .change(let sender, _, _),
                 .interaction(let sender, _, _), .trackedMessage(let sender, _, _, _, _, _): peer = sender
            }
            guard !isBlocked(peer), contacts.contains(where: { $0.jid == peer }) else { return }
            let previous = chat.messages
            chat.receive(event)
            if !chat.preferences.doNotDisturb, !chat.preferences.mutedPeers.contains(peer),
               let message = chat.messages.last, message.state == .incoming,
               !previous.contains(where: { $0.id == message.id }), !message.hidden, !message.retracted {
                onIncomingMessage?(message)
            }
            queueCloudChanges(previous)
            if case .trackedMessage(_, let identifier, _, _, _, _) = event,
               let message = chat.messages.last(where: { $0.peer == peer && $0.stanzaID == identifier && $0.state == .incoming }) {
                sendReceipt(message.id, displayed: false)
            }
        } else if roster == .loading, earlyMessages.count < 32 {
            earlyMessages.append(event)
        }
    }

    private func fail(_ error: Error, attempt: UUID) {
        guard !Task.isCancelled, generation == attempt else { return }
        let transient: Bool
        if let failure = error as? XMPPSessionFailure {
            transient = failure == .streamClosed || failure == .heartbeatTimeout
        } else if error is NativeAccountFailure || error is CancellationError {
            transient = false
        } else if let failure = error as? ConnectionFailure {
            transient = failure == .offline || failure == .timeout
        } else {
            let failure = error as NSError
            transient = failure.domain == NSURLErrorDomain && [NSURLErrorTimedOut, NSURLErrorNetworkConnectionLost,
                NSURLErrorNotConnectedToInternet, NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost,
                NSURLErrorDNSLookupFailed].contains(failure.code)
        }
        if transient, !isBackground, reconnectAttempt < 5, let account = resumableAccount {
            let next = reconnectAttempt + 1
            invalidate(clearChat: false, keepAccount: true, keepReconnect: true)
            reconnectAttempt = next
            phase = .connecting
            let retry = generation
            task = Task { [weak self, checker, reconnectWait] in
                do {
                    try await reconnectWait(next)
                    guard !Task.isCancelled, self?.generation == retry else { return }
                    _ = try await checker.check(account.configuration)
                    guard !Task.isCancelled, self?.generation == retry else { return }
                    try await self?.runSession(account, attempt: retry)
                } catch { self?.fail(error, attempt: retry) }
            }
            return
        }
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
        let keepAccount = isConnected || isReconnecting
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

    private func invalidate(clearChat: Bool = true, keepAccount: Bool = false, keepReconnect: Bool = false) {
        contactActionTask?.cancel()
        contactActionTask = nil
        contactActionBusy = false
        contactActionNotice = nil
        stableConnection?.cancel()
        stableConnection = nil
        if !keepReconnect { reconnectAttempt = 0 }
        cloudHistory.configure(nil, owner: nil); cloudAccountID = nil
        chat.interrupt()
        flushHistory()
        receiptsInFlight = 0
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
        callIntentObservation?.cancel(); callIntentObservation = nil
        earlyCallIntents.removeAll(); callPolicy.reset()
        jingleSender = nil
        sender = nil
        isBackground = false
        chat.interrupt()
        if clearChat {
            visibleConversation = nil
            historyScope = nil; cachedContacts = []; historyNotice = nil
            chat = NativeChatStore(); chatError = nil; historyStates.removeAll()
        }
        if !keepAccount {
            callAuthorization = UUID()
            if let session = resumableAccount?.webSession { Task { await session.close() } }
            resumableAccount = nil
        }
        for send in sendTasks.values { send.cancel() }
        sendTasks.removeAll()
        task?.cancel()
        task = nil
    }
}
