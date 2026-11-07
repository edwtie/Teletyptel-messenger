import SwiftUI

struct NativeChatView: View {
    @ObservedObject var model: NativeLoginModel
    let contact: NativeContact
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    private var messages: [NativeChatMessage] { model.chat.messages.filter { $0.peer == contact.jid } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Text(model.isConnected ? "Verbonden · één-op-één chat" : "Niet verbonden · tekst blijft in deze sessie bewaard")
                    .font(.footnote)
                    .padding(8)
                    .accessibilityIdentifier("chat-connection")
                Text("Preview: alleen sessiegeheugen. De app beëindigen, opnieuw aanmelden of uitloggen wist deze gegevens.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                if model.chat.historyLimited {
                    Text("Alleen de meest recente berichten passen in deze preview.").font(.caption).padding(8)
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(messages) { message in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(message.state == .incoming ? contact.displayName : "Ik").font(.caption.bold())
                                    Text(message.body).textSelection(.enabled)
                                    Text(message.state.label).font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(12)
                                .background(message.state == .incoming ? Color(uiColor: .secondarySystemBackground) : Color.blue.opacity(0.12),
                                            in: RoundedRectangle(cornerRadius: 12))
                                .frame(maxWidth: .infinity, alignment: message.state == .incoming ? .leading : .trailing)
                                .accessibilityElement(children: .combine)
                                .accessibilityIdentifier("chat-message-" + message.id.uuidString)
                                .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.last?.id) { identifier in
                        if let identifier = identifier { proxy.scrollTo(identifier, anchor: .bottom) }
                    }
                }
                if let error = model.chatError { Text(error).font(.caption).padding(8).accessibilityIdentifier("chat-error") }
                HStack(alignment: .bottom, spacing: 12) {
                    TextField("Typ een bericht", text: Binding(
                        get: { model.chat.drafts[contact.jid] ?? "" },
                        set: { model.setDraft($0, peer: contact.jid) }), axis: .vertical)
                        .lineLimit(1...5)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityLabel("Bericht")
                        .accessibilityIdentifier("chat-draft")
                    Button { model.sendDraft(to: contact.jid) } label: {
                        Image(systemName: "paperplane.fill").frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel("Bericht verzenden")
                    .accessibilityIdentifier("chat-send")
                    .disabled(!model.canSend || (model.chat.drafts[contact.jid] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding()
            }
            .frame(maxWidth: 800)
            .frame(maxWidth: .infinity)
            .navigationTitle(contact.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gereed") { dismiss() } } }
            .scrollDismissesKeyboard(.interactively)
        }
        .overlay { if scenePhase != .active { Color(uiColor: .systemBackground).ignoresSafeArea().overlay(Text("TeleTypTel")) } }
        .onChange(of: model.phase) { phase in
            if phase == .signedOut || phase == .idle { dismiss() }
        }
    }
}
