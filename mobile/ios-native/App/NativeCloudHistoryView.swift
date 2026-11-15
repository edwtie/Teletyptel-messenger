import SwiftUI

struct NativeCloudHistoryHeader: View {
    @ObservedObject var model: NativeCloudSync
    let peer: String
    let kind: String
    let load: (Bool, Bool) -> Void

    var body: some View {
        let state = model.state(peer: peer, kind: kind)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                if state.loading { ProgressView().accessibilityLabel("Online geschiedenis ophalen") }
                Text(model.available ? "Online geschiedenis" : "Offline · lokale cache")
                    .font(.caption).foregroundStyle(NativeWebStyle.muted)
                    .accessibilityIdentifier(state.ready ? "cloud-history-ready" : "cloud-history-status")
                Spacer()
                if state.nextCursor != nil {
                    Button { load(true, false) } label: { Image(systemName: "arrow.up").frame(width: 44, height: 44) }
                        .accessibilityLabel("Eerdere online berichten ophalen").accessibilityIdentifier("cloud-history-earlier")
                        .disabled(state.loading || !model.available)
                }
                Button { load(false, true) } label: { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }
                    .accessibilityLabel("Online geschiedenis vernieuwen").accessibilityIdentifier("cloud-history-refresh")
                    .disabled(state.loading || !model.available)
            }
            if let notice = state.notice { Text(notice).font(.caption).accessibilityIdentifier("cloud-history-notice") }
        }
        .task(id: model.available) { if model.available { load(false, false) } }
    }
}

struct NativeHistoricalContacts: View {
    @ObservedObject var cloud: NativeCloudSync
    let rosterJIDs: Set<String>
    let search: String
    let selected: String?
    var body: some View {
        let previous = cloud.conversations.filter { $0.kind == "contact" && !rosterJIDs.contains($0.peer) &&
            (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.peer.localizedCaseInsensitiveContains(search)) }
        if !previous.isEmpty {
            Section("Eerdere online gesprekken") {
                ForEach(previous, id: \.peer) { conversation in
                    NavigationLink(value: conversation.peer) {
                        HStack(spacing: 8) {
                            NativeWebAvatar(name: conversation.name)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(conversation.name.isEmpty ? conversation.peer : conversation.name).lineLimit(1)
                                Text("Archief · niet in je contactenlijst").font(.caption)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                        .foregroundStyle(selected == conversation.peer ? Color.white : NativeWebStyle.muted)
                        .contentShape(Rectangle())
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("cloud-contact-" + conversation.peer)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct NativeCloudSaveStatus: View {
    @ObservedObject var model: NativeCloudSync
    var body: some View {
        if let notice = model.notice { Text(notice).font(.caption).accessibilityIdentifier("cloud-save-status") }
    }
}

struct NativeOnlineGroups: View {
    @ObservedObject var cloud: NativeCloudSync
    @ObservedObject var groups: NativeGroupModel
    let login: NativeLoginModel
    var translation: NativeTranslationModel?
    var avatars: NativeAvatarCache? = nil
    var body: some View {
        let previous = cloud.conversations.filter { $0.kind == "group" }
        if !previous.isEmpty {
            Section("Online groepsgeschiedenis") {
                ForEach(previous, id: \.peer) { conversation in
                    NavigationLink {
                        NativeGroupChatView(model: groups, room: conversation.peer, login: login, translation: translation, avatars: avatars)
                            .onAppear { login.openCloudGroup(conversation.peer) }
                    } label: {
                        Label(conversation.name.isEmpty ? conversation.peer : conversation.name, systemImage: "clock.arrow.circlepath")
                    }.accessibilityIdentifier("cloud-group-" + conversation.peer)
                }
            }
        }
    }
}
