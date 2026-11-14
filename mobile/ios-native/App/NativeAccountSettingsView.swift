import SwiftUI

struct NativeAccountSettingsView: View {
    @ObservedObject var login: NativeLoginModel
    @ObservedObject var translation: NativeTranslationModel
    @StateObject private var model = NativeAccountSettingsModel()
    @State private var draft: NativeAccountProfile?
    @State private var showTranslation = false
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                if model.busy { ProgressView("Accountinstellingen ophalen…") }
                if let profile = draft {
                    Section("Account") {
                        LabeledContent("XMPP", value: profile.jid)
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("profile-jid")
                        TextField("Naam", text: binding(\.displayName)).accessibilityIdentifier("profile-name")
                        TextField("Telefoonnummer", text: binding(\.phoneNumber)).keyboardType(.phonePad)
                        Picker("Profieltaal", selection: binding(\.preferredLanguage)) {
                            ForEach(Array(zip(NativeTranslationModel.languageCodes, NativeTranslationModel.languageNames)), id: \.0) { code, name in Text(name).tag(code) }
                        }
                        TextField("Avatarkleur (#RRGGBB)", text: binding(\.avatarColor)).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Text("De profieltaal is geen wijziging van de app-interface of je vertaaltoestemming.").font(.caption)
                    }
                    Button { Task { await model.save(profile) } } label: { Label("Accountinstellingen opslaan", systemImage: "checkmark") }
                        .disabled(model.busy || !profile.valid).accessibilityIdentifier("profile-save")
                }
                if let status = model.status { Text(status).accessibilityIdentifier("profile-status") }
                Section("Privacy en vertaling") {
                    Button { showTranslation = true } label: { Label("Vertaalinstellingen", systemImage: "globe") }
                    Text("Face ID en Touch ID blijven een afzonderlijke keuze op het aanmeldscherm. Wachtwoorden en aanmeldproviders worden hier niet gewijzigd.").font(.caption)
                }
                Button { Task { await load() } } label: { Label("Opnieuw ophalen", systemImage: "arrow.clockwise") }.disabled(model.busy)
            }
            .navigationTitle("Accountinstellingen")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten") } }
        }
        .task { await load() }
        .onChange(of: login.phase) { _ in if !login.canSend { model.detach(); draft = nil; dismiss() } }
        .onDisappear { model.detach(); draft = nil }
        .sheet(isPresented: $showTranslation) { NativeTranslationSettingsView(model: translation) }
    }
    private func load() async {
        await model.connect(login.activeWebSession, accountID: login.activeAccountID)
        draft = model.profile
    }
    private func binding(_ key: WritableKeyPath<NativeAccountProfile, String>) -> Binding<String> {
        Binding(get: { draft?[keyPath: key] ?? "" }, set: { draft?[keyPath: key] = $0 })
    }
}
