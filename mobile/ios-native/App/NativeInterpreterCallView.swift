import SwiftUI

struct NativeInterpreterCallView: View {
    @ObservedObject var session: NativeInterpreterSession
    @Environment(\.dismiss) private var dismiss
    @State private var confirm = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Gebarentolk") {
                    Text(session.notice).accessibilityIdentifier("interpreter-status")
                    Text("De tolk wordt een derde deelnemer en mag na toestemming van alle deelnemers beeld, geluid en live tekst ontvangen. Je bestaande gesprek blijft apart bestaan.")
                        .font(.caption)
                    if session.room == nil {
                        Button { confirm = true } label: { Label("Gebarentolk oproepen", systemImage: "person.2.wave.2") }
                            .disabled(!session.available).accessibilityIdentifier("interpreter-request")
                    }
                    if session.needsConsent {
                        Button { confirm = true } label: { Label("Tolk laten deelnemen", systemImage: "checkmark.shield") }
                            .accessibilityIdentifier("interpreter-consent")
                    }
                    if session.room != nil {
                        Button(role: .destructive) { session.stop(); dismiss() } label: { Label("Tolk verwijderen", systemImage: "person.crop.circle.badge.minus") }
                            .accessibilityIdentifier("interpreter-leave")
                    }
                }
                Section("Externe tolkdienst") { Text("Tolkcontact is nog niet aangesloten. Deze oproep gaat alleen naar de bevoegde tolken in TeleTypTel.").font(.caption) }
            }
            .nativeWebForm().navigationTitle("Gebarentolk")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Sluiten").accessibilityIdentifier("interpreter-close") } }
        }
        .alert("Tolk laten meekijken en luisteren?", isPresented: $confirm) {
            Button("Toestaan") {
                if session.needsConsent { session.allow() }
                else { Task { await session.request() } }
            }
            Button("Annuleren", role: .cancel) {}
        } message: {
            Text("Je deelt de huidige microfoon, beschikbare camera en live tekst met een bevoegde tolk. Een uitgeschakelde camera of microfoon blijft uitgeschakeld. Ook je gesprekspartner moet zelf instemmen.")
        }
    }
}

struct NativeInterpreterTile: View {
    @ObservedObject var session: NativeInterpreterSession
    @ObservedObject var media: NativeInterpreterMedia
    let width: CGFloat
    var body: some View {
        if media.remoteVideo != nil || session.connected {
        VStack(alignment: .leading, spacing: 4) {
            if let video = media.remoteVideo {
                NativeVideoSurface(track: video, fit: true).frame(width: max(1, width - 16), height: max(1, width - 16) * 0.7).clipped()
            }
            Text(session.interpreterName).font(.caption.bold())
            if !session.remoteText.isEmpty { Text(session.remoteText).font(.caption).lineLimit(4).textSelection(.enabled) }
        }
        .foregroundStyle(.white).padding(8).frame(width: width)
        .background(NativeWebStyle.callBackground.opacity(0.92), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(NativeWebStyle.callLine, lineWidth: 1))
        .accessibilityIdentifier("interpreter-video-tile")
        }
    }
}
