import Foundation
import WebRTC

private final class PeerEvents: NSObject, RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) { dataChannel.close() }
}

@main
enum NativeWebRTCTests {
    private static func wait(_ label: String, until predicate: () -> Bool) {
        let deadline = Date().addingTimeInterval(12)
        while !predicate() && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
        precondition(predicate(), label)
    }

    private static func set(_ description: RTCSessionDescription, on peer: RTCPeerConnection, local: Bool) {
        var complete = false
        var failed = false
        let done: (Error?) -> Void = { error in
            DispatchQueue.main.async { failed = error != nil; complete = true }
        }
        if local { peer.setLocalDescription(description, completionHandler: done) }
        else { peer.setRemoteDescription(description, completionHandler: done) }
        wait("description completion", until: { complete })
        precondition(!failed, "description rejected")
    }

    private static func description(for peer: RTCPeerConnection, offer: Bool) -> RTCSessionDescription {
        var complete = false
        var value: RTCSessionDescription?
        let done: (RTCSessionDescription?, Error?) -> Void = { result, error in
            DispatchQueue.main.async { value = error == nil ? result : nil; complete = true }
        }
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        if offer { peer.offer(for: constraints, completionHandler: done) }
        else { peer.answer(for: constraints, completionHandler: done) }
        wait("SDP completion", until: { complete })
        precondition(value != nil, "SDP generation failed")
        return value!
    }

    private static func jingleDescription(_ description: RTCSessionDescription) throws -> RTCSessionDescription {
        let action = description.type == .offer ? "session-initiate" : "session-accept"
        let xml = try MessengerJingleRtt.fromSdp(description.sdp, sid: "native-loopback", action: action)
        let restored = try MessengerJingleRtt.toSdp(xml, sid: "native-loopback", action: action, expectedMid: "0")
        return RTCSessionDescription(type: description.type, sdp: restored)
    }

    static func main() throws {
        RTCInitializeSSL()
        let factory = RTCPeerConnectionFactory()
        let firstEvents = PeerEvents()
        let secondEvents = PeerEvents()
        let configuration = RTCConfiguration()
        configuration.iceServers = []
        configuration.sdpSemantics = .unifiedPlan
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let first = factory.peerConnection(with: configuration, constraints: constraints, delegate: firstEvents)!
        let second = factory.peerConnection(with: configuration, constraints: constraints, delegate: secondEvents)!
        defer { first.close(); second.close() }
        let id = UUID()
        let sender = MessengerNativeRttSession(callId: id, sid: "native-loopback")
        let receiver = MessengerNativeRttSession(callId: id, sid: "native-loopback")
        var changes = 0
        let outgoing = MessengerWebRTCChannel.attach(to: first, session: sender) { changes += 1 }!
        let incoming = MessengerWebRTCChannel.attach(to: second, session: receiver) { changes += 1 }!
        precondition(outgoing.descriptor == .conversation && incoming.descriptor == .conversation)
        precondition(!sender.setText("not connected"))
        set(description(for: first, offer: true), on: first, local: true)
        wait("first gathering", until: { first.iceGatheringState == .complete })
        set(try jingleDescription(first.localDescription!), on: second, local: false)
        set(description(for: second, offer: false), on: second, local: true)
        wait("second gathering", until: { second.iceGatheringState == .complete })
        set(try jingleDescription(second.localDescription!), on: first, local: false)
        wait("native ordered T.140 channel open", until: { sender.isReady && receiver.isReady })
        precondition(first.senders.isEmpty && second.senders.isEmpty)
        for text in ["Hallo 👋", "Hall🌍", "e\u{301}\nVolgende", "e", "", "{\"type\":\"literal text\"}"] {
            precondition(sender.setText(text))
            wait("native text delivery", until: { receiver.remoteText == text })
        }
        let large = String(repeating: "🌍", count: 22000)
        _ = sender.setText(large)
        wait("segmented native text delivery and drain", until: { receiver.remoteText == large && !sender.hasPendingText })
        precondition(receiver.setText("Antwoord vanuit tweede peer"))
        wait("bidirectional native text", until: { sender.remoteText == "Antwoord vanuit tweede peer" })
        precondition(!outgoing.send(Data([0xff])))
        precondition(!outgoing.send(Data(repeating: 65, count: 4097)))
        precondition(!receiver.receive(Data("wrong call".utf8), from: incoming, callId: UUID(), sid: "native-loopback"))
        precondition(changes > 0)
        sender.close()
        wait("remote channel closure callback", until: { receiver.status == "unavailable" })
        precondition(!receiver.isReady)
        precondition(sender.ownText.isEmpty && sender.remoteText.isEmpty)
        precondition(receiver.ownText.isEmpty && receiver.remoteText.isEmpty)
        precondition(!sender.setText("late edit"))
        precondition(!outgoing.send(Data("late packet".utf8)))
        let replacement = MessengerNativeRttSession(callId: UUID(), sid: "native-loopback")
        precondition(replacement.ownText.isEmpty && replacement.remoteText.isEmpty && !replacement.isReady)
        print("Native WebRTC RTT loopback passed")
    }
}
