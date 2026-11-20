import AVFoundation
import SwiftUI
import WebRTC

@MainActor
final class HybridRoomCall: ObservableObject {
    struct Invitation: Equatable {
        let room: String
        let nick: String
        let source: UUID
    }
    final class Link {
        let id: UUID
        let media: NativeInterpreterMedia
        var receivedDescription = false
        var error = false
        init(_ id: UUID, _ media: NativeInterpreterMedia) { self.id = id; self.media = media }
    }
    let login: NativeLoginModel
    let controller: NativeCallController
    @Published private(set) var invitation: Invitation?
    @Published private(set) var links: [String: Link] = [:]
    @Published private(set) var notice = ""
    @Published private(set) var joined = false
    @Published private(set) var preparing = false
    @Published private(set) var mic = true
    @Published private(set) var camera = true
    private(set) var room: String?
    private var generation = UUID()
    private var rtc: NativeInterpreterRTC?
    private var capture: NativeMediaCapture?
    private var prepareTask: Task<Void, Never>?
    private var invitationTimeout: Task<Void, Never>?
    private var restoreAudio: Bool?
    private var retired: [String: Set<UUID>] = [:]
    private var draft = ""

    init(login: NativeLoginModel, controller: NativeCallController) {
        self.login = login; self.controller = controller
    }
    func snapshot(_ room: String) -> NativeGroupSnapshot? {
        guard login.isConnected, !login.isBackground, !controller.hasLiveCall, login.groups.available,
              let value = login.groups.rooms.first(where: { $0.room == room })?.snapshot,
              value.canSpeak, value.participants.count <= 4 else { return nil }
        return value
    }
    func open(_ room: String) -> Bool {
        guard self.room == nil, snapshot(room) != nil else { return false }
        dismissInvite(); self.room = room; notice = ""; return true
    }
    func dismissInvite() { invitationTimeout?.cancel(); invitationTimeout = nil; invitation = nil }
    func join() {
        guard let room = room, snapshot(room) != nil, !preparing, !joined,
              let session = login.activeWebSession, let account = login.activeAccountID,
              let factory = controller.factory else { notice = "Geen verbinding met de groepskamer."; return }
        let id = UUID(); generation = id; preparing = true; notice = ""
        let capture = NativeMediaCapture(factory: factory)
        self.capture = capture
        prepareTask = Task {
            do {
                let rtc = try await NativeInterpreterAPI(session: session, account: account).rtc()
                try Task.checkCancellation()
                try await capture.prepare(.total)
                guard generation == id, let members = snapshot(room), login.activeWebSession === session else { throw CancellationError() }
                let audio = RTCAudioSession.sharedInstance()
                audio.lockForConfiguration()
                do { try audio.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetooth, .defaultToSpeaker]) }
                catch { audio.unlockForConfiguration(); throw error }
                audio.unlockForConfiguration()
                if audio.useManualAudio { restoreAudio = audio.isAudioEnabled; audio.isAudioEnabled = true }
                capture.tracks?.0.isEnabled = true
                self.rtc = rtc; joined = true; preparing = false; mic = true; camera = true
                for member in members.occupants where member.nickname != members.nickname && member.role != "visitor" {
                    try? await send(.hello, to: member.nickname, room: room, id: id)
                }
            } catch {
                capture.stop()
                guard generation == id else { return }
                preparing = false; self.capture = nil
                notice = "Deelnemen mislukt. Controleer de verbinding en de toestemming voor camera en microfoon."
            }
        }
    }
    private func send(_ kind: NativeRoomCallSignal.Kind, to nick: String, room: String, id: UUID, target: UUID? = nil, sdp: String? = nil) async throws {
        guard joined, generation == id, self.room == room, snapshot(room)?.participants.contains(nick) == true else { throw CancellationError() }
        try await login.groups.sendRoomCall(room: room, nick: nick, signal: .init(kind, source: id, target: target, sdp: sdp))
    }
    func receive(room: String, nick: String, signal: NativeRoomCallSignal) {
        guard let members = snapshot(room), members.participants.contains(nick), members.nickname != nick else { return }
        if self.room == nil && signal.kind == .hello {
            let invite = Invitation(room: room, nick: nick, source: signal.source)
            dismissInvite(); invitation = invite
            invitationTimeout = Task {
                do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
                if invitation == invite { invitation = nil }
            }
            return
        }
        guard self.room == room, joined, let capture = capture, let rtc = rtc,
              retired[nick]?.contains(signal.source) != true else { return }
        let id = generation
        if signal.kind == .hello {
            Task { try? await send(.ready, to: nick, room: room, id: id, target: signal.source) }
            return
        }
        guard signal.target == id else { return }
        if signal.kind == .ready {
            if let old = links[nick] {
                guard old.id != signal.source else { return }
                remove(nick)
            }
            guard links.count < 3 else { return }
            let media = NativeInterpreterMedia(factory: capture.factory, tracks: { [weak capture] in capture?.tracks })
            let link = Link(signal.source, media)
            links[nick] = link
            let offerer = id.uuidString < signal.source.uuidString
            Task {
                do {
                    guard links[nick] === link else { return }
                    if offerer { try await send(.ready, to: nick, room: room, id: id, target: link.id) }
                    guard links[nick] === link else { return }
                    try await media.start(offerer: offerer, rtc: rtc, send: { [weak self, weak link] payload in
                        guard let self = self, let link = link, self.links[nick] === link else { throw CancellationError() }
                        try await self.send(payload.type == "offer" ? .offer : .answer, to: nick, room: room, id: id, target: link.id, sdp: payload.sdp)
                    }, changed: { [weak self] in self?.objectWillChange.send() })
                    guard links[nick] === link else { return }
                    media.sendText(draft)
                    if !offerer { try await send(.ready, to: nick, room: room, id: id, target: link.id) }
                } catch { fail(nick, link) }
            }
            return
        }
        guard let link = links[nick], link.id == signal.source else { return }
        if signal.kind == .leave { remove(nick); return }
        guard !link.error, !link.receivedDescription, (signal.kind == .answer) == (id.uuidString < signal.source.uuidString) else { return }
        link.receivedDescription = true
        Task {
            guard links[nick] === link else { return }
            do { try await link.media.receive(.init(type: signal.kind.rawValue, sdp: signal.sdp)) }
            catch { fail(nick, link) }
        }
    }
    private func fail(_ nick: String, _ link: Link) {
        guard links[nick] === link else { return }
        link.media.stop(); link.error = true; objectWillChange.send()
    }
    private func remove(_ nick: String) {
        guard let link = links.removeValue(forKey: nick) else { return }
        retired[nick, default: []].insert(link.id); link.media.stop()
    }
    func reconcile() {
        if let invite = invitation, snapshot(invite.room)?.participants.contains(invite.nick) != true { dismissInvite() }
        guard let room = room else { return }
        guard let current = snapshot(room) else { stop(); return }
        for nick in Array(links.keys) where !current.occupants.contains(where: { $0.nickname == nick && $0.role != "visitor" }) { remove(nick) }
    }
    func text(_ text: String) {
        guard joined, NativeInterpreterText.encode(text) != nil else { return }
        draft = text; for link in links.values { link.media.sendText(text) }
    }
    func toggleMic() { mic.toggle(); capture?.tracks?.0.isEnabled = mic }
    func toggleCamera() { if capture?.setCameraEnabled(!camera) == true { camera.toggle() } }
    func stop() {
        let id = generation
        let departing = links.mapValues(\.id)
        let previousRoom = room
        generation = UUID(); room = nil; prepareTask?.cancel(); prepareTask = nil
        for link in links.values { link.media.stop() }
        links.removeAll(); retired.removeAll(); capture?.stop(); capture = nil; rtc = nil; draft = ""
        if let restoreAudio = restoreAudio, !controller.hasLiveCall { RTCAudioSession.sharedInstance().isAudioEnabled = restoreAudio }
        restoreAudio = nil; preparing = false; joined = false
        if let previousRoom = previousRoom {
            for (nick, target) in departing {
                Task { try? await login.groups.sendRoomCall(room: previousRoom, nick: nick, signal: .init(.leave, source: id, target: target)) }
            }
        }
    }
}

