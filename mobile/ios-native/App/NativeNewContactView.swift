import SwiftUI

struct NativeNewContactView: View {
    @ObservedObject var login: NativeLoginModel
    @StateObject private var editor = NativeContactEditor()
    @State private var jid = ""
    @State private var name = ""
    @State private var requestPresence = false
    @Environment(\.dismiss) private var dismiss
    private var address: String { jid.trimmingCharacters(in: .whitespacesAndNewlines) }
    var body: some View {
        NavigationStack {
            Form {
                Section("Nieuw contact") {
                    TextField("XMPP-adres", text: $jid).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.emailAddress)
                        .accessibilityIdentifier("new-contact-jid")
                    TextField("Naam", text: $name).accessibilityIdentifier("new-contact-name")
                    Text("Gebruik het volledige XMPP-adres, bijvoorbeeld naam@chatserver.nl. Een telefoonnummer of gewoon e-mailadres is niet automatisch een Messenger-account.").font(.caption)
                }.disabled(editor.busy || editor.saved)
                Section("Online status") {
                    Toggle("Toestemming voor online status vragen", isOn: $requestPresence).disabled(editor.busy || editor.saved)
                    Text("Dit verstuurt een statusverzoek naar het contact. Het geeft die persoon niet automatisch toegang tot jouw status, camera of berichten.").font(.caption)
                }
                if let notice = editor.notice { Text(notice).accessibilityIdentifier("new-contact-status") }
                if editor.busy { ProgressView("Serverbevestiging afwachten…") }
                if !editor.saved {
                    Button {
                        editor.add(jid: address, name: name.trimmingCharacters(in: .whitespacesAndNewlines), requestPresence: requestPresence,
                                   owner: login.currentOwner ?? "", sender: login.contactManager)
                    } label: { Label("Contact toevoegen", systemImage: "person.badge.plus") }
                        .disabled(editor.busy || !login.canSend || !NativeContactEditing.valid(jid: address, name: name, owner: login.currentOwner ?? ""))
                        .accessibilityIdentifier("new-contact-save")
                }
            }.nativeWebForm().navigationTitle("Nieuw contact")
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
                } }
        }
        .onDisappear { editor.detach() }
        .onChange(of: login.phase) { _ in if !login.canSend { editor.detach(); dismiss() } }
    }
}
