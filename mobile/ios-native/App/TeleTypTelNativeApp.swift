import SwiftUI

@main
struct TeleTypTelNativeApp: App {
    var body: some Scene {
        WindowGroup { NativeStartupView() }
    }
}

@MainActor
final class NativeStartupModel: ObservableObject {
    @Published private(set) var state = StartupState()
    private var task: Task<Void, Never>?
    private let checker: any ServerChecking

    init(checker: any ServerChecking = XMPPAvailabilityClient()) { self.checker = checker }

    func check(address: String, domain: String) {
        task?.cancel()
        let attempt = state.begin()
        do {
            let configuration = try ServerConfiguration(address: address, domain: domain)
            task = Task { [weak self, checker] in
                do {
                    _ = try await checker.check(configuration)
                    guard !Task.isCancelled else { return }
                    self?.state.complete(attempt)
                } catch is CancellationError {
                    return
                } catch {
                    guard !Task.isCancelled else { return }
                    self?.state.complete(attempt, failure: ConnectionFailure.classify(error))
                }
            }
        } catch {
            state.complete(attempt, failure: .configuration)
        }
    }

    func reset() {
        task?.cancel()
        task = nil
        state.reset()
    }

    func cancel() {
        guard state.phase == .checking else { return }
        task?.cancel()
        task = nil
        state.cancel()
    }
}

struct NativeStartupView: View {
    private struct RestoredInput {
        let address: String
        let domain: String
        let jid: String
    }
    @StateObject private var model: NativeStartupModel
    @StateObject private var loginModel: NativeLoginModel
    @StateObject private var savedLogin: NativeSavedLoginModel
    @StateObject private var background = NativeBackgroundController()
    @StateObject private var calls = NativeCallController()
    @State private var selectedContact: NativeContact?
    @Environment(\.scenePhase) private var scenePhase
    @State private var address = ""
    @State private var domain = ""
    @State private var jid = ""
    @State private var password = ""
    @State private var rememberLogin = false
    @State private var restoredInput: RestoredInput?
    private let fixtureName: String?

