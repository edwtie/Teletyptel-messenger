import SwiftUI

struct NativeHistoryBrowserView: View {
    @ObservedObject var login: NativeLoginModel
    @ObservedObject var calls: NativeCallController
    @ObservedObject var translation: NativeTranslationModel
    @ObservedObject var archive: NativeConversationArchive
    let avatars: NativeAvatarCache
    var archivedOnly = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var search = ""
    private var roster: [NativeContact] { if case .ready(let contacts) = login.roster { return contacts }; return [] }
    private var conversations: [NativeConversationSummary] {
        var values = NativeConversationSummary.list(contacts: roster, groups: login.groups.rooms, messages: login.chat.messages, catalog: login.cloudHistory.conversations)
        let known = Set(values.map(\.id))
        for key in archive.entries where !known.contains(key) {
            let parts = key.components(separatedBy: "\u{0}")
            if parts.count == 2 { values.append(NativeConversationSummary(peer: parts[1], kind: parts[0], name: parts[1])) }
        }
        return values.filter { (!archivedOnly || archive.contains(peer: $0.peer, kind: $0.kind)) &&
            (search.isEmpty || ($0.name + " " + $0.peer + " " + $0.preview).localizedCaseInsensitiveContains(search)) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(archivedOnly ? "Archiveren verbergt het gesprek alleen op dit apparaat, per account en server. Het verwijdert geen berichten en blokkeert niemand." : "Gesprekken uit je contacten, deze sessie en de bestaande online gesprekslijst. Open een gesprek voor de beschikbare servergeschiedenis.").font(.caption)
                    if let notice = login.cloudHistory.notice { Text(notice).font(.caption) }
                }
                if conversations.isEmpty { Text(archivedOnly ? "Geen gearchiveerde gesprekken." : "Geen gesprekken gevonden.") }
                ForEach(conversations) { conversation in
                    NavigationLink { destination(conversation) } label: {
                        HStack(spacing: 10) {
                            NativeCachedAvatar(name: conversation.name, jid: conversation.peer, cache: avatars)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(conversation.name).font(.headline).lineLimit(1)
                                Text(conversation.preview.isEmpty ? conversation.peer : conversation.preview).font(.caption).lineLimit(2)
                            }
                            Spacer()
                            if let date = conversation.date { Text(date, style: .date).font(.caption2) }
                            if archive.contains(peer: conversation.peer, kind: conversation.kind) { Image(systemName: "archivebox") }
                        }.foregroundStyle(NativeWebStyle.text)
                    }
                    .swipeActions { archiveAction(conversation) }
                    .contextMenu { archiveAction(conversation) }
                }
            }.nativeWebForm().searchable(text: $search, prompt: "Gesprekken zoeken")
                .navigationTitle(archivedOnly ? "Archief" : "Geschiedenis")
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
                } }
        }
        .onChange(of: login.phase) { _ in if !login.isConnected { dismiss() } }
        .overlay { if scenePhase != .active { NativeWebStyle.panel.ignoresSafeArea().overlay(Text("TeleTypTel")) } }
    }
    private func archiveAction(_ value: NativeConversationSummary) -> some View {
        Button {
            archive.set(peer: value.peer, kind: value.kind, archived: !archive.contains(peer: value.peer, kind: value.kind))
        } label: { Label(archive.contains(peer: value.peer, kind: value.kind) ? "Terugzetten" : "Archiveren", systemImage: "archivebox") }
    }
    @ViewBuilder private func destination(_ value: NativeConversationSummary) -> some View {
        if value.kind == "group" {
            NativeGroupChatView(model: login.groups, room: value.peer, login: login, translation: translation, avatars: avatars, archive: archive)
                .onAppear { login.openCloudGroup(value.peer) }
        } else {
            let contact = roster.first { $0.jid == value.peer } ?? NativeContact(jid: value.peer, name: value.name, groups: [], subscription: "none")
            NativeChatView(model: login, calls: calls, translation: translation, contact: contact,
                contactProfile: avatars.profiles[contact.jid], ownProfile: avatars.owner.flatMap { avatars.profiles[$0] }, avatars: avatars, archive: archive,
                historyOnly: !roster.contains { $0.jid == value.peer })
        }
    }
}
