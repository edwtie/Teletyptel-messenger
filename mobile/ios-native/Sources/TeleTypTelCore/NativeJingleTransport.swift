import Foundation

public enum NativeJingleFailure: Error, Equatable {
    case disconnected, busy, invalidRequest, staleBinding, timedOut, rejected
}

public enum NativeJingleRejection: String, Sendable {
    case badRequest = "bad-request"
    case notAcceptable = "not-acceptable"
    case unexpectedRequest = "unexpected-request"
    case featureNotImplemented = "feature-not-implemented"
    case serviceUnavailable = "service-unavailable"
    case resourceConstraint = "resource-constraint"
}

public struct NativeJingleRequest: Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    public let binding: UUID
    public let peer: String
    public let sid: String
    public let action: String
    public let xml: String
    let token: UUID
    let identifier: String

    public var description: String { "NativeJingleRequest(redacted)" }
    public var debugDescription: String { description }

    func jingleElement() throws -> ProbeElement {
        let root = try ProbeXML.parse(xml)
        guard root.name == "iq", root.namespace == "jabber:client", root.attributes["type"] == "set",
              root.attributes["from"] == peer, root.attributes["id"] == identifier, root.children.count == 1,
              root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let element = root.children.first, element.name == "jingle", element.namespace == "urn:xmpp:jingle:1",
              element.attributes["sid"] == sid, element.attributes["action"] == action else { throw NativeJingleFailure.invalidRequest }
        return element
    }
}

public protocol NativeJingleSending: Sendable {
    func bindCall(peer: String, sid: String) async throws -> UUID
    func exchangeJingle(binding: UUID, xml: String) async throws
    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws
    func unbindCall(_ binding: UUID) async
}

struct NativeJingleOutput {
    var frames: [String] = []
    var request: NativeJingleRequest?
    var completed: String?
    var failure: NativeJingleFailure?
}

struct NativeJingleTransport {
    private static let namespace = "urn:xmpp:jingle:1"
    private static let actions: Set<String> = ["session-initiate", "session-accept", "session-terminate",
        "session-info", "transport-info", "transport-accept", "transport-reject", "transport-replace",
        "content-accept", "content-add", "content-modify", "content-reject", "content-remove",
        "description-info", "security-info"]
    private struct Binding {
        let id: UUID
        let peer: String
        let sid: String
    }
    private let owner: String
    private var binding: Binding?
    private(set) var pending: Set<String> = []
    private var incoming: [UUID: (request: NativeJingleRequest, deadline: TimeInterval)] = [:]
    private var seen: [String: String] = [:]

    init(owner: String) { self.owner = owner }

    var hasIncoming: Bool { !incoming.isEmpty }

    mutating func bind(peer: String, sid: String) throws -> UUID {
        guard binding == nil else { throw NativeJingleFailure.busy }
        guard Self.fullJID(owner), Self.fullJID(peer), peer != owner, Self.validSID(sid) else {
            throw NativeJingleFailure.invalidRequest
        }
        let id = UUID()
        binding = Binding(id: id, peer: peer, sid: sid)
        return id
    }

    mutating func unbind(_ id: UUID) -> [String] {
        guard binding?.id == id else { return [] }
        let pendingIDs = Array(pending)
        binding = nil
        pending.removeAll()
        incoming.removeAll()
        seen.removeAll()
        return pendingIDs
    }

    mutating func prepare(binding id: UUID, xml: String, identifier: String = "jingle-" + UUID().uuidString) throws -> (identifier: String, frame: String) {
        guard let binding = binding, binding.id == id else { throw NativeJingleFailure.staleBinding }
        guard pending.count < 8 else { throw NativeJingleFailure.busy }
        guard Self.validIdentifier(identifier), !pending.contains(identifier), let element = try? ProbeXML.parse(xml),
              Self.validJingle(element, sid: binding.sid, sender: owner, receiver: binding.peer) else {
            throw NativeJingleFailure.invalidRequest
        }
        let frame = "<iq xmlns='jabber:client' type='set' to='\(Self.escape(binding.peer))' id='\(Self.escape(identifier))'>\(xml)</iq>"
        guard (try? ProbeXML.parse(frame)) != nil else { throw NativeJingleFailure.invalidRequest }
        pending.insert(identifier)
        return (identifier, frame)
    }

    mutating func cancel(_ identifier: String) { pending.remove(identifier) }

