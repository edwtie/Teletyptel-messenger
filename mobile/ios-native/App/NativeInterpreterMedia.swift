import Foundation
import Combine
import WebRTC

private final class NativeInterpreterEvents: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    var changed: (() -> Void)?
    var opened: ((RTCDataChannel) -> Void)?
    var received: ((RTCDataBuffer) -> Void)?
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) { changed?() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) { changed?() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) { changed?() }
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) { changed?() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) { changed?() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) { changed?() }
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) { opened?(dataChannel) }
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams: [RTCMediaStream]) { changed?() }
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) { changed?() }
    func dataChannel(_ dataChannel: RTCDataChannel, didChangeBufferedAmount amount: UInt64) { changed?() }
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) { received?(buffer) }
}

@MainActor
final class NativeInterpreterMedia: ObservableObject, NativeInterpreterMediaDriving {
    @Published private(set) var remoteVideo: RTCVideoTrack?
    private(set) var remoteText = ""
    private let factory: RTCPeerConnectionFactory
    private let tracks: () -> (RTCAudioTrack, RTCVideoTrack?)?
    private var peer: RTCPeerConnection?
    private var channel: RTCDataChannel?
    private var events: NativeInterpreterEvents?
    private var changed: (() -> Void)?
    private var send: ((NativeInterpreterPayload) async throws -> Void)?
    private var offerer = false
    private var negotiated = false
    private var candidates: [NativeInterpreterPayload.Candidate] = []
    private var generation = UUID()
    private var pendingText: String?
    private var pendingID: UUID?
    private var pendingFailure: ((Error) -> Void)?
    private var deadline: Task<Void, Never>?
    private(set) var failed = false
    var connected: Bool { peer?.connectionState == .connected && channel?.readyState == .open && !failed }

