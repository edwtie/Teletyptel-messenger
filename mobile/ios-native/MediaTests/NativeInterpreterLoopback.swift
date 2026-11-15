import Foundation
import CoreVideo
import WebRTC

private final class InterpreterFrameCounter: NSObject, RTCVideoRenderer {
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
private final class InterpreterSyntheticTracks {
    let microphone: RTCAudioTrack
    let camera: RTCVideoTrack
    let source: RTCVideoSource
    let capturer: RTCVideoCapturer
    private var frames: Task<Void, Never>?
    init(factory: RTCPeerConnectionFactory) {
        microphone = factory.audioTrack(withTrackId: UUID().uuidString)
        microphone.isEnabled = false
        source = factory.videoSource()
        camera = factory.videoTrack(with: source, trackId: UUID().uuidString)
        capturer = RTCVideoCapturer(delegate: source)
    }
    func start() {
        frames = Task { @MainActor in
            while !Task.isCancelled {
                var buffer: CVPixelBuffer?
                precondition(CVPixelBufferCreate(kCFAllocatorDefault, 160, 90, kCVPixelFormatType_32BGRA, nil, &buffer) == kCVReturnSuccess)
                if let buffer = buffer {
                    CVPixelBufferLockBaseAddress(buffer, [])
                    memset(CVPixelBufferGetBaseAddress(buffer), 127, CVPixelBufferGetDataSize(buffer))
                    CVPixelBufferUnlockBaseAddress(buffer, [])
                    source.capturer(capturer, didCapture: RTCVideoFrame(buffer: RTCCVPixelBuffer(pixelBuffer: buffer), rotation: ._0,
                        timeStampNs: Int64(ProcessInfo.processInfo.systemUptime * 1_000_000_000)))
                }
                do { try await Task.sleep(nanoseconds: 50_000_000) } catch { return }
            }
        }
    }
    func stop() { frames?.cancel(); frames = nil }
}

@MainActor
enum NativeInterpreterLoopback {
    private static func wait(_ predicate: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + 12
        while !predicate(), ProcessInfo.processInfo.systemUptime < deadline { try await Task.sleep(nanoseconds: 20_000_000) }
        precondition(predicate(), "Native three-party media did not complete")
    }
    static func run(factory: RTCPeerConnectionFactory) async throws {
        let first = InterpreterSyntheticTracks(factory: factory), second = InterpreterSyntheticTracks(factory: factory), interpreter = InterpreterSyntheticTracks(factory: factory)
        let primaryFirst = try NativeMediaPeer(factory: factory, microphone: first.microphone, camera: first.camera, profile: .total, sid: "primary-call", changed: {})
        let primarySecond = try NativeMediaPeer(factory: factory, microphone: second.microphone, camera: second.camera, profile: .total, sid: "primary-call", changed: {})
        let firstText = MessengerNativeRttSession(callId: UUID(), sid: "primary-call"), secondText = MessengerNativeRttSession(callId: UUID(), sid: "primary-call")
        let firstChannel = MessengerWebRTCChannel.attach(to: primaryFirst.prepared.peer, session: firstText, changed: {})!
        let secondChannel = MessengerWebRTCChannel.attach(to: primarySecond.prepared.peer, session: secondText, changed: {})!
        let firstToInterpreter = NativeInterpreterMedia(factory: factory, tracks: { (first.microphone, first.camera) })
        let secondToInterpreter = NativeInterpreterMedia(factory: factory, tracks: { (second.microphone, second.camera) })
        let interpreterToFirst = NativeInterpreterMedia(factory: factory, tracks: { (interpreter.microphone, interpreter.camera) })
        let interpreterToSecond = NativeInterpreterMedia(factory: factory, tracks: { (interpreter.microphone, interpreter.camera) })
        let legs = [firstToInterpreter, secondToInterpreter, interpreterToFirst, interpreterToSecond]
        defer {
            legs.forEach { $0.stop() }
            first.stop(); second.stop(); interpreter.stop()
            firstChannel.close(); secondChannel.close(); firstText.close(); secondText.close()
            primaryFirst.close(); primarySecond.close()
        }
        let offer = try await primaryFirst.createOffer()
        let answer = try await primarySecond.acceptOffer(offer.xml)
        try await primaryFirst.applyAnswer(answer.xml)
        try await wait { firstText.isReady && secondText.isReady }
        precondition(firstText.setText("Oorspronkelijk gesprek"))
        try await wait { secondText.remoteText == "Oorspronkelijk gesprek" }
        let rtc = try JSONDecoder().decode(NativeInterpreterRTC.self, from: Data("{\"ok\":true,\"iceServers\":[],\"iceTransportPolicy\":\"all\"}".utf8))
        var toFirst: [NativeInterpreterPayload] = [], toSecond: [NativeInterpreterPayload] = []
        var toInterpreterFirst: [NativeInterpreterPayload] = [], toInterpreterSecond: [NativeInterpreterPayload] = []
        try await interpreterToFirst.start(offerer: false, rtc: rtc, send: { toFirst.append($0) }, changed: {})
        try await secondToInterpreter.start(offerer: false, rtc: rtc, send: { toInterpreterSecond.append($0) }, changed: {})
        try await firstToInterpreter.start(offerer: true, rtc: rtc, send: { toInterpreterFirst.append($0) }, changed: {})
        try await interpreterToSecond.start(offerer: true, rtc: rtc, send: { toSecond.append($0) }, changed: {})
        for _ in 0..<4 {
            for payload in toInterpreterFirst { try await interpreterToFirst.receive(payload) }; toInterpreterFirst.removeAll()
            for payload in toFirst { try await firstToInterpreter.receive(payload) }; toFirst.removeAll()
            for payload in toSecond { try await secondToInterpreter.receive(payload) }; toSecond.removeAll()
            for payload in toInterpreterSecond { try await interpreterToSecond.receive(payload) }; toInterpreterSecond.removeAll()
        }
        try await wait { legs.allSatisfy(\.connected) && legs.allSatisfy { $0.remoteVideo != nil } }
        let counters = legs.map { _ in InterpreterFrameCounter() }
        for (leg, counter) in zip(legs, counters) { leg.remoteVideo!.add(counter) }
        defer { for (leg, counter) in zip(legs, counters) { leg.remoteVideo?.remove(counter) } }
        first.start(); second.start(); interpreter.start()
        try await wait { counters.allSatisfy { $0.count >= 3 } }
        firstToInterpreter.sendText("Dove deelnemer 👋")
        secondToInterpreter.sendText("Horende deelnemer")
        interpreterToFirst.sendText("Gebarentolk")
        interpreterToSecond.sendText("Gebarentolk")
        try await wait {
            interpreterToFirst.remoteText == "Dove deelnemer 👋" && interpreterToSecond.remoteText == "Horende deelnemer" &&
                firstToInterpreter.remoteText == "Gebarentolk" && secondToInterpreter.remoteText == "Gebarentolk"
        }
        legs.forEach { $0.stop() }
        precondition(legs.allSatisfy { !$0.connected && $0.remoteText.isEmpty && $0.remoteVideo == nil })
        precondition(first.camera.isEnabled && second.camera.isEnabled)
        precondition(primaryFirst.prepared.peer.connectionState == .connected && primarySecond.prepared.peer.connectionState == .connected)
        precondition(firstText.setText("Gesprek gaat verder zonder tolk"))
        try await wait { secondText.remoteText == "Gesprek gaat verder zonder tolk" }
        print("Native interpreter three-party loopback passed: shared synthetic VP8, isolated live text, primary Jingle/RTT preserved; microphone disabled")
    }
}
