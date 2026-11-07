import Foundation
import WebRTC

enum NativeMediaPeerFailure: Error { case state, configuration, transport, timeout, closed }

struct NativePreparedPeer {
    let peer: RTCPeerConnection
    let microphone: RTCAudioTrack
    let camera: RTCVideoTrack?
}

@MainActor
protocol NativePeerNegotiating: AnyObject {
    var remoteEnded: Bool { get }
    func prepare(handle: NativeCallHandle, media: NativeCallMedia,
                 changed: @escaping () -> Void) throws -> NativePreparedPeer
    func accept(handle: NativeCallHandle, peer: RTCPeerConnection,
                completion: @escaping (Result<NativeCallMedia, Error>) -> Void)
    func close(handle: NativeCallHandle)
}

private final class NativePeerEvents: NSObject, RTCPeerConnectionDelegate {
    let changed: () -> Void
    init(changed: @escaping () -> Void) { self.changed = changed }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) { changed() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) { changed() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) { changed() }
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) { changed() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) { changed() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) { changed() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) { dataChannel.close() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams: [RTCMediaStream]) { changed() }
}

@MainActor
final class NativeMediaPeer: NativeMediaNegotiating {
    private enum Phase { case fresh, offering, offered, answering, negotiated, closed }
    let prepared: NativePreparedPeer
    let profile: NativeCallMedia
    let sid: String
    private let events: NativePeerEvents
    private var phase = Phase.fresh
    private var offer: NativeJingleMedia?
    private var pendingID: UUID?
    private var pendingFailure: ((Error) -> Void)?
    private var deadline: Task<Void, Never>?
    private let diagnostic: ((String, Error) -> Void)?

