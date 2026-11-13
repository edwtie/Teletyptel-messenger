import SwiftUI
import UIKit

struct NativeChatView: View {
    @ObservedObject var model: NativeLoginModel
    @ObservedObject var calls: NativeCallController
    @ObservedObject var translation: NativeTranslationModel
    let contact: NativeContact
    var onClose: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @State private var showTranslation = false
    @State private var showEmoji = false

    private var messages: [NativeChatMessage] { model.chat.messages.filter { $0.peer == contact.jid } }
    private var draft: String { model.chat.drafts[contact.jid] ?? "" }

    var body: some View {
            VStack(spacing: 0) {
                if verticalSizeClass != .compact || !model.isConnected {
                    Text(model.isConnected ? "Verbonden · één-op-één chat" : "Niet verbonden · tekst blijft in deze sessie bewaard")
                        .font(.caption).foregroundStyle(.secondary).padding(6)
                        .accessibilityIdentifier("chat-connection")
                }
                if model.chat.historyLimited {
                    Text("Alleen de meest recente berichten passen in deze preview.").font(.caption).padding(6)
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 0) {
                            LazyVStack(spacing: 12) {
                                ForEach(messages) { message in bubble(message).id(message.id) }
                            }.padding(.horizontal, 14).padding(.top, 14)
                            Color.clear.frame(height: 1).id("chat-bottom")
                        }
                    }
                    .modifier(NativeChatBottomAnchor())
                    .background {
                        GeometryReader { geometry in
                            Image(geometry.size.width > geometry.size.height ? "ChatBackgroundWide" : "ChatBackground")
                                .resizable().scaledToFill()
                                .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                                .task(id: geometry.size) {
                                    await Task.yield()
                                    guard !Task.isCancelled else { return }
                                    proxy.scrollTo("chat-bottom", anchor: .bottom)
                                }
                        }
                    }
                    .onChange(of: messages.last?.id) { identifier in
                        if identifier != nil { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                    }
                    .onAppear { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                }
                if let error = model.chatError { Text(error).font(.caption).padding(6).accessibilityIdentifier("chat-error") }
                if let error = translation.error { Text(error).font(.caption).padding(6) }
                if showEmoji {
                    HStack {
                        ForEach(["🙂", "👍", "❤️", "👋", "🙏", "😂"], id: \.self) { emoji in
                            Button(emoji) { model.setDraft(draft + emoji, peer: contact.jid) }
                                .font(.title2).frame(minWidth: 44, minHeight: 44)
                        }
                    }
                }
                composer
            }
            .navigationTitle(contact.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { onClose?(); dismiss() } label: {
                        Image(systemName: "arrow.left").frame(width: 44, height: 44)
                    }.accessibilityLabel("Terug naar contacten").accessibilityIdentifier("chat-back")
                }
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 10) {
                        Button { startCall(.total) } label: {
                            NativeTotalConversationSymbol().fill(.white).frame(width: 26, height: 26)
                                .frame(width: 44, height: 44).background(.blue, in: RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(contact.callEndpoint == nil || calls.status != .idle)
                        .accessibilityLabel("Totale conversatie starten")
                        Menu {
                            callButton("Spraak", icon: "phone.fill", profile: .audio)
                            callButton("Spraak en video", icon: "video.fill", profile: .video)
                            callButton("Spraak en realtime tekst", icon: "teletype", profile: .audioRtt)
                            Button { showTranslation = true } label: { Label("Vertaling", systemImage: "globe") }
                        } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                        .accessibilityLabel("Gespreksmenu")
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $showTranslation) { NativeTranslationSettingsView(model: translation) }
        .overlay { if scenePhase != .active { Color(uiColor: .systemBackground).ignoresSafeArea().overlay(Text("TeleTypTel")) } }
        .onChange(of: model.phase) { phase in
            if phase == .signedOut || phase == .idle { dismiss() }
        }
        .task(id: automaticTranslationIdentity) {
            guard translation.preferences.mode == "automatic" else { return }
            await translation.automaticallyTranslate(Array(messages.suffix(12)))
        }
    }

    private var automaticTranslationIdentity: String {
        "\(messages.count):\(translation.ready):\(translation.preferences.mode):\(translation.preferences.targetLanguage):\(translation.sharingConsent)"
    }

    private func bubble(_ message: NativeChatMessage) -> some View {
        let incoming = message.state == .incoming
        return HStack(alignment: .bottom, spacing: 8) {
            if !incoming { Spacer(minLength: 36) }
            if incoming { avatar }
            VStack(alignment: .leading, spacing: 5) {
                Text(message.body).textSelection(.enabled)
                if let result = translation.results[message.id.uuidString], translation.preferences.mode != "off", translation.sharingConsent {
                    NativeTranslationCaption(result: result)
                }
                HStack(spacing: 5) {
                    Spacer(minLength: 0)
                    Text(message.date, style: .time).font(.caption2)
                    if !incoming {
                        Image(systemName: message.state == .sending ? "clock" : message.state == .submitted ? "checkmark" : "exclamationmark.circle")
                            .font(.caption2)
                    }
                }.foregroundStyle(incoming ? Color.secondary : Color(red: 0.25, green: 0.37, blue: 0.4))
            }
            .foregroundStyle(incoming ? Color.primary : Color.black)
            .padding(12)
            .background(incoming ? Color(uiColor: .secondarySystemBackground) : Color(red: 0.86, green: 0.97, blue: 0.92),
                        in: RoundedRectangle(cornerRadius: 15))
            .overlay(RoundedRectangle(cornerRadius: 15).stroke(incoming ? Color.gray.opacity(0.35) : Color.green.opacity(0.55), lineWidth: 1))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibleMessage(message))
            .accessibilityIdentifier("chat-message-" + message.id.uuidString)
            .contextMenu {
                Button { UIPasteboard.general.string = message.body } label: { Label("Kopiëren", systemImage: "doc.on.doc") }
                if translation.preferences.mode != "off" {
                    Button { translation.translate(message.body, key: message.id.uuidString) } label: { Label("Vertalen", systemImage: "globe") }
                        .disabled(!translation.ready || !translation.available || !translation.sharingConsent)
                }
            }
            if incoming { Spacer(minLength: 36) }
        }
    }

