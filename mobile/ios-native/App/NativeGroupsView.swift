import SwiftUI
import UIKit

struct NativeGroupsView: View {
    @ObservedObject var model: NativeGroupModel
    var login: NativeLoginModel? = nil
    var translation: NativeTranslationModel? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var room = ""
    @State private var nickname = ""
    @State private var confirmCreate = false

    var body: some View {
        NavigationStack {
            List {
                Section("Bestaande groep openen") {
                    TextField("Groepsadres", text: $room).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("group-address")
                    TextField("Jouw schermnaam", text: $nickname).autocorrectionDisabled()
                        .accessibilityIdentifier("group-nickname")
                    Text("Gebruik het volledige adres, zoals groep@conference.jouwdomein. Alleen bestaande groepen op je eigen XMPP-domein worden ondersteund.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button { model.join(room: room, nickname: nickname) } label: { Label("Groep openen", systemImage: "person.3.fill") }
                        .disabled(!model.available).accessibilityIdentifier("group-join")
                }
                if let error = model.error { Text(error).foregroundStyle(.red).accessibilityIdentifier("group-error") }
                NativeInvitationInbox(model: model.invitationModel, nickname: $nickname) { identifier in
                    model.acceptInvitation(identifier, nickname: nickname)
                }
                Section("Groepschats") {
                    if model.rooms.isEmpty { Text("Nog geen groepen geopend in deze sessie.") }
                    ForEach(model.rooms) { group in
                        NavigationLink { NativeGroupChatView(model: model, room: group.room, login: login, translation: translation) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Label(group.room, systemImage: "person.3.fill").lineLimit(2)
                                Text(group.joining ? "Deelname controleren…" : group.snapshot == nil ? "Niet in de groep" : "Deelgenomen")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }.accessibilityIdentifier("group-room-" + group.room)
                    }
                }
                Section("Nieuwe groep") {
                    Button { confirmCreate = true } label: { Label("Nieuwe besloten groep maken", systemImage: "plus.bubble") }
                        .disabled(!model.available || !NativeMUCStream.validNickname(nickname) || room.isEmpty)
                        .accessibilityIdentifier("group-create")
                }
                NativeRoomDiscovery(model: model.management) { room = $0 }
            }
            .nativeWebForm()
            .navigationTitle("Groepschats")
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
            } }
            .confirmationDialog("Besloten groep maken?", isPresented: $confirmCreate, titleVisibility: .visible) {
                Button("Besloten groep maken") { model.join(room: room, nickname: nickname, create: true) }
                Button("Annuleren", role: .cancel) {}
            } message: { Text("Alleen op je eigen groepsserver, als die aanmaken toestaat. De groep krijgt ledengebonden toegang en wordt niet publiek vindbaar.") }
        }
    }
}

struct NativeGroupChatView: View {
    @ObservedObject var model: NativeGroupModel
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    let room: String
    var login: NativeLoginModel? = nil
    var translation: NativeTranslationModel? = nil
    @State private var showParticipants = false
    @State private var showInvite = false
    @State private var searching = false
    @State private var search = ""
    @FocusState private var searchFocused: Bool
    private var group: NativeGroupConversation? { model.rooms.first { $0.room == room } }

