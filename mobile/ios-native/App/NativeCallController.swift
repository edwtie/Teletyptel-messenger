import Combine
import Foundation
import WebRTC

@MainActor
private final class NativePeerRouter: NativePeerNegotiating {
    private var provider: (any NativePeerNegotiating)?

    var remoteEnded: Bool { provider?.remoteEnded ?? false }
    var isRemoteHeld: Bool { provider?.isRemoteHeld ?? false }
    func setHeld(_ held: Bool) async throws {
        guard let provider = provider else { throw NativeJingleFailure.disconnected }
        try await provider.setHeld(held)
    }

    func install(_ provider: any NativePeerNegotiating) -> Bool {
        guard self.provider == nil else { return false }
        self.provider = provider
        return true
    }

    func clear(_ expected: any NativePeerNegotiating) {
        guard let provider = provider, provider === expected else { return }
        self.provider = nil
    }

    func prepare(handle: NativeCallHandle, media: NativeCallMedia,
                 changed: @escaping () -> Void) throws -> NativePreparedPeer {
        guard let provider = provider else { throw NativeMediaPeerFailure.state }
        return try provider.prepare(handle: handle, media: media, changed: changed)
    }

    func accept(handle: NativeCallHandle, peer: RTCPeerConnection,
                completion: @escaping (Result<NativeCallMedia, Error>) -> Void) {
        guard let provider = provider else {
            completion(.failure(NativeMediaPeerFailure.state))
            return
        }
        provider.accept(handle: handle, peer: peer, completion: completion)
    }

    func close(handle: NativeCallHandle) {
        let previous = provider
        provider = nil
        previous?.close(handle: handle)
    }
}

@MainActor
final class NativeCallController: ObservableObject, NativePushRegistering {
    enum Status: Equatable { case idle, calling(String), ringing(String), active(String), failed }

    @Published private(set) var status: Status = .idle
    @Published private(set) var presentation: NativeCallPresentation?
    @Published private(set) var peerName: String?
    @Published private(set) var isMuted = false
    @Published private(set) var isHeld = false
    @Published private(set) var holdPending = false
    let interpreter = NativeInterpreterSession()
    @Published private(set) var interpreterMedia: NativeInterpreterMedia?
    private static let initializeWebRTC = RTCInitializeSSL()
    private var factory: RTCPeerConnectionFactory?
    private var capture: NativeMediaCapture?
    private var router: NativePeerRouter?
    private var runtime: NativeCallRuntime?
    private weak var login: NativeLoginModel?
    private var account: String?
    private var activePeer: (any NativeActivePeerNegotiating)?
    private var activeID: UUID?
    private var callPeerJID: String?
    private var prepareTask: Task<Void, Never>?
    private var isForeground = true
    var backgroundCallEnded: (() -> Void)?
    var hasLiveCall: Bool { runtime?.platform.coordinator.currentHandle != nil }
    var pushCallActive: Bool { hasLiveCall }
    lazy var pushRegistration = NativePushRegistrationModel(
        enabled: Bundle.main.object(forInfoDictionaryKey: "TeleTypTelNativeCallPushEnabled") as? Bool == true,
        store: NativePushVault(), driver: self)

    func startPushRegistration(tokenChanged: @escaping (Data?) -> Void) -> Bool {
        guard let account = account else { return false }
        return ensureRuntime().platform.enable(account: account, consented: true, tokenChanged: tokenChanged)
    }

    func stopPushRegistration() { runtime?.platform.stopPushRegistration() }
    func confirmPushRevocation() {
        if let account = account {
            runtime?.platform.confirmRevocation(account: account)
            if login?.isConnected == true { _ = runtime?.platform.connectForeground(account: account) }
        }
    }

    func synchronizePush() async {
        guard let session = login?.activeWebSession, let identifier = login?.activeAccountID else { return }
        await pushRegistration.connect(NativePushRegistryClient(session: session, accountID: identifier),
            scope: NativePushScope(origin: session.configuration.origin.absoluteString, accountID: identifier))
    }

    func setForeground(_ active: Bool) {
        isForeground = active
        if !active { interpreter.stop() }
        pushRegistration.setForeground(active)
        Task { [weak self] in
            guard let self = self else { return }
            await self.runtime?.media.setForeground(active)
        }
    }

    init() {}

    #if DEBUG
    func presentVisualFixture() {
        guard ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_UI_FIXTURE"] == "connected",
              ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_CALL_VISUAL_FIXTURE"] == "total",
              presentation == nil else { return }
        peerName = "Fictieve UI-test"
        presentation = NativeCallPresentation(callID: UUID(), profile: .total, localVideo: nil,
            remoteVideo: nil, ownText: "", remoteText: "Fictieve realtime tekst", rttReady: false,
            cameraEnabled: false, canSwitchCamera: false, canSendDtmf: false)
    }
    #endif

    func attach(_ login: NativeLoginModel) {
        guard self.login !== login else { return }
        detach()
        self.login = login
        login.onJingle = { [weak self] request, sender in
            self?.receive(request, sender: sender)
        }
        synchronize(login.phase)
    }

