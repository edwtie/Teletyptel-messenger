import SwiftUI

struct NativeTranslationCaption: View {
    let result: NativeTranslationResult
    @State private var information = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button("Vertaling") { information = true }
                .font(.caption).underline()
                .buttonStyle(.plain)
                .accessibilityHint("Informatie over machinevertaling")
            Text(result.text).textSelection(.enabled)
        }
        .padding(.top, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Divider() }
        .alert("Vertaling", isPresented: $information) {
            Button("Sluiten", role: .cancel) {}
        } message: {
            Text("Machinevertaling kan fouten bevatten. De vertaling is alleen op jouw scherm zichtbaar. Het originele bericht blijft behouden.")
        }
    }
}

struct NativeTranslationSettingsView: View {
    @ObservedObject var model: NativeTranslationModel
    @Environment(\.dismiss) private var dismiss
    @State private var preferences = NativeTranslationPreferences()
    @State private var consent = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Vertaling op jouw scherm") {
                    Text("Originele berichten blijven ongewijzigd. Vertaalde tekst wordt niet naar je gesprekspartner gestuurd.")
                    Picker("Taal", selection: $preferences.targetLanguage) {
                        ForEach(Array(zip(NativeTranslationModel.languageCodes, NativeTranslationModel.languageNames)), id: \.0) { code, name in
                            Text(name).tag(code)
                        }
                    }
                    Picker("Vertaling", selection: $preferences.mode) {
                        Text("Uit").tag("off")
                        Text("Handmatig via berichtmenu").tag("manual")
                        Text("Automatisch").tag("automatic")
                    }
                    .onChange(of: preferences.mode) { mode in
                        if mode == "off" { model.setSharingConsent(false) }
                    }
                }
                Section("Privacy en toestemming") {
                    Text("Voor vertaling wordt de gekozen tekst via de TeleTypTel-server naar Google Cloud Translation gestuurd. Stuur geen gevoelige gegevens zonder passende toestemming.")
                    Toggle("Ik geef toestemming voor deze vertaling", isOn: $consent)
                        .onChange(of: consent) { if !$0 { model.setSharingConsent(false) } }
                    Toggle("Ontvangen live RTT vertalen", isOn: $preferences.liveRttConsent)
                    Toggle("Mijn eigen live RTT vertalen", isOn: $preferences.ownLiveRttConsent)
                }
                Section {
                    if !model.ready { Text("Geen actieve vertaalsessie. Meld opnieuw aan als de instellingen niet geladen zijn.") }
                    else if !model.available { Text("De beheerder heeft nog geen beschikbare vertaaldienst ingesteld.") }
                    if let error = model.error { Text(error).foregroundStyle(.red) }
                    Button("Instellingen opslaan") {
                        preferences.automaticConsent = preferences.mode == "automatic" && consent
                        saving = true
                        Task {
                            await model.save(preferences, consent: consent)
                            saving = false
                            if model.error == nil { dismiss() }
                        }
                    }
                    .disabled(saving || !model.ready || (preferences.mode != "off" && !consent))
                }
            }
            .navigationTitle("Vertaling")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gereed") { dismiss() } } }
            .onAppear { preferences = model.preferences; consent = model.sharingConsent }
        }
    }
}

struct NativeMessengerView: View {
    @ObservedObject var model: NativeLoginModel
    @ObservedObject var calls: NativeCallController
    @ObservedObject var translation: NativeTranslationModel
    let logout: () -> Void
    @State private var selected: String?
    @State private var search = ""
    @State private var showTranslation = false

    private var contacts: [NativeContact] {
        guard case .ready(let contacts) = model.roster else { return [] }
        return contacts.filter { search.isEmpty || $0.displayName.localizedCaseInsensitiveContains(search) || $0.jid.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                HStack {
                    Image("TeleTypTelLogo").resizable().scaledToFit().frame(maxWidth: 190, maxHeight: 36)
                    Spacer()
                    Button(action: logout) { Image(systemName: "rectangle.portrait.and.arrow.right").frame(width: 44, height: 44) }
                        .accessibilityLabel("Uitloggen").accessibilityIdentifier("disconnect-session")
                }.padding(.horizontal)
                Text(model.isConnected ? "XMPP verbonden" : "Opnieuw verbinden…")
                    .font(.caption).foregroundStyle(.secondary)
                    .accessibilityLabel(connectionStatus)
                    .accessibilityIdentifier("startup-status")
                List(selection: $selected) {
                    switch model.roster {
                    case .idle, .loading:
                        ProgressView("Contacten ophalen…")
                    case .unavailable:
                        Text("Contacten konden niet worden opgehaald. Meld opnieuw aan om het opnieuw te proberen.")
                            .accessibilityIdentifier("contacts-error")
                    case .ready(let roster) where roster.isEmpty:
                        Text("Nog geen contacten in je XMPP-contactenlijst.")
                            .accessibilityIdentifier("contacts-empty")
                    case .ready:
                        if contacts.isEmpty { Text("Geen contacten gevonden.") }
                    }
                    ForEach(contacts) { contact in
                        NavigationLink(value: contact.jid) {
                            HStack(spacing: 12) {
                                Text(String(contact.displayName.prefix(2)).uppercased())
                                    .font(.subheadline.bold()).foregroundStyle(.white)
                                    .frame(width: 44, height: 44).background(.blue, in: Circle())
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(contact.displayName).font(.headline)
                                    Text(contact.presence.label).font(.caption).foregroundStyle(.secondary)
                                    if let last = model.chat.messages.last(where: { $0.peer == contact.jid }) {
                                        Text(last.body).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                }
                                Spacer()
                            }
                            .padding(.vertical, 6)
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("contact-" + contact.jid)
                        }
                    }
                }
                .searchable(text: $search, prompt: "Contacten zoeken")
                .listStyle(.sidebar)
            }
            .navigationTitle("Contacten en groepen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showTranslation = true } label: { Label("Vertaling", systemImage: "globe") }
                        Button(action: logout) { Label("Uitloggen", systemImage: "rectangle.portrait.and.arrow.right") }
                    } label: { Image(systemName: "line.3.horizontal").frame(width: 44, height: 44) }
                    .accessibilityLabel("Hoofdmenu")
                }
            }
        } detail: {
            if let contact = contacts.first(where: { $0.jid == selected }) {
                NativeChatView(model: model, calls: calls, translation: translation, contact: contact, onClose: { selected = nil })
            } else {
                GeometryReader { geometry in
                    Image(geometry.size.width > geometry.size.height ? "ChatBackgroundWide" : "ChatBackground")
                        .resizable().scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipped()
                        .overlay { Text("Kies een gesprek").font(.headline).padding().background(.regularMaterial, in: Capsule()) }
                }
            }
        }
        .sheet(isPresented: $showTranslation) { NativeTranslationSettingsView(model: translation) }
    }

    private var connectionStatus: String {
        if case .connected(let jid) = model.phase { return "XMPP verbonden als " + jid }
        return "Niet verbonden"
    }
}
