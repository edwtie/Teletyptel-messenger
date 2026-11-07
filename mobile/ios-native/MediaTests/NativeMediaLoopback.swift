import Foundation
import CoreVideo
import WebRTC

@MainActor
private final class MediaTestWire: NativeJingleSending {
    let owner: String
    private var transport: NativeJingleTransport
    weak var remote: MediaTestWire?
    var received: ((NativeJingleRequest) async -> Void)?
    private var pending: [String: CheckedContinuation<Void, Error>] = [:]
    init(owner: String) { self.owner = owner; transport = NativeJingleTransport(owner: owner) }
    func bindCall(peer: String, sid: String) async throws -> UUID { try transport.bind(peer: peer, sid: sid) }
    func exchangeJingle(binding: UUID, xml: String) async throws {
        let output = try transport.prepare(binding: binding, xml: xml)
        try await withCheckedThrowingContinuation { continuation in
            pending[output.identifier] = continuation
            Task {
                await send(output.frame)
            }
            Task {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                transport.cancel(output.identifier)
                pending.removeValue(forKey: output.identifier)?.resume(throwing: NativeJingleFailure.timedOut)
            }
        }
    }
    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws {
        let frame = try transport.reply(request, rejection: rejection, now: ProcessInfo.processInfo.systemUptime)
        await send(frame)
    }
    func unbindCall(_ binding: UUID) async {
        for identifier in transport.unbind(binding) { pending.removeValue(forKey: identifier)?.resume(throwing: NativeJingleFailure.disconnected) }
    }
    private func send(_ frame: String) async {
        guard let remote = remote else { return }
        await remote.receive(frame.replacingOccurrences(of: "<iq ", with: "<iq from='\(owner)' "))
    }
    private func receive(_ frame: String) async {
        let output = transport.receive(frame, now: ProcessInfo.processInfo.systemUptime)
        if let identifier = output.completed, let continuation = pending.removeValue(forKey: identifier) {
            if let failure = output.failure { continuation.resume(throwing: failure) }
            else { continuation.resume() }
        }
        for reply in output.frames { await send(reply) }
        if let request = output.request { await received?(request) }
    }
}

private final class FrameCounter: NSObject, RTCVideoRenderer {
    private let lock = NSLock()
    private var frames = 0
    var count: Int { lock.lock(); defer { lock.unlock() }; return frames }
    func setSize(_ size: CGSize) {}
    func renderFrame(_ frame: RTCVideoFrame?) {
        guard frame != nil else { return }
        lock.lock(); frames += 1; lock.unlock()
    }
}

@MainActor
private final class FixturePeer {
    let engine: NativeMediaPeer
    let rtt: MessengerNativeRttSession?
    let channel: MessengerWebRTCChannel?
    let source: RTCVideoSource?
    let capturer: RTCVideoCapturer?
    private var frames: Task<Void, Never>?

    init(factory: RTCPeerConnectionFactory, profile: NativeCallMedia) throws {
        let microphone = factory.audioTrack(withTrackId: "fixture-audio")
        microphone.isEnabled = false
        let source = profile.hasVideo ? factory.videoSource() : nil
        self.source = source
        capturer = source.map { RTCVideoCapturer(delegate: $0) }
        let camera = source.map { factory.videoTrack(with: $0, trackId: "fixture-video") }
        engine = try NativeMediaPeer(factory: factory, microphone: microphone, camera: camera,
            profile: profile, sid: "media-loopback", changed: {})
        if profile.contents.contains("rtt") {
            let session = MessengerNativeRttSession(callId: UUID(), sid: "media-loopback")
            rtt = session
            channel = MessengerWebRTCChannel.attach(to: engine.prepared.peer, session: session, changed: {})
            precondition(channel != nil)
        } else { rtt = nil; channel = nil }
    }

