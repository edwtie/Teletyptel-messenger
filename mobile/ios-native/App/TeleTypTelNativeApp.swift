import SwiftUI

@main
struct TeleTypTelNativeApp: App {
    @AppStorage("teletyptel.native.interfaceLanguage") private var language = "system"
    @UIApplicationDelegateAdaptor(NativeProviderAppDelegate.self) private var providerDelegate
    var body: some Scene {
        WindowGroup {
            NativeStartupView().font(NativeWebStyle.font()).tint(NativeWebStyle.accent)
                .environment(\.locale, language == "nl" || language == "en" ? Locale(identifier: language) : .current)
        }
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
    private enum LoginFocus: Hashable { case account, password, code }
    @FocusState private var loginFocus: LoginFocus?
    private struct RestoredInput {
        let address: String
        let domain: String
        let jid: String
    }
    @StateObject private var model: NativeStartupModel
    @StateObject private var settingsModel: NativeStartupModel
    @StateObject private var loginModel: NativeLoginModel
    @StateObject private var savedLogin: NativeSavedLoginModel
    @StateObject private var background = NativeBackgroundController()
    @StateObject private var calls = NativeCallController.shared
    @StateObject private var translation = NativeTranslationModel()
    @StateObject private var providerSDK = NativeProviderSDK()
    @State private var selectedContact: NativeContact?
    @State private var showMessenger = false
    @State private var preparingStartup = true
    @Environment(\.scenePhase) private var scenePhase
    @State private var address = ""
    @State private var domain = ""
    @State private var jid = ""
    @State private var password = ""
    @State private var verificationCode = ""
    @State private var rememberLogin = false
    @State private var showRegistration = false
    @State private var showRecovery = false
    @State private var showLoginSettings = false
    @State private var advancedServerSettings = false
    @State private var advancedFailureDetails = false
    @State private var settingsAddress = ""
    @State private var settingsDomain = ""
    @AppStorage("teletyptel.native.interfaceLanguage") private var interfaceLanguage = "system"
    @StateObject private var messageNotifications = NativeMessageNotifications.shared
    @State private var restoredInput: RestoredInput?
    private let fixtureName: String?

    init() {
        #if DEBUG
        if let scenario = ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_UI_FIXTURE"],
           ["connected", "two-factor", "disconnect", "invitations"].contains(scenario) {
            let fixture = NativeLoginUIFixture(scenario: scenario)
            _model = StateObject(wrappedValue: NativeStartupModel(checker: fixture))
            _settingsModel = StateObject(wrappedValue: NativeStartupModel(checker: fixture))
            _loginModel = StateObject(wrappedValue: NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture,
                reconnectWait: { _ in try await Task.sleep(nanoseconds: 2_000_000_000) }))
            _savedLogin = StateObject(wrappedValue: NativeSavedLoginModel(vault: NativeBiometricLoginVault(enabled: false)))
            _address = State(initialValue: "https://example.invalid")
            _domain = State(initialValue: "localhost")
            fixtureName = scenario
            return
        }
        #endif
        _model = StateObject(wrappedValue: NativeStartupModel())
        _settingsModel = StateObject(wrappedValue: NativeStartupModel())
        _loginModel = StateObject(wrappedValue: NativeLoginModel(history: NativeDeviceHistory()))
        _savedLogin = StateObject(wrappedValue: NativeSavedLoginModel(vault: NativeBiometricLoginVault()))
        let server = NativeServerDefaults.resolve(
            savedAddress: UserDefaults.standard.string(forKey: "teletyptel.native.serverAddress"),
            savedDomain: UserDefaults.standard.string(forKey: "teletyptel.native.xmppDomain"))
        _address = State(initialValue: server.address)
        _domain = State(initialValue: server.domain)
        fixtureName = nil
    }

