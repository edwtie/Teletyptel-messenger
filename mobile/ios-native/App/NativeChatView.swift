import SwiftUI
import UIKit

struct NativeChatView: View {
    @ObservedObject var model: NativeLoginModel
    @ObservedObject var calls: NativeCallController
    @ObservedObject var translation: NativeTranslationModel
    let contact: NativeContact
    var onClose: (() -> Void)? = nil
    var contactProfile: NativePublicAvatar? = nil
    var ownProfile: NativePublicAvatar? = nil
    var avatars: NativeAvatarCache? = nil
    var archive: NativeConversationArchive? = nil
    var allowReadMarkers = true
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @State private var showTranslation = false
    @State private var showEmoji = false
    @State private var forwarding: NativeChatMessage?
    @State private var editing: NativeChatMessage?
    @State private var deleting: NativeChatMessage?
    @State private var removeContact = false
    @State private var renameContact = false
    @State private var contactName = ""
    var historyOnly = false
    @State private var browsingOlder = false
    @State private var preservedMessage: UUID?

    private var messages: [NativeChatMessage] { model.chat.messages.filter { $0.peer == contact.jid && !$0.hidden } }
    private var draft: String { model.chat.drafts[contact.jid] ?? "" }

    var body: some View {
            VStack(spacing: 0) {
                conversationHeader
                if !model.isConnected {
                    Text(model.isReconnecting ? "Verbinding herstellen (\(model.reconnectAttempt)/5)… Je tekst blijft bewaard." : "Niet verbonden · tekst blijft in deze sessie bewaard")
                        .font(.caption).foregroundStyle(.secondary).padding(6)
                        .accessibilityIdentifier("chat-connection")
                }
                if model.chat.historyLimited {
                    Text("Beperkt cachevenster · haal andere pagina’s op via Online geschiedenis.").font(.caption).padding(6)
                }
                if historyOnly { Text("Online archief · voeg dit contact eerst aan je contactenlijst toe om te chatten.").font(.caption).padding(6) }
                if model.isBlocked(contact.jid) { Text("Contact geblokkeerd").font(.caption).padding(6) }
                if let notice = model.contactActionNotice { Text(LocalizedStringKey(notice)).font(.caption).padding(6).accessibilityIdentifier("contact-action-status") }
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 0) {
                            NativeCloudHistoryHeader(model: model.cloudHistory, peer: contact.jid, kind: "contact") { earlier, refresh in
                                browsingOlder = earlier
                                if earlier { preservedMessage = messages.first?.id }
                                model.loadCloudHistory(peer: contact.jid, kind: "contact", earlier: earlier, refresh: refresh)
                            }.padding(.horizontal, 14)
                            historyHeader.padding(.horizontal, 14).padding(.vertical, 8)
                            if let error = model.chatError { Text(error).font(.caption).padding(6).accessibilityIdentifier("chat-error") }
                            if let error = translation.error { Text(error).font(.caption).padding(6) }
                            LazyVStack(spacing: 12) {
                                ForEach(messages) { message in
                                    bubble(message).id(message.id).background(GeometryReader { geometry in
                                        Color.clear.preference(key: NativeMessageFramesKey.self, value: [message.id: geometry.frame(in: .named("native-chat-messages"))])
                                    })
                                }
                            }.padding(.horizontal, 14).padding(.top, 14)
                            Color.clear.frame(height: 1).id("chat-bottom")
                        }
                    }
                    .modifier(NativeChatBottomAnchor())
                    .coordinateSpace(name: "native-chat-messages")
                    .overlayPreferenceValue(NativeMessageFramesKey.self) { frames in
                        GeometryReader { viewport in
                            let visible = frames.filter { CGRect(origin: .zero, size: viewport.size).contains($0.value) }.map(\.key)
                            let enabled = scenePhase == .active && allowReadMarkers && !showTranslation && forwarding == nil && editing == nil && deleting == nil && calls.presentation == nil && (model.canSend || model.canReadCachedHistory)
                            Color.clear.allowsHitTesting(false).task(id: enabled ? visible.map(\.uuidString).sorted().joined() : "hidden") {
                                if enabled { model.displayed(visible) }
                            }
                        }
                    }
                    .clipped()
                    .background {
                        GeometryReader { geometry in
                            NativeConversationBackground()
                                .task(id: geometry.size) {
                                    await Task.yield()
                                    guard !Task.isCancelled else { return }
                                    if !browsingOlder { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                                }
                        }
                    }
                    .onChange(of: messages.last) { message in
                        if message != nil && !browsingOlder { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                    }
                    .onChange(of: messages.first?.id) { _ in
                        if let preservedMessage = preservedMessage { proxy.scrollTo(preservedMessage, anchor: .top); self.preservedMessage = nil }
                    }
                    .onAppear { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                }
                if showEmoji {
                    HStack {
                        ForEach(["🙂", "👍", "❤️", "👋", "🙏", "😂"], id: \.self) { emoji in
                            Button(emoji) { model.setDraft(draft + emoji, peer: contact.jid) }
                                .font(.title2).frame(minWidth: 44, minHeight: 44)
                        }
                    }
                }
                composer.disabled(historyOnly)
            }
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
            .font(NativeWebStyle.font())
            .foregroundStyle(NativeWebStyle.text)
            .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $showTranslation) { NativeTranslationSettingsView(model: translation) }
        .onAppear { model.visibleConversation = contact.jid }
        .onDisappear { if model.visibleConversation == contact.jid { model.visibleConversation = nil } }
        .alert("Naam wijzigen", isPresented: $renameContact) {
            TextField("Naam", text: $contactName)
            Button("Opslaan") { model.renameContact(contact.jid, name: contactName) }
            Button("Annuleren", role: .cancel) {}
        }
        .confirmationDialog("Contact verwijderen?", isPresented: $removeContact, titleVisibility: .visible) {
            Button("Contact verwijderen", role: .destructive) { model.removeContact(contact.jid) }
            Button("Annuleren", role: .cancel) {}
        } message: { Text("Dit verwijdert het contact uit je XMPP-lijst, niet de berichtgeschiedenis. Gebruik blokkeren om berichten en oproepen te weigeren.") }
        .sheet(item: $forwarding) { NativeForwardMessageView(model: model, text: $0.body, avatars: avatars) }
        .sheet(item: $editing) { NativeEditMessageView(model: model, message: $0) }
        .confirmationDialog("Bericht verwijderen?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            if let message = deleting {
                Button("Verwijderen voor mij", role: .destructive) { translation.translate("", key: message.id.uuidString); model.hideMessage(message.id); deleting = nil }
                if model.canChangeMessages, model.chat.canRetract(message.id) {
                    Button("Voor iedereen intrekken", role: .destructive) { model.changeMessage(message.id); deleting = nil }
                }
            }
            Button("Annuleren", role: .cancel) { deleting = nil }
        } message: { Text("Voor mij verbergt alleen de lokale kopie op dit apparaat; de online geschiedenis blijft bestaan. Voor iedereen is een verzoek: andere apparaten, archieven en kopieën kunnen het origineel behouden.") }
        .overlay { if scenePhase != .active { Color(uiColor: .systemBackground).ignoresSafeArea().overlay(Text("TeleTypTel")) } }
        .onChange(of: model.phase) { phase in
            if phase == .signedOut || phase == .idle { dismiss() }
        }
        .task(id: automaticTranslationIdentity) {
            guard translation.preferences.mode == "automatic" else { return }
            await translation.automaticallyTranslate(Array(messages.suffix(12)))
        }
    }

    private var conversationHeader: some View {
        NativeConversationHeader(title: contact.displayName, subtitle: contact.presence.label, profile: contactProfile,
            identifier: "chat", identityLabel: (model.isConnected ? "Verbonden · " : "Niet verbonden · ") + contact.displayName + " · " + contact.presence.label,
            back: { onClose?(); dismiss() }) {
            Button { startCall(.total) } label: {
                NativeTotalConversationSymbol().fill(.white).frame(width: 26, height: 26).frame(width: 44, height: 44)
            }
            .buttonStyle(NativeWebIconStyle(prominent: true)).disabled(!calls.canCall(contact))
            .accessibilityLabel("Totale conversatie starten").accessibilityIdentifier("chat-start-total")
            Menu { conversationActions } label: { Image(systemName: "ellipsis").rotationEffect(.degrees(90)) }
                .buttonStyle(NativeWebIconStyle()).accessibilityLabel("Gespreksmenu").accessibilityIdentifier("chat-menu")
        }
    }

    @ViewBuilder private var conversationActions: some View {
        callButton("Spraak", icon: "phone.fill", profile: .audio)
        callButton("Spraak en video", icon: "video.fill", profile: .video)
        callButton("Spraak en realtime tekst", icon: "teletype", profile: .audioRtt)
        Button { showTranslation = true } label: { Label("Vertaling", systemImage: "globe") }
        Divider()
        Button { contactName = contact.displayName; renameContact = true } label: { Label("Naam wijzigen", systemImage: "pencil") }
            .disabled(!model.canSend || model.contactActionBusy)
        Button { model.setMuted(contact.jid, muted: !model.chat.preferences.mutedPeers.contains(contact.jid)) } label: {
            Label(LocalizedStringKey(model.chat.preferences.mutedPeers.contains(contact.jid) ? "Meldingen aan" : "Meldingen dempen"), systemImage: "bell.slash")
        }
        if let archive = archive {
            Button {
                archive.set(peer: contact.jid, kind: "contact", archived: !archive.contains(peer: contact.jid, kind: "contact"))
                onClose?(); dismiss()
            } label: { Label(archive.contains(peer: contact.jid, kind: "contact") ? "Terugzetten" : "Archiveren", systemImage: "archivebox") }
        }
        Button { model.loadHistory(for: contact.jid, refresh: true) } label: { Label("XMPP-archief ophalen", systemImage: "clock.arrow.circlepath") }
            .disabled(!model.canSend || model.historyStates[contact.jid] == .loading)
        Divider()
        Button { model.setBlocked(contact.jid, blocked: !model.isBlocked(contact.jid)) } label: {
            Label(LocalizedStringKey(model.isBlocked(contact.jid) ? "Deblokkeren" : "Blokkeren"), systemImage: "hand.raised")
        }.disabled(!model.canSend || model.contactActionBusy)
        Button(role: .destructive) { removeContact = true } label: { Label("Contact verwijderen", systemImage: "person.crop.circle.badge.minus") }
            .disabled(!model.canSend || model.contactActionBusy)
    }

    @ViewBuilder
    private var historyHeader: some View {
        switch model.historyStates[contact.jid] ?? .idle {
        case .loading:
            ProgressView("Servergeschiedenis ophalen…").font(.caption)
        case .ready:
            Text("Recent serverarchief · maximaal 50 resultaten per keer").font(.caption).foregroundStyle(.secondary)
                .accessibilityIdentifier("history-ready")
        case .unavailable:
            Text("Serverarchief niet beschikbaar. Berichten uit deze sessie blijven zichtbaar.")
                .font(.caption).accessibilityIdentifier("history-unavailable")
        case .failed:
            Button("Geschiedenis niet opgehaald · opnieuw proberen") { model.loadHistory(for: contact.jid, refresh: true) }
                .font(.caption).disabled(!model.canSend).accessibilityIdentifier("history-retry")
        case .idle:
            EmptyView()
        }
    }

    private var automaticTranslationIdentity: String {
        "\(messages.suffix(12).map { $0.id.uuidString + $0.body + String($0.retracted) }.joined(separator: "\u{1F}")):\(translation.ready):\(translation.preferences.mode):\(translation.preferences.targetLanguage):\(translation.sharingConsent)"
    }

    private func bubble(_ message: NativeChatMessage) -> some View {
        let incoming = message.state == .incoming
        return HStack(alignment: .bottom, spacing: 8) {
            if !incoming { Spacer(minLength: 36) }
            if incoming { avatar }
            ViewThatFits(in: .horizontal) {
                bubbleContent(message).fixedSize(horizontal: true, vertical: true)
                bubbleContent(message)
            }
            .foregroundStyle(NativeWebStyle.text)
            .padding(.horizontal, 10).padding(.vertical, 8)
            .background(NativeWebBubble(own: !incoming).fill(incoming ? NativeWebStyle.incoming : NativeWebStyle.outgoing))
            .overlay(NativeWebBubble(own: !incoming).stroke(incoming ? NativeWebStyle.incomingLine : NativeWebStyle.outgoingLine, lineWidth: 1))
            .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
            .contentShape(Rectangle())
            .accessibilityElement(children: .contain)
            .accessibilityLabel(accessibleMessage(message))
            .accessibilityIdentifier("chat-message-" + message.id.uuidString)
            .contextMenu { messageActions(message) }
            if incoming { Spacer(minLength: 36) }
            else { NativeWebAvatar(name: model.currentOwner ?? "TX", size: 30, profile: ownProfile) }
        }
    }

    private func bubbleContent(_ message: NativeChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .top, spacing: 6) {
                    Text(message.retracted ? "Bericht ingetrokken" : message.body).accessibilityIdentifier("message-body-" + message.id.uuidString)
                    Menu { messageActions(message) } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                        .buttonStyle(.plain).accessibilityLabel("Berichtmenu").accessibilityIdentifier("message-menu-" + message.id.uuidString)
                }
                if let session = model.activeWebSession, NativeFileReference.inMessage(message.body, configuration: session.configuration) != nil {
                    NativeFileMessageButton(bodyText: message.body, session: session)
                }
                if !message.retracted, translation.isCurrent(key: message.id.uuidString, text: message.body), let result = translation.results[message.id.uuidString], translation.preferences.mode != "off", translation.sharingConsent {
                    NativeTranslationCaption(result: result)
                }
                HStack(spacing: 5) {
                    Spacer(minLength: 0)
                    Text(message.date, style: .time).font(.caption2)
                    if message.edited { Text("bewerkt").font(.caption2) }
                    if message.state != .incoming {
                        NativeMessageTicks(message: message)
                    }
                }.foregroundStyle(NativeWebStyle.muted).accessibilityElement(children: .combine)
                    .accessibilityIdentifier("message-metadata-" + message.id.uuidString)
                NativeReactionChips(reactions: message.reactions, owner: model.currentOwner, enabled: model.canSend && !message.reactionPending) { model.react(message.id, emoji: $0) }
                if let notice = message.actionNotice { Text(notice).font(.caption2).foregroundStyle(NativeWebStyle.muted) }
            }
            .task(id: message.body) { translation.discardStale(key: message.id.uuidString, text: message.body) }
    }

    @ViewBuilder private func messageActions(_ message: NativeChatMessage) -> some View {
        if !message.retracted {
                Menu { ForEach(NativeInteractionCodec.picker, id: \.self) { emoji in Button(emoji) { model.react(message.id, emoji: emoji) } } } label: { Label("Reageren", systemImage: "face.smiling") }
                    .disabled(!model.canSend || message.stanzaID == nil || message.reactionPending)
                Button { model.setDraft("> " + message.body + "\n\n" + draft, peer: contact.jid) } label: { Label("Beantwoorden", systemImage: "arrowshape.turn.up.left") }
                    .disabled(!NativeChatCodec.validBody("> " + message.body + "\n\n" + draft))
                Button { UIPasteboard.general.string = message.body } label: { Label("Kopiëren", systemImage: "doc.on.doc") }
                Button { forwarding = message } label: { Label("Doorsturen", systemImage: "arrowshape.turn.up.right") }
                if model.canChangeMessages, model.chat.canCorrect(message.id) { Button { editing = message } label: { Label("Bewerken", systemImage: "pencil") } }
                if translation.preferences.mode != "off" {
                    Button { translation.translate(message.body, key: message.id.uuidString) } label: { Label("Vertalen", systemImage: "globe") }
                        .disabled(!translation.ready || !translation.available || !translation.sharingConsent)
                }
        }
        Button(role: .destructive) { deleting = message } label: { Label("Verwijderen", systemImage: "trash") }
            .disabled(message.state == .sending || message.actionPending)
    }

    private var avatar: some View {
        NativeWebAvatar(name: contact.displayName, size: 30, profile: contactProfile)
    }

    private func accessibleMessage(_ message: NativeChatMessage) -> String {
        var label = (message.state == .incoming ? contact.displayName : "Ik") + ": " + (message.retracted ? "Bericht ingetrokken" : message.body) + ". " + message.statusLabel
        if !message.retracted, translation.isCurrent(key: message.id.uuidString, text: message.body), let result = translation.results[message.id.uuidString], translation.preferences.mode != "off", translation.sharingConsent {
            label += ". Vertaling: " + result.text
        }
        return label
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            NativeAttachmentButton(login: model) { link in model.setDraft(draft.isEmpty ? link : draft + "\n" + link, peer: contact.jid) }
            Button { showEmoji.toggle() } label: { Image(systemName: "face.smiling").frame(width: 40, height: 44) }
                .buttonStyle(NativeWebIconStyle(round: true))
                .accessibilityLabel("Emoji")
            TextField("Typ een bericht", text: Binding(get: { draft }, set: { model.setDraft($0, peer: contact.jid) }), axis: .vertical)
                .lineLimit(1...5).textFieldStyle(.plain).padding(.vertical, 12)
                .accessibilityLabel("Bericht").accessibilityIdentifier("chat-draft")
            if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button { startCall(.video) } label: { Image(systemName: "video").frame(width: 40, height: 44) }
                    .buttonStyle(NativeWebIconStyle(round: true))
                    .accessibilityLabel("Videogesprek starten").disabled(!calls.canCall(contact))
                Button { startCall(.audio) } label: { Image(systemName: "mic").frame(width: 40, height: 44) }
                    .buttonStyle(NativeWebIconStyle(round: true))
                    .accessibilityLabel("Audiogesprek starten").disabled(!calls.canCall(contact))
            } else {
                Button { model.sendDraft(to: contact.jid) } label: { Image(systemName: "paperplane").frame(width: 44, height: 44) }
                    .buttonStyle(NativeWebIconStyle(prominent: true, round: true))
                    .accessibilityLabel("Bericht verzenden").accessibilityIdentifier("chat-send").disabled(!model.canSend)
            }
        }
        .nativeWebComposer()
        .padding(.horizontal, 10).padding(.vertical, verticalSizeClass == .compact ? 4 : 10)
    }

    private func startCall(_ profile: NativeCallMedia) { calls.startCall(contact, profile: profile) }

    private func callButton(_ title: String, icon: String, profile: NativeCallMedia) -> some View {
        Button { startCall(profile) } label: { Label(LocalizedStringKey(title), systemImage: icon) }
            .disabled(!calls.canCall(contact))
    }
}

struct NativeChatBottomAnchor: ViewModifier {
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
