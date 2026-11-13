import SwiftUI
import UIKit

struct NativeGroupsView: View {
    @ObservedObject var model: NativeGroupModel
    @Environment(\.dismiss) private var dismiss
    @State private var room = ""
    @State private var nickname = ""

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
                Section("Groepschats") {
                    if model.rooms.isEmpty { Text("Nog geen groepen geopend in deze sessie.") }
                    ForEach(model.rooms) { group in
                        NavigationLink { NativeGroupChatView(model: model, room: group.room) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Label(group.room, systemImage: "person.3.fill").lineLimit(2)
                                Text(group.joining ? "Deelname controleren…" : group.snapshot == nil ? "Niet in de groep" : "Deelgenomen")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }.accessibilityIdentifier("group-room-" + group.room)
                    }
                }
            }
            .navigationTitle("Groepschats")
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
            } }
        }
    }
}

private struct NativeGroupChatView: View {
    @ObservedObject var model: NativeGroupModel
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    let room: String
    @State private var showParticipants = false
    private var group: NativeGroupConversation? { model.rooms.first { $0.room == room } }

    var body: some View {
        VStack(spacing: 0) {
            if let group = group {
                status(group)
                messageList(group)
                if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).padding(4) }
                composer(group)
            }
        }
        .navigationTitle(room.components(separatedBy: "@")[0]).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { showParticipants = true } label: { Image(systemName: "person.3").frame(width: 44, height: 44) }.accessibilityLabel("Deelnemers")
                Button { model.leave(room: room) } label: { Image(systemName: "rectangle.portrait.and.arrow.right").frame(width: 44, height: 44) }
                    .tint(.red).accessibilityLabel("Groep verlaten").accessibilityIdentifier("group-leave")
            }
        }
        .sheet(isPresented: $showParticipants) {
            NavigationStack {
                List(group?.snapshot?.participants ?? [], id: \.self) { Text($0) }
                    .navigationTitle("Deelnemers")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gereed") { showParticipants = false } } }
            }
        }
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
                        ForEach(group.messages) { message in NativeGroupBubble(message: message).id(message.id) }
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
        HStack(spacing: 10) {
            TextField("Typ een groepsbericht", text: Binding(get: { self.group?.draft ?? "" }, set: { model.setDraft($0, room: room) }), axis: .vertical)
                .lineLimit(1...4).accessibilityIdentifier("group-draft")
            Button { model.send(room: room) } label: { Image(systemName: "paperplane.fill").frame(width: 44, height: 44) }
                .disabled(!model.available || group.snapshot?.canSpeak != true || group.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Groepsbericht verzenden").accessibilityIdentifier("group-send")
        }.padding(.horizontal, 12).padding(.vertical, verticalSizeClass == .compact ? 4 : 12).background(.background)
    }
}

private struct NativeGroupBubble: View {
    let message: NativeGroupText
    private var fillColor: Color { message.own ? Color(red: 0.86, green: 0.97, blue: 0.92) : Color(uiColor: .secondarySystemBackground) }
    private var borderColor: Color { message.own ? Color.green.opacity(0.55) : Color.gray.opacity(0.35) }
    private var description: String { message.nickname + ": " + message.body + ". " + message.state.label }
    private var indicator: String { message.state == .sending ? "clock" : message.state == .submitted ? "checkmark" : "exclamationmark.circle" }
    var body: some View {
        HStack {
            if message.own { Spacer(minLength: 36) }
            content
            .foregroundStyle(message.own ? Color.black : Color.primary)
            .padding(12).background(RoundedRectangle(cornerRadius: 14).fill(fillColor))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: 1))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(description)
            .accessibilityIdentifier("group-message-" + message.id.uuidString)
            .contextMenu { Button { UIPasteboard.general.string = message.body } label: { Label("Kopiëren", systemImage: "doc.on.doc") } }
            if !message.own { Spacer(minLength: 36) }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(message.nickname).font(.caption.bold())
            Text(message.body).textSelection(.enabled)
            metadata
        }
    }

    private var metadata: some View {
        HStack(spacing: 5) {
            Spacer(minLength: 0)
            Text(message.date, style: .time).font(.caption2)
            if message.own { Image(systemName: indicator).font(.caption2) }
        }.foregroundStyle(.secondary)
    }
}
