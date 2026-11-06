import Foundation

public enum XMPPSessionFailure: Error, Equatable {
    case unsupportedAuthentication
    case authenticationRejected
    case bindingRejected
    case streamClosed
    case heartbeatTimeout
}

struct XMPPSessionOutput {
    var frames: [String] = []
    var connectedJID: String?
    var heartbeatAcknowledged = false
}

struct XMPPSessionStream {
    enum Phase: Equatable { case opening, features, authenticating, reopening, bindingFeatures, binding, online, closed }
    private static let framing = "urn:ietf:params:xml:ns:xmpp-framing"
    private static let streams = "http://etherx.jabber.org/streams"
    private static let sasl = "urn:ietf:params:xml:ns:xmpp-sasl"
    private static let bind = "urn:ietf:params:xml:ns:xmpp-bind"
    private(set) var phase: Phase = .opening
    private var account: NativeAuthenticatedAccount?
    private let configuration: ServerConfiguration
    private let expectedJID: String
    private let bindID = "bind-" + UUID().uuidString
    private let resource = "TeleTypTel-native-" + UUID().uuidString
    private var boundJID: String?
    private var pingID: String?
    private var handshakeBytes = 0

    init(account: NativeAuthenticatedAccount) {
        self.account = account
        configuration = account.configuration
        expectedJID = account.jid
    }

    var opening: String { XMPPProbeStream.opening(for: configuration) }

    mutating func close() {
        account = nil
        boundJID = nil
        pingID = nil
        phase = .closed
    }

    mutating func heartbeat() throws -> String {
        guard phase == .online else { throw ConnectionFailure.invalidResponse }
        guard pingID == nil else { close(); throw XMPPSessionFailure.heartbeatTimeout }
        let identifier = "ping-" + UUID().uuidString
        pingID = identifier
        return "<iq xmlns='jabber:client' type='get' to='\(configuration.domain)' id='\(identifier)'><ping xmlns='urn:xmpp:ping'/></iq>"
    }

    mutating func receive(_ message: String) throws -> XMPPSessionOutput {
        do { return try process(message) }
        catch { close(); throw error }
    }

    private mutating func process(_ message: String) throws -> XMPPSessionOutput {
        guard phase != .closed else { throw XMPPSessionFailure.streamClosed }
        if phase != .online {
            handshakeBytes += message.utf8.count
            guard handshakeBytes <= 65536 else { throw ConnectionFailure.invalidResponse }
        }
        let root = try ProbeXML.parse(message)
        if (root.name == "close" && root.namespace == Self.framing) ||
            (root.name == "error" && root.namespace == Self.streams) { throw XMPPSessionFailure.streamClosed }
        switch phase {
        case .opening, .reopening:
            guard root.name == "open", root.namespace == Self.framing,
                  root.attributes["version"] == "1.0", !(root.attributes["id"] ?? "").isEmpty,
                  root.attributes["from"] == nil || root.attributes["from"] == configuration.domain,
                  root.children.isEmpty, root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw ConnectionFailure.invalidResponse
            }
            phase = phase == .opening ? .features : .bindingFeatures
        case .features:
            guard root.name == "features", root.namespace == Self.streams, let account = account else {
                throw ConnectionFailure.invalidResponse
            }
            let mechanisms = root.children.filter { $0.name == "mechanisms" && $0.namespace == Self.sasl }
            guard mechanisms.count == 1 else { throw ConnectionFailure.invalidResponse }
            let plain = mechanisms[0].children.filter { $0.name == "mechanism" && $0.namespace == Self.sasl && $0.children.isEmpty && $0.text.trimmingCharacters(in: .whitespacesAndNewlines) == "PLAIN" }
            guard plain.count == 1 else { throw XMPPSessionFailure.unsupportedAuthentication }
            let username = String(account.jid.prefix { $0 != "@" })
            let payload = Data(("\0" + username + "\0" + account.password).utf8).base64EncodedString()
            self.account = nil
            phase = .authenticating
            return XMPPSessionOutput(frames: ["<auth xmlns='\(Self.sasl)' mechanism='PLAIN'>\(payload)</auth>"])
        case .authenticating:
            if root.name == "failure", root.namespace == Self.sasl { throw XMPPSessionFailure.authenticationRejected }
            guard root.name == "success", root.namespace == Self.sasl, root.children.isEmpty,
                  root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ConnectionFailure.invalidResponse }
            phase = .reopening
            return XMPPSessionOutput(frames: [opening])
        case .bindingFeatures:
            guard root.name == "features", root.namespace == Self.streams,
                  root.children.filter({ $0.name == "bind" && $0.namespace == Self.bind }).count == 1 else {
                throw XMPPSessionFailure.bindingRejected
            }
            phase = .binding
            return XMPPSessionOutput(frames: ["<iq xmlns='jabber:client' type='set' id='\(bindID)'><bind xmlns='\(Self.bind)'><resource>\(resource)</resource></bind></iq>"])
        case .binding:
            guard root.name == "iq", root.namespace == "jabber:client", root.attributes["id"] == bindID,
                  root.attributes["type"] == "result",
                  root.attributes["from"] == nil || root.attributes["from"] == configuration.domain,
                  root.children.count == 1, let bind = root.children.first,
                  bind.name == "bind", bind.namespace == Self.bind,
                  bind.children.count == 1, let jid = bind.children.first,
                  jid.name == "jid", jid.namespace == Self.bind, jid.children.isEmpty else {
                throw XMPPSessionFailure.bindingRejected
            }
            let parts = jid.text.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2, parts[0] == expectedJID, !parts[1].isEmpty,
                  jid.text.utf8.count <= 3071,
                  !jid.text.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
                throw XMPPSessionFailure.bindingRejected
            }
            boundJID = jid.text
            phase = .online
            return XMPPSessionOutput(frames: ["<presence xmlns='jabber:client'/>"], connectedJID: jid.text)
        case .online:
            guard root.namespace == "jabber:client", ["message", "presence", "iq"].contains(root.name) else {
                throw ConnectionFailure.invalidResponse
            }
            if root.name == "iq" {
                let sender = root.attributes["from"]
                let trustedSender = sender == nil || sender == configuration.domain || sender == boundJID || sender == expectedJID
                if let pingID = pingID, root.attributes["id"] == pingID,
                   ["result", "error"].contains(root.attributes["type"] ?? ""), trustedSender {
                    self.pingID = nil
                    return XMPPSessionOutput(heartbeatAcknowledged: true)
                }
                if root.attributes["type"] == "get", root.children.count == 1,
                   let ping = root.children.first, ping.name == "ping", ping.namespace == "urn:xmpp:ping",
                   ping.children.isEmpty, let identifier = root.attributes["id"], !identifier.isEmpty {
                    let destination = sender.map { " to='\(Self.escape($0))'" } ?? ""
                    return XMPPSessionOutput(frames: ["<iq xmlns='jabber:client' type='result' id='\(Self.escape(identifier))'\(destination)/>"])
                }
            }
        case .closed:
            throw XMPPSessionFailure.streamClosed
        }
        return XMPPSessionOutput()
    }

    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
}
