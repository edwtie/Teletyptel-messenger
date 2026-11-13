import Combine
import Foundation
import WebRTC

@MainActor
private final class NativePeerRouter: NativePeerNegotiating {
    private var provider: (any NativePeerNegotiating)?

    var remoteEnded: Bool { provider?.remoteEnded ?? false }

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
final class NativeCallController: ObservableObject {
    enum Status: Equatable { case idle, calling(String), ringing(String), active(String), failed }

    @Published private(set) var status: Status = .idle
    @Published private(set) var presentation: NativeCallPresentation?
    @Published private(set) var peerName: String?
    @Published private(set) var isMuted = false
    private static let initializeWebRTC = RTCInitializeSSL()
    private var factory: RTCPeerConnectionFactory?
    private var capture: NativeMediaCapture?
    private var router: NativePeerRouter?
    private var runtime: NativeCallRuntime?
    private weak var login: NativeLoginModel?
    private var account: String?
    private var activePeer: (any NativeActivePeerNegotiating)?
    private var activeID: UUID?
    private var prepareTask: Task<Void, Never>?

    init() {}

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
        case .checking, .authenticating, .connecting:
            break
        case .idle, .failed, .signedOut, .suspended:
            resetCall()
            account = nil
            runtime?.logout()
        }
    }

    func detach() {
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

    func startCall(_ contact: NativeContact, profile: NativeCallMedia) {
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
                    profile: profile, signalling: sender, factory: factory, tracks: { [weak capture] in
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
            return
        }
        if coordinator.isConnected { status = .active(activePeer?.sid ?? "") }
    }

    func setRttText(_ text: String) {
        _ = runtime?.media.setRttText(text)
    }

    func toggleMuted() {
        guard let id = runtime?.platform.coordinator.currentHandle?.id else { return }
        let muted = !isMuted
        guard runtime?.platform.coordinator.setMuted(id: id, muted: muted) == true else { return }
        isMuted = muted
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
        prepareTask?.cancel()
        prepareTask = nil
        let id = activeID ?? runtime?.platform.coordinator.currentHandle?.id
        let provider = activePeer
        activePeer = nil
        activeID = nil
        peerName = nil
        presentation = nil
        isMuted = false
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
        let capture = NativeMediaCapture(factory: factory)
        let router = NativePeerRouter()
        let runtime = NativeCallRuntime(negotiation: router, capture: capture)
        self.factory = factory
        self.capture = capture
        self.router = router
        self.runtime = runtime
        runtime.media.presentationChanged = { [weak self] snapshot in
            self?.presentation = snapshot
        }
        runtime.platform.coordinator.changed = { [weak self] in self?.callChanged() }
        return runtime
    }
}