    func startFrames() {
        guard let source = source, let capturer = capturer else { return }
        frames = Task { @MainActor in
            var index: UInt8 = 0
            while !Task.isCancelled {
                var pixelBuffer: CVPixelBuffer?
                precondition(CVPixelBufferCreate(kCFAllocatorDefault, 160, 90, kCVPixelFormatType_32BGRA, nil, &pixelBuffer) == kCVReturnSuccess)
                let buffer = pixelBuffer!
                CVPixelBufferLockBaseAddress(buffer, [])
                memset(CVPixelBufferGetBaseAddress(buffer), Int32(index), CVPixelBufferGetDataSize(buffer))
                CVPixelBufferUnlockBaseAddress(buffer, [])
                index &+= 1
                let frame = RTCVideoFrame(buffer: RTCCVPixelBuffer(pixelBuffer: buffer), rotation: ._0,
                    timeStampNs: Int64(ProcessInfo.processInfo.systemUptime * 1_000_000_000))
                source.capturer(capturer, didCapture: frame)
                do { try await Task.sleep(nanoseconds: 50_000_000) } catch { return }
            }
        }
    }

    func close() { frames?.cancel(); frames = nil; rtt?.close(); channel?.close(); engine.close() }
}

@main
@MainActor
enum NativeMediaLoopback {
    private static func wait(_ label: String, until predicate: () -> Bool) async throws {
        let limit = ProcessInfo.processInfo.systemUptime + 12
        while !predicate() && ProcessInfo.processInfo.systemUptime < limit { try await Task.sleep(nanoseconds: 20_000_000) }
        precondition(predicate(), label)
    }

    private static func profile(_ profile: NativeCallMedia, factory: RTCPeerConnectionFactory) async throws {
        FileHandle.standardError.write(Data("Testing native media profile: \(profile.rawValue)\n".utf8))
        let first = try FixturePeer(factory: factory, profile: profile)
        let second = try FixturePeer(factory: factory, profile: profile)
        defer { first.close(); second.close() }
        let firstWire = MediaTestWire(owner: "first@localhost/phone"), secondWire = MediaTestWire(owner: "second@localhost/tablet")
        firstWire.remote = secondWire; secondWire.remote = firstWire
        let firstBinding = try await firstWire.bindCall(peer: secondWire.owner, sid: "media-loopback")
        let secondBinding = try await secondWire.bindCall(peer: firstWire.owner, sid: "media-loopback")
        let firstSession = try NativeJingleSession(role: .initiator, binding: firstBinding, peer: secondWire.owner,
            sid: "media-loopback", profile: profile, signalling: firstWire, media: first.engine)
        let secondSession = try NativeJingleSession(role: .responder, binding: secondBinding, peer: firstWire.owner,
            sid: "media-loopback", profile: profile, signalling: secondWire, media: second.engine)
        firstWire.received = { [weak firstSession] request in await firstSession?.receive(request) }
        secondWire.received = { [weak secondSession] request in await secondSession?.receive(request) }
        try await firstSession.start()
        precondition(firstSession.phase == .waiting && secondSession.phase == .ringing)
        try await secondSession.accept()
        precondition(firstSession.phase == .negotiated && secondSession.phase == .negotiated)
        try await wait("both peer transports connected") {
            first.engine.prepared.peer.connectionState == .connected && second.engine.prepared.peer.connectionState == .connected
        }
        for fixture in [first, second] {
            precondition(fixture.engine.prepared.peer.receivers.contains { $0.track is RTCAudioTrack })
        }
        if profile.hasVideo {
            let firstTrack = first.engine.prepared.peer.receivers.compactMap { $0.track as? RTCVideoTrack }.first!
            let secondTrack = second.engine.prepared.peer.receivers.compactMap { $0.track as? RTCVideoTrack }.first!
            let firstFrames = FrameCounter(), secondFrames = FrameCounter()
            firstTrack.add(firstFrames); secondTrack.add(secondFrames)
            defer { firstTrack.remove(firstFrames); secondTrack.remove(secondFrames) }
            first.startFrames(); second.startFrames()
            try await wait("VP8 frames decoded in both directions") { firstFrames.count >= 3 && secondFrames.count >= 3 }
        }
        if let sender = first.rtt, let receiver = second.rtt {
            try await wait("both T140 channels ready") { sender.isReady && receiver.isReady }
            for text in ["Hallo 👋", "Hal🌍", "e\u{301}\nVolgende", ""] {
                precondition(sender.setText(text))
                try await wait("T140 edits reach second peer") { receiver.remoteText == text }
            }
            precondition(receiver.setText("Fictief antwoord"))
            try await wait("T140 response reaches first peer") { sender.remoteText == "Fictief antwoord" }
            await firstSession.stop(notifyPeer: true)
            try await wait("RTT closes and clears remote text") { !receiver.isReady && receiver.remoteText.isEmpty }
        }
        await firstSession.stop(notifyPeer: true)
        precondition(secondSession.phase == .ended)
        first.close(); second.close()
        precondition(first.engine.prepared.peer.connectionState == .closed)
        do { _ = try await first.engine.createOffer(); preconditionFailure("closed peer reopened") }
        catch NativeMediaPeerFailure.state {}
        print("Native media profile passed: \(profile.rawValue)")
    }

