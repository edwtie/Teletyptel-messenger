import SwiftUI

struct NativeForwardMessageView: View {
    @ObservedObject var model: NativeLoginModel
    let text: String
    @Environment(\.dismiss) private var dismiss
    @State private var selected: String?
    @State private var search = ""
    private var contacts: [NativeContact] {
        guard case .ready(let contacts) = model.roster else { return [] }
        return contacts.filter { search.isEmpty || $0.displayName.localizedCaseInsensitiveContains(search) || $0.jid.localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section("Oorspronkelijk bericht") {
                    Text(text).lineLimit(5)
                    Text("Alleen het origineel wordt doorgestuurd, niet jouw privévertaling. Bestandslinks blijven deelbaar.").font(.caption)
                }
                Section("Kies een contact") {
                    TextField("Contacten zoeken", text: $search)
                    ForEach(contacts) { contact in
                        Button { selected = contact.jid } label: {
                            HStack { NativeWebAvatar(name: contact.displayName); Text(contact.displayName); Spacer(); if selected == contact.jid { Image(systemName: "checkmark.circle.fill") } }
                        }.accessibilityIdentifier("forward-contact-" + contact.jid)
                    }
                }
                Button {
                    if let selected = selected, model.forwardMessage(text, to: selected) { dismiss() }
                } label: { Label("Doorsturen", systemImage: "arrowshape.turn.up.right") }
                    .disabled(selected == nil || !model.canSend || !NativeChatCodec.validBody("Doorgestuurd:\n" + text))
                    .accessibilityIdentifier("forward-confirm")
                if let error = model.chatError { Text(error).font(.caption) }
            }
            .nativeWebForm().navigationTitle("Doorsturen")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten") } }
        }
        .onChange(of: model.phase) { _ in if !model.isConnected { dismiss() } }
    }
}

struct NativeEditMessageView: View {
    @ObservedObject var model: NativeLoginModel
    let message: NativeChatMessage
    @State private var text: String
    @Environment(\.dismiss) private var dismiss
    init(model: NativeLoginModel, message: NativeChatMessage) {
        self.model = model; self.message = message; _text = State(initialValue: message.body)
    }
    var body: some View {
        NavigationStack {
            Form {
                TextField("Bericht", text: $text, axis: .vertical).lineLimit(3...8).accessibilityIdentifier("message-edit-text")
                Text("Correctieverzoek voor je laatste eigen bericht. Andere clients kunnen een los gecorrigeerd bericht tonen.").font(.caption)
                Button {
                    model.changeMessage(message.id, correctedBody: text)
                    dismiss()
                } label: { Label("Bewerking versturen", systemImage: "checkmark") }
                    .disabled(!model.canChangeMessages || !model.chat.canCorrect(message.id) || !NativeChatCodec.validBody(text) || text == message.body)
                    .accessibilityIdentifier("message-edit-save")
            }.nativeWebForm().navigationTitle("Bericht bewerken")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten") } }
        }
        .onChange(of: model.phase) { _ in if !model.isConnected { dismiss() } }
    }
}
