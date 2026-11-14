import SwiftUI

struct NativeRoomDiscovery: View {
    @ObservedObject var model: NativeGroupManagementModel
    let select: (String) -> Void
    var body: some View {
        Section("Groepen op jouw server") {
            Button { model.run(.discover) } label: { Label("Beschikbare groepen ophalen", systemImage: "magnifyingglass") }.disabled(model.busy)
            if model.busy { ProgressView() }
            ForEach(model.discovered) { item in Button { select(item.room) } label: {
                VStack(alignment: .leading) { Text(item.name); Text(item.room).font(.caption) }
            } }
            Text("Besloten groepen worden niet altijd vermeld. Selecteren vult alleen het adres in; deelnemen blijft je eigen keuze.").font(.caption)
            if model.room == nil, let status = model.status { Text(status).font(.caption) }
        }
    }
}

struct NativeGroupManagementView: View {
    @ObservedObject var groups: NativeGroupModel
    @ObservedObject var model: NativeGroupManagementModel
    let room: String
    @State private var configuration: NativeRoomConfiguration?
    @State private var subject = ""
    @State private var memberJID = ""
    @State private var affiliation = "member"
    @State private var pending: NativeGroupCommand?
    @State private var confirm = false
    @Environment(\.dismiss) private var dismiss
    private var group: NativeGroupConversation? { groups.rooms.first { $0.room == room } }
    private var owner: Bool { group?.snapshot?.ownAffiliation == "owner" }
    private var administrator: Bool { owner || group?.snapshot?.ownAffiliation == "admin" }
    private var moderator: Bool { administrator || group?.snapshot?.ownRole == "moderator" }
    var body: some View {
        NavigationStack {
            Form {
                Section("Groep") {
                    Text(room).font(.caption)
                    Text(group?.subject.isEmpty == false ? group!.subject : "Nog geen onderwerp")
                    TextField("Nieuw onderwerp", text: $subject).accessibilityIdentifier("group-subject")
                    Button { groups.setSubject(subject, room: room) } label: { Label("Onderwerp verzenden", systemImage: "text.bubble") }
                        .disabled(model.busy || group?.snapshot?.canSpeak != true || subject.utf8.count > 512)
                    if let error = groups.error { Text(error).font(.caption) }
                }
                Section("Deelnemers") {
                    ForEach(group?.snapshot?.occupants ?? []) { occupant in
                        HStack {
                            VStack(alignment: .leading) { Text(occupant.nickname); Text(occupant.role + " · " + occupant.affiliation).font(.caption) }
                            Spacer()
                            if moderator, occupant.nickname != group?.nickname {
                                Menu {
                                    action("Spreekrecht geven", .role(room, occupant.nickname, "participant"), icon: "mic")
                                    action("Spreekrecht intrekken", .role(room, occupant.nickname, "visitor"), icon: "mic.slash")
                                    action("Moderator maken", .role(room, occupant.nickname, "moderator"), icon: "person.badge.key")
                                    action("Uit gesprek verwijderen", .role(room, occupant.nickname, "none"), icon: "person.badge.minus")
                                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.disabled(model.busy)
                            }
                        }
                    }
                }
                if administrator { membershipSection }
                if owner { configurationSection }
                if model.busy { ProgressView("Groepsserver raadplegen…") }
                if model.room == room, let status = model.status { Text(status).font(.caption).accessibilityIdentifier("group-management-status") }
                Text("De server controleert alle rechten. Verwijderen uit het gesprek is niet hetzelfde als een lidmaatschap intrekken of blokkeren. Eigenarenoverdracht en de groep vernietigen zijn hier bewust niet beschikbaar.").font(.caption)
            }
            .navigationTitle("Groepsbeheer")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten").accessibilityIdentifier("close-group-management") } }
        }
        .confirmationDialog("Groepsrechten of toegang wijzigen?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Wijziging uitvoeren", role: .destructive) { if let command = pending { model.run(command) }; pending = nil }
            Button("Annuleren", role: .cancel) { pending = nil }
        } message: { Text("Dit kan toegang tot deze groep veranderen. De server moet de wijziging eerst bevestigen.") }
        .onChange(of: model.configuration) { value in if model.room == room { configuration = value } }
    }
    private var membershipSection: some View {
        Section("Lidmaatschap en blokkades") {
            Picker("Lijst / nieuwe bevoegdheid", selection: $affiliation) {
                Text("Lid").tag("member"); Text("Beheerder").tag("admin"); Text("Geblokkeerd").tag("outcast"); Text("Geen lid").tag("none")
            }
            Button { model.run(.members(room, affiliation)) } label: { Label("Lijst ophalen", systemImage: "list.bullet") }.disabled(model.busy || affiliation == "none")
            if model.room == room { ForEach(model.members, id: \.self) { jid in Button(jid) { memberJID = jid } } }
            TextField("Volledig XMPP-adres", text: $memberJID).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button { pending = .affiliation(room, memberJID, affiliation); confirm = true } label: { Label("Bevoegdheid wijzigen", systemImage: "person.badge.key") }
                .disabled(model.busy || NativeChatCodec.bareJID(memberJID) != memberJID)
        }
    }
    private var configurationSection: some View {
        Section("Groepsinstellingen (eigenaar)") {
            Button { configuration = nil; model.run(.configuration(room)) } label: { Label("Instellingen ophalen", systemImage: "gearshape") }.disabled(model.busy)
            if configuration != nil {
                TextField("Groepsnaam", text: field(\.name))
                TextField("Omschrijving", text: field(\.description))
                Toggle("Alleen leden", isOn: flag(\.membersOnly))
                Toggle("Publiek vindbaar", isOn: flag(\.publicRoom))
                Toggle("Blijvende groep", isOn: flag(\.persistent))
                Toggle("Gemodereerd", isOn: flag(\.moderated))
                Toggle("Leden mogen uitnodigen", isOn: flag(\.allowInvites))
                Button { if let configuration = configuration { pending = .configure(room, configuration); confirm = true } } label: { Label("Groepsinstellingen opslaan", systemImage: "checkmark") }.disabled(model.busy)
                Text("Toegang en vindbaarheid veranderen geldt voor de hele groep. Wachtwoordbeveiligde formulieren met een bestaand geheim worden niet aangepast.").font(.caption)
            }
        }
    }
    private func action(_ title: String, _ command: NativeGroupCommand, icon: String) -> some View {
        Button { pending = command; confirm = true } label: { Label(title, systemImage: icon) }
    }
    private func field(_ key: WritableKeyPath<NativeRoomConfiguration, String>) -> Binding<String> {
        Binding(get: { configuration?[keyPath: key] ?? "" }, set: { configuration?[keyPath: key] = $0 })
    }
    private func flag(_ key: WritableKeyPath<NativeRoomConfiguration, Bool>) -> Binding<Bool> {
        Binding(get: { configuration?[keyPath: key] ?? false }, set: { configuration?[keyPath: key] = $0 })
    }
}