    static func main() async throws {
        RTCInitializeSSL()
        let factory = RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(), decoderFactory: RTCDefaultVideoDecoderFactory())
        for mode in NativeCallMedia.allCases { try await profile(mode, factory: factory) }
        try await incomingProvider(factory: factory)
        let cancelled = try FixturePeer(factory: factory, profile: .total)
        let task = Task { try await cancelled.engine.createOffer() }
        task.cancel()
        do { _ = try await task.value; preconditionFailure("cancelled offer succeeded") } catch {}
        cancelled.close()
        precondition(cancelled.engine.prepared.peer.connectionState == .closed)
        print("Native audio/video/RTT negotiation loopback passed")
    }

    private static func incomingProvider(factory: RTCPeerConnectionFactory) async throws {
        let caller = try FixturePeer(factory: factory, profile: .audioRtt)
        let firstWire = MediaTestWire(owner: "caller@localhost/phone"), secondWire = MediaTestWire(owner: "callee@localhost/tablet")
        firstWire.remote = secondWire; secondWire.remote = firstWire
        let binding = try await firstWire.bindCall(peer: secondWire.owner, sid: "media-loopback")
        _ = try await secondWire.bindCall(peer: firstWire.owner, sid: "media-loopback")
        let session = try NativeJingleSession(role: .initiator, binding: binding, peer: secondWire.owner,
            sid: "media-loopback", profile: .audioRtt, signalling: firstWire, media: caller.engine)
        firstWire.received = { [weak session] request in await session?.receive(request) }
        var provider: NativeIncomingPeerNegotiator?
        var created = 0, stopped = 0
        secondWire.received = { request in
            do {
                provider = try await NativeIncomingPeerNegotiator(request: request, profile: .audioRtt,
                    signalling: secondWire, factory: factory, tracks: {
                        created += 1
                        let microphone = factory.audioTrack(withTrackId: "callee-audio")
                        microphone.isEnabled = false
                        return (microphone, nil)
                    }, stopCapture: { stopped += 1 })
            } catch { preconditionFailure("incoming provider refused valid offer") }
        }
        defer { provider?.cancel(); caller.close(); secondWire.received = nil }
        try await session.start()
        try await wait("provider acknowledged without capture") { provider != nil }
        precondition(created == 0)
        let handle = NativeCallHandle(id: UUID(), sid: "media-loopback", generation: UUID())
        let prepared = try provider!.prepare(handle: handle, media: .audioRtt, changed: {})
        precondition(created == 1)
        let rtt = MessengerNativeRttSession(callId: handle.id, sid: handle.sid)
        let channel = MessengerWebRTCChannel.attach(to: prepared.peer, session: rtt, changed: {})!
        defer { rtt.close(); channel.close() }
        var accepted = false, failed = false
        provider!.accept(handle: handle, peer: prepared.peer) { result in
            switch result {
            case .success(let profile): accepted = profile == .audioRtt
            case .failure: failed = true
            }
        }
        try await wait("provider negotiation completion") { accepted || failed }
        precondition(accepted && !failed)
        try await wait("provider native RTT ready") { rtt.isReady && caller.rtt!.isReady }
        precondition(caller.rtt!.setText("Native provider test"))
        try await wait("provider receives conversational text") { rtt.remoteText == "Native provider test" }
        provider!.close(handle: NativeCallHandle(id: UUID(), sid: handle.sid, generation: handle.generation))
        precondition(stopped == 0)
        provider!.close(handle: handle)
        precondition(stopped == 1 && prepared.peer.connectionState == .closed)
        provider!.cancel()
        precondition(stopped == 1)
        print("Native incoming peer provider passed")
    }
}
