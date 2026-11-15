import SwiftUI

struct NativeAccountEntryView: View {
    let configuration: ServerConfiguration
    let recovery: Bool
    @StateObject private var model = NativeAccountLifecycle()
    @State private var jid = ""
    @State private var name = ""
    @State private var password = ""
    @State private var repeated = ""
    @State private var consent = false
    @State private var task: Task<Void, Never>?
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section(recovery ? "Wachtwoord vergeten" : "Nieuwe gebruiker") {
                    Text(configuration.origin.host ?? "").font(.caption)
                    TextField("XMPP-account", text: $jid).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !recovery {
                        TextField("Naam", text: $name)
                        SecureField("Nieuw wachtwoord", text: $password).textContentType(.newPassword)
                        SecureField("Herhaal wachtwoord", text: $repeated).textContentType(.newPassword)
                        Text("Minimaal 10 tekens, met een kleine letter, hoofdletter, cijfer en speciaal teken.").font(.caption)
                        if configuration.domain != "localhost" { Text("Deze server ondersteunt via de bestaande API nog geen nieuwe lokale XMPP-accounts voor dit domein.").font(.caption) }
                        if let url = URL(string: "privacy.html", relativeTo: configuration.origin)?.absoluteURL { Link("Privacy-informatie", destination: url) }
                        Toggle("Ik heb de privacy-informatie gelezen", isOn: $consent)
                    }
                    Button(recovery ? "Herstellink aanvragen" : "Account aanmaken") {
                        let submitted = password
                        password = ""; repeated = ""
                        task = Task {
                            if recovery { await model.requestRecovery(configuration: configuration, jid: jid.trimmingCharacters(in: .whitespacesAndNewlines)) }
                            else { await model.register(configuration: configuration, jid: jid.trimmingCharacters(in: .whitespacesAndNewlines), name: name, password: submitted) }
                        }
                    }.disabled(model.busy || jid.isEmpty || (!recovery && (!consent || configuration.domain != "localhost" || password != repeated || !NativeAccountLifecycle.validPassword(password) || name.isEmpty)))
                }
                if model.busy { ProgressView() }
                if let status = model.status { Text(LocalizedStringKey(status)).accessibilityIdentifier("account-lifecycle-status") }
            }.nativeWebForm().navigationTitle(recovery ? "Wachtwoord herstellen" : "Account aanmaken")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluiten") { dismiss() } } }
        }.onDisappear { task?.cancel(); model.detach(); password = ""; repeated = "" }
    }
}

struct NativeAccountSecurityView: View {
    @ObservedObject var login: NativeLoginModel
    var credentialsChanged: () -> Void
    @StateObject private var model = NativeAccountLifecycle()
    @State private var current = ""
    @State private var password = ""
    @State private var repeated = ""
    @State private var code = ""
    @State private var task: Task<Void, Never>?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            Form {
                Section("Wachtwoord wijzigen") {
                    SecureField("Huidig wachtwoord", text: $current).textContentType(.password)
                    SecureField("Nieuw wachtwoord", text: $password).textContentType(.newPassword)
                    SecureField("Herhaal wachtwoord", text: $repeated).textContentType(.newPassword)
                    Text("Minimaal 10 tekens, met een kleine letter, hoofdletter, cijfer en speciaal teken. Na wijzigen meld je opnieuw aan.").font(.caption)
                    Button("Wachtwoord wijzigen") {
                        guard let session = login.activeWebSession, let account = login.activeAccountID, let jid = login.currentOwner else { return }
                        let old = current, new = password
                        current = ""; password = ""; repeated = ""
                        task = Task {
                            if await model.changePassword(session: session, accountID: account, jid: jid, current: old, password: new) {
                                credentialsChanged(); dismiss()
                            }
                        }
                    }.disabled(model.busy || current.isEmpty || current == password || password != repeated || !NativeAccountLifecycle.validPassword(password))
                }
                Section("Tweestapsverificatie") {
                    if model.twoFactorEnabled == false && model.setupSecret == nil {
                        Button("Authenticator instellen") {
                            guard let session = login.activeWebSession, let account = login.activeAccountID else { return }
                            task = Task { await model.beginTwoFactor(session: session, accountID: account) }
                        }.disabled(model.busy)
                    }
                    if let secret = model.setupSecret {
                        Text("Voer deze sleutel handmatig in je authenticator in. Deel hem niet.").font(.caption)
                        Text(secret).font(.system(.body, design: .monospaced)).privacySensitive()
                        SecureField("Zescijferige code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                        Button("Bevestigen") {
                            guard let session = login.activeWebSession, let account = login.activeAccountID else { return }
                            let value = code; code = ""
                            task = Task { await model.confirmTwoFactor(session: session, accountID: account, code: value) }
                        }.disabled(model.busy || code.count != 6)
                    }
                    Button("Beveiligingsstatus ophalen") { task = Task { await load() } }.disabled(model.busy)
                }
                if model.busy { ProgressView() }
                if let status = model.status { Text(LocalizedStringKey(status)) }
            }.nativeWebForm().navigationTitle("Accountbeveiliging")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Sluiten") { dismiss() } } }
        }.task { await load() }
            .onChange(of: scenePhase) { phase in if phase != .active { dismiss() } }
            .onChange(of: login.phase) { _ in if !login.canSend { dismiss() } }
            .onDisappear { task?.cancel(); model.detach(); current = ""; password = ""; repeated = ""; code = "" }
    }
    private func load() async {
        guard let session = login.activeWebSession, let account = login.activeAccountID, let jid = login.currentOwner else { return }
        await model.loadSecurity(session: session, accountID: account, jid: jid)
    }
}
