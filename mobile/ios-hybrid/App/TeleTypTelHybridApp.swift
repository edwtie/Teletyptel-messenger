import Combine
import SwiftUI
import SafariServices

@main
struct TeleTypTelHybridApp: App {
    @UIApplicationDelegateAdaptor(NativeProviderAppDelegate.self) private var providerDelegate
    @StateObject private var owner = NativeHybridOwner()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if let content = owner.content {
                    HybridLoginView(session: owner.session, content: content, videoView: owner.callPort.videoView)
                } else { Text("De lokale TeleTypTel-interface kon niet worden geladen.") }
            }
            .sheet(item: $owner.fileSheet, onDismiss: { owner.account.setPresentation(owner.fileSheet != nil) }) { sheet in
                if let url = sheet.privacy {
                    HybridPrivacyView(url: url)
                } else if let panel = sheet.panel {
                    if panel == "dialer" { NativeDialerView(login: owner.login, calls: owner.calls) }
                    else if panel == "security" { NativeAccountSecurityView(login: owner.login, credentialsChanged: owner.signOutFromNative) }
                    else {
                        NativeAccountSettingsView(login: owner.login, translation: owner.features.nativeTranslation, avatars: owner.account.avatars,
                            credentialsChanged: owner.signOutFromNative).environmentObject(owner.calls.pushRegistration)
                    }
                } else if sheet.avatar {
                    NativeAvatarEditorView(login: owner.login) { owner.account.avatars.refreshOwner() }
                } else if let body = sheet.body {
                    NavigationStack {
                        Form { NativeFileMessageButton(bodyText: body, session: owner.login.activeWebSession) }
                            .navigationTitle("Bijlage")
                            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluiten") { owner.fileSheet = nil } } }
                    }
                } else {
                    NativeAttachmentPicker(login: owner.login) { text in owner.features.stage(text, context: sheet.context) }
                }
            }
            .background(NativeProviderPresenter(sdk: owner.account.provider).frame(width: 0, height: 0))
            .onOpenURL { owner.account.provider.handle($0) }
            .task { owner.restoreSavedLogin() }
            .onChange(of: scenePhase) { owner.sceneChanged($0) }
        }
    }
}

@MainActor
final class NativeHybridOwner: ObservableObject {
    let login: NativeLoginModel
    let calls: NativeCallController
    let callPort: NativeHybridCallAdapter
    let session: HybridSession
    let content: HybridContent?
    let features: NativeHybridExtrasAdapter
    let account: NativeHybridAccountAdapter
    @Published var fileSheet: HybridFileSheet? { didSet { if fileSheet != nil { account.setPresentation(true) } } }
    private let background = NativeBackgroundController()
    private var observation: AnyCancellable?
    private var groupObservation: AnyCancellable?
    private var attemptedRestore = false

    init() {
        let login = NativeLoginModel(history: NativeDeviceHistory())
        let calls = NativeCallController.shared
        self.login = login
        self.calls = calls
        let port = NativeHybridCallAdapter(controller: calls, login: login)
        callPort = port
        let features = NativeHybridExtrasAdapter(login: login)
        self.features = features
        let server = NativeServerDefaults.resolve(savedAddress: UserDefaults.standard.string(forKey: "teletyptel.native.serverAddress"),
            savedDomain: UserDefaults.standard.string(forKey: "teletyptel.native.xmppDomain"))
        let configuration = try! ServerConfiguration(address: server.address, domain: server.domain)
        let account = NativeHybridAccountAdapter(login: login, configuration: configuration)
        self.account = account
        session = HybridSession(model: login, configuration: configuration, nativeLogout: {
            calls.pushRegistration.logout()
            calls.endFromHybrid()
            login.disconnect()
        }, calls: port, extras: features, account: account)
        content = Bundle.main.url(forResource: "hybrid-content", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }.flatMap { try? HybridContent(data: $0) }
        calls.attach(login)
        NativeMessageNotifications.shared.connect(login)
        features.presentPicker = { [weak self] context in self?.fileSheet = HybridFileSheet(context: context, body: nil) }
        features.presentFile = { [weak self] body, context in self?.fileSheet = HybridFileSheet(context: context, body: body) }
        features.dismissPresentation = { [weak self] in self?.fileSheet = nil }
        account.dismissPresentation = { [weak self] in self?.fileSheet = nil }
        account.presentAvatar = { [weak self] in
            guard let self = self else { return }
            let snapshot = self.session.snapshot()
            self.fileSheet = HybridFileSheet(context: HybridExtrasContext(epoch: snapshot.epoch, conversation: snapshot.conversation, call: snapshot.call), body: nil, avatar: true)
        }
        account.presentPrivacy = { [weak self] url in
            guard let self = self else { return }
            let snapshot = self.session.snapshot()
            self.fileSheet = HybridFileSheet(context: HybridExtrasContext(epoch: snapshot.epoch, conversation: nil, call: snapshot.call), body: nil, privacy: url)
        }
        account.presentPanel = { [weak self] panel in
            guard let self = self else { return }
            let snapshot = self.session.snapshot()
            self.fileSheet = HybridFileSheet(context: HybridExtrasContext(epoch: snapshot.epoch, conversation: snapshot.conversation, call: snapshot.call), body: nil, panel: panel)
        }
        observation = login.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.calls.synchronize(self.login.phase)
                self.callPort.refresh()
                NativeMessageNotifications.shared.updateBadge()
                if !self.login.isConnected && !self.login.isWorking { NativeMessageNotifications.shared.clear() }
            }
        }
        groupObservation = login.groups.objectWillChange.sink { _ in Task { @MainActor in NativeMessageNotifications.shared.updateBadge() } }
    }

    func sceneChanged(_ phase: ScenePhase) {
        if phase == .background {
            calls.setForeground(false)
            calls.backgroundCallEnded = { [weak self] in
                guard let self = self else { return }
                self.background.enter(self.login)
            }
            background.enter(login, keepingCall: calls.hasLiveCall)
        } else if phase == .active {
            calls.backgroundCallEnded = nil
            calls.setForeground(true)
            background.returnToForeground(login)
            callPort.refresh()
        }
    }

    func restoreSavedLogin() {
        guard !attemptedRestore else { return }
        attemptedRestore = true; account.restoreIfAllowed()
    }

    func signOutFromNative() {
        guard let data = try? JSONSerialization.data(withJSONObject: ["version": 1, "id": UUID().uuidString, "command": "session.logout", "arguments": [String: String](), "epoch": session.snapshot().epoch]) else { return }
        _ = try? session.handle(data, document: URL(string: "capacitor://localhost/chat.html"), mainFrame: true)
    }
}

struct HybridFileSheet: Identifiable {
    let id = UUID()
    let context: HybridExtrasContext
    let body: String?
    var avatar = false
    var privacy: URL?
    var panel: String?
}

struct HybridPrivacyView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
