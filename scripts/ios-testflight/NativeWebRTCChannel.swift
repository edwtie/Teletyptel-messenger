import Foundation
import WebRTC

final class MessengerWebRTCChannel: NSObject, MessengerT140Channel, RTCDataChannelDelegate {
    private let transport: RTCDataChannel
    private weak var session: MessengerNativeRttSession?
    private var changed: (() -> Void)?
    private var closed = false
    private let queueLock = NSLock()
    private var accepting = true
    private var queuedBytes = 0
    private var queuedMessages = 0
    private var updateQueued = false

    var descriptor: MessengerT140Description {
        MessengerT140Description(label: transport.label, subprotocolName: transport.protocol,
            ordered: transport.isOrdered, negotiated: transport.isNegotiated,
            channelId: Int(transport.channelId),
            maxRetransmits: transport.maxRetransmits == UInt16.max ? nil : Int(transport.maxRetransmits),
            maxPacketLifeTime: transport.maxPacketLifeTime == UInt16.max ? nil : Int(transport.maxPacketLifeTime))
    }
    var isOpen: Bool { !closed && transport.readyState == .open }
    var bufferedAmount: UInt64 { transport.bufferedAmount }

    private init(transport: RTCDataChannel, session: MessengerNativeRttSession, changed: @escaping () -> Void) {
        self.transport = transport
        self.session = session
        self.changed = changed
        super.init()
    }

    static func attach(to peer: RTCPeerConnection, session: MessengerNativeRttSession,
                       changed: @escaping () -> Void) -> MessengerWebRTCChannel? {
        precondition(Thread.isMainThread)
        let config = RTCDataChannelConfiguration()
        config.isOrdered = true
        config.isNegotiated = true
        config.channelId = 0
        config.protocol = "t140"
        config.maxRetransmits = -1
        config.maxPacketLifeTime = -1
        guard let transport = peer.dataChannel(forLabel: "rtt", configuration: config) else { return nil }
        let adapter = MessengerWebRTCChannel(transport: transport, session: session, changed: changed)
        guard session.attach(adapter, callId: session.callId, sid: session.sid) else { adapter.close(); return nil }
        transport.delegate = adapter
        adapter.updateTransport()
        return adapter
    }

    func send(_ data: Data) -> Bool {
        precondition(Thread.isMainThread)
        guard isOpen, data.count <= MessengerT140Text.maxBlockBytes,
              bufferedAmount <= MessengerT140Text.maxBufferedBytes - UInt64(data.count),
              String(data: data, encoding: .utf8) != nil else { return false }
        return transport.sendData(RTCDataBuffer(data: data, isBinary: true))
    }

    func close() {
        precondition(Thread.isMainThread)
        guard !closed else { return }
        closed = true
        queueLock.lock()
        accepting = false
        queueLock.unlock()
        transport.delegate = nil
        session = nil
        changed = nil
        transport.close()
    }

    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        guard dataChannel === transport else { return }
        scheduleUpdate()
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didChangeBufferedAmount amount: UInt64) {
        guard dataChannel === transport else { return }
        scheduleUpdate()
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard dataChannel === transport else { return }
        let data = buffer.data
        guard data.count <= MessengerT140Text.maxBlockBytes else { rejectTransport(); return }
        enqueue(bytes: data.count) { adapter in
            guard let session = adapter.session else { return }
            let notify = adapter.changed
            session.receive(data, from: adapter, callId: session.callId, sid: session.sid)
            notify?()
        }
    }

    private func scheduleUpdate() {
        queueLock.lock()
        guard accepting && !updateQueued else { queueLock.unlock(); return }
        updateQueued = true
        queueLock.unlock()
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.queueLock.lock()
            self.updateQueued = false
            let allowed = self.accepting
            self.queueLock.unlock()
            if allowed && !self.closed { self.updateTransport() }
        }
    }

    private func updateTransport() {
        guard !closed, let session = session else { return }
        let notify = changed
        session.transportChanged(self, callId: session.callId, sid: session.sid,
            ended: transport.readyState == .closed || transport.readyState == .closing)
        notify?()
    }

    private func enqueue(bytes: Int, operation: @escaping (MessengerWebRTCChannel) -> Void) {
        queueLock.lock()
        guard accepting else { queueLock.unlock(); return }
        guard queuedMessages < 64, queuedBytes + bytes <= 262144 else {
            queueLock.unlock()
            rejectTransport()
            return
        }
        queuedMessages += 1
        queuedBytes += bytes
        queueLock.unlock()
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.queueLock.lock()
            self.queuedMessages -= 1
            self.queuedBytes -= bytes
            let allowed = self.accepting
            self.queueLock.unlock()
            if allowed && !self.closed { operation(self) }
        }
    }

    private func rejectTransport() {
        queueLock.lock()
        let shouldNotify = accepting
        accepting = false
        queueLock.unlock()
        guard shouldNotify else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.closed else { return }
            let notify = self.changed
            if let session = self.session {
                session.transportChanged(self, callId: session.callId, sid: session.sid, ended: true)
            }
            self.close()
            notify?()
        }
    }
}
