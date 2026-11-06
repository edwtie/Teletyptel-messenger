import Foundation

private final class TestChannel: MessengerT140Channel {
    var descriptor = MessengerT140Description.conversation
    var isOpen = true
    var bufferedAmount: UInt64 = 0
    var packets: [Data] = []
    var rejectSend = false
    var fillBuffer = false
    var onSend: (() -> Void)?
    var wasClosed = false
    func send(_ data: Data) -> Bool {
        if rejectSend { return false }
        packets.append(data)
        if fillBuffer { bufferedAmount += UInt64(data.count) }
        onSend?()
        return true
    }
    func close() { isOpen = false; wasClosed = true }
}

@main
enum NativeT140Tests {
    static func main() throws {
        let vectors = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
        for vector in vectors["receive"] as! [[String: Any]] {
            var value = MessengerT140Text()
            for block in vector["blocks"] as! [String] { value = value.applying(Data(block.utf8))! }
            precondition(value.text == (vector["text"] as! String), vector["name"] as! String)
        }
        let id = UUID()
        let sid = "verified-session"
        func make(_ channel: TestChannel = TestChannel()) -> (MessengerNativeRttSession, TestChannel) {
            let session = MessengerNativeRttSession(callId: id, sid: sid)
            precondition(session.attach(channel, callId: id, sid: sid))
            return (session, channel)
        }
        let (sender, outgoing) = make()
        let (receiver, incoming) = make()
        for edit in vectors["edits"] as! [[String: String]] {
            let offset = outgoing.packets.count
            precondition(sender.setText(edit["input"]!))
            let packets = outgoing.packets.dropFirst(offset)
            precondition(String(data: packets.reduce(Data(), +), encoding: .utf8) == edit["bytes"]!)
            for packet in packets { precondition(receiver.receive(packet, from: incoming, callId: id, sid: sid)) }
            precondition(receiver.remoteText == edit["text"]!)
        }

        let (blocked, congested) = make()
        precondition(blocked.setText("oud"))
        congested.bufferedAmount = UInt64.max
        precondition(!blocked.setText("nieuw") && blocked.hasPendingText)
        precondition(blocked.ownText == "nieuw" && blocked.status == "backpressure")
        congested.bufferedAmount = 0
        congested.rejectSend = true
        precondition(!blocked.transportChanged(congested, callId: id, sid: sid))
        precondition(blocked.status == "send-blocked")
        congested.rejectSend = false
        precondition(blocked.setText("nu"))
        precondition(String(data: congested.packets.last!, encoding: .utf8) == "\u{8}\u{8}\u{8}nu")
        precondition(!blocked.hasPendingText)

        let large = String(repeating: "漢👋e\u{301}\nمرحبا", count: 1500)
        let (largeSender, largeWire) = make()
        let (largeReceiver, largeInput) = make()
        var consumed = 0
        for text in [large, "変更\n" + large, "", String(repeating: "x", count: 32768)] {
            precondition(largeSender.setText(text))
            for packet in largeWire.packets.dropFirst(consumed) {
                precondition(packet.count <= 4096 && String(data: packet, encoding: .utf8) != nil)
                precondition(largeReceiver.receive(packet, from: largeInput, callId: id, sid: sid))
            }
            consumed = largeWire.packets.count
            precondition(largeReceiver.remoteText == text)
        }
        precondition(!largeSender.setText(String(repeating: "x", count: 32769)))
        for invalid in ["\u{0}", "\t", "\u{8}", "\u{7f}", "\u{85}", "\u{feff}"] {
            precondition(!largeSender.setText(invalid))
        }

        let (partial, partialWire) = make()
        partialWire.fillBuffer = true
        let longText = String(repeating: "🌍", count: 30000)
        precondition(!partial.setText(longText) && partial.hasPendingText)
        var reconstructed = MessengerT140Text()
        for packet in partialWire.packets { reconstructed = reconstructed.applying(packet)! }
        precondition(reconstructed.text != longText && !reconstructed.text.isEmpty)
        consumed = partialWire.packets.count
        partialWire.fillBuffer = false
        partialWire.bufferedAmount = 0
        precondition(partial.transportChanged(partialWire, callId: id, sid: sid))
        for packet in partialWire.packets.dropFirst(consumed) { reconstructed = reconstructed.applying(packet)! }
        precondition(reconstructed.text == longText && !partial.hasPendingText)

        for malformed in [Data([0xc0, 0xaf]), Data([0xed, 0xa0, 0x80]), Data([0xf0]), Data(repeating: 65, count: 4097)] {
            let (session, channel) = make()
            precondition(!session.receive(malformed, from: channel, callId: id, sid: sid))
            precondition(channel.wasClosed && !session.isReady && session.status == "invalid-text")
        }
        let (limited, limitWire) = make()
        for _ in 0..<8 { precondition(limited.receive(Data(repeating: 65, count: 4096), from: limitWire, callId: id, sid: sid)) }
        precondition(!limited.receive(Data([65]), from: limitWire, callId: id, sid: sid))
        precondition(limited.remoteText.isEmpty && !limited.isReady)

        let (bound, boundWire) = make()
        precondition(!bound.receive(Data("wrong".utf8), from: boundWire, callId: UUID(), sid: sid))
        precondition(!bound.receive(Data("wrong".utf8), from: boundWire, callId: id, sid: "other"))
        precondition(!bound.receive(Data("wrong".utf8), from: TestChannel(), callId: id, sid: sid))
        precondition(bound.remoteText.isEmpty)
        precondition(bound.receive(Data("current".utf8), from: boundWire, callId: id, sid: sid))
        boundWire.bufferedAmount = 65536
        precondition(!bound.setText("unsent"))
        bound.close()
        precondition(bound.ownText.isEmpty && bound.remoteText.isEmpty && !bound.hasPendingText)
        precondition(!bound.receive(Data("late".utf8), from: boundWire, callId: id, sid: sid))
        precondition(!bound.transportChanged(boundWire, callId: id, sid: sid))
        precondition(!bound.setText("late"))
        precondition(!bound.attach(TestChannel(), callId: id, sid: sid))
        let (nextCall, nextWire) = make()
        precondition(!nextCall.receive(Data("old".utf8), from: boundWire, callId: id, sid: sid))
        precondition(nextCall.remoteText.isEmpty && nextCall.isReady)
        precondition(nextCall.transportChanged(nextWire, callId: id, sid: sid, ended: true))
        precondition(!nextCall.isReady && nextCall.status == "unavailable")

        let connecting = TestChannel()
        connecting.isOpen = false
        let (pendingConnection, _) = make(connecting)
        precondition(!pendingConnection.isReady && !pendingConnection.setText("before connection"))
        connecting.isOpen = true
        precondition(pendingConnection.transportChanged(connecting, callId: id, sid: sid))
        precondition(pendingConnection.isReady)
        let (closing, closingWire) = make()
        closingWire.onSend = { closing.close() }
        precondition(!closing.setText("end during send"))
        precondition(closing.ownText.isEmpty && !closing.hasPendingText)

        let (reentrant, reentrantWire) = make()
        reentrantWire.onSend = { precondition(!reentrant.setText("new")) }
        precondition(!reentrant.setText("old"))
        precondition(reentrant.ownText == "new" && reentrant.hasPendingText)
        reentrantWire.onSend = nil
        precondition(reentrant.transportChanged(reentrantWire, callId: id, sid: sid))
        var latest = MessengerT140Text()
        for packet in reentrantWire.packets { latest = latest.applying(packet)! }
        precondition(latest.text == "new")

        let invalidDescriptions = [
            MessengerT140Description(label: "chat", subprotocolName: "t140", ordered: true, negotiated: true, channelId: 0, maxRetransmits: nil, maxPacketLifeTime: nil),
            MessengerT140Description(label: "rtt", subprotocolName: "json", ordered: true, negotiated: true, channelId: 0, maxRetransmits: nil, maxPacketLifeTime: nil),
            MessengerT140Description(label: "rtt", subprotocolName: "t140", ordered: false, negotiated: true, channelId: 0, maxRetransmits: nil, maxPacketLifeTime: nil),
            MessengerT140Description(label: "rtt", subprotocolName: "t140", ordered: true, negotiated: false, channelId: 0, maxRetransmits: nil, maxPacketLifeTime: nil),
            MessengerT140Description(label: "rtt", subprotocolName: "t140", ordered: true, negotiated: true, channelId: 1, maxRetransmits: nil, maxPacketLifeTime: nil),
            MessengerT140Description(label: "rtt", subprotocolName: "t140", ordered: true, negotiated: true, channelId: 0, maxRetransmits: 0, maxPacketLifeTime: nil),
            MessengerT140Description(label: "rtt", subprotocolName: "t140", ordered: true, negotiated: true, channelId: 0, maxRetransmits: nil, maxPacketLifeTime: 100)
        ]
        for descriptor in invalidDescriptions {
            let session = MessengerNativeRttSession(callId: id, sid: sid)
            let channel = TestChannel()
            channel.descriptor = descriptor
            precondition(!session.attach(channel, callId: id, sid: sid) && channel.wasClosed)
        }
        print("Native T140 checks passed")
    }
}