    private var avatar: some View {
        Text(String(contact.displayName.prefix(2)).uppercased()).font(.caption.bold()).foregroundStyle(.white)
            .frame(width: 30, height: 30).background(.blue, in: Circle()).accessibilityHidden(true)
    }

    private func accessibleMessage(_ message: NativeChatMessage) -> String {
        var label = (message.state == .incoming ? contact.displayName : "Ik") + ": " + message.body + ". " + message.state.label
        if let result = translation.results[message.id.uuidString], translation.preferences.mode != "off", translation.sharingConsent {
            label += ". Vertaling: " + result.text
        }
        return label
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Menu {
                Button { showTranslation = true } label: { Label("Vertaalinstellingen", systemImage: "globe") }
                Label("Bijlagen worden nog aangesloten", systemImage: "paperclip")
            } label: { Image(systemName: "plus").frame(width: 40, height: 44) }
            .accessibilityLabel("Toevoegen")
            Button { showEmoji.toggle() } label: { Image(systemName: "face.smiling").frame(width: 40, height: 44) }
                .accessibilityLabel("Emoji")
            TextField("Typ een bericht", text: Binding(get: { draft }, set: { model.setDraft($0, peer: contact.jid) }), axis: .vertical)
                .lineLimit(1...5).textFieldStyle(.plain).padding(.vertical, 12)
                .accessibilityLabel("Bericht").accessibilityIdentifier("chat-draft")
            if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button { startCall(.video) } label: { Image(systemName: "video").frame(width: 40, height: 44) }
                    .accessibilityLabel("Videogesprek starten").disabled(contact.callEndpoint == nil || calls.status != .idle)
                Button { startCall(.audio) } label: { Image(systemName: "mic").frame(width: 40, height: 44) }
                    .accessibilityLabel("Audiogesprek starten").disabled(contact.callEndpoint == nil || calls.status != .idle)
            } else {
                Button { model.sendDraft(to: contact.jid) } label: { Image(systemName: "paperplane.fill").frame(width: 44, height: 44) }
                    .accessibilityLabel("Bericht verzenden").accessibilityIdentifier("chat-send").disabled(!model.canSend)
            }
        }
        .foregroundStyle(Color(red: 0.12, green: 0.24, blue: 0.39))
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(.background, in: RoundedRectangle(cornerRadius: 28))
        .shadow(color: .black.opacity(0.12), radius: 5, y: 2)
        .padding(.horizontal, 10).padding(.vertical, verticalSizeClass == .compact ? 4 : 10)
    }

    private func startCall(_ profile: NativeCallMedia) { calls.startCall(contact, profile: profile) }

    private func callButton(_ title: String, icon: String, profile: NativeCallMedia) -> some View {
        Button { startCall(profile) } label: { Label(title, systemImage: icon) }
            .disabled(contact.callEndpoint == nil || calls.status != .idle)
    }
}

private struct NativeChatBottomAnchor: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) { content.defaultScrollAnchor(.bottom) }
        else { content }
    }
}

struct NativeTotalConversationSymbol: Shape {
    func path(in rect: CGRect) -> Path {
        let polygons: [[CGPoint]] = [
            [[365, 840], [381, 738], [474, 738], [556, 222], [456, 222], [427, 402],
             [321, 402], [366, 120], [885, 120], [840, 402], [734, 402], [762, 222],
             [662, 222], [580, 738], [673, 738], [657, 840]].map { CGPoint(x: $0[0], y: $0[1]) },
            [[150, 280], [163, 200], [313, 200], [300, 280]].map { CGPoint(x: $0[0], y: $0[1]) },
            [[125, 440], [138, 360], [288, 360], [275, 440]].map { CGPoint(x: $0[0], y: $0[1]) },
            [[75, 760], [87, 680], [337, 680], [325, 760]].map { CGPoint(x: $0[0], y: $0[1]) },
            [[100, 600], [113, 520], [363, 520], [350, 600]].map { CGPoint(x: $0[0], y: $0[1]) }
        ]
        var path = Path()
        for polygon in polygons { path.addLines(polygon); path.closeSubpath() }
        return path.applying(CGAffineTransform(scaleX: rect.width / 960, y: rect.height / 960)
            .concatenating(CGAffineTransform(translationX: rect.minX, y: rect.minY)))
    }
}