    init() {
        #if DEBUG
        if let scenario = ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_UI_FIXTURE"],
           ["connected", "two-factor", "disconnect"].contains(scenario) {
            let fixture = NativeLoginUIFixture(scenario: scenario)
            _model = StateObject(wrappedValue: NativeStartupModel(checker: fixture))
            _loginModel = StateObject(wrappedValue: NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture))
            _savedLogin = StateObject(wrappedValue: NativeSavedLoginModel(vault: NativeBiometricLoginVault(enabled: false)))
            _address = State(initialValue: "https://example.invalid")
            _domain = State(initialValue: "localhost")
            fixtureName = scenario
            return
        }
        #endif
        _model = StateObject(wrappedValue: NativeStartupModel())
        _loginModel = StateObject(wrappedValue: NativeLoginModel())
        _savedLogin = StateObject(wrappedValue: NativeSavedLoginModel(vault: NativeBiometricLoginVault()))
        fixtureName = nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Image("TeleTypTelLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 300)
                        .accessibilityLabel("TeleTypTel")
                        .frame(maxWidth: .infinity)
                    Text("Native iPhone- en iPad-app")
                        .font(.title2.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("Ontwikkelversie: XMPP-aanmelding, contacten, één-op-één tekstchat en native inkomende en uitgaande Total Conversation. Pushmeldingen en opgeslagen geschiedenis volgen nog.")
                        .foregroundStyle(.secondary)
                    if fixtureName != nil {
                        Text("TESTSCENARIO — geen echte serververbinding")
                            .font(.headline)
                            .accessibilityIdentifier("fixture-banner")
                    }
                    if savedLogin.hasSavedLogin {
                        VStack(alignment: .leading, spacing: 12) {
                            if !loginModel.isConnected {
                                Button("Aanmelden met Face ID of Touch ID", action: unlockSavedLogin)
                                    .buttonStyle(.borderedProminent)
                                    .disabled(loginModel.isWorking || savedLogin.isWorking)
                                    .accessibilityIdentifier("biometric-login")
                            }
                            Button("Bewaarde aanmelding verwijderen", role: .destructive) {
                                savedLogin.forget()
                                rememberLogin = false
                            }
                            .disabled(savedLogin.isWorking)
                            .accessibilityIdentifier("forget-saved-login")
                        }
                    }
                    if savedLogin.isWorking { ProgressView("Face ID of Touch ID…") }
                    if let notice = savedLogin.notice {
                        Text(notice).font(.footnote).accessibilityIdentifier("saved-login-status")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Serveradres (HTTPS)")
                        TextField("https://chat.teletyptel.nl", text: $address)
                            .textContentType(.URL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Serveradres, HTTPS")
                            .accessibilityIdentifier("server-address")
                            .disabled(loginModel.isWorking || loginModel.isConnected)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("XMPP-domein")
                        TextField("Bijvoorbeeld localhost voor de lokale testserver", text: $domain)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("XMPP-domein")
                            .accessibilityIdentifier("xmpp-domain")
                            .disabled(loginModel.isWorking || loginModel.isConnected)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        if model.state.phase == .checking || loginModel.isWorking {
                            ProgressView("Verbinding voorbereiden…")
                                .tint(.blue)
                        }
                        Text(statusText)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("startup-status")
                        if let callStatusText = callStatusText {
                            Text(callStatusText)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .accessibilityIdentifier("call-status")
                        }
                        if loginModel.isWorking || loginModel.isConnected {
                            Button(loginModel.isConnected ? "Verbinding verbreken" : "Aanmelding annuleren") {
                                password = ""
                                savedLogin.forget()
                                rememberLogin = false
                                loginModel.disconnect()
                            }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("disconnect-session")
                        } else if model.state.phase == .checking {
                            Button("Annuleren", action: model.cancel)
                                .frame(minHeight: 44)
                        } else {
                            Button("Verbinding controleren") {
                                loginModel.reset()
                                model.check(address: address, domain: domain)
                            }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                                .accessibilityIdentifier("check-connection")
                                .disabled(address.isEmpty || domain.isEmpty)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                    if loginModel.isConnected {
                        contactsView
                    }
                    if model.state.phase == .available && !loginModel.isConnected {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Aanmelden")
                                .font(.headline)
                                .accessibilityAddTraits(.isHeader)
                            Text("XMPP-account (naam@domein)")
                            TextField("naam@localhost", text: $jid)
                                .textContentType(.username)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .textFieldStyle(.roundedBorder)
                                .accessibilityLabel("XMPP-account")
                                .accessibilityIdentifier("login-jid")
                                .disabled(loginModel.isWorking || loginModel.isConnected)
                            Text("Wachtwoord")
                            SecureField("Wachtwoord", text: $password)
                                .textContentType(.password)
                                .textFieldStyle(.roundedBorder)
                                .accessibilityLabel("Wachtwoord")
                                .accessibilityIdentifier("login-password")
                                .disabled(loginModel.isWorking || loginModel.isConnected)
                            Toggle("Automatisch aanmelden met Face ID of Touch ID", isOn: $rememberLogin)
                                .accessibilityIdentifier("remember-biometric-login")
                                .disabled(loginModel.isWorking || savedLogin.isWorking)
                            Text("Optioneel: bewaar je aanmelding alleen op dit apparaat, beschermd met Face ID of Touch ID. Bij openen vraagt iOS om ontgrendeling. Uitloggen verwijdert deze aanmelding.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Button("Aanmelden") {
                                let submittedPassword = password
                                password = ""
                                savedLogin.prepare(address: address, domain: domain,
                                    jid: jid.trimmingCharacters(in: .whitespacesAndNewlines),
                                    password: submittedPassword, consented: rememberLogin && fixtureName == nil)
                                loginModel.login(address: address, domain: domain,
                                                 jid: jid.trimmingCharacters(in: .whitespacesAndNewlines), password: submittedPassword)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .accessibilityIdentifier("login-account")
                            .disabled(loginModel.isWorking || loginModel.isConnected || savedLogin.isWorking || jid.isEmpty || password.isEmpty)
                        }
                    }
                    Text("Aanmelden gebruikt het ingevulde HTTPS-adres. Zonder toestemming blijven inloggegevens alleen in het werkgeheugen. Biometrisch aanmelden bewaart ze in de beveiligde iOS-sleutelhanger, niet in iCloud. Alleen ‘Bericht verzenden’ stuurt jouw tekst. Pushmeldingen, Google/Facebook en tweestapsverificatie zijn hier nog niet aangesloten.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: 560)
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("TeleTypTel Native")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
        }
        .sheet(item: $selectedContact) { contact in
            NativeChatView(model: loginModel, calls: calls, contact: contact)
        }
        .fullScreenCover(isPresented: Binding(
            get: { calls.presentation != nil },
            set: { visible in if !visible { calls.endCall() } }
        )) {
            NativeTotalConversationView(controller: calls)
        }
        .onAppear { calls.attach(loginModel) }
        .task {
            if fixtureName == nil, savedLogin.canRestoreAutomatically, !loginModel.isWorking, !loginModel.isConnected {
                unlockSavedLogin()
            }
        }
        .onChange(of: address) { _ in resetConfiguration() }
        .onChange(of: domain) { _ in resetConfiguration() }
        .onChange(of: jid) { _ in
            if !matchesRestoredInput { savedLogin.cancel(); loginModel.reset() }
        }
        .onChange(of: loginModel.phase) { phase in
            calls.synchronize(phase)
            if case .connected(let account) = phase { savedLogin.connected(jid: account) }
            else if case .failed = phase { savedLogin.cancel() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                password = ""
                savedLogin.cancel()
                model.cancel()
                background.enter(loginModel)
            } else if phase == .active {
                background.returnToForeground(loginModel)
            }
        }
        .onDisappear {
            password = ""
            savedLogin.cancel()
            model.cancel()
            background.stop()
            calls.detach()
            loginModel.suspend()
        }
    }

    private func resetConfiguration() {
        guard !matchesRestoredInput else { return }
        restoredInput = nil
        savedLogin.cancel()
        password = ""
        model.reset()
        loginModel.reset()
    }

    private var matchesRestoredInput: Bool {
        guard let restored = restoredInput else { return false }
        return address == restored.address && domain == restored.domain && jid == restored.jid
    }

    private func unlockSavedLogin() {
        savedLogin.unlock { value in
            guard scenePhase == .active, !loginModel.isWorking, !loginModel.isConnected else { return }
            restoredInput = RestoredInput(address: value.address, domain: value.domain, jid: value.jid)
            address = value.address
            domain = value.domain
            jid = value.jid
            password = ""
            loginModel.login(address: value.address, domain: value.domain, jid: value.jid, password: value.password)
        }
    }

    private var contactsView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Contacten")
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)
            Text("Kies een contact om te chatten. De status komt van XMPP; onbekend betekent niet offline. Groepsgesprekken volgen later.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            switch loginModel.roster {
            case .idle, .loading:
                ProgressView("Contacten ophalen…")
            case .unavailable:
                Text("Contacten konden niet worden opgehaald. Je XMPP-verbinding kan nog actief zijn. Verbreek de verbinding en meld opnieuw aan om het opnieuw te proberen.")
                    .accessibilityIdentifier("contacts-error")
            case .ready(let contacts):
                if contacts.isEmpty {
                    Text("Nog geen contacten in je XMPP-contactenlijst.")
                        .accessibilityIdentifier("contacts-empty")
                }
                ForEach(contacts) { contact in
                    HStack(spacing: 8) {
                        Button { selectedContact = contact } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "person.crop.circle")
                                    .font(.title2)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(contact.displayName).font(.headline)
                                    Text(contact.jid).font(.subheadline)
                                    Text(contact.presence.label)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    if !contact.groups.isEmpty {
                                        Text(contact.groups.joined(separator: ", "))
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("contact-" + contact.jid)
                        }
                        .buttonStyle(.plain)
                        Menu {
                            Button { calls.startCall(contact, profile: .audio) } label: {
                                Label("Spraak", systemImage: "phone.fill")
                            }
                            Button { calls.startCall(contact, profile: .video) } label: {
                                Label("Spraak en video", systemImage: "video.fill")
                            }
                            Button { calls.startCall(contact, profile: .audioRtt) } label: {
                                Label("Spraak en realtime tekst", systemImage: "teletype")
                            }
                            Button { calls.startCall(contact, profile: .total) } label: {
                                Label("Totale conversatie", systemImage: "person.wave.2.fill")
                            }
                        } label: {
                            Image(systemName: "phone.arrow.up.right.fill")
                                .font(.title3)
                                .frame(width: 44, height: 44)
                        }
                        .disabled(contact.callEndpoint == nil || calls.status != .idle)
                        .accessibilityLabel(contact.callEndpoint == nil
                            ? "Oproepen niet beschikbaar voor \(contact.displayName)"
                            : "Bel \(contact.displayName)")
                    }
                    .padding()
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private var statusText: String {
        switch loginModel.phase {
        case .idle: break
        case .checking: return "Chatserver opnieuw controleren voordat je inloggegevens worden verstuurd…"
        case .authenticating: return "Account controleren… Je bent nog niet verbonden met XMPP."
        case .connecting: return "Account goedgekeurd. Beveiligde XMPP-aanmelding voltooien…"
        case .connected(let account): return "XMPP verbonden als \(account). Kies een contact om te chatten."
        case .signedOut: return "De XMPP-verbinding is verbroken. Je kunt opnieuw aanmelden."
        case .suspended: return "De verbinding is gepauzeerd op de achtergrond. Een aangemelde sessie verbindt opnieuw zodra je terugkeert. Pushoproepen zijn hier nog niet aangesloten."
        case .failed(let failure):
            switch failure {
            case .account(.invalidCredentials): return "Aanmelden mislukt. Controleer je XMPP-account en wachtwoord."
            case .account(.twoFactorRequired): return "Tweestapsverificatie vereist. Deze native preview ondersteunt de verificatiestap nog niet. Gebruik voorlopig de bestaande app; schakel tweestapsverificatie niet uit."
            case .account(.rejected): return "De server heeft de aanmelding geweigerd. Controleer je accounttoegang."
            case .account(.invalidResponse): return "De accountserver geeft geen geldige aanmeldreactie. Er is geen XMPP-verbinding gestart."
            case .connection(let error): return connectionError(error)
            case .xmpp(.unsupportedAuthentication): return "Deze XMPP-server biedt geen ondersteunde aanmeldmethode voor deze preview."
            case .xmpp(.authenticationRejected): return "De XMPP-server heeft je aanmelding geweigerd."
            case .xmpp(.bindingRejected): return "De XMPP-server kon deze accountsessie niet bevestigen."
            case .xmpp(.streamClosed): return "De XMPP-server heeft de verbinding gesloten. Meld opnieuw aan."
            case .xmpp(.heartbeatTimeout): return "De XMPP-server reageert niet meer. De verbinding is gestopt; meld opnieuw aan."
            }
        }
        switch model.state.phase {
        case .idle:
            return "Vul het bekende serveradres en XMPP-domein in. De controle start alleen wanneer je op de knop drukt."
        case .checking:
            return "Beveiligde XMPP-verbinding controleren. Dit duurt maximaal acht seconden."
        case .available:
            return "De XMPP-server is bereikbaar. Je bent nog niet ingelogd. Vul je XMPP-account in om aan te melden."
        case .cancelled:
            return "De controle is gestopt. Je kunt deze opnieuw starten."
        case .failed(let failure):
            return connectionError(failure)
        }
    }

    private var callStatusText: String? {
        switch calls.status {
        case .idle: return nil
        case .calling(let peer): return "Total Conversation-oproep naar \(peer) wordt opgebouwd."
        case .ringing: return "Inkomende Total Conversation-oproep. Neem op of weiger via het systeemscherm."
        case .active: return "Total Conversation is verbonden."
        case .failed: return "De oproep kon niet veilig worden voorbereid. Probeer opnieuw."
        }
    }

    private func connectionError(_ failure: ConnectionFailure) -> String {
        switch failure {
            case .configuration:
                return "Gebruik een HTTPS-serveradres zonder pad, gebruikersnaam of parameters en een geldig XMPP-domein."
            case .certificate:
                return "De beveiligde verbinding kon niet worden geverifieerd. Controleer het certificaat en datum/tijd. Vertrouw geen onbekend certificaat."
            case .timeout:
                return "De chatserver reageert niet op tijd. Controleer je netwerk en probeer opnieuw."
            case .offline:
                return "De chatserver is niet bereikbaar. Controleer je netwerk en probeer opnieuw."
            case .protocolMismatch, .invalidResponse:
                return "De server geeft geen geldige XMPP-aanmeldreactie. Laat de serverconfiguratie controleren."
            case .redirectRejected:
                return "De server verwijst naar een ander adres. Deze omleiding is geblokkeerd; controleer het serveradres."
        }
    }
}

#if DEBUG
private struct NativeLoginUIFixture: ServerChecking, NativeAccountAuthenticating, NativeXMPPConnecting {
    let scenario: String

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws {
        onSender(NativeChatUIFixture())
        onChat(.message(peer: "demo-contact@localhost", identifier: "fixture-greeting", body: "Fictief ontvangen bericht"))
        try await run(account: account, onConnected: onConnected, onRoster: onRoster)
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws {
        onRoster(.ready([NativeContact(jid: "demo-contact@localhost", name: "Fictief testcontact",
                                       groups: ["Testcontacten"], subscription: "both", presence: .online)]))
        try await run(account: account, onConnected: onConnected)
    }

    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport {
        guard configuration.origin.host == "example.invalid", configuration.domain == "localhost" else {
            throw ConnectionFailure.configuration
        }
        try await Task.sleep(nanoseconds: 150_000_000)
        return ProbeReport(mechanisms: ["PLAIN"])
    }

    func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        try await Task.sleep(nanoseconds: 150_000_000)
        guard jid == "fixture@localhost", password == "fixture-password" else {
            throw NativeAccountFailure.invalidCredentials
        }
        if scenario == "two-factor" { throw NativeAccountFailure.twoFactorRequired }
        return NativeAuthenticatedAccount(configuration: configuration, jid: jid, password: password)
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        try await Task.sleep(nanoseconds: 150_000_000)
        onConnected(account.jid + "/ui-fixture")
        if scenario == "disconnect" {
            try await Task.sleep(nanoseconds: 3_000_000_000)
            throw XMPPSessionFailure.heartbeatTimeout
        }
        while !Task.isCancelled { try await Task.sleep(nanoseconds: 60_000_000_000) }
        throw CancellationError()
    }
}

private struct NativeChatUIFixture: NativeChatSending {
    func sendMessage(to jid: String, body: String, identifier: String) async throws {
        guard jid == "demo-contact@localhost", !body.isEmpty else { throw NativeChatFailure.invalidMessage }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
}
#endif
