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
    let room: String
    @State private var showParticipants = false
    private var group: NativeGroupConversation? { model.rooms.first { $0.room == room } }

    var body: some View {
        VStack(spacing: 0) {
            if let group = group {
                if group.joining { ProgressView("Deelname controleren…").padding(8) }
                else if let snapshot = group.snapshot {
                    Text("\(snapshot.participants.count) deelnemers · \(snapshot.canSpeak ? "Groepschat" : "Alleen lezen")")
                        .font(.caption).padding(6).accessibilityIdentifier("group-status")
                } else {
                    Text(group.error?.label ?? "Je bent niet meer in de groep.").font(.caption).padding(6)
                    Button("Opnieuw deelnemen") { model.join(room: room, nickname: group.nickname) }.disabled(!model.available)
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            if group.historyLimited { Text("Alleen de meest recente berichten passen in deze preview.").font(.caption) }
                            ForEach(group.messages) { message in
                                HStack {
                                    if message.own { Spacer(minLength: 36) }
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(message.nickname).font(.caption.bold())
                                        Text(message.body).textSelection(.enabled)
                                        Text(message.state.label).font(.caption2).foregroundStyle(.secondary)
                                    }
                                    .padding(12).background(message.own ? Color(red: 0.86, green: 0.97, blue: 0.92) : Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                                    .accessibilityElement(children: .combine).accessibilityIdentifier("group-message-" + message.id.uuidString)
                                    .contextMenu { Button { UIPasteboard.general.string = message.body } label: { Label("Kopiëren", systemImage: "doc.on.doc") } }
                                    if !message.own { Spacer(minLength: 36) }
                                }.id(message.id)
                            }
                        }.padding(14)
                    }
                    .background(Image("ChatBackground").resizable().scaledToFill().clipped())
                    .clipped()
                    .onChange(of: group.messages.last?.id) { identifier in if let identifier = identifier { proxy.scrollTo(identifier, anchor: .bottom) } }
                    .onAppear { if let identifier = group.messages.last?.id { proxy.scrollTo(identifier, anchor: .bottom) } }
                }
                if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).padding(4) }
                HStack(spacing: 10) {
                    TextField("Typ een groepsbericht", text: Binding(get: { self.group?.draft ?? "" }, set: { model.setDraft($0, room: room) }), axis: .vertical)
                        .lineLimit(1...4).accessibilityIdentifier("group-draft")
                    Button { model.send(room: room) } label: { Image(systemName: "paperplane.fill").frame(width: 44, height: 44) }
                        .disabled(!model.available || group.snapshot?.canSpeak != true || group.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel("Groepsbericht verzenden").accessibilityIdentifier("group-send")
                }.padding(12).background(.background)
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
}