    init(factory: RTCPeerConnectionFactory, tracks: @escaping () -> (RTCAudioTrack, RTCVideoTrack?)?) {
        self.factory = factory; self.tracks = tracks
    }
    func start(offerer: Bool, rtc: NativeInterpreterRTC,
               send: @escaping (NativeInterpreterPayload) async throws -> Void, changed: @escaping () -> Void) async throws {
        guard peer == nil, rtc.valid, let tracks = tracks() else { throw NativeInterpreterFailure.media }
        let configuration = RTCConfiguration()
        configuration.sdpSemantics = .unifiedPlan
        configuration.bundlePolicy = .balanced
        configuration.iceTransportPolicy = rtc.iceTransportPolicy == "relay" ? .relay : .all
        configuration.iceServers = rtc.iceServers.map { RTCIceServer(urlStrings: $0.urls.values, username: $0.username, credential: $0.credential) }
        let events = NativeInterpreterEvents()
        guard let peer = factory.peerConnection(with: configuration,
            constraints: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil), delegate: events) else { throw NativeInterpreterFailure.media }
        self.peer = peer; self.events = events; self.send = send; self.changed = changed; self.offerer = offerer
        failed = false; negotiated = false
        let attempt = generation
        events.changed = { [weak self] in Task { @MainActor in
            guard let self = self, self.generation == attempt else { return }
            self.failed = self.peer?.connectionState == .failed || self.peer?.connectionState == .closed || self.channel?.readyState == .closed
            self.remoteVideo = self.peer?.transceivers.compactMap { $0.receiver.track as? RTCVideoTrack }.first
            self.flushText(); self.changed?()
        } }
        events.opened = { [weak self] channel in Task { @MainActor in
            guard let self = self, self.generation == attempt else { channel.close(); return }
            self.attach(channel)
        } }
        events.received = { [weak self] buffer in Task { @MainActor in
            guard let self = self, self.generation == attempt, !buffer.isBinary,
                  let text = NativeInterpreterText.decode(buffer.data) else { return }
            self.remoteText = text; self.changed?()
        } }
        guard peer.add(tracks.0, streamIds: ["interpreter"]) != nil else { stop(); throw NativeInterpreterFailure.media }
        if let camera = tracks.1 {
            guard peer.add(camera, streamIds: ["interpreter"]) != nil else { stop(); throw NativeInterpreterFailure.media }
        } else {
            let initialization = RTCRtpTransceiverInit(); initialization.direction = .recvOnly
            guard peer.addTransceiver(of: .video, init: initialization) != nil else { stop(); throw NativeInterpreterFailure.media }
        }
        if offerer {
            let initialization = RTCDataChannelConfiguration(); initialization.isOrdered = true
            guard let channel = peer.dataChannel(forLabel: "teletyptel-rtt", configuration: initialization) else { stop(); throw NativeInterpreterFailure.media }
            attach(channel)
            let sdp = try await localDescription(offer: true)
            try await send(NativeInterpreterPayload(type: "offer", sdp: sdp))
        }
        guard generation == attempt else { throw NativeInterpreterFailure.expired }
    }

    private func attach(_ value: RTCDataChannel) {
        guard value.label == "teletyptel-rtt", channel == nil, value.isOrdered, !value.isNegotiated else {
            value.close(); return
        }
        channel = value; value.delegate = events
        flushText(); changed?()
    }

    func receive(_ payload: NativeInterpreterPayload) async throws {
        guard payload.valid, let peer = peer, !failed else { throw NativeInterpreterFailure.media }
        let attempt = generation
        if let candidate = payload.candidate {
            if peer.remoteDescription == nil {
                guard candidates.count < 128 else { throw NativeInterpreterFailure.invalid }
                candidates.append(candidate)
            } else { try await add(candidate, peer: peer) }
            return
        }
        guard !negotiated, (payload.type == "answer") == offerer, let sdp = payload.sdp else { throw NativeInterpreterFailure.invalid }
        let media = sdp.components(separatedBy: "\n").filter { $0.hasPrefix("m=") }
        guard media.count == 3, Set(media.map { String($0.split(separator: " ").first ?? "") }) == Set(["m=audio", "m=video", "m=application"]) else { throw NativeInterpreterFailure.invalid }
        let description = RTCSessionDescription(type: offerer ? .answer : .offer, sdp: sdp)
        let _: Bool = try await operation { complete in
            peer.setRemoteDescription(description) { error in
                complete(error == nil ? .success(true) : .failure(NativeInterpreterFailure.media))
            }
        }
        guard generation == attempt else { throw NativeInterpreterFailure.expired }
        negotiated = true
        if !offerer, let send = send {
            let sdp = try await localDescription(offer: false)
            try await send(NativeInterpreterPayload(type: "answer", sdp: sdp))
        }
        guard generation == attempt else { throw NativeInterpreterFailure.expired }
        for candidate in candidates { try await add(candidate, peer: peer) }
        candidates.removeAll()
    }

    private func add(_ value: NativeInterpreterPayload.Candidate, peer: RTCPeerConnection) async throws {
        let candidate = RTCIceCandidate(sdp: value.candidate, sdpMLineIndex: value.sdpMLineIndex ?? 0, sdpMid: value.sdpMid)
        let _: Bool = try await operation { complete in
            peer.add(candidate) { error in
                complete(error == nil ? .success(true) : .failure(NativeInterpreterFailure.media))
            }
        }
    }

    private func localDescription(offer: Bool) async throws -> String {
        guard let peer = peer else { throw NativeInterpreterFailure.media }
        let attempt = generation
        let description: RTCSessionDescription = try await operation { complete in
            let done: (RTCSessionDescription?, Error?) -> Void = { result, error in
                if let result = result, error == nil { complete(.success(result)) }
                else { complete(.failure(NativeInterpreterFailure.media)) }
            }
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            if offer { peer.offer(for: constraints, completionHandler: done) } else { peer.answer(for: constraints, completionHandler: done) }
        }
        guard generation == attempt else { throw NativeInterpreterFailure.expired }
        let _: Bool = try await operation { complete in
            peer.setLocalDescription(description) { error in
                complete(error == nil ? .success(true) : .failure(NativeInterpreterFailure.media))
            }
        }
        let deadline = ProcessInfo.processInfo.systemUptime + 8
        while peer.iceGatheringState != .complete {
            try Task.checkCancellation()
            guard generation == attempt, ProcessInfo.processInfo.systemUptime < deadline else { throw NativeInterpreterFailure.expired }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        guard generation == attempt, let sdp = peer.localDescription?.sdp,
              NativeInterpreterPayload(type: offer ? "offer" : "answer", sdp: sdp).valid else { throw NativeInterpreterFailure.media }
        return sdp
    }

    func sendText(_ text: String) {
        guard NativeInterpreterText.encode(text) != nil else { return }
        pendingText = text; flushText()
    }
    private func flushText() {
        guard let channel = channel, channel.readyState == .open, let text = pendingText,
              let data = NativeInterpreterText.encode(text), channel.bufferedAmount + UInt64(data.count) <= 262144 else { return }
        if channel.sendData(RTCDataBuffer(data: data, isBinary: false)) { pendingText = nil }
    }
    func stop() {
        generation = UUID()
        let failure = pendingFailure; pendingFailure = nil; pendingID = nil
        deadline?.cancel(); deadline = nil
        failure?(NativeInterpreterFailure.expired)
        changed = nil; send = nil
        channel?.delegate = nil; channel?.close(); channel = nil
        peer?.delegate = nil; peer?.close(); peer = nil; events = nil
        remoteVideo = nil; remoteText = ""; pendingText = nil; candidates.removeAll(); negotiated = false; failed = false
    }

    private func operation<Value>(_ start: (@escaping (Result<Value, Error>) -> Void) -> Void) async throws -> Value {
        try Task.checkCancellation()
        guard peer != nil, pendingID == nil else { throw NativeInterpreterFailure.media }
        let identifier = UUID()
        let attempt = generation
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                pendingID = identifier
                pendingFailure = { continuation.resume(throwing: $0) }
                deadline = Task { [weak self] in
                    do { try await Task.sleep(nanoseconds: 10_000_000_000) } catch { return }
                    guard let self = self, self.pendingID == identifier else { return }
                    let failure = self.pendingFailure
                    self.pendingFailure = nil; self.pendingID = nil
                    failure?(NativeInterpreterFailure.media)
                }
                start { [weak self] result in Task { @MainActor in
                    guard let self = self, self.pendingID == identifier else { return }
                    self.pendingID = nil; self.pendingFailure = nil
                    self.deadline?.cancel(); self.deadline = nil
                    continuation.resume(with: result)
                } }
            }
        }, onCancel: { Task { @MainActor [weak self] in
            guard let self = self, self.generation == attempt else { return }
            self.stop()
        } })
    }
}
