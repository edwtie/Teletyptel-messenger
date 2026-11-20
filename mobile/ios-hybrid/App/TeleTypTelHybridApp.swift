import Combine
import SwiftUI

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
            .sheet(item: $owner.fileSheet) { sheet in
                if let body = sheet.body {
                    NavigationStack {
                        Form { NativeFileMessageButton(bodyText: body, session: owner.login.activeWebSession) }
                            .navigationTitle("Bijlage")
                            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluiten") { owner.fileSheet = nil } } }
                    }
                } else {
                    NativeAttachmentPicker(login: owner.login) { text in owner.features.stage(text, context: sheet.context) }
                }
            }
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
    @Published var fileSheet: HybridFileSheet?
    private let background = NativeBackgroundController()
    private var observation: AnyCancellable?

    init() {
        let login = NativeLoginModel(history: NativeDeviceHistory())
        let calls = NativeCallController.shared
        self.login = login
        self.calls = calls
        let port = NativeHybridCallAdapter(controller: calls, login: login)
        callPort = port
        let features = NativeHybridExtrasAdapter(login: login)
        self.features = features
        let configuration = try! ServerConfiguration(address: NativeServerDefaults.address, domain: NativeServerDefaults.domain)
        session = HybridSession(model: login, configuration: configuration, nativeLogout: {
            calls.pushRegistration.logout()
            calls.endFromHybrid()
            login.disconnect()
        }, calls: port, extras: features)
        content = Bundle.main.url(forResource: "hybrid-content", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }.flatMap { try? HybridContent(data: $0) }
        calls.attach(login)
        features.presentPicker = { [weak self] context in self?.fileSheet = HybridFileSheet(context: context, body: nil) }
        features.presentFile = { [weak self] body, context in self?.fileSheet = HybridFileSheet(context: context, body: body) }
        features.dismissPresentation = { [weak self] in self?.fileSheet = nil }
        observation = login.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.calls.synchronize(self.login.phase)
                self.callPort.refresh()
            }
        }
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
}

struct HybridFileSheet: Identifiable {
    let id = UUID()
    let context: HybridExtrasContext
    let body: String?
}
