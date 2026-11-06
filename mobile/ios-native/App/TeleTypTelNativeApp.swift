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
    @StateObject private var model = NativeStartupModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var address = ""
    @State private var domain = ""

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
                    Text("Ontwikkelversie: de servercontrole werkt los van de bestaande app. Aanmelden, chat en bellen worden stapsgewijs aangesloten.")
                        .foregroundStyle(.secondary)
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
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("XMPP-domein")
                        TextField("Bijvoorbeeld localhost voor de lokale testserver", text: $domain)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("XMPP-domein")
                            .accessibilityIdentifier("xmpp-domain")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        if model.state.phase == .checking {
                            ProgressView("Chatserver controleren…")
                                .tint(.blue)
                        }
                        Text(statusText)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("startup-status")
                        if model.state.phase == .checking {
                            Button("Annuleren", action: model.cancel)
                                .frame(minHeight: 44)
                        } else {
                            Button("Verbinding controleren") { model.check(address: address, domain: domain) }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                                .accessibilityIdentifier("check-connection")
                                .disabled(address.isEmpty || domain.isEmpty)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                    Text("Deze controle meldt niemand aan, verstuurt geen berichten en start geen oproep. Er worden geen wachtwoorden gevraagd of opgeslagen.")
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
        .onChange(of: address) { _ in model.reset() }
        .onChange(of: domain) { _ in model.reset() }
        .onChange(of: scenePhase) { phase in
            if phase == .background { model.cancel() }
        }
        .onDisappear { model.cancel() }
    }

    private var statusText: String {
        switch model.state.phase {
        case .idle:
            return "Vul het bekende serveradres en XMPP-domein in. De controle start alleen wanneer je op de knop drukt."
        case .checking:
            return "Beveiligde XMPP-verbinding controleren. Dit duurt maximaal acht seconden."
        case .available:
            return "De XMPP-server is bereikbaar en biedt aanmelden aan. Je bent nog niet ingelogd; de native aanmeldfunctie volgt in de volgende stap."
        case .cancelled:
            return "De controle is gestopt. Je kunt deze opnieuw starten."
        case .failed(let failure):
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
}
