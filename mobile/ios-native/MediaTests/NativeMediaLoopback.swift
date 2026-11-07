import Foundation
import CoreVideo
import WebRTC

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
        let first = try FixturePeer(factory: factory, profile: profile)
        let second = try FixturePeer(factory: factory, profile: profile)
        defer { first.close(); second.close() }
        let offer = try await first.engine.createOffer()
        precondition(!offer.sdp.contains("BUNDLE"))
        let answer = try await second.engine.acceptOffer(offer.xml)
        try await first.engine.applyAnswer(answer.xml)
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
            first.close()
            try await wait("RTT closes and clears remote text") { !receiver.isReady && receiver.remoteText.isEmpty }
        }
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
        let cancelled = try FixturePeer(factory: factory, profile: .total)
        let task = Task { try await cancelled.engine.createOffer() }
        task.cancel()
        do { _ = try await task.value; preconditionFailure("cancelled offer succeeded") } catch {}
        cancelled.close()
        precondition(cancelled.engine.prepared.peer.connectionState == .closed)
        print("Native audio/video/RTT negotiation loopback passed")
    }
}