    func synchronize(_ phase: NativeLoginModel.Phase) {
        switch phase {
        case .connected(let jid):
            guard account != jid else { return }
            resetCall()
            account = jid
            if ensureRuntime().platform.connectForeground(account: jid) == nil { status = .failed }
        case .checking, .authenticating, .connecting, .awaitingSecondFactor:
            break
        case .suspended:
            if !hasLiveCall { resetCall() }
            if !pushRegistration.consented { account = nil; runtime?.logout() }
        case .idle, .failed, .signedOut:
            pushRegistration.logout()
            resetCall()
            account = nil
            runtime?.logout()
        }
    }

    func detach() {
        pushRegistration.logout()
        login?.onJingle = nil
        login = nil
        resetCall()
        account = nil
        runtime?.logout()
    }

    private func receive(_ request: NativeJingleRequest, sender: any NativeJingleSending) {
        if let provider = activePeer {
            guard provider.sid == request.sid else {
                Task { try? await sender.replyJingle(request, rejection: .serviceUnavailable) }
                return
            }
            Task { [weak self] in
                await provider.receive(request)
                guard let self = self else { return }
                if provider.remoteEnded, let id = self.activeID {
                    _ = self.runtime?.platform.coordinator.end(id: id, reason: .remoteEnded)
                }
            }
            return
        }
        guard request.action == "session-initiate", account != nil, prepareTask == nil else {
            Task { try? await sender.replyJingle(request, rejection: .serviceUnavailable) }
            return
        }
        prepareTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                let runtime = self.ensureRuntime()
                guard let factory = self.factory, let capture = self.capture,
                      let router = self.router else { throw NativeMediaPeerFailure.configuration }
                let profile = try self.profile(request)
                let provider = try await NativeIncomingPeerNegotiator(request: request, profile: profile,
                    signalling: sender, factory: factory, tracks: { [weak capture] in
                        guard let tracks = capture?.tracks else { throw NativeMediaCaptureFailure.unavailable }
                        return tracks
                    }, stopCapture: { [weak capture] in capture?.stop() })
                try Task.checkCancellation()
                guard self.activePeer == nil, router.install(provider) else {
                    provider.cancel(notifyPeer: true)
                    throw NativeJingleFailure.busy
                }
                let now = Date().timeIntervalSince1970
                guard let invitation = NativeCallInvitation(sid: request.sid, expiresAt: now + 45,
                                                            media: profile, now: now) else {
                    provider.cancel(notifyPeer: true)
                    router.clear(provider)
                    throw NativeJingleFailure.invalidRequest
                }
                self.activePeer = provider
                self.callPeerJID = NativeChatCodec.bareJID(request.peer)
                self.activeID = invitation.id
                self.peerName = request.peer
                self.status = .ringing(request.peer)
                guard runtime.platform.receive(invitation, completion: {}) else {
                    self.resetCall()
                    throw NativeJingleFailure.disconnected
                }
            } catch {
                guard !(error is CancellationError) else { return }
                self.status = .failed
            }
            self.prepareTask = nil
        }
    }

    func startCall(_ contact: NativeContact, profile: NativeCallMedia, videoCodec: String = "VP8") {
        let audioCodec = NativeAudioCodec(rawValue: UserDefaults.standard.string(forKey: NativeAudioCodec.preferenceKey) ?? "") ?? .pcmu
        guard activePeer == nil, prepareTask == nil, account != nil,
              let endpoint = contact.callEndpoint,
              let sender = login?.activeJingleSender else {
            status = .failed
            return
        }
        prepareTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                let runtime = self.ensureRuntime()
                guard let factory = self.factory, let capture = self.capture,
                      let router = self.router else { throw NativeMediaPeerFailure.configuration }
                let sid = UUID().uuidString.replacingOccurrences(of: "-", with: "")
                let provider = try await NativeOutgoingPeerNegotiator(peerJID: endpoint, sid: sid,
                    profile: profile, signalling: sender, factory: factory, videoCodec: videoCodec, audioCodec: audioCodec.rawValue, tracks: { [weak capture] in
                        guard let tracks = capture?.tracks else { throw NativeMediaCaptureFailure.unavailable }
                        return tracks
                    }, stopCapture: { [weak capture] in capture?.stop() })
                try Task.checkCancellation()
                guard self.login?.activeJingleSender != nil, self.activePeer == nil,
                      router.install(provider) else {
                    provider.cancel(notifyPeer: true)
                    throw NativeJingleFailure.disconnected
                }
                self.activePeer = provider
                self.callPeerJID = NativeChatCodec.bareJID(endpoint)
                self.peerName = contact.displayName
                self.status = .calling(contact.displayName)
                guard let id = runtime.platform.startOutgoing(peer: endpoint, sid: sid, media: profile,
                    completion: { [weak self, weak provider] success in
                        guard let self = self, let provider = provider,
                              self.activePeer === provider else { return }
                        if !success { self.resetCall() }
                    }) else {
                    self.resetCall()
                    throw NativeJingleFailure.disconnected
                }
                self.activeID = id
            } catch {
                guard !(error is CancellationError) else { return }
                self.status = .failed
            }
            self.prepareTask = nil
        }
    }

    private func profile(_ request: NativeJingleRequest) throws -> NativeCallMedia {
        let element = try request.jingleElement()
        let matches = NativeCallMedia.allCases.filter {
            (try? NativeJingleMedia.decode(element, sid: request.sid, action: request.action, profile: $0)) != nil
        }
        guard matches.count == 1, let profile = matches.first else { throw NativeJingleFailure.invalidRequest }
        return profile
    }

    private func callChanged() {
        guard let coordinator = runtime?.platform.coordinator,
              coordinator.currentHandle != nil else {
            if activePeer != nil { resetCall() }
            pushRegistration.flushToken()
            if !isForeground { backgroundCallEnded?() }
            return
        }
        if coordinator.isConnected {
            isHeld = coordinator.isHeld
            holdPending = coordinator.holdPending
            if let snapshot = presentation {
                runtime?.platform.setDtmfEnabled(id: snapshot.callID, enabled: snapshot.canSendDtmf,
                    hasVideo: snapshot.profile.hasVideo, canHold: snapshot.canHold)
            }
            status = .active(activePeer?.sid ?? "")
            prepareInterpreter()
        }
    }

    func prepareInterpreter() {
        guard isForeground, runtime?.platform.coordinator.isConnected == true,
              let session = login?.activeWebSession, let account = login?.activeAccountID,
              let owner = login?.currentOwner, let peer = callPeerJID, let sid = activePeer?.sid,
              let media = interpreterMedia else { return }
        interpreter.connect(client: NativeInterpreterAPI(session: session, account: account), media: media,
                            sid: sid, owner: owner, peer: peer, account: account)
    }

    func setRttText(_ text: String) {
        if runtime?.media.setRttText(text) == true, presentation?.isHeld != true { interpreter.sendText(text) }
    }

    func toggleHeld() {
        guard let coordinator = runtime?.platform.coordinator, let id = coordinator.currentHandle?.id else { return }
        let held = !coordinator.isHeld
        runtime?.platform.requestHeld(id: id, held: held)
    }

    func toggleMuted() {
        guard let id = runtime?.platform.coordinator.currentHandle?.id else { return }
        let muted = !isMuted
        guard runtime?.platform.coordinator.setMuted(id: id, muted: muted) == true else { return }
        isMuted = muted
    }

    func sendDtmf(_ tone: String) -> Bool {
        guard let coordinator = runtime?.platform.coordinator, let id = coordinator.currentHandle?.id else { return false }
        return coordinator.sendDtmf(id: id, tone: tone)
    }

    func toggleCamera() {
        guard let enabled = presentation?.cameraEnabled else { return }
        _ = runtime?.media.setCameraEnabled(!enabled)
    }

    func switchCamera() {
        Task { [weak self] in
            _ = await self?.runtime?.media.switchCamera()
        }
    }

    func endCall() {
        guard let id = runtime?.platform.coordinator.currentHandle?.id else { return }
        _ = runtime?.platform.coordinator.end(id: id)
    }

    private func resetCall() {
        interpreter.stop()
        prepareTask?.cancel()
        prepareTask = nil
        let id = activeID ?? runtime?.platform.coordinator.currentHandle?.id
        let provider = activePeer
        activePeer = nil
        activeID = nil
        callPeerJID = nil
        peerName = nil
        presentation = nil
        isMuted = false
        isHeld = false
        holdPending = false
        if let id = id { _ = runtime?.platform.coordinator.end(id: id, reason: .failed) }
        if let provider = provider {
            provider.cancel(notifyPeer: true)
            router?.clear(provider)
        }
        capture?.stop()
        status = .idle
    }

    private func ensureRuntime() -> NativeCallRuntime {
        if let runtime = runtime { return runtime }
        _ = Self.initializeWebRTC
        let factory = RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(),
                                               decoderFactory: RTCDefaultVideoDecoderFactory())
        let capture = NativeMediaCapture(factory: factory, foreground: isForeground)
        let router = NativePeerRouter()
        let runtime = NativeCallRuntime(negotiation: router, capture: capture)
        self.factory = factory
        self.capture = capture
        self.router = router
        self.runtime = runtime
        self.interpreterMedia = NativeInterpreterMedia(factory: factory, tracks: { [weak capture] in capture?.tracks })
        runtime.media.presentationChanged = { [weak self] snapshot in
            self?.presentation = snapshot
            if let snapshot = snapshot {
                self?.runtime?.platform.setDtmfEnabled(id: snapshot.callID, enabled: snapshot.canSendDtmf, hasVideo: snapshot.profile.hasVideo, canHold: snapshot.canHold)
            }
        }
        runtime.platform.coordinator.changed = { [weak self] in self?.callChanged() }
        return runtime
    }
}