    private var startupContent: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !showsServerStatusScreen {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Aanmelden")
                        .font(NativeWebStyle.font(28, weight: .bold))
                        .accessibilityAddTraits(.isHeader)
                    Text("Gebruik je XMPP-account om je aan te melden bij TeleTypTel.")
                        .foregroundStyle(NativeWebStyle.muted)
                }
                .frame(maxWidth: 560, alignment: .leading).padding(20)
                }
                NativeStartupProgress(isActive: startupIsBusy)
                ScrollView {
                  VStack(alignment: .leading, spacing: 18) {
                    if fixtureName != nil {
                        Text("TESTSCENARIO — geen echte serververbinding")
                            .font(.headline)
                            .accessibilityIdentifier("fixture-banner")
                    }
                    if showsServerStatusScreen {
                        serverStatusPanel
                    } else {
                    if savedLogin.hasSavedLogin {
                        VStack(alignment: .leading, spacing: 12) {
                            if !loginModel.isConnected {
                                Button("Aanmelden met Face ID of Touch ID", action: unlockSavedLogin)
                                    .buttonStyle(.borderedProminent).tint(NativeWebStyle.accent).foregroundStyle(.white)
                                    .disabled(loginModel.isWorking || loginModel.isSecondFactorPending || savedLogin.isWorking)
                                    .accessibilityIdentifier("biometric-login")
                            }
                        }
                    }
                    if let notice = savedLogin.notice {
                        Text(notice).font(.footnote).accessibilityIdentifier("saved-login-status")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(LocalizedStringKey(statusText))
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("startup-status")
                        if let callStatusText = callStatusText {
                            Text(callStatusText)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .accessibilityIdentifier("call-status")
                        }
                        if loginModel.isWorking || loginModel.isConnected || loginModel.isSecondFactorPending {
                            Button(loginModel.isConnected ? "Verbinding verbreken" : "Aanmelding annuleren") {
                                password = ""
                                verificationCode = ""
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
                                .accessibilityIdentifier("startup-cancel-check")
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NativeWebStyle.incoming, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(NativeWebStyle.line, lineWidth: 1).allowsHitTesting(false))
                    if loginModel.isSecondFactorPending {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Tweestapsverificatie").font(.headline).accessibilityAddTraits(.isHeader)
                            Text("Vul de zes cijfers uit je authenticator-app in. Deze aanmeldpoging vervalt na vijf minuten.")
                            SecureField("Verificatiecode", text: $verificationCode)
                                .focused($loginFocus, equals: .code)
                                .textContentType(.oneTimeCode)
                                .keyboardType(.numberPad)
                                .textFieldStyle(.roundedBorder)
                                .accessibilityLabel("Zescijferige verificatiecode")
                                .accessibilityIdentifier("two-factor-code")
                                .disabled(!loginModel.isAwaitingSecondFactor)
                            if let error = loginModel.twoFactorError {
                                Text(error).foregroundStyle(.red).accessibilityIdentifier("two-factor-error")
                            }
                            Button("Code bevestigen") {
                                let code = verificationCode
                                verificationCode = ""
                                loginModel.verifySecondFactor(code: code)
                            }
                            .buttonStyle(.borderedProminent).tint(NativeWebStyle.accent).foregroundStyle(.white)
                            .accessibilityIdentifier("two-factor-verify")
                            .disabled(!loginModel.isAwaitingSecondFactor || verificationCode.range(of: #"\A[0-9]{6}\z"#, options: .regularExpression) == nil)
                        }
                    }
                    if !loginModel.isConnected && !loginModel.isSecondFactorPending {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Account")
                            TextField("naam@localhost", text: $jid)
                                .focused($loginFocus, equals: .account)
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
                                .focused($loginFocus, equals: .password)
                                .textContentType(.password)
                                .textFieldStyle(.roundedBorder)
                                .accessibilityLabel("Wachtwoord")
                                .accessibilityIdentifier("login-password")
                                .disabled(loginModel.isWorking || loginModel.isConnected)
                            Button("Wachtwoord vergeten?") { showRecovery = true }
                                .disabled(loginModel.isWorking || !hasServerConfiguration)
                            HStack(spacing: 16) {
                                providerButton(.google, title: "Google")
                                providerButton(.facebook, title: "Facebook")
                            }.frame(maxWidth: .infinity).padding(.vertical, 4)
                            Toggle("Account bewaren", isOn: $rememberLogin)
                                .accessibilityIdentifier("remember-biometric-login")
                                .accessibilityHint("Bewaar je aanmelding alleen op dit apparaat, beschermd met Face ID of Touch ID.")
                                .disabled(loginModel.isWorking || savedLogin.isWorking)
                            if rememberLogin {
                                Text("Beveiligd met Face ID of Touch ID.").font(.footnote).foregroundStyle(NativeWebStyle.muted)
                            }
                        }
                    }
                    }
                  }
                .frame(maxWidth: 560)
                .padding(20)
                .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                if !showsServerStatusScreen { loginActions }
            }
            .background(NativeWebStyle.panel).foregroundStyle(NativeWebStyle.text)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var startupIsBusy: Bool {
        preparingStartup || model.state.phase == .checking || loginModel.isWorking || savedLogin.isWorking
    }

    private var hasServerConfiguration: Bool {
        (try? ServerConfiguration(address: address, domain: domain)) != nil
    }

    private var serverFailure: ConnectionFailure? {
        if case .failed(.connection(let failure)) = loginModel.phase { return failure }
        if case .failed(.xmpp(.streamClosed)) = loginModel.phase { return .offline }
        if case .failed(.xmpp(.heartbeatTimeout)) = loginModel.phase { return .timeout }
        if case .failed(let failure) = model.state.phase { return failure }
        return nil
    }

    private var showsServerStatusScreen: Bool {
        serverFailure != nil || model.state.phase == .checking && !showLoginSettings
    }

    private var serverStatusPanel: some View {
        VStack(spacing: 18) {
            Image("TeleTypTelLogo").resizable().scaledToFit().frame(maxWidth: 240, maxHeight: 60)
                .accessibilityLabel("TeleTypTel")
            Text(LocalizedStringKey(serverStatusTitle)).font(NativeWebStyle.font(22, weight: .bold))
                .accessibilityAddTraits(.isHeader).accessibilityIdentifier("startup-failure-title")
            Text(LocalizedStringKey(serverStatusMessage)).multilineTextAlignment(.center)
                .foregroundStyle(NativeWebStyle.muted).accessibilityIdentifier("startup-status")
            if model.state.phase == .checking {
                Button(action: model.cancel) { Text("Annuleren").frame(minHeight: 44) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("startup-cancel-check")
            } else {
                Button(action: retryServerAvailability) {
                    Text("Opnieuw proberen").frame(maxWidth: .infinity, minHeight: 44)
                }
                    .buttonStyle(.borderedProminent).tint(NativeWebStyle.accent).foregroundStyle(.white)
                    .disabled(startupIsBusy || !hasServerConfiguration)
                    .accessibilityIdentifier("startup-retry")
                Button { advancedFailureDetails.toggle() } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .buttonStyle(NativeWebIconStyle())
                .accessibilityLabel("Geavanceerd").help("Geavanceerd")
                .accessibilityValue(Text(LocalizedStringKey(advancedFailureDetails ? "Uitgeklapt" : "Ingeklapt")))
                .accessibilityIdentifier("startup-advanced")
                if advancedFailureDetails {
                    if let failure = serverFailure {
                        Text(LocalizedStringKey(connectionError(failure))).font(.footnote)
                            .accessibilityIdentifier("startup-technical-details")
                    }
                    Button { openLoginSettings(advanced: true) } label: { Label("Serverinstellingen", systemImage: "gearshape") }
                        .frame(minHeight: 44).accessibilityIdentifier("login-settings")
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 300)
        .accessibilityElement(children: .contain).accessibilityIdentifier("startup-server-status")
    }

    private var serverStatusTitle: String {
        if model.state.phase == .checking { return "Verbinding controleren…" }
        switch serverFailure {
        case .certificate: return "Beveiligde verbinding mislukt"
        case .configuration: return "Verbinding niet ingesteld"
        case .offline, .timeout: return "Server niet bereikbaar"
        default: return "Verbinding mislukt"
        }
    }

    private var serverStatusMessage: String {
        if model.state.phase == .checking { return "De verbinding met TeleTypTel wordt gecontroleerd." }
        switch serverFailure {
        case .certificate: return "De beveiliging van de server kon niet worden gecontroleerd. Vertrouw geen onbekend certificaat. Neem contact op met de beheerder."
        case .configuration: return "De verbinding kan met deze instellingen niet worden gestart. Neem contact op met de beheerder."
        case .offline, .timeout: return "Controleer je internetverbinding en probeer het opnieuw."
        default: return "De verbinding met TeleTypTel is niet gelukt. Probeer het later opnieuw."
        }
    }

    private func retryServerAvailability() {
        guard hasServerConfiguration, !startupIsBusy, !loginModel.isConnected, !loginModel.isSecondFactorPending else { return }
        loginFocus = nil
        password = ""
        verificationCode = ""
        advancedFailureDetails = false
        loginModel.reset()
        model.check(address: address, domain: domain)
    }

    private func openLoginSettings(advanced: Bool = false) {
        loginFocus = nil
        settingsModel.reset()
        settingsAddress = address
        settingsDomain = domain
        advancedServerSettings = advanced
        showLoginSettings = true
    }

    private var loginActions: some View {
        VStack(spacing: 12) {
            NativeWebStyle.line.frame(height: 1).accessibilityHidden(true)
            VStack(spacing: 10) {
                Button(action: submitLogin) { Text("Aanmelden").frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(.borderedProminent).tint(NativeWebStyle.accent).foregroundStyle(.white)
                    .accessibilityIdentifier("login-account")
                    .disabled(!hasServerConfiguration || loginModel.isWorking || loginModel.isConnected || loginModel.isSecondFactorPending || savedLogin.isWorking || jid.isEmpty || password.isEmpty)
                HStack(spacing: 12) {
                    Button { showRegistration = true } label: { Text("Nieuwe gebruiker").frame(maxWidth: .infinity, minHeight: 40) }
                        .buttonStyle(.bordered)
                        .disabled(!hasServerConfiguration || loginModel.isWorking || loginModel.isSecondFactorPending)
                    Button { openLoginSettings() } label: { Image(systemName: "gearshape") }
                        .buttonStyle(NativeWebIconStyle())
                        .accessibilityLabel("Instellingen")
                        .accessibilityIdentifier("login-settings")
                        .disabled(loginModel.isWorking || loginModel.isSecondFactorPending || savedLogin.isWorking)
                }
            }.frame(maxWidth: 560).padding(.horizontal, 20).padding(.bottom, 12)
        }.frame(maxWidth: .infinity).background(NativeWebStyle.panel)
            .accessibilityElement(children: .contain).accessibilityIdentifier("login-actions")
    }

    private var loginSettings: some View {
        NavigationStack {
            Form {
                Section {
                  Button { advancedServerSettings.toggle() } label: {
                    Image(systemName: "slider.horizontal.3")
                  }
                  .buttonStyle(NativeWebIconStyle())
                  .accessibilityLabel("Geavanceerd").help("Geavanceerd")
                  .accessibilityValue(Text(LocalizedStringKey(advancedServerSettings ? "Uitgeklapt" : "Ingeklapt")))
                  .accessibilityIdentifier("login-advanced-settings")
                   if advancedServerSettings {
                    Text("Wijzig de serverinstellingen alleen als je weet welke server je nodig hebt. Verkeerde instellingen kunnen aanmelden verhinderen.")
                        .font(.footnote)
                    TextField("Serveradres (HTTPS)", text: $settingsAddress)
                        .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("Serveradres, HTTPS").accessibilityIdentifier("server-address")
                    TextField("XMPP-domein", text: $settingsDomain)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("XMPP-domein").accessibilityIdentifier("xmpp-domain")
                    Button("Verbinding controleren") {
                        settingsModel.check(address: settingsAddress, domain: settingsDomain)
                    }.accessibilityIdentifier("check-connection")
                        .disabled(settingsAddress.isEmpty || settingsDomain.isEmpty || settingsModel.state.phase == .checking)
                    NativeStartupProgress(isActive: settingsModel.state.phase == .checking, identifier: "settings-startup-progress")
                    Text(LocalizedStringKey(settingsStatusText)).accessibilityIdentifier("settings-startup-status")
                    if !providerSDK.configured(.google) || !providerSDK.configured(.facebook) {
                        Text("Google/Facebook vereisen providerinstellingen voor de bundle-ID van deze native build. De bestaande web- en TestFlight-aanmelding blijft ongewijzigd.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                   }
                }
                Section("Taal") {
                    Picker("App-taal", selection: $interfaceLanguage) {
                        Text("Systeemtaal").tag("system")
                        Text("Nederlands").tag("nl")
                        Text("Engels").tag("en")
                    }.accessibilityIdentifier("login-interface-language")
                }
                Section("Privacy") {
                    if savedLogin.hasSavedLogin {
                        Button("Bewaarde aanmelding verwijderen", role: .destructive) {
                            savedLogin.forget()
                            rememberLogin = false
                        }.disabled(savedLogin.isWorking).accessibilityIdentifier("forget-saved-login")
                    }
                    Text("Optioneel: bewaar je aanmelding alleen op dit apparaat, beschermd met Face ID of Touch ID. Bij openen vraagt iOS om ontgrendeling. Uitloggen verwijdert deze aanmelding.")
                    Text("De app-taal staat los van berichtvertaling; een taal kiezen geeft geen toestemming om berichten extern te vertalen.")
                }
            }
            .modifier(NativeWebForm())
            .navigationTitle("Instellingen")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(LocalizedStringKey(advancedServerSettings ? "Annuleren" : "Sluiten")) { settingsModel.cancel(); showLoginSettings = false }.accessibilityIdentifier("login-settings-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    if advancedServerSettings {
                      Button("Bewaren") { saveLoginSettings(dismiss: true) }
                        .accessibilityIdentifier("login-settings-save")
                        .disabled((try? ServerConfiguration(address: settingsAddress, domain: settingsDomain)) == nil || settingsModel.state.phase == .checking)
                    }
                }
            }
        }
    }

    private func saveLoginSettings(dismiss: Bool) {
        guard advancedServerSettings, !loginModel.isWorking, !loginModel.isSecondFactorPending,
              (try? ServerConfiguration(address: settingsAddress, domain: settingsDomain)) != nil else { return }
        address = settingsAddress
        domain = settingsDomain
        if fixtureName == nil {
            UserDefaults.standard.set(address, forKey: "teletyptel.native.serverAddress")
            UserDefaults.standard.set(domain, forKey: "teletyptel.native.xmppDomain")
        }
        if dismiss { showLoginSettings = false }
    }

    private func submitLogin() {
        guard hasServerConfiguration, !loginModel.isWorking, !loginModel.isSecondFactorPending else { return }
        loginFocus = nil
        let submittedPassword = password
        password = ""
        savedLogin.prepare(address: address, domain: domain,
            jid: jid.trimmingCharacters(in: .whitespacesAndNewlines),
            password: submittedPassword, consented: rememberLogin && fixtureName == nil)
        loginModel.login(address: address, domain: domain,
            jid: jid.trimmingCharacters(in: .whitespacesAndNewlines), password: submittedPassword)
    }

    var body: some View {
        Group {
            if showMessenger {
                NativeMessengerView(model: loginModel, calls: calls, translation: translation, logout: logout)
            } else { startupContent }
        }
        .background(NativeProviderPresenter(sdk: providerSDK).frame(width: 0, height: 0))
        .modifier(NativeAppearancePresentation())
        .environmentObject(calls.pushRegistration)
        .onOpenURL { providerSDK.handle($0) }
        .fullScreenCover(isPresented: Binding(
            get: { calls.presentation != nil },
            set: { visible in if !visible { calls.endCall() } }
        )) {
            NativeTotalConversationView(controller: calls, translation: translation)
        }
        .onAppear {
            calls.attach(loginModel)
            #if DEBUG
            if fixtureName == "connected" { calls.presentVisualFixture() }
            if fixtureName != nil, ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] != nil {
                model.check(address: address, domain: domain)
            }
            #endif
        }
        .task {
            restoreSavedLoginIfForeground()
            preparingStartup = false
        }
        .onChange(of: address) { _ in resetConfiguration() }
        .onChange(of: domain) { _ in resetConfiguration() }
        .onChange(of: jid) { _ in
            if !matchesRestoredInput { savedLogin.cancel(); loginModel.reset() }
        }
        .sheet(isPresented: $showRegistration) {
            if let configuration = try? ServerConfiguration(address: address, domain: domain) { NativeAccountEntryView(configuration: configuration, recovery: false) }
        }
        .sheet(isPresented: $showRecovery) {
            if let configuration = try? ServerConfiguration(address: address, domain: domain) { NativeAccountEntryView(configuration: configuration, recovery: true) }
        }
        .sheet(isPresented: $showLoginSettings, onDismiss: { settingsModel.reset() }) { loginSettings }
        .onAppear { messageNotifications.connect(loginModel) }
        .onReceive(loginModel.$chat) { _ in Task { @MainActor in messageNotifications.updateBadge() } }
        .onReceive(loginModel.groups.$rooms) { _ in Task { @MainActor in messageNotifications.updateBadge() } }
        .onChange(of: loginModel.phase) { phase in
            calls.synchronize(phase)
            if loginModel.isConnected { Task { await calls.synchronizePush() } }
            if case .connected(let account) = phase {
                showMessenger = true
                savedLogin.connected(jid: account)
                Task { await translation.connect(loginModel.activeWebSession, accountID: loginModel.activeAccountID) }
            }
            else if case .failed = phase {
                showMessenger = false
                verificationCode = ""
                savedLogin.cancel()
            }
            if phase == .signedOut || phase == .idle { showMessenger = false; messageNotifications.clear() }
            if case .failed = phase { messageNotifications.clear() }
            if !loginModel.isConnected { translation.detach() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                password = ""
                verificationCode = ""
                savedLogin.cancel()
                model.cancel()
                settingsModel.cancel()
                calls.setForeground(false)
                calls.backgroundCallEnded = { [weak loginModel, weak background] in
                    guard let loginModel = loginModel else { return }
                    background?.enter(loginModel)
                }
                background.enter(loginModel, keepingCall: calls.hasLiveCall)
            } else if phase == .active {
                calls.backgroundCallEnded = nil
                calls.setForeground(true)
                background.returnToForeground(loginModel)
                restoreSavedLoginIfForeground()
            }
        }
        .onDisappear {
            password = ""
            verificationCode = ""
            savedLogin.cancel()
            model.cancel()
            background.stop()
            if !calls.hasLiveCall { calls.detach() }
            loginModel.suspend()
        }
    }

    private func logout() {
        calls.pushRegistration.logout()
        password = ""
        verificationCode = ""
        savedLogin.forget()
        rememberLogin = false
        translation.detach()
        loginModel.disconnect()
    }

    private func providerButton(_ provider: NativeIdentityProvider, title: String) -> some View {
        Button {
            loginFocus = nil
            password = ""
            savedLogin.cancel()
            loginModel.loginSocial(address: address, domain: domain, provider: provider, signer: providerSDK)
        } label: {
            Image(provider == .google ? "NativeGoogleSignIn" : "NativeFacebookSignIn")
                .resizable().scaledToFit().frame(width: 28, height: 28).frame(width: 52, height: 52)
        }
        .buttonStyle(NativeWebIconStyle(round: true))
        .accessibilityLabel(Text(provider == .google ? "Aanmelden met Google" : "Aanmelden met Facebook"))
        .disabled(!hasServerConfiguration || !providerSDK.configured(provider) || loginModel.isWorking || savedLogin.isWorking || loginModel.isSecondFactorPending)
        .accessibilityIdentifier("login-" + provider.rawValue)
    }

    private func resetConfiguration() {
        guard !matchesRestoredInput else { return }
        restoredInput = nil
        savedLogin.cancel()
        password = ""
        verificationCode = ""
        model.reset()
        loginModel.reset()
    }

    private var matchesRestoredInput: Bool {
        guard let restored = restoredInput else { return false }
        return address == restored.address && domain == restored.domain && jid == restored.jid
    }

    private func restoreSavedLoginIfForeground() {
        guard fixtureName == nil, scenePhase == .active, !calls.hasLiveCall,
              savedLogin.canRestoreAutomatically, !savedLogin.isWorking,
              !loginModel.isWorking, !loginModel.isConnected else { return }
        unlockSavedLogin()
    }

    private func unlockSavedLogin() {
        guard scenePhase == .active, !calls.hasLiveCall else { return }
        savedLogin.unlock { value in
            guard scenePhase != .background, !calls.hasLiveCall, !loginModel.isWorking, !loginModel.isConnected else { return }
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
                        .disabled(!calls.canCall(contact))
                        .accessibilityLabel(!calls.canCall(contact)
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
        if preparingStartup { return "App voorbereiden…" }
        if savedLogin.isWorking { return "Face ID of Touch ID…" }
        switch loginModel.phase {
        case .idle: break
        case .checking: return "Chatserver opnieuw controleren voordat je inloggegevens worden verstuurd…"
        case .authenticating: return "Account controleren… Je bent nog niet verbonden met XMPP."
        case .awaitingSecondFactor: return "Tweestapsverificatie vereist. Bevestig je authenticatorcode om verder te gaan. Je bent nog niet verbonden met XMPP."
        case .connecting: return "Account goedgekeurd. Beveiligde XMPP-aanmelding voltooien…"
        case .connected(let account): return "XMPP verbonden als \(account). Kies een contact om te chatten."
        case .signedOut: return "De XMPP-verbinding is verbroken. Je kunt opnieuw aanmelden."
        case .suspended: return "De verbinding is gepauzeerd op de achtergrond. Een aangemelde sessie verbindt opnieuw zodra je terugkeert. Pushoproepen zijn hier nog niet aangesloten."
        case .failed(let failure):
            switch failure {
            case .account(.invalidCredentials): return "Aanmelden mislukt. Controleer je XMPP-account en wachtwoord."
            case .account(.twoFactorRequired): return "Tweestapsverificatie vereist. De poging is verlopen of de server vraagt een niet-ondersteunde verificatiemethode. Meld opnieuw aan; schakel tweestapsverificatie niet uit."
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
        return probeStatusText
    }

    private var probeStatusText: String {
        probeStatus(model.state.phase)
    }

    private var settingsStatusText: String {
        probeStatus(settingsModel.state.phase)
    }

    private func probeStatus(_ phase: StartupState.Phase) -> String {
        switch phase {
        case .idle:
            return hasServerConfiguration ? "Meld je aan om verder te gaan." : "Stel de server in via Instellingen."
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
private actor NativeLoginUIConnectionCount {
    private var count = 0
    func next() -> Int { count += 1; return count }
}

private struct NativeLoginUIFixture: ServerChecking, NativeAccountChallenging, NativeXMPPConnecting {
    let scenario: String
    private let connections = NativeLoginUIConnectionCount()
    private let availabilityChecks = NativeLoginUIConnectionCount()

    init(scenario: String) { self.scenario = scenario }

    func begin(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAccountLoginStep {
        if scenario == "two-factor" {
            try await Task.sleep(nanoseconds: 150_000_000)
            guard jid == "fixture@localhost", password == "fixture-password" else {
                throw NativeAccountFailure.invalidCredentials
            }
            return .challenge(NativeSecondFactorUIFixture(account:
                NativeAuthenticatedAccount(configuration: configuration, jid: jid, password: password)))
        }
        return .authenticated(try await login(configuration: configuration, jid: jid, password: password))
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws {
        onSender(NativeChatUIFixture(includeInvitations: scenario == "invitations"))
        onChat(.message(peer: "demo-contact@localhost", identifier: "fixture-greeting", body: "Fictief ontvangen bericht"))
        try await run(account: account, onConnected: onConnected, onRoster: onRoster)
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws {
        let contactName = ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_LONG_CONTACT_NAME"] == "1"
            ? "Fictief testcontact met een bijzonder lange naam" : "Fictief testcontact"
        onRoster(.ready([NativeContact(jid: "demo-contact@localhost", name: contactName,
                                       groups: ["Testcontacten"], subscription: "both", presence: .online)]))
        try await run(account: account, onConnected: onConnected)
    }

    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport {
        guard configuration.origin.host == "example.invalid", configuration.domain == "localhost" else {
            throw ConnectionFailure.configuration
        }
        if ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] == "checking" {
            try await Task.sleep(nanoseconds: 300_000_000_000)
        }
        if ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] == "certificate" {
            throw ConnectionFailure.certificate
        }
        if ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] == "offline",
           await availabilityChecks.next() == 1 {
            throw ConnectionFailure.offline
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
        var account = NativeAuthenticatedAccount(configuration: configuration, jid: jid, password: password)
        account.accountID = "fixture-ui"
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [NativeFeatureFixture.self]
        account.webSession = NativeAccountWebSession(configuration: configuration, cookie: "PHPSESSID=fixture-session", settings: settings)
        return account
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        let connectionNumber = await connections.next()
        try await Task.sleep(nanoseconds: 150_000_000)
        onConnected(account.jid + "/ui-fixture")
        if scenario == "disconnect", connectionNumber == 1 {
            try await Task.sleep(nanoseconds: 3_000_000_000)
            throw XMPPSessionFailure.heartbeatTimeout
        }
        while !Task.isCancelled { try await Task.sleep(nanoseconds: 60_000_000_000) }
        throw CancellationError()
    }
}

private struct NativeChatUIFixture: NativeArchiveSending, NativeGroupManaging, NativeMessageChanging, NativeChatInteracting {
    func interact(to peer: String, interaction: NativeChatInteraction, identifier: String) async throws {
        _ = try NativeInteractionCodec.encode(to: peer, interaction: interaction, identifier: identifier)
    }
    func changeMessage(to peer: String, change: NativeMessageChange, identifier: String) async throws {
        _ = try NativeMessageActionCodec.encode(to: peer, change: change, identifier: identifier)
    }
    let includeInvitations: Bool
    func manageGroup(_ command: NativeGroupCommand) async throws -> NativeGroupReply {
        try await Task.sleep(nanoseconds: 100_000_000)
        switch command {
        case .discover: return .rooms([NativeDiscoveredRoom(room: "fixture@conference.localhost", name: "Fictieve testgroep")])
        case .configuration:
            return .configuration(NativeRoomConfiguration(name: "Fictieve testgroep", description: "Fictieve groep", membersOnly: true, moderated: false, publicRoom: false, persistent: true, allowInvites: true, fields: [:]))
        case .members: return .members(["demo-contact@localhost"])
        default: return .confirmed
        }
    }
    func createGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        try await joinGroup(room: room, nickname: nickname, onEvent: onEvent)
    }
    func setGroupSubject(room: String, subject: String) async throws { try await Task.sleep(nanoseconds: 100_000_000) }
    func observeGroupInvitations(_ observer: @escaping @Sendable (NativeGroupInvitationEvent) -> Void) async {
        guard includeInvitations else { return }
        for room in ["fixture@conference.localhost", "ignore@conference.localhost"] {
            observer(.invited(NativeGroupInvitation(id: UUID(), room: room, inviter: "demo-contact@localhost",
                replyTo: "demo-contact@localhost/device", requiresPassword: false, receivedAt: Date())))
        }
    }
    func inviteToGroup(room: String, peer: String, identifier: String) async throws {
        guard room == "fixture@conference.localhost", peer == "demo-contact@localhost" else { throw NativeGroupFailure.denied }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
    func declineGroupInvitation(_ invitation: NativeGroupInvitation) async throws {
        guard invitation.inviter == "demo-contact@localhost" else { throw NativeGroupFailure.denied }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        guard room == "fixture@conference.localhost", nickname == "Testnaam" else { throw NativeGroupFailure.denied }
        try await Task.sleep(nanoseconds: 100_000_000)
        onEvent(.snapshot(NativeGroupSnapshot(room: room, nickname: nickname, participants: [nickname, "Fictieve deelnemer"], canSpeak: true,
            ownRole: "moderator", ownAffiliation: "owner", occupants: [NativeGroupOccupant(nickname: nickname, role: "moderator", affiliation: "owner"), NativeGroupOccupant(nickname: "Fictieve deelnemer", role: "participant", affiliation: "member")])))
        onEvent(.message(NativeGroupText(id: UUID(), room: room, nickname: "Fictieve deelnemer", identifier: "fixture-welcome",
            archiveID: nil, body: "Fictief groepsbericht", date: Date(), own: false, state: .incoming)))
    }
    func sendGroup(room: String, body: String, identifier: String) async throws {
        guard room == "fixture@conference.localhost", !body.isEmpty else { throw NativeGroupFailure.denied }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
    func leaveGroup(room: String) async { }
    func fetchArchive(peer: String, before: String?) async throws -> NativeArchivePage {
        guard peer == "demo-contact@localhost", before == nil else { throw NativeArchiveFailure.unavailable }
        try await Task.sleep(nanoseconds: 100_000_000)
        let messages = [NativeArchivedText(archiveID: "ui-past-peer", identifier: "ui-past-peer", peer: peer,
            body: "Fictief eerder bericht", date: Date(timeIntervalSince1970: 1793528430), outgoing: false)]
        return NativeArchivePage(owner: "fixture@localhost", peer: peer, messages: messages, first: "ui-past-peer", hasEarlier: false)
    }

    func sendMessage(to jid: String, body: String, identifier: String) async throws {
        guard jid == "demo-contact@localhost", !body.isEmpty else { throw NativeChatFailure.invalidMessage }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
}

private final class NativeSecondFactorUIFixture: NativeSecondFactorSession {
    private let account: NativeAuthenticatedAccount
    private var cancelled = false
    init(account: NativeAuthenticatedAccount) { self.account = account }
    func verify(code: String) async throws -> NativeAuthenticatedAccount {
        try await Task.sleep(nanoseconds: 100_000_000)
        guard !cancelled else { throw NativeSecondFactorFailure.expired }
        guard code == "123456" else { throw NativeSecondFactorFailure.invalidCode }
        return account
    }
    func cancel() { cancelled = true }
}
#endif
