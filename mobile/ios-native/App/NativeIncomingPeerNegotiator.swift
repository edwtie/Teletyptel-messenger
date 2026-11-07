import Foundation
import WebRTC

@MainActor
private final class NativeDeferredIncomingMedia: NativeMediaNegotiating {
    var engine: NativeMediaPeer?
    func createOffer() async throws -> NativeJingleMedia { throw NativeMediaPeerFailure.state }
    func applyAnswer(_ xml: String) async throws { throw NativeMediaPeerFailure.state }
    func acceptOffer(_ xml: String) async throws -> NativeJingleMedia {
        guard let engine = engine else { throw NativeMediaPeerFailure.state }
        return try await engine.acceptOffer(xml)
    }
    func close() { engine?.close(); engine = nil }
}

@MainActor
final class NativeIncomingPeerNegotiator: NativePeerNegotiating {
    private let request: NativeJingleRequest
    private let profile: NativeCallMedia
    private let signalling: any NativeJingleSending
    private let factory: RTCPeerConnectionFactory
    private let tracks: () throws -> (RTCAudioTrack, RTCVideoTrack?)
    private let stopCapture: () -> Void
    private let iceServers: [RTCIceServer]
    private var handle: NativeCallHandle?
    private var engine: NativeMediaPeer?
    private var session: NativeJingleSession?
    private var task: Task<Void, Never>?
    private var used = false
    private let deferred = NativeDeferredIncomingMedia()

    init(request: NativeJingleRequest, profile: NativeCallMedia, signalling: any NativeJingleSending,
         factory: RTCPeerConnectionFactory, iceServers: [RTCIceServer] = [],
         tracks: @escaping () throws -> (RTCAudioTrack, RTCVideoTrack?), stopCapture: @escaping () -> Void) async throws {
        guard request.action == "session-initiate", NativeJingleTransport.fullJID(request.peer) else { throw NativeJingleFailure.invalidRequest }
        _ = try NativeJingleMedia.decode(request.jingleElement(), sid: request.sid, action: request.action, profile: profile)
        self.request = request
        self.profile = profile
        self.signalling = signalling
        self.factory = factory
        self.iceServers = iceServers
        self.tracks = tracks
        self.stopCapture = stopCapture
        let session = try NativeJingleSession(role: .responder, binding: request.binding, peer: request.peer,
            sid: request.sid, profile: profile, signalling: signalling, media: deferred)
        self.session = session
        await session.receive(request)
        guard session.phase == .ringing, !Task.isCancelled else {
            await session.stop()
            throw NativeMediaPeerFailure.state
        }
    }

    func prepare(handle: NativeCallHandle, media: NativeCallMedia, changed: @escaping () -> Void) throws -> NativePreparedPeer {
        guard !used, self.handle == nil, session?.phase == .ringing,
              handle.sid == request.sid, media == profile else { throw NativeMediaPeerFailure.state }
        used = true
        self.handle = handle
        do {
            let (microphone, camera) = try tracks()
            let engine = try NativeMediaPeer(factory: factory, microphone: microphone, camera: camera,
                profile: profile, sid: handle.sid, iceServers: iceServers, changed: { [weak self] in
                    guard self?.handle == handle else { return }
                    changed()
                })
            self.engine = engine
            deferred.engine = engine
            return engine.prepared
        } catch { close(handle: handle); throw error }
    }

    func accept(handle: NativeCallHandle, peer: RTCPeerConnection,
                completion: @escaping (Result<NativeCallMedia, Error>) -> Void) {
        guard self.handle == handle, engine?.prepared.peer === peer, task == nil, let session = session else {
            completion(.failure(NativeMediaPeerFailure.state))
            return
        }
        task = Task { [weak self] in
            guard let self = self else { return }
            do {
                try Task.checkCancellation()
                guard self.handle == handle, session.phase == .ringing else { throw NativeMediaPeerFailure.state }
                try await session.accept()
                try Task.checkCancellation()
                guard self.handle == handle else { return }
                completion(.success(self.profile))
            } catch {
                guard self.handle == handle else { return }
                completion(.failure(error))
            }
        }
    }

    func close(handle: NativeCallHandle) {
        guard self.handle == handle else { return }
        cancel()
    }

    func cancel() {
        guard session != nil else { return }
        used = true
        let hadPreparation = handle != nil
        self.handle = nil
        task?.cancel()
        task = nil
        if hadPreparation { stopCapture() }
        engine?.close()
        engine = nil
        deferred.close()
        let previous = session
        session = nil
        let signalling = signalling, binding = request.binding
        Task {
            if let previous = previous { await previous.stop() }
            else { await signalling.unbindCall(binding) }
        }
    }
}