    init(factory: RTCPeerConnectionFactory, microphone: RTCAudioTrack, camera: RTCVideoTrack?,
         profile: NativeCallMedia, sid: String, iceServers: [RTCIceServer] = [],
         diagnostic: ((String, Error) -> Void)? = nil, changed: @escaping () -> Void) throws {
        guard profile.hasVideo == (camera != nil), microphone.readyState == .live,
              sid.range(of: "\\A[A-Za-z0-9_-]{1,128}\\z", options: .regularExpression) != nil else {
            throw NativeMediaPeerFailure.configuration
        }
        self.profile = profile
        self.sid = sid
        self.diagnostic = diagnostic
        let events = NativePeerEvents { Task { @MainActor in changed() } }
        self.events = events
        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.bundlePolicy = .maxCompat
        configuration.iceServers = iceServers
        configuration.tcpCandidatePolicy = .disabled
        guard let peer = factory.peerConnection(with: configuration,
            constraints: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil), delegate: events) else {
            throw NativeMediaPeerFailure.configuration
        }
        prepared = NativePreparedPeer(peer: peer, microphone: microphone, camera: camera)
        do {
            try Self.add(microphone, kind: "audio", codec: "PCMU", factory: factory, peer: peer)
            if let camera = camera { try Self.add(camera, kind: "video", codec: "VP8", factory: factory, peer: peer) }
        } catch { peer.close(); throw error }
    }

    private static func add(_ track: RTCMediaStreamTrack, kind: String, codec: String,
                            factory: RTCPeerConnectionFactory, peer: RTCPeerConnection) throws {
        let options = RTCRtpTransceiverInit()
        options.direction = .sendRecv
        options.streamIds = ["conversation"]
        let codecs = factory.rtpSenderCapabilities(forKind: kind).codecs.filter { $0.name.uppercased() == codec }
        guard !codecs.isEmpty, let transceiver = peer.addTransceiver(with: track, init: options) else {
            throw NativeMediaPeerFailure.configuration
        }
        try transceiver.setCodecPreferences(codecs)
    }

    func createOffer() async throws -> NativeJingleMedia {
        guard phase == .fresh else { throw NativeMediaPeerFailure.state }
        phase = .offering
        do {
            let description = try await local(offer: true)
            let media = try NativeJingleMedia.fromSDP(description.sdp, sid: sid, action: "session-initiate", profile: profile)
            offer = media
            phase = .offered
            return media
        } catch { close(); throw error }
    }

    func acceptOffer(_ xml: String) async throws -> NativeJingleMedia {
        guard phase == .fresh else { throw NativeMediaPeerFailure.state }
        phase = .answering
        do {
            let proposed = try NativeJingleMedia.decode(xml, sid: sid, action: "session-initiate", profile: profile)
            try await set(RTCSessionDescription(type: .offer, sdp: proposed.sdp), local: false)
            let description = try await local(offer: false)
            let answer = try NativeJingleMedia.fromSDP(description.sdp, sid: sid, action: "session-accept", profile: profile)
            try answer.validateAnswer(to: proposed)
            phase = .negotiated
            return answer
        } catch { close(); throw error }
    }

    func applyAnswer(_ xml: String) async throws {
        guard phase == .offered, let offer = offer else { throw NativeMediaPeerFailure.state }
        phase = .answering
        do {
            let answer = try NativeJingleMedia.decode(xml, sid: sid, action: "session-accept", profile: profile)
            try answer.validateAnswer(to: offer)
            try await set(RTCSessionDescription(type: .answer, sdp: answer.sdp), local: false)
            self.offer = nil
            phase = .negotiated
        } catch { close(); throw error }
    }

    func close() {
        guard phase != .closed else { return }
        phase = .closed
        offer = nil
        let failure = pendingFailure
        pendingFailure = nil
        pendingID = nil
        deadline?.cancel()
        deadline = nil
        prepared.microphone.isEnabled = false
        prepared.camera?.isEnabled = false
        prepared.peer.delegate = nil
        prepared.peer.close()
        failure?(NativeMediaPeerFailure.closed)
    }

    private func local(offer: Bool) async throws -> RTCSessionDescription {
        let peer = prepared.peer
        let diagnostic = diagnostic
        let description: RTCSessionDescription = try await operation { complete in
            let done: (RTCSessionDescription?, Error?) -> Void = { result, error in
                if let result = result, error == nil { complete(.success(result)) }
                else {
                    if let error = error { diagnostic?(offer ? "create-offer" : "create-answer", error) }
                    complete(.failure(NativeMediaPeerFailure.transport))
                }
            }
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            if offer { peer.offer(for: constraints, completionHandler: done) }
            else { peer.answer(for: constraints, completionHandler: done) }
        }
        let restricted = try NativeLocalMediaSDP.restrict(description.sdp)
        try await set(RTCSessionDescription(type: description.type, sdp: restricted), local: true)
        let limit = ProcessInfo.processInfo.systemUptime + 8
        while peer.iceGatheringState != .complete {
            try Task.checkCancellation()
            guard phase != .closed else { throw NativeMediaPeerFailure.closed }
            guard ProcessInfo.processInfo.systemUptime < limit else { throw NativeMediaPeerFailure.timeout }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        try Task.checkCancellation()
        guard phase != .closed, let gathered = peer.localDescription else { throw NativeMediaPeerFailure.closed }
        return RTCSessionDescription(type: gathered.type, sdp: try NativeLocalMediaSDP.restrict(gathered.sdp))
    }

    private func set(_ description: RTCSessionDescription, local: Bool) async throws {
        let peer = prepared.peer
        let diagnostic = diagnostic
        let _: Bool = try await operation { complete in
            let done: (Error?) -> Void = { error in
                if let error = error { diagnostic?(local ? "set-local" : "set-remote", error) }
                complete(error == nil ? .success(true) : .failure(NativeMediaPeerFailure.transport))
            }
            if local { peer.setLocalDescription(description, completionHandler: done) }
            else { peer.setRemoteDescription(description, completionHandler: done) }
        }
    }

    private func operation<Value>(_ start: (@escaping (Result<Value, Error>) -> Void) -> Void) async throws -> Value {
        try Task.checkCancellation()
        guard phase != .closed, pendingID == nil else { throw NativeMediaPeerFailure.state }
        let id = UUID()
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                pendingID = id
                pendingFailure = { continuation.resume(throwing: $0) }
                deadline = Task { [weak self] in
                    do { try await Task.sleep(nanoseconds: 10_000_000_000) } catch { return }
                    guard let self = self, self.pendingID == id else { return }
                    let failure = self.pendingFailure
                    self.pendingFailure = nil
                    self.pendingID = nil
                    failure?(NativeMediaPeerFailure.timeout)
                }
                start { [weak self] result in
                    Task { @MainActor in
                        guard let self = self, self.pendingID == id else { return }
                        self.pendingID = nil
                        self.pendingFailure = nil
                        self.deadline?.cancel()
                        self.deadline = nil
                        continuation.resume(with: result)
                    }
                }
            }
        }, onCancel: { Task { @MainActor [weak self] in self?.close() } })
    }
}
