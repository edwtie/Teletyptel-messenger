import AVFAudio
import WebRTC

@MainActor
final class NativeWebRTCCallMedia: NativeCallMediaDriver {
    private let negotiation: any NativePeerNegotiating
    private var handle: NativeCallHandle?
    private var prepared: NativePreparedPeer?
    private var profile: NativeCallMedia?
    private var negotiated = false
    private var event: ((NativeCallMediaEvent) -> Void)?
    private var rtt: MessengerNativeRttSession?
    private var channel: MessengerWebRTCChannel?
    private var connected = false
    private var audioActive = false
    private var reconnectDeadline: Task<Void, Never>?

    init(negotiation: any NativePeerNegotiating) {
        self.negotiation = negotiation
    }

    func start(handle: NativeCallHandle, media: NativeCallMedia,
               event: @escaping (NativeCallMediaEvent) -> Void) {
        guard self.handle == nil else { event(.failed); return }
        self.handle = handle
        self.profile = media
        self.event = event
        let audio = RTCAudioSession.sharedInstance()
        audio.useManualAudio = true
        audio.isAudioEnabled = false
        do {
            try configureAudio(audio)
            let created = try negotiation.prepare(handle: handle, media: media) { [weak self] in
                guard self?.handle == handle else { return }
                self?.refresh()
            }
            prepared = created
            if media.contents.contains("rtt") {
                let session = MessengerNativeRttSession(callId: handle.id, sid: handle.sid)
                rtt = session
                channel = MessengerWebRTCChannel.attach(to: created.peer, session: session) { [weak self] in
                    guard self?.handle == handle else { return }
                    self?.refresh()
                }
                guard channel != nil else { event(.failed); return }
            }
            negotiation.accept(handle: handle, peer: created.peer) { [weak self] result in
                guard let self = self, self.handle == handle else { return }
                guard case .success(let accepted) = result, accepted == media else {
                    self.event?(.failed)
                    return
                }
                self.negotiated = true
                self.refresh()
            }
        } catch { event(.failed) }
    }

    func stop(handle: NativeCallHandle) {
        guard self.handle == handle else { return }
        self.handle = nil
        event = nil
        connected = false
        negotiated = false
        reconnectDeadline?.cancel()
        reconnectDeadline = nil
        profile = nil
        rtt?.close()
        rtt = nil
        channel?.close()
        channel = nil
        let previous = prepared
        prepared = nil
        previous?.microphone.isEnabled = false
        previous?.camera?.isEnabled = false
        previous?.peer.close()
        negotiation.close(handle: handle)
        audioActivated(false)
    }

    func audioActivated(_ active: Bool) {
        let permitted = active && handle != nil
        guard audioActive != permitted else { return }
        audioActive = permitted
        let audio = RTCAudioSession.sharedInstance()
        audio.useManualAudio = true
        if permitted {
            audio.audioSessionDidActivate(AVAudioSession.sharedInstance())
            audio.isAudioEnabled = true
        } else {
            audio.isAudioEnabled = false
            audio.audioSessionDidDeactivate(AVAudioSession.sharedInstance())
        }
    }

    func setMuted(_ muted: Bool) -> Bool {
        guard let microphone = prepared?.microphone else { return false }
        microphone.isEnabled = !muted
        return true
    }

    func setRttText(_ text: String) -> Bool { rtt?.setText(text) ?? false }
    var ownText: String { rtt?.ownText ?? "" }
    var remoteText: String { rtt?.remoteText ?? "" }

    private func configureAudio(_ audio: RTCAudioSession) throws {
        audio.lockForConfiguration()
        defer { audio.unlockForConfiguration() }
        try audio.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    }

    private func refresh() {
        guard let prepared = prepared, let profile = profile else { return }
        if negotiation.remoteEnded { event?(.ended); return }
        if prepared.peer.connectionState == .disconnected {
            if connected && reconnectDeadline == nil, let currentHandle = handle {
                reconnectDeadline = Task { [weak self] in
                    do { try await Task.sleep(nanoseconds: 10_000_000_000) }
                    catch { return }
                    guard let self = self, self.handle == currentHandle,
                          self.prepared?.peer.connectionState == .disconnected else { return }
                    self.event?(.failed)
                }
            }
            return
        }
        reconnectDeadline?.cancel()
        reconnectDeadline = nil
        if prepared.peer.connectionState == .failed || prepared.peer.connectionState == .closed {
            event?(.failed)
            return
        }
        if connected && profile.contents.contains("rtt") && rtt?.isReady != true {
            event?(.failed)
            return
        }
        guard !connected, negotiated, prepared.peer.connectionState == .connected else { return }
        var contents: [String] = []
        let tracks = prepared.peer.receivers.compactMap { $0.track }
        if prepared.microphone.readyState == .live,
           tracks.contains(where: { $0 is RTCAudioTrack && $0.readyState == .live }) { contents.append("audio") }
        if profile.hasVideo, prepared.camera?.readyState == .live,
           tracks.contains(where: { $0 is RTCVideoTrack && $0.readyState == .live }) { contents.append("video") }
        if profile.contents.contains("rtt"), rtt?.isReady == true { contents.append("rtt") }
        guard Set(contents) == profile.contents else { return }
        connected = true
        event?(.ready(profile, contents: contents, rttReady: rtt?.isReady ?? false))
    }
}

@MainActor
final class NativeCallRuntime {
    let media: NativeWebRTCCallMedia
    let platform: NativeCallPlatform

    init(negotiation: any NativePeerNegotiating) {
        let media = NativeWebRTCCallMedia(negotiation: negotiation)
        self.media = media
        platform = NativeCallPlatform(media: media)
    }

    func logout() { platform.disable() }
}
