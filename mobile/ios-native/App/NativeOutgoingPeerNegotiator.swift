import Foundation
import WebRTC

@MainActor
final class NativeOutgoingPeerNegotiator: NativeActivePeerNegotiating {
    private let peerJID: String
    let sid: String
    private let profile: NativeCallMedia
    private let signalling: any NativeJingleSending
    private let factory: RTCPeerConnectionFactory
    private let tracks: () throws -> (RTCAudioTrack, RTCVideoTrack?)
    private let stopCapture: () -> Void
    private let iceServers: [RTCIceServer]
    private let binding: UUID
    private var handle: NativeCallHandle?
    private var engine: NativeMediaPeer?
    private var session: NativeJingleSession?
    private var task: Task<Void, Never>?
    private var completion: ((Result<NativeCallMedia, Error>) -> Void)?
    private var active = true
    private var captureActive = false
    private var changed: (() -> Void)?
    private(set) var remoteEnded = false

    init(peerJID: String, sid: String, profile: NativeCallMedia,
         signalling: any NativeJingleSending, factory: RTCPeerConnectionFactory,
         iceServers: [RTCIceServer] = [],
         tracks: @escaping () throws -> (RTCAudioTrack, RTCVideoTrack?),
         stopCapture: @escaping () -> Void) async throws {
        guard NativeJingleTransport.fullJID(peerJID), NativeJingleTransport.validSID(sid) else {
            throw NativeJingleFailure.invalidRequest
        }
        self.peerJID = peerJID
        self.sid = sid
        self.profile = profile
        self.signalling = signalling
        self.factory = factory
        self.iceServers = iceServers
        self.tracks = tracks
        self.stopCapture = stopCapture
        binding = try await signalling.bindCall(peer: peerJID, sid: sid)
        if Task.isCancelled {
            await signalling.unbindCall(binding)
            throw CancellationError()
        }
    }

    func prepare(handle: NativeCallHandle, media: NativeCallMedia,
                 changed: @escaping () -> Void) throws -> NativePreparedPeer {
        guard self.handle == nil, session == nil, handle.sid == sid, media == profile else {
            throw NativeMediaPeerFailure.state
        }
        self.handle = handle
        self.changed = changed
        captureActive = true
        do {
            let (microphone, camera) = try tracks()
            let engine = try NativeMediaPeer(factory: factory, microphone: microphone, camera: camera,
                profile: profile, sid: sid, iceServers: iceServers, changed: { [weak self] in
                    guard self?.handle == handle else { return }
                    changed()
                })
            let session = try NativeJingleSession(role: .initiator, binding: binding, peer: peerJID,
                sid: sid, profile: profile, signalling: signalling, media: engine, changed: { [weak self] phase in
                    self?.sessionChanged(phase, handle: handle)
                })
            self.engine = engine
            self.session = session
            return engine.prepared
        } catch {
            close(handle: handle)
            throw error
        }
    }

    func accept(handle: NativeCallHandle, peer: RTCPeerConnection,
                completion: @escaping (Result<NativeCallMedia, Error>) -> Void) {
        guard self.handle == handle, engine?.prepared.peer === peer, task == nil,
              let session = session, self.completion == nil else {
            completion(.failure(NativeMediaPeerFailure.state))
            return
        }
        self.completion = completion
        task = Task { [weak self] in
            guard let self = self else { return }
            do {
                try await session.start()
                try Task.checkCancellation()
                guard self.handle == handle else { return }
            } catch {
                self.finish(.failure(error), handle: handle)
            }
        }
    }

    func receive(_ request: NativeJingleRequest) async {
        guard let session = session else {
            try? await signalling.replyJingle(request, rejection: .unexpectedRequest)
            return
        }
        await session.receive(request)
        guard self.session === session, session.phase == .ended else { return }
        remoteEnded = request.action == "session-terminate"
        finishCapture()
        finish(.failure(NativeMediaPeerFailure.closed), handle: handle)
        changed?()
    }

    func close(handle: NativeCallHandle) {
        guard self.handle == handle else { return }
        cancel(notifyPeer: true)
    }

    func cancel(notifyPeer: Bool = false) {
        guard active else { return }
        active = false
        let previousSession = session
        session = nil
        let previousHandle = handle
        finish(.failure(NativeMediaPeerFailure.closed), handle: previousHandle)
        handle = nil
        changed = nil
        task?.cancel()
        task = nil
        finishCapture()
        engine?.close()
        engine = nil
        let signalling = signalling, binding = binding
        Task {
            if let previousSession = previousSession { await previousSession.stop(notifyPeer: notifyPeer) }
            else { await signalling.unbindCall(binding) }
        }
    }

    private func sessionChanged(_ phase: NativeJingleSession.Phase, handle: NativeCallHandle) {
        guard self.handle == handle else { return }
        if phase == .negotiated { finish(.success(profile), handle: handle) }
        else if phase == .ended { finish(.failure(NativeMediaPeerFailure.closed), handle: handle) }
        changed?()
    }

    private func finish(_ result: Result<NativeCallMedia, Error>, handle: NativeCallHandle?) {
        guard handle == nil || self.handle == handle else { return }
        let callback = completion
        completion = nil
        callback?(result)
    }

    private func finishCapture() {
        guard captureActive else { return }
        captureActive = false
        stopCapture()
    }
}
