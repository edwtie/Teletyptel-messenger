import Foundation
import CryptoKit

public enum NativeMessageChange: Equatable, Sendable {
    case correct(target: String, body: String)
    case retract(target: String)

    var target: String {
        switch self { case .correct(let target, _), .retract(let target): return target }
    }
}

public protocol NativeMessageChanging: NativeChatSending {
    func changeMessage(to peer: String, change: NativeMessageChange, identifier: String) async throws
}

enum NativeMessageActionCodec {
    static let correction = "urn:xmpp:message-correct:0"
    static let retraction = "urn:xmpp:message-retract:1"
    static let features = ["http://jabber.org/protocol/disco#info", correction, retraction, "urn:xmpp:ping"].sorted()
    static let node = "https://teletyptel.nl/native"
    static var verification: String {
        Data(Insecure.SHA1.hash(data: Data(("client/phone//TeleTypTel<" + features.joined(separator: "<") + "<").utf8))).base64EncodedString()
    }
    static var presence: String { "<presence xmlns='jabber:client'><c xmlns='http://jabber.org/protocol/caps' hash='sha-1' node='\(node)' ver='\(verification)'/></presence>" }

    static func discovery(_ root: ProbeElement, owner: String, bound: String) -> String? {
        guard root.name == "iq", root.namespace == "jabber:client", root.attributes["type"] == "get",
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == bound,
              let identifier = root.attributes["id"], validID(identifier), let sender = root.attributes["from"],
              NativeChatCodec.bareJID(sender) != nil, root.children.count == 1,
              let query = root.children.first, query.name == "query", query.namespace == features[0], query.children.isEmpty,
              query.attributes["node"] == nil || query.attributes["node"] == node + "#" + verification else { return nil }
        let requested = query.attributes["node"].map { " node='\(escape($0))'" } ?? ""
        return "<iq xmlns='jabber:client' type='result' to='\(escape(sender))' id='\(escape(identifier))'><query xmlns='http://jabber.org/protocol/disco#info'\(requested)><identity category='client' type='phone' name='TeleTypTel'/>\(features.map { "<feature var='\($0)'/>" }.joined())</query></iq>"
    }

    static func validID(_ identifier: String) -> Bool {
        !identifier.isEmpty && identifier.utf8.count <= 256 &&
            identifier.unicodeScalars.allSatisfy { !CharacterSet.controlCharacters.contains($0) }
    }

    static func encode(to peer: String, change: NativeMessageChange, identifier: String, group: Bool = false) throws -> String {
        guard NativeChatCodec.bareJID(peer) == peer, validID(change.target), UUID(uuidString: identifier) != nil else {
            throw NativeChatFailure.invalidMessage
        }
        let payload: String
        switch change {
        case .correct(let target, let body):
            guard NativeChatCodec.validBody(body) else { throw NativeChatFailure.invalidMessage }
            payload = "<body>\(escape(body))</body><replace xmlns='\(correction)' id='\(escape(target))'/>"
        case .retract(let target):
            payload = "<retract xmlns='\(retraction)' id='\(escape(target))'/><fallback xmlns='urn:xmpp:fallback:0' for='\(retraction)'/><body>Een eerder bericht is ingetrokken. Je client ondersteunt dit mogelijk niet.</body><store xmlns='urn:xmpp:hints'/>"
        }
        return "<message xmlns='jabber:client' type='\(group ? "groupchat" : "chat")' to='\(escape(peer))' id='\(identifier)'>\(payload)</message>"
    }

    static func decode(_ root: ProbeElement) -> NativeMessageChange? {
        let changes = root.children.filter { ($0.name == "replace" && $0.namespace == correction) || ($0.name == "retract" && $0.namespace == retraction) }
        guard changes.count == 1, let change = changes.first, change.children.isEmpty,
              let target = change.attributes["id"], validID(target) else { return nil }
        if change.name == "retract" { return .retract(target: target) }
        let bodies = root.children.filter { $0.name == "body" && $0.namespace == "jabber:client" }
        guard bodies.count == 1, let body = bodies.first, body.children.isEmpty, NativeChatCodec.validBody(body.text) else { return nil }
        return .correct(target: target, body: body.text)
    }

    static func hasChange(_ root: ProbeElement) -> Bool {
        root.children.contains { $0.namespace == correction || $0.namespace == retraction }
    }

    static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