    var body: some View {
        VStack(spacing: 0) {
            if let group = group {
                status(group)
                if searching { TextField("Zoek in deze groepssessie", text: $search).focused($searchFocused).textFieldStyle(.roundedBorder).frame(minHeight: 44).padding(.horizontal, 16).accessibilityIdentifier("group-search") }
                messageList(group)
                if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).padding(4) }
                composer(group)
            }
        }
        .navigationTitle(room.components(separatedBy: "@")[0]).navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(NativeWebStyle.panel, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .font(NativeWebStyle.font()).foregroundStyle(NativeWebStyle.text)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { showInvite = true } label: { Image(systemName: "person.badge.plus").frame(width: 44, height: 44) }
                    .disabled(group?.snapshot?.canSpeak != true).accessibilityLabel("Contact uitnodigen").accessibilityIdentifier("group-invite")
                Menu {
                    Button { showParticipants = true } label: { Label("Deelnemers en groepsbeheer", systemImage: "person.3") }
                    Button {
                        searching.toggle()
                        if !searching { search = ""; searchFocused = false }
                        else { Task { await Task.yield(); searchFocused = true } }
                    } label: { Label("Berichten zoeken", systemImage: "magnifyingglass") }
                } label: { Image(systemName: "person.3").frame(width: 44, height: 44) }.accessibilityLabel("Deelnemers en groepsmenu")
                Button { model.leave(room: room) } label: { Image(systemName: "rectangle.portrait.and.arrow.right").frame(width: 44, height: 44) }
                    .tint(.red).accessibilityLabel("Groep verlaten").accessibilityIdentifier("group-leave")
            }
        }
        .sheet(isPresented: $showParticipants) {
            NativeGroupManagementView(groups: model, model: model.management, room: room)
        }
        .sheet(isPresented: $showInvite) { NativeInviteContactView(groups: model, model: model.invitationModel, room: room) }
    }

    @ViewBuilder
    private func status(_ group: NativeGroupConversation) -> some View {
        if group.joining { ProgressView("Deelname controleren…").padding(8) }
        else if let snapshot = group.snapshot {
            if verticalSizeClass != .compact || !snapshot.canSpeak {
                Text("\(snapshot.participants.count) deelnemers · \(snapshot.canSpeak ? "Groepschat" : "Alleen lezen")")
                    .font(.caption).padding(6).accessibilityIdentifier("group-status")
            }
        } else {
            Text(group.error?.label ?? "Je bent niet meer in de groep.").font(.caption).padding(6)
            Button("Opnieuw deelnemen") { model.join(room: room, nickname: group.nickname) }.disabled(!model.available)
        }
    }

    private func messageList(_ group: NativeGroupConversation) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    LazyVStack(spacing: 12) {
                        if group.historyLimited { Text("Alleen de meest recente berichten passen in deze preview.").font(.caption) }
                        ForEach(group.messages.filter { search.isEmpty || $0.body.localizedCaseInsensitiveContains(search) || $0.nickname.localizedCaseInsensitiveContains(search) }) { message in
                            NativeGroupBubble(message: message, translation: translation, session: login?.activeWebSession).id(message.id)
                        }
                    }.padding(.horizontal, 14).padding(.top, 14)
                    Color.clear.frame(height: 1).id("group-bottom")
                }
            }
            .modifier(NativeChatBottomAnchor())
            .background {
                GeometryReader { geometry in
                    Image(geometry.size.width > geometry.size.height ? "ChatBackgroundWide" : "ChatBackground")
                        .resizable().scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipped()
                        .task(id: geometry.size) {
                            await Task.yield()
                            guard !Task.isCancelled else { return }
                            proxy.scrollTo("group-bottom", anchor: .bottom)
                        }
                }
            }
            .clipped()
            .onChange(of: group.messages.last?.id) { identifier in if identifier != nil { proxy.scrollTo("group-bottom", anchor: .bottom) } }
            .onAppear { proxy.scrollTo("group-bottom", anchor: .bottom) }
        }
    }

    private func composer(_ group: NativeGroupConversation) -> some View {
        HStack(spacing: 6) {
            if let login = login { NativeAttachmentButton(login: login) { link in
                let draft = self.group?.draft ?? ""
                model.setDraft(draft.isEmpty ? link : draft + "\n" + link, room: room)
            }.disabled(group.snapshot?.canSpeak != true) }
            TextField("Typ een groepsbericht", text: Binding(get: { self.group?.draft ?? "" }, set: { model.setDraft($0, room: room) }), axis: .vertical)
                .lineLimit(1...4).accessibilityIdentifier("group-draft")
            Button { model.send(room: room) } label: { Image(systemName: "paperplane").frame(width: 44, height: 44) }
                .buttonStyle(NativeWebIconStyle(prominent: true, round: true))
                .disabled(!model.available || group.snapshot?.canSpeak != true || group.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Groepsbericht verzenden").accessibilityIdentifier("group-send")
        }.nativeWebComposer().padding(.horizontal, 10).padding(.vertical, verticalSizeClass == .compact ? 4 : 10)
    }
}

private struct NativeGroupBubble: View {
    let message: NativeGroupText
    var translation: NativeTranslationModel? = nil
    var session: NativeAccountWebSession? = nil
    private var fillColor: Color { message.own ? NativeWebStyle.outgoing : NativeWebStyle.incoming }
    private var borderColor: Color { message.own ? NativeWebStyle.outgoingLine : NativeWebStyle.incomingLine }
    private var description: String { message.nickname + ": " + message.body + ". " + message.state.label }
    private var indicator: String { message.state == .sending ? "clock" : message.state == .submitted ? "checkmark" : "exclamationmark.circle" }
    var body: some View {
        HStack {
            if message.own { Spacer(minLength: 36) }
            else { NativeWebAvatar(name: message.nickname, size: 30) }
            content
            .foregroundStyle(NativeWebStyle.text)
            .padding(.horizontal, 10).padding(.vertical, 8).background(NativeWebBubble(own: message.own).fill(fillColor))
            .overlay(NativeWebBubble(own: message.own).stroke(borderColor, lineWidth: 1))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(description)
            .accessibilityIdentifier("group-message-" + message.id.uuidString)
            .contextMenu { Button { UIPasteboard.general.string = message.body } label: { Label("Kopiëren", systemImage: "doc.on.doc") } }
            if !message.own { Spacer(minLength: 36) }
            else { NativeWebAvatar(name: message.nickname, size: 30) }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(message.nickname).font(.caption.bold())
            if let session = session, NativeFileReference.inMessage(message.body, configuration: session.configuration) != nil {
                Text(message.body).textSelection(.enabled)
                NativeFileMessageButton(bodyText: message.body, session: session)
            } else if let translation = translation {
                NativeGroupTranslationExtras(model: translation, message: message)
            } else {
                Text(message.body).textSelection(.enabled)
            }
            metadata
        }
    }

    private var metadata: some View {
        HStack(spacing: 5) {
            Spacer(minLength: 0)
            Text(message.date, style: .time).font(.caption2)
            if message.own { Image(systemName: indicator).font(.caption2) }
        }.foregroundStyle(NativeWebStyle.muted)
    }
}

private struct NativeGroupTranslationExtras: View {
    @ObservedObject var model: NativeTranslationModel
    let message: NativeGroupText
    private var key: String { "group:" + message.room + ":" + message.id.uuidString }
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(message.body).textSelection(.enabled)
            if model.preferences.mode != "off", model.sharingConsent, let result = model.results[key] { NativeTranslationCaption(result: result) }
            if model.preferences.mode == "manual" {
                Button("Vertalen") { model.translate(message.body, key: key) }.font(.caption)
                    .disabled(!model.ready || !model.available || !model.sharingConsent)
            }
        }
        .task(id: "\(model.preferences.mode):\(model.preferences.targetLanguage):\(model.sharingConsent):\(model.ready)") {
            if model.preferences.mode == "automatic" { model.translate(message.body, key: key, automatic: true) }
        }
    }
}
