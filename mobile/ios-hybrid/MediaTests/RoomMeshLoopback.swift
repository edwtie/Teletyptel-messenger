import CoreVideo
import Foundation
import WebRTC

private final class Frames: NSObject, RTCVideoRenderer {
    private let lock = NSLock()
    private var count = 0
    var received: Bool { lock.lock(); defer { lock.unlock() }; return count > 0 }
    func setSize(_ size: CGSize) {}
    func renderFrame(_ frame: RTCVideoFrame?) {
        if frame != nil { lock.lock(); count += 1; lock.unlock() }
    }
}

@main @MainActor
enum RoomMeshLoopback {
    static func main() async throws {
        RTCInitializeSSL()
        let factory = RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(), decoderFactory: RTCDefaultVideoDecoderFactory())
        let rtc = try JSONDecoder().decode(NativeInterpreterRTC.self, from: Data(#"{"ok":true,"iceServers":[],"iceTransportPolicy":"all"}"#.utf8))
        let sources = (0..<3).map { _ in factory.videoSource() }
        let generators = sources.map { RTCVideoCapturer(delegate: $0) }
        let tracks = sources.map { source -> (RTCAudioTrack, RTCVideoTrack) in
            let mic = factory.audioTrack(withTrackId: UUID().uuidString); mic.isEnabled = false
            return (mic, factory.videoTrack(with: source, trackId: UUID().uuidString))
        }
        var links = [[Int: NativeInterpreterMedia]](repeating: [:], count: 3)
        defer { links.flatMap(\.values).forEach { $0.stop() } }
        for sender in tracks.indices {
            for receiver in tracks.indices where sender != receiver {
                links[sender][receiver] = NativeInterpreterMedia(factory: factory, tracks: { tracks[sender] })
            }
        }
        for sender in tracks.indices {
            for receiver in tracks.indices where sender < receiver {
                let outbound = links[sender][receiver]!, inbound = links[receiver][sender]!
                try await inbound.start(offerer: false, rtc: rtc, send: { try await outbound.receive($0) }, changed: {})
                try await outbound.start(offerer: true, rtc: rtc, send: { try await inbound.receive($0) }, changed: {})
            }
        }
        let legs = links.flatMap(\.values)
        try await wait { legs.allSatisfy { $0.connected && $0.remoteVideo != nil } }
        let counters = legs.map { _ in Frames() }
        for (leg, counter) in zip(legs, counters) { leg.remoteVideo!.add(counter) }
        defer { for (leg, counter) in zip(legs, counters) { leg.remoteVideo?.remove(counter) } }
        var buffer: CVPixelBuffer?
        precondition(CVPixelBufferCreate(kCFAllocatorDefault, 160, 90, kCVPixelFormatType_32BGRA, nil, &buffer) == kCVReturnSuccess)
        try await wait {
            for sender in sources.indices {
                sources[sender].capturer(generators[sender], didCapture: RTCVideoFrame(buffer: RTCCVPixelBuffer(pixelBuffer: buffer!), rotation: ._0,
                    timeStampNs: Int64(ProcessInfo.processInfo.systemUptime * 1_000_000_000)))
                for leg in links[sender].values { leg.sendText("Live \(sender)") }
            }
            return counters.allSatisfy(\.received) && links.indices.allSatisfy { receiver in
                links[receiver].allSatisfy { sender, leg in leg.remoteText == "Live \(sender)" }
            }
        }
        for other in [0, 1] { links[2][other]!.stop(); links[other][2]!.stop() }
        links[0][1]!.sendText("Nog verbonden")
        try await wait { links[1][0]?.remoteText == "Nog verbonden" && links[0][1]?.connected == true }
        print("Three equal peers: six simultaneous video/RTT paths; remaining pair continued after leave.")
    }
    private static func wait(_ condition: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + 20
        while !condition() {
            guard ProcessInfo.processInfo.systemUptime < deadline else { throw NativeInterpreterFailure.expired }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }
}
