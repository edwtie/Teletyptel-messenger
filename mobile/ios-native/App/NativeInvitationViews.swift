import SwiftUI

struct NativeInvitationNotice: View {
    @ObservedObject var model: NativeGroupInvitationModel
    let open: () -> Void
    var body: some View {
        if !model.invitations.isEmpty {
            Button(action: open) { Label("Groepsuitnodigingen (\(model.invitations.count))", systemImage: "person.badge.plus") }
                .padding(6).accessibilityIdentifier("invitation-notice")
        }
    }
}

struct NativeInvitationInbox: View {
    @ObservedObject var model: NativeGroupInvitationModel
    @Binding var nickname: String
    let accept: (UUID) -> Void
    var body: some View {
        if !model.invitations.isEmpty {
            Section("Uitnodigingen") {
                ForEach(model.invitations) { invitation in invitationRow(invitation) }
            }
        }
        if let notice = model.notice { Text(notice).font(.caption).accessibilityIdentifier("invitation-status") }
    }

    private func invitationRow(_ invitation: NativeGroupInvitation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(invitation.room).font(.headline)
            Text("Uitgenodigd door " + invitation.inviter).font(.caption)
            if invitation.requiresPassword { Text("Wachtwoordgroepen worden nog niet ondersteund.").font(.caption) }
            HStack {
                Button { accept(invitation.id) } label: { Image(systemName: "checkmark").frame(width: 44, height: 44) }
                    .buttonStyle(.borderless).accessibilityLabel("Uitnodiging accepteren")
                    .accessibilityIdentifier("accept-invitation-" + invitation.room + "-" + invitation.inviter)
                    .disabled(!model.available || invitation.requiresPassword || !NativeMUCStream.validNickname(nickname))
                Button { model.decline(invitation.id) } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                    .buttonStyle(.borderless).tint(.red).accessibilityLabel("Uitnodiging afwijzen")
                    .accessibilityIdentifier("decline-invitation-" + invitation.room + "-" + invitation.inviter)
                    .disabled(!model.available || model.pending.contains(invitation.id))
            }
        }
        .contextMenu { Button { model.dismiss(invitation.id) } label: { Label("Alleen verbergen", systemImage: "eye.slash") } }
    }
}

struct NativeInviteContactView: View {
    @ObservedObject var groups: NativeGroupModel
    @ObservedObject var model: NativeGroupInvitationModel
    let room: String
    @Environment(\.dismiss) private var dismiss
    private var canInvite: Bool { model.available && groups.rooms.first(where: { $0.room == room })?.snapshot?.canSpeak == true }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Een uitnodiging kan toegang geven tot een besloten groep. Kies alleen het bedoelde contact; de server bepaalt de rechten.").font(.footnote)
                }
                Section("Contact uitnodigen") {
                    if model.contacts.isEmpty { Text("Geen bekende contacten beschikbaar.") }
                    ForEach(model.contacts) { contact in
                        Button { groups.invite(room: room, peer: contact.jid) } label: {
                            Label(contact.displayName, systemImage: "person.badge.plus")
                        }
                        .disabled(!canInvite)
                        .accessibilityIdentifier("invite-contact-" + contact.jid)
                    }
                }
                Section("Verzending") {
                    ForEach(model.attempts.filter { $0.room == room }) { attempt in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(attempt.peer)
                            Text(attempt.state.label).font(.caption)
                        }.accessibilityElement(children: .combine).accessibilityIdentifier("invite-attempt-" + attempt.id.uuidString)
                    }
                    if let notice = model.notice { Text(notice).font(.caption) }
                }
            }
            .navigationTitle("Uitnodigen")
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                    .accessibilityLabel("Sluiten").accessibilityIdentifier("close-invite-contacts")
            } }
        }
    }
}
