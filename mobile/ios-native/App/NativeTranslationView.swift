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
            .nativeWebForm()
            .navigationTitle("Vertaling")
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
            } }
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
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var search = ""
    @State private var showTranslation = false
    @State private var showGroups = false
    @State private var showAccount = false
    @State private var showDialer = false
    @State private var showNewContact = false
    @State private var showAppearance = false
    @State private var showProfile = false
    @State private var mainMenuOpen = false
    @State private var historyBrowser: String?
    @State private var menuPresentation: Task<Void, Never>?
    @StateObject private var avatars = NativeAvatarCache()
    @StateObject private var archive = NativeConversationArchive()
    @StateObject private var contactRequests = NativeContactRequests()
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    private var contacts: [NativeContact] {
        guard case .ready(let contacts) = model.roster else { return [] }
        return contacts.filter { !archive.contains(peer: $0.jid, kind: "contact") && (search.isEmpty || $0.displayName.localizedCaseInsensitiveContains(search) || $0.jid.localizedCaseInsensitiveContains(search)) }
    }

    private var selectedContact: NativeContact? {
        if let contact = contacts.first(where: { $0.jid == selected }) { return contact }
        guard let previous = model.cloudHistory.conversations.first(where: { $0.peer == selected && $0.kind == "contact" }) else { return nil }
        return NativeContact(jid: previous.peer, name: previous.name, groups: [], subscription: "none")
    }

    private var rosterJIDs: Set<String> {
        if case .ready(let contacts) = model.roster { return Set(contacts.map(\.jid)) }
        return []
    }

    var body: some View {
        VStack(spacing: 0) {
            if verticalSizeClass != .compact || selected == nil { brandHeader }
            conversationLayout
        }
        .font(NativeWebStyle.font()).tint(NativeWebStyle.accent)
        .sheet(isPresented: $showGroups) { NativeGroupsView(model: model.groups, login: model, translation: translation, avatars: avatars, archive: archive) }
        .sheet(isPresented: $showAccount) { NativeAccountSettingsView(login: model, translation: translation, avatars: avatars, credentialsChanged: logout) }
        .sheet(isPresented: $showTranslation) { NativeTranslationSettingsView(model: translation) }
        .sheet(isPresented: $showDialer) { NativeDialerView(login: model, calls: calls) }
        .sheet(isPresented: $showNewContact) { NativeNewContactView(login: model) }
        .sheet(isPresented: $showAppearance) { NativeAppearanceView() }
        .sheet(isPresented: $showProfile) { NativeAvatarEditorView(login: model, onSaved: { avatars.refreshOwner() }) }
        .sheet(isPresented: Binding(get: { historyBrowser != nil }, set: { if !$0 { historyBrowser = nil } })) {
            NativeHistoryBrowserView(login: model, calls: calls, translation: translation, archive: archive, avatars: avatars, archivedOnly: historyBrowser == "archive")
        }
        .task(id: model.canSend) { loadAvatars() }
        .onChange(of: model.roster) { _ in loadAvatars() }
        .onChange(of: showAccount) { if !$0 { avatars.refreshOwner() } }
        .onDisappear { menuPresentation?.cancel(); menuPresentation = nil; NativeAvatarImages.clear() }
        .task(id: model.canSend) { contactRequests.configure(model.contactManager) }
    }

    private var conversationLayout: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Contacten en groepen").font(NativeWebStyle.font())
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(NativeWebStyle.muted)
                        TextField("Contacten zoeken", text: $search).textFieldStyle(.plain)
                            .accessibilityLabel("Contacten zoeken")
                    }
                    .padding(.horizontal, 10).frame(minHeight: 44)
                    .background(NativeWebStyle.panel, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(NativeWebStyle.line, lineWidth: 1))
                }.padding(12)
                NativeInvitationNotice(model: model.groups.invitationModel) { showGroups = true }
                if !contactRequests.peers.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Statusverzoeken").font(.headline)
                        ForEach(contactRequests.peers, id: \.self) { peer in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(peer + " vraagt toestemming om jouw online status te zien.").font(.caption)
                                HStack {
                                    Button { Task { await contactRequests.respond(peer, allow: true) } } label: { Label("Toestaan", systemImage: "checkmark") }
                                    Button(role: .destructive) { Task { await contactRequests.respond(peer, allow: false) } } label: { Label("Weigeren", systemImage: "xmark") }
                                }.disabled(contactRequests.busy)
                            }
                        }
                        if let notice = contactRequests.notice { Text(notice).font(.caption) }
                    }.padding(12)
                }
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
                            HStack(spacing: 8) {
                                NativeCachedAvatar(name: contact.displayName, jid: contact.jid, cache: avatars)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(contact.displayName).font(NativeWebStyle.font(14, weight: .bold)).lineLimit(1)
                                    if let last = model.chat.messages.last(where: { $0.peer == contact.jid && !$0.hidden }) {
                                        Text(last.retracted ? "Bericht ingetrokken" : last.body).font(NativeWebStyle.font(13)).lineLimit(1)
                                    } else { Text(LocalizedStringKey(contact.presence.label)).font(NativeWebStyle.font(13)) }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                if model.chat.unreadCount(peer: contact.jid) > 0 {
                                    Text(String(model.chat.unreadCount(peer: contact.jid))).font(.caption.bold())
                                        .padding(6).background(NativeWebStyle.accent, in: Capsule()).foregroundStyle(.white)
                                        .accessibilityLabel("\(model.chat.unreadCount(peer: contact.jid)) ongelezen berichten")
                                }
                                if let last = model.chat.messages.last(where: { $0.peer == contact.jid && !$0.hidden }) {
                                    Text(last.date, style: .time).font(NativeWebStyle.font(10)).lineLimit(1)
                                }
                                Circle().fill(presenceColor(contact.presence)).frame(width: 10, height: 10)
                                    .accessibilityLabel(contact.presence.label)
                            }
                            .foregroundStyle(selected == contact.jid ? Color.white : NativeWebStyle.muted)
                            .padding(.horizontal, 10).padding(.vertical, 10)
                            .background(selected == contact.jid ? NativeWebStyle.accent : NativeWebStyle.button, in: RoundedRectangle(cornerRadius: 6))
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("contact-" + contact.jid)
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 6, trailing: 12))
                        .listRowSeparator(.hidden).listRowBackground(Color.clear)
                        .contextMenu {
                            Button { archive.set(peer: contact.jid, kind: "contact", archived: true); if selected == contact.jid { selected = nil } } label: { Label("Archiveren", systemImage: "archivebox") }
                        }
                    }
                    NativeHistoricalContacts(cloud: model.cloudHistory, rosterJIDs: rosterJIDs, search: search, selected: selected, archived: archive.entries)
                    ForEach(model.groups.rooms.filter { !archive.contains(peer: $0.room, kind: "group") && (search.isEmpty || $0.room.localizedCaseInsensitiveContains(search)) }) { group in
                        NavigationLink(value: group.room) {
                            HStack(spacing: 8) {
                                NativeWebAvatar(name: group.room)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(group.room.components(separatedBy: "@")[0]).font(NativeWebStyle.font(14, weight: .bold)).lineLimit(1)
                                    Text(group.messages.last?.body ?? "Groep").font(NativeWebStyle.font(13)).lineLimit(1)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                Circle().fill(Color.blue).frame(width: 10, height: 10).accessibilityLabel("Groep")
                                if group.unreadCount > 0 {
                                    Text(String(group.unreadCount)).font(.caption.bold()).padding(6)
                                        .background(NativeWebStyle.accent, in: Capsule()).foregroundStyle(.white)
                                        .accessibilityLabel("\(group.unreadCount) ongelezen groepsberichten")
                                }
                            }.padding(10)
                                .foregroundStyle(selected == group.room ? Color.white : NativeWebStyle.muted)
                                .background(selected == group.room ? NativeWebStyle.accent : NativeWebStyle.button, in: RoundedRectangle(cornerRadius: 6))
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 6, trailing: 12))
                        .listRowSeparator(.hidden).listRowBackground(Color.clear)
                    }
                }
                .listStyle(.plain).scrollContentBackground(.hidden)
                HStack {
                    Spacer()
                    Menu {
                        Button { showNewContact = true } label: { Label("Nieuw contact", systemImage: "person.badge.plus") }
                        Button { showGroups = true } label: { Label("Groepschats openen of maken", systemImage: "person.3") }
                    } label: { Image(systemName: "plus").frame(width: 52, height: 52) }
                        .buttonStyle(NativeWebIconStyle(prominent: true, round: true))
                        .accessibilityLabel("Contacten en groepen toevoegen")
                }.padding(12)
            }
            .background(NativeWebStyle.panel).foregroundStyle(NativeWebStyle.text)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .navigationSplitViewColumnWidth(min: 260, ideal: 300, max: 360)
        } detail: {
            if let contact = selectedContact {
                NativeChatView(model: model, calls: calls, translation: translation, contact: contact, onClose: { selected = nil },
                    contactProfile: avatars.profiles[contact.jid], ownProfile: avatars.owner.flatMap { avatars.profiles[$0] }, avatars: avatars, archive: archive,
                    allowReadMarkers: !mainMenuOpen && !showProfile && !showAccount && !showTranslation && !showGroups && !showDialer && !showNewContact && !showAppearance && historyBrowser == nil,
                    historyOnly: !rosterJIDs.contains(contact.jid))
            } else if let room = model.groups.rooms.first(where: { $0.room == selected }) {
                NativeGroupChatView(model: model.groups, room: room.room, login: model, translation: translation, avatars: avatars, archive: archive, onArchive: { selected = nil }, onClose: { selected = nil })
            } else {
                GeometryReader { geometry in
                    NativeConversationBackground()
                        .overlay {
                            VStack(spacing: 16) {
                                Image("TeleTypTelLogo").resizable().scaledToFit().frame(maxWidth: 300, maxHeight: 68)
                                    .accessibilityLabel("TeleTypTel")
                                Text("Kies een gesprek").font(NativeWebStyle.font(24, weight: .bold))
                                Text("Kies links een contact om te chatten, bellen of Total Conversation te gebruiken.")
                                    .multilineTextAlignment(.center).foregroundStyle(NativeWebStyle.muted)
                            }
                            .padding(24).frame(maxWidth: 440).foregroundStyle(NativeWebStyle.text)
                            .background(NativeWebStyle.panel.opacity(0.94), in: RoundedRectangle(cornerRadius: 16))
                            .padding(20).accessibilityIdentifier("messenger-choose-conversation")
                        }
                }
                .toolbar(.hidden, for: .navigationBar)
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    private var brandHeader: some View {
        HStack(spacing: 12) {
            Image("TeleTypTelLogo").resizable().scaledToFit().frame(maxWidth: 190, maxHeight: 38).accessibilityLabel("TeleTypTel")
            Text(model.isConnected ? "XMPP connected" : "Opnieuw verbinden…")
                .font(NativeWebStyle.font(10)).foregroundStyle(NativeWebStyle.muted).lineLimit(2)
                .accessibilityLabel(connectionStatus).accessibilityIdentifier("startup-status")
            Spacer(minLength: 0)
            if horizontalSizeClass == .regular {
                Button { showDialer = true } label: { Image(systemName: "phone") }
                    .buttonStyle(NativeWebIconStyle()).accessibilityLabel("Nummer bellen")
                    .accessibilityIdentifier("toolbar-number-dialer")
                Button { showAccount = true } label: { Image(systemName: "gearshape") }
                    .buttonStyle(NativeWebIconStyle()).accessibilityLabel("Accountinstellingen")
                    .accessibilityIdentifier("toolbar-account-settings")
                Button(action: logout) { Image(systemName: "rectangle.portrait.and.arrow.right") }
                    .buttonStyle(NativeWebIconStyle(destructive: true))
                    .accessibilityLabel("Uitloggen").accessibilityIdentifier("disconnect-session")
            }
            Button { mainMenuOpen.toggle() } label: { Image(systemName: "line.3.horizontal") }
                .buttonStyle(NativeWebIconStyle(prominent: mainMenuOpen)).accessibilityLabel("Hoofdmenu")
                .accessibilityValue(Text(LocalizedStringKey(mainMenuOpen ? "Geopend" : "Gesloten")))
                .accessibilityIdentifier("messenger-main-menu")
                .popover(isPresented: $mainMenuOpen, arrowEdge: .top) {
                    mainMenuGrid.modifier(NativeWebCompactPopover())
                }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(NativeWebStyle.panel)
        .overlay(alignment: .bottom) { NativeWebStyle.line.frame(height: 1) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("messenger-brand-header")
    }

    private var mainMenuGrid: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                menuTile("Nummer bellen", symbol: "phone", identifier: "open-number-dialer") { afterMenu { showDialer = true } }
                menuTile("Nieuws · nog niet beschikbaar in deze app", symbol: "doc.text", identifier: "menu-news") {}.disabled(true)
                menuTile("Klantenservice · nog niet beschikbaar in deze app", symbol: "headphones", identifier: "menu-support") {}.disabled(true)
                menuTile("Geschiedenis", symbol: "calendar", identifier: "open-history") { afterMenu { historyBrowser = "history" } }
                menuTile("Archief", symbol: "archivebox", identifier: "open-archive") { afterMenu { historyBrowser = "archive" } }
                menuTile("Weergave", symbol: "circle.lefthalf.filled", identifier: "open-appearance") { afterMenu { showAppearance = true } }
                menuTile("Profiel", symbol: "person", identifier: "open-profile") { afterMenu { showProfile = true } }
                menuTile("Accountinstellingen", symbol: "gearshape", identifier: "open-account-settings") { afterMenu { showAccount = true } }
                menuTile("Niet storen", symbol: model.chat.preferences.doNotDisturb ? "bell.slash.fill" : "bell.slash", identifier: "menu-do-not-disturb", selected: model.chat.preferences.doNotDisturb) {
                    model.setDoNotDisturb(!model.chat.preferences.doNotDisturb)
                }.accessibilityValue(Text(LocalizedStringKey(model.chat.preferences.doNotDisturb ? "Aan" : "Uit")))
                menuTile("Uitloggen", symbol: "rectangle.portrait.and.arrow.right", identifier: "menu-logout", destructive: true) { afterMenu { logout() } }
                menuTile("Groepschats", symbol: "person.3", identifier: "open-groups") { afterMenu { showGroups = true } }
                menuTile("Vertaling", symbol: "globe", identifier: "open-translation") { afterMenu { showTranslation = true } }
            }.padding(12)
        }
        .frame(width: 252, height: verticalSizeClass == .compact ? 180 : 240)
        .background(NativeWebStyle.panel)
        .accessibilityElement(children: .contain).accessibilityIdentifier("main-menu-grid")
    }

    private func menuTile(_ title: String, symbol: String, identifier: String, destructive: Bool = false, selected: Bool = false,
                          action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol) }
            .buttonStyle(NativeWebMenuTileStyle(destructive: destructive, selected: selected))
            .accessibilityLabel(LocalizedStringKey(title)).help(LocalizedStringKey(title))
            .accessibilityIdentifier(identifier)
    }

    private func afterMenu(_ action: @escaping @MainActor () -> Void) {
        mainMenuOpen = false
        menuPresentation?.cancel()
        menuPresentation = Task { @MainActor in
            do { try await Task.sleep(nanoseconds: 250_000_000) } catch { return }
            guard !Task.isCancelled, model.currentOwner != nil else { return }
            action()
            menuPresentation = nil
        }
    }

    private func loadAvatars() {
        if let configuration = model.connectedConfiguration, let owner = model.currentOwner {
            archive.configure(try? NativeHistoryScope(configuration: configuration, owner: owner))
        } else { archive.configure(nil) }
        guard model.canSend, case .connected(let owner) = model.phase, case .ready(let roster) = model.roster else { avatars.detach(); return }
        avatars.connect(model.activeWebSession, owner: owner, contacts: roster)
    }

    private func presenceColor(_ presence: NativeContactPresence) -> Color {
        switch presence {
        case .online: return .green
        case .offline: return .red
        case .away, .extendedAway: return .orange
        case .busy: return .red
        case .unknown: return .gray
        }
    }

    private var connectionStatus: String {
        if model.isReconnecting { return "Verbinding herstellen…" }
        if case .connected(let jid) = model.phase { return "XMPP verbonden als " + jid }
        return "Niet verbonden"
    }
}
