import Foundation

enum NativeCallIntentAction: String, Sendable { case propose, proceed, retract, reject, finish }

struct NativeCallIntent: Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    static let namespace = "urn:xmpp:jingle-message:0"
    static let recoveryNamespace = "urn:teletyptel:call-recovery:1"
    let action: NativeCallIntentAction
    let sid: String
    let peer: String
    let media: NativeCallMedia?
    var description: String { "NativeCallIntent(redacted)" }
    var debugDescription: String { description }

    static func decode(_ xml: String, owner: String, bound: String) -> Self? {
        guard xml.utf8.count <= 8192, NativeChatCodec.bareJID(owner) == owner,
              NativeChatCodec.bareJID(bound) == owner, NativeJingleTransport.fullJID(bound),
              let root = try? ProbeXML.parse(xml), root.name == "message", root.namespace == "jabber:client",
              root.attributes["type"] == "chat", let peer = root.attributes["from"],
              NativeJingleTransport.fullJID(peer), NativeChatCodec.bareJID(peer) != owner,
              root.attributes["to"] == owner || root.attributes["to"] == bound,
              root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              root.children.allSatisfy({ $0.namespace == namespace
                  || $0.namespace == "urn:xmpp:hints" && $0.name == "store" && $0.children.isEmpty
                  || $0.namespace == "urn:xmpp:sid:0" && ["origin-id", "stanza-id"].contains($0.name) && $0.children.isEmpty }),
              root.children.contains(where: { $0.namespace == "urn:xmpp:hints" && $0.name == "store" }),
              root.children.filter({ $0.namespace == namespace }).count == 1,
              let element = root.children.first(where: { $0.namespace == namespace }),
              Set(element.attributes.keys) == ["id"], let sid = element.attributes["id"], NativeJingleTransport.validSID(sid),
              let action = NativeCallIntentAction(rawValue: element.name),
              element.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        if action != .propose {
            guard element.children.isEmpty else { return nil }
            return Self(action: action, sid: sid, peer: peer, media: nil)
        }
        var media = Set<String>()
        for child in element.children {
            guard child.name == "description", child.children.isEmpty,
                  child.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            let kind: String
            if child.namespace == NativeJingleMedia.rtt, child.attributes.isEmpty { kind = "rtt" }
            else if child.namespace == NativeJingleMedia.rtp, Set(child.attributes.keys) == ["media"],
                    let value = child.attributes["media"], ["audio", "video"].contains(value) { kind = value }
            else { return nil }
            guard media.insert(kind).inserted else { return nil }
        }
        guard let profile = NativeCallMedia.allCases.first(where: { $0.contents == media }) else { return nil }
        return Self(action: action, sid: sid, peer: peer, media: profile)
    }

    static func frame(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia? = nil) throws -> String {
        let validTarget: Bool
        switch action {
        case .propose: validTarget = NativeChatCodec.bareJID(peer) == peer && media != nil
        case .retract: validTarget = NativeChatCodec.bareJID(peer) == peer && media == nil
        case .proceed, .reject, .finish: validTarget = NativeJingleTransport.fullJID(peer) && media == nil
        }
        guard NativeJingleTransport.validSID(sid), NativeChatCodec.bareJID(peer) != nil,
              validTarget else {
            throw NativeJingleFailure.invalidRequest
        }
        var content = ""
        if let media = media {
            content = media.contents.sorted().map { kind in
                kind == "rtt" ? "<description xmlns='\(NativeJingleMedia.rtt)'/>" : "<description xmlns='\(NativeJingleMedia.rtp)' media='\(kind)'/>"
            }.joined()
        }
        return "<message xmlns='jabber:client' type='chat' to='\(NativeMUCStream.escape(peer))'><\(action.rawValue) xmlns='\(namespace)' id='\(NativeMUCStream.escape(sid))'>\(content)</\(action.rawValue)><store xmlns='urn:xmpp:hints'/></message>"
    }

    static func preferences(owner: String, identifier: String, enabled: Bool, dnd: Bool, muted: Set<String>) throws -> String {
        guard NativeChatCodec.bareJID(owner) == owner, NativeMessageActionCodec.validID(identifier), muted.count <= 256,
              let domain = owner.split(separator: "@").last,
              muted.allSatisfy({ NativeChatCodec.bareJID($0) == $0 && $0.split(separator: "@").last == domain }) else { throw NativeJingleFailure.invalidRequest }
        let peers = muted.sorted().map { "<muted jid='\(NativeMUCStream.escape($0))'/>" }.joined()
        return "<iq xmlns='jabber:client' type='set' to='\(NativeMUCStream.escape(String(domain)))' id='\(NativeMUCStream.escape(identifier))'><preferences xmlns='\(recoveryNamespace)' enabled='\(enabled)' dnd='\(dnd)'>\(peers)</preferences></iq>"
    }

    static func handoff(owner: String, identifier: String, invitation: NativeCallInvitation, registration: NativePushRegistration) throws -> String {
        guard NativeChatCodec.bareJID(owner) == owner, NativeMessageActionCodec.validID(identifier),
              let domain = owner.split(separator: "@").last,
              registration.generation.range(of: "\\A[0-9a-f]{32}\\z", options: .regularExpression) != nil else { throw NativeJingleFailure.invalidRequest }
        return "<iq xmlns='jabber:client' type='set' to='\(NativeMUCStream.escape(String(domain)))' id='\(NativeMUCStream.escape(identifier))'><handoff xmlns='\(recoveryNamespace)' callId='\(invitation.id.uuidString.lowercased())' sid='\(NativeMUCStream.escape(invitation.sid))' deviceId='\(registration.deviceID.uuidString.lowercased())' generation='\(registration.generation)'/></iq>"
    }
}

protocol NativeCallIntentSending: Sendable {
    func observeCallIntents(_ observer: @escaping @Sendable (NativeCallIntent) -> Void) async
    func sendCallIntent(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia?) async throws
    func setCallPreferences(enabled: Bool, dnd: Bool, muted: Set<String>) async throws
    func proveCallResource(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws
}
