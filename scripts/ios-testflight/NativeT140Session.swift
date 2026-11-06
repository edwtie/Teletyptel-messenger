import Foundation

struct MessengerT140Description: Equatable {
    let label: String
    let subprotocolName: String
    let ordered: Bool
    let negotiated: Bool
    let channelId: Int
    let maxRetransmits: Int?
    let maxPacketLifeTime: Int?

    static let conversation = MessengerT140Description(label: "rtt", subprotocolName: "t140",
        ordered: true, negotiated: true, channelId: 0, maxRetransmits: nil, maxPacketLifeTime: nil)
}

protocol MessengerT140Channel: AnyObject {
    var descriptor: MessengerT140Description { get }
    var isOpen: Bool { get }
    var bufferedAmount: UInt64 { get }
    func send(_ data: Data) -> Bool
    func close()
}

struct MessengerT140Text {
    static let maxBlockBytes = 4096
    static let maxTextPoints = 32768
    static let maxBufferedBytes: UInt64 = 65536
    private(set) var scalars: [Unicode.Scalar] = []
    private var carriageReturn = false
    var text: String { String(String.UnicodeScalarView(scalars)) }

    func applying(_ data: Data) -> MessengerT140Text? {
        guard data.count <= Self.maxBlockBytes, let block = String(data: data, encoding: .utf8) else { return nil }
        var result = self
        for scalar in block.unicodeScalars {
            let code = scalar.value
            if code == 0xfeff { continue }
            if code == 10 && result.carriageReturn { result.carriageReturn = false; continue }
            result.carriageReturn = false
            switch code {
            case 8:
                if !result.scalars.isEmpty { result.scalars.removeLast() }
            case 13:
                result.scalars.append("\n")
                result.carriageReturn = true
            case 10, 0x2028:
                result.scalars.append("\n")
            case 0...31, 127...159:
                break
            default:
                result.scalars.append(scalar)
            }
            if result.scalars.count > Self.maxTextPoints { return nil }
        }
        return result
    }

    static func normalize(_ text: String) -> [Unicode.Scalar]? {
        var normalized: [Unicode.Scalar] = []
        var carriageReturn = false
        for scalar in text.unicodeScalars {
            let code = scalar.value
            if code == 10 && carriageReturn { carriageReturn = false; continue }
            carriageReturn = false
            switch code {
            case 13:
                normalized.append("\n")
                carriageReturn = true
            case 10, 0x2028:
                normalized.append("\n")
            case 0...31, 127...159, 0xfeff:
                return nil
            default:
                normalized.append(scalar)
            }
            if normalized.count > maxTextPoints { return nil }
        }
        return normalized
    }
}

final class MessengerNativeRttSession {
    let callId: UUID
    let sid: String
    private var channel: MessengerT140Channel?
    private var closed = false
    private var sent = MessengerT140Text()
    private var received = MessengerT140Text()
    private var pending: [Unicode.Scalar]?
    private var pendingRevision = 0
    private var flushing = false
    private(set) var status = "waiting"

    init(callId: UUID, sid: String) {
        self.callId = callId
        self.sid = sid
    }

    var isReady: Bool { !closed && channel?.isOpen == true }
    var ownText: String { String(String.UnicodeScalarView(pending ?? sent.scalars)) }
    var remoteText: String { received.text }
    var hasPendingText: Bool { pending != nil }

    @discardableResult
    func attach(_ candidate: MessengerT140Channel, callId: UUID, sid: String) -> Bool {
        precondition(Thread.isMainThread)
        guard !closed, self.callId == callId, self.sid == sid, channel == nil else { return false }
        guard candidate.descriptor == .conversation else { candidate.close(); return false }
        channel = candidate
        status = candidate.isOpen ? "open" : "connecting"
        return true
    }

    @discardableResult
    func receive(_ data: Data, from candidate: MessengerT140Channel, callId: UUID, sid: String) -> Bool {
        precondition(Thread.isMainThread)
        guard matches(candidate, callId: callId, sid: sid), candidate.isOpen else { return false }
        guard let next = received.applying(data) else { close(status: "invalid-text"); return false }
        received = next
        return true
    }

    @discardableResult
    func setText(_ text: String) -> Bool {
        precondition(Thread.isMainThread)
        guard isReady, let normalized = MessengerT140Text.normalize(text) else { return false }
        pending = normalized
        pendingRevision &+= 1
        return flush()
    }

    @discardableResult
    func transportChanged(_ candidate: MessengerT140Channel, callId: UUID, sid: String, ended: Bool = false) -> Bool {
        precondition(Thread.isMainThread)
        guard matches(candidate, callId: callId, sid: sid) else { return false }
        if ended { close(status: "unavailable"); return true }
        guard candidate.isOpen else { status = "connecting"; return true }
        return flush()
    }

    func close() {
        precondition(Thread.isMainThread)
        close(status: "ended")
    }

    private func matches(_ candidate: MessengerT140Channel, callId: UUID, sid: String) -> Bool {
        !closed && self.callId == callId && self.sid == sid && channel === candidate
    }

    private func flush() -> Bool {
        guard !flushing, isReady, let channel = channel else { return false }
        guard let target = pending else { status = "open"; return true }
        flushing = true
        defer { flushing = false }
        let revision = pendingRevision
        var common = 0
        while common < sent.scalars.count && common < target.count && sent.scalars[common] == target[common] { common += 1 }
        let operations = Array(repeating: "\u{8}", count: sent.scalars.count - common)
            + target.dropFirst(common).map { $0.value == 10 ? "\r\n" : String($0) }
        var block = Data()
        for operation in operations {
            let bytes = Data(operation.utf8)
            if block.count + bytes.count > MessengerT140Text.maxBlockBytes {
                if !send(block, through: channel) { return false }
                if pendingRevision != revision { status = "pending"; return false }
                block.removeAll(keepingCapacity: true)
            }
            block.append(bytes)
        }
        if !block.isEmpty && !send(block, through: channel) { return false }
        guard !closed else { return false }
        if pendingRevision != revision { status = "pending"; return false }
        pending = nil
        status = "open"
        return true
    }

    private func send(_ block: Data, through channel: MessengerT140Channel) -> Bool {
        guard isReady, block.count <= MessengerT140Text.maxBlockBytes,
              channel.bufferedAmount <= MessengerT140Text.maxBufferedBytes - UInt64(block.count),
              let next = sent.applying(block) else { status = "backpressure"; return false }
        guard channel.send(block) else {
            if !closed { status = "send-blocked" }
            return false
        }
        guard !closed else { return false }
        sent = next
        return true
    }

    private func close(status: String) {
        guard !closed else { return }
        closed = true
        self.status = status
        let previous = channel
        channel = nil
        pending = nil
        sent = MessengerT140Text()
        received = MessengerT140Text()
        previous?.close()
    }
}