struct HybridRoomCallView: View {
    @ObservedObject var call: HybridRoomCall
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if call.joined {
                        if call.links.isEmpty { Text("Je bent in de oproep. Wachten op andere groepsleden…") }
                        ForEach(call.links.keys.sorted(), id: \.self) { nick in
                            if let link = call.links[nick] {
                                VStack(alignment: .leading) {
                                    Text(nick).font(.headline)
                                    Text(link.error || link.media.failed ? "Verbinding mislukt" : link.media.connected ? "Verbonden" : "Verbinden…")
                                    if let track = link.media.remoteVideo { NativeVideoSurface(track: track, fit: true).frame(height: 160) }
                                    Text(link.media.remoteText)
                                }
                            }
                        }
                        TextField("Jouw realtime tekst voor de groep", text: $text).textFieldStyle(.roundedBorder)
                            .onChange(of: text) { value in call.text(value) }
                        HStack {
                            Button(call.mic ? "Microfoon uit" : "Microfoon aan", action: call.toggleMic)
                            Button(call.camera ? "Camera uit" : "Camera aan", action: call.toggleCamera)
                        }
                    } else {
                        Text("Deel beeld, geluid en realtime tekst met de deelnemers. Geschikt voor groepskamers met maximaal vier aanwezigen.")
                        Button(call.preparing ? "Verbinden…" : "Deelnemen", action: call.join).disabled(call.preparing)
                    }
                    if !call.notice.isEmpty { Text(call.notice) }
                }.padding()
            }.navigationTitle("Groepsoproep").toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(call.joined ? "Verlaten" : "Sluiten") { call.stop(); dismiss() } }
            }
        }.onDisappear { call.stop() }
    }
}

struct HybridRoomInvitation: View {
    @ObservedObject var call: HybridRoomCall
    let open: (String) -> Void
    var body: some View {
        if let invite = call.invitation {
            VStack {
                Text("\(invite.nick) nodigt je uit voor een groepsoproep in \(invite.room.components(separatedBy: "@").first ?? invite.room).")
                HStack {
                    Button("Bekijken") { open(invite.room) }
                    Button("Niet nu", action: call.dismissInvite)
                }
            }.padding(8).background(.regularMaterial)
        }
    }
}
