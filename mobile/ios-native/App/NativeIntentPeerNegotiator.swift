import Foundation
import WebRTC

@MainActor
final class NativeIntentPeerNegotiator: NativeActivePeerNegotiating {
    let sid: String
    let outgoing: Bool
    private let lease: NativeCallIntentLease
    private let profile: NativeCallMedia
    private let factory: RTCPeerConnectionFactory
    private let videoCodec: String
    private let audioCodec: String
    private let tracks: () throws -> (RTCAudioTrack, RTCVideoTrack?)
    private let stopCapture: () -> Void
    private let caller: NativeOutgoingCallIntent?
    private let recipient: NativeIncomingCallIntent?
    private var provider: (any NativeActivePeerNegotiating)?
    private var stopped = false
    private(set) var remoteEnded = false
    var intentEnded: (() -> Void)?
    var isRemoteHeld: Bool { provider?.isRemoteHeld ?? false }
    var isRemoteVideoMuted: Bool { provider?.isRemoteVideoMuted ?? false }

    init(lease: NativeCallIntentLease, peer: String, sid: String, profile: NativeCallMedia,
         proposal: NativeCallIntent? = nil, factory: RTCPeerConnectionFactory,
         videoCodec: String = "VP8", audioCodec: String = "PCMU",
         tracks: @escaping () throws -> (RTCAudioTrack, RTCVideoTrack?), stopCapture: @escaping () -> Void) throws {
        self.lease = lease; self.sid = sid; self.profile = profile; self.factory = factory
        guard NativeAudioCodec(rawValue: audioCodec) != nil else { throw NativeJingleFailure.invalidRequest }
        self.videoCodec = videoCodec; self.audioCodec = audioCodec
        self.tracks = tracks; self.stopCapture = stopCapture; outgoing = proposal == nil
        if let proposal = proposal {
            guard proposal.sid == sid, proposal.media == profile, NativeChatCodec.bareJID(proposal.peer) == peer else { throw NativeJingleFailure.invalidRequest }
            caller = nil; recipient = try NativeIncomingCallIntent(proposal: proposal, sender: lease.sender)
        } else {
            recipient = nil; caller = try NativeOutgoingCallIntent(owner: lease.owner, peer: peer, sid: sid, profile: profile)
        }
        caller?.remoteEnded = { [weak self] in self?.ended() }
        recipient?.remoteEnded = { [weak self] in self?.ended() }
    }

    func prepareSignaling(validate: @escaping () throws -> Void) async throws {
        guard !stopped, provider == nil else { throw NativeJingleFailure.staleBinding }
        let prepared: any NativeActivePeerNegotiating
        if let caller = caller {
            let peer = try await caller.prepare(sender: lease.sender, validate: validate)
            try validate()
            prepared = try await NativeOutgoingPeerNegotiator(peerJID: peer, sid: sid, profile: profile,
                signalling: lease.sender, factory: factory, videoCodec: videoCodec, audioCodec: audioCodec,
                tracks: tracks, stopCapture: stopCapture)
        } else if let recipient = recipient {
            let request = try await recipient.prepare(validate: validate)
            try validate()
            prepared = try await NativeIncomingPeerNegotiator(request: request, profile: profile, signalling: lease.sender,
                factory: factory, tracks: tracks, stopCapture: stopCapture)
        } else { throw NativeJingleFailure.disconnected }
        do {
            try Task.checkCancellation(); try validate()
            guard !stopped, !remoteEnded else { throw NativeJingleFailure.staleBinding }
        } catch { prepared.cancel(notifyPeer: true); throw error }
        provider = prepared
        for request in recipient?.drainRequests() ?? [] { await prepared.receive(request) }
        if prepared.remoteEnded { ended() }
    }

    func prepare(handle: NativeCallHandle, media: NativeCallMedia, changed: @escaping () -> Void) throws -> NativePreparedPeer {
        guard !stopped, handle.sid == sid, media == profile, let provider = provider else { throw NativeJingleFailure.disconnected }
        return try provider.prepare(handle: handle, media: media, changed: changed)
    }
    func accept(handle: NativeCallHandle, peer: RTCPeerConnection, completion: @escaping (Result<NativeCallMedia, Error>) -> Void) {
        guard !stopped, let provider = provider else { completion(.failure(NativeJingleFailure.disconnected)); return }
        provider.accept(handle: handle, peer: peer, completion: completion)
    }
    func receive(_ request: NativeJingleRequest) async {
        if let provider = provider { await provider.receive(request); if provider.remoteEnded { ended() } }
        else if let recipient = recipient { await recipient.receive(request) }
        else { try? await lease.sender.replyJingle(request, rejection: .unexpectedRequest) }
    }
    func receive(_ intent: NativeCallIntent) { caller?.receive(intent); recipient?.receive(intent) }
    func setHeld(_ held: Bool) async throws {
        guard let provider = provider else { throw NativeJingleFailure.disconnected }; try await provider.setHeld(held)
    }
    func setVideoEnabled(_ enabled: Bool) async throws {
        guard let provider = provider else { throw NativeJingleFailure.disconnected }; try await provider.setVideoEnabled(enabled)
    }
    func close(handle: NativeCallHandle) { cancel(notifyPeer: true) }
    func cancel(notifyPeer: Bool) {
        guard !stopped else { return }; stopped = true; intentEnded = nil
        provider?.cancel(notifyPeer: notifyPeer); provider = nil; caller?.cancel(); recipient?.cancel()
    }
    private func ended() { guard !stopped, !remoteEnded else { return }; remoteEnded = true; intentEnded?() }
}