    mutating func receive(_ xml: String, now: TimeInterval) -> NativeJingleOutput {
        guard now.isFinite, let root = try? ProbeXML.parse(xml), root.name == "iq", root.namespace == "jabber:client",
              let identifier = root.attributes["id"], Self.validIdentifier(identifier),
              let sender = root.attributes["from"], Self.fullJID(sender),
              root.attributes["to"] == nil || root.attributes["to"] == owner,
              root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return NativeJingleOutput() }
        let type = root.attributes["type"]
        if type == "result" || type == "error" {
            guard binding?.peer == sender, pending.contains(identifier) else { return NativeJingleOutput() }
            if type == "result" {
                guard root.children.isEmpty else { return NativeJingleOutput() }
            } else {
                guard root.children.filter({ $0.name == "error" && $0.namespace == "jabber:client" }).count == 1 else {
                    return NativeJingleOutput()
                }
            }
            pending.remove(identifier)
            return NativeJingleOutput(completed: identifier, failure: type == "error" ? .rejected : nil)
        }
        guard type == "set", root.children.contains(where: { $0.name == "jingle" && $0.namespace == Self.namespace }) else {
            return NativeJingleOutput()
        }
        guard let binding = binding, sender == binding.peer else {
            return NativeJingleOutput(frames: [Self.reply(to: sender, identifier: identifier, rejection: .serviceUnavailable)])
        }
        if let reply = seen[identifier] { return NativeJingleOutput(frames: [reply]) }
        if incoming.values.contains(where: { $0.request.identifier == identifier }) { return NativeJingleOutput() }
        guard root.children.count == 1, let element = root.children.first,
              Self.validJingle(element, sid: binding.sid, sender: sender, receiver: owner),
              let action = element.attributes["action"] else {
            return NativeJingleOutput(frames: [Self.reply(to: sender, identifier: identifier, rejection: .badRequest)])
        }
        guard incoming.count < 8, seen.count + incoming.count < 256 else {
            return NativeJingleOutput(frames: [Self.reply(to: sender, identifier: identifier, rejection: .resourceConstraint)])
        }
        let request = NativeJingleRequest(binding: binding.id, peer: sender, sid: binding.sid, action: action,
                                          xml: xml, token: UUID(), identifier: identifier)
        incoming[request.token] = (request, now + 8)
        return NativeJingleOutput(request: request)
    }

    mutating func reply(_ request: NativeJingleRequest, rejection: NativeJingleRejection?, now: TimeInterval) throws -> String {
        guard now.isFinite, binding?.id == request.binding, let pending = incoming[request.token],
              pending.request.identifier == request.identifier, pending.request.peer == request.peer,
              pending.request.sid == request.sid, pending.request.xml == request.xml else {
            throw NativeJingleFailure.staleBinding
        }
        guard now < pending.deadline else { throw NativeJingleFailure.timedOut }
        incoming.removeValue(forKey: request.token)
        let frame = Self.reply(to: request.peer, identifier: request.identifier, rejection: rejection)
        seen[request.identifier] = frame
        return frame
    }

    mutating func expire(now: TimeInterval) -> [String] {
        guard now.isFinite else { return [] }
        var frames: [String] = []
        for token in Array(incoming.keys) {
            guard let item = incoming[token], now >= item.deadline else { continue }
            incoming.removeValue(forKey: token)
            let frame = Self.reply(to: item.request.peer, identifier: item.request.identifier, rejection: .serviceUnavailable)
            seen[item.request.identifier] = frame
            frames.append(frame)
        }
        return frames
    }

    private static func validJingle(_ element: ProbeElement, sid: String, sender: String, receiver: String) -> Bool {
        guard element.name == "jingle", element.namespace == namespace, element.attributes["sid"] == sid,
              let action = element.attributes["action"], actions.contains(action),
              element.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        if let initiator = element.attributes["initiator"] {
            guard initiator == sender || (action != "session-initiate" && initiator == receiver) else { return false }
        }
        if let responder = element.attributes["responder"] {
            guard responder == sender || (action != "session-accept" && responder == receiver) else { return false }
        }
        return true
    }

    static func fullJID(_ jid: String) -> Bool {
        let parts = jid.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        return parts.count == 2 && !parts[1].isEmpty && NativeChatCodec.bareJID(jid) != nil
    }

    static func validSID(_ sid: String) -> Bool {
        sid.range(of: #"\A[A-Za-z0-9_-]{1,128}\z"#, options: .regularExpression) != nil
    }

    private static func validIdentifier(_ identifier: String) -> Bool {
        !identifier.isEmpty && identifier.utf8.count <= 256 &&
            !identifier.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
    }

    private static func reply(to peer: String, identifier: String, rejection: NativeJingleRejection?) -> String {
        let type = rejection == nil ? "result" : "error"
        let payload = rejection.map {
            "<error type='\($0 == .badRequest ? "modify" : "cancel")'><\($0.rawValue) xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error>"
        } ?? ""
        return "<iq xmlns='jabber:client' type='\(type)' to='\(escape(peer))' id='\(escape(identifier))'>\(payload)</iq>"
    }

    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
}
