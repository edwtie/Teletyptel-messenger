import Foundation
import Darwin

enum MessengerJingleRttError: Error { case unsupported }

private final class MessengerJingleNode {
    let name: String
    let namespace: String
    let attributes: [String: String]
    var children: [MessengerJingleNode] = []
    var text = ""

    init(_ name: String, _ namespace: String, _ attributes: [String: String]) {
        self.name = name
        self.namespace = namespace
        self.attributes = attributes
    }

    func require(_ name: String, _ namespace: String, attributes: Set<String>) throws {
        guard self.name == name, self.namespace == namespace,
              Set(self.attributes.keys).isSubset(of: attributes) else { throw MessengerJingleRttError.unsupported }
    }

    func one(_ name: String, _ namespace: String) throws -> MessengerJingleNode {
        let matches = children.filter { $0.name == name && $0.namespace == namespace }
        guard matches.count == 1 else { throw MessengerJingleRttError.unsupported }
        return matches[0]
    }
}

private final class MessengerJingleParser: NSObject, XMLParserDelegate {
    var root: MessengerJingleNode?
    private var stack: [MessengerJingleNode] = []
    private var count = 0

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName: String?, attributes: [String: String]) {
        count += 1
        guard count <= 80, stack.count < 6, attributes.count <= 12,
              attributes.values.allSatisfy({ $0.utf8.count <= 1024 }),
              root == nil || !stack.isEmpty else { parser.abortParsing(); return }
        let node = MessengerJingleNode(elementName, namespaceURI ?? "", attributes)
        if let parent = stack.last { parent.children.append(node) } else { root = node }
        stack.append(node)
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard let node = stack.last else { return }
        if node.name != "fingerprint" && !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parser.abortParsing(); return
        }
        guard node.text.utf8.count + string.utf8.count <= 1024 else { parser.abortParsing(); return }
        node.text += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) { parser.abortParsing() }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName: String?) {
        if !stack.isEmpty { stack.removeLast() }
    }
}

struct MessengerJingleRtt {
    static let jingle = "urn:xmpp:jingle:1"
    static let rtt = "urn:xmpp:jingle:apps:rtt-sync:0"
    static let ice = "urn:xmpp:jingle:transports:ice-udp:1"
    static let dtls = "urn:xmpp:jingle:apps:dtls:0"
    static let sctp = "urn:xmpp:jingle:transports:dtls-sctp:1"
    static let channel = "urn:xmpp:jingle:transports:webrtc-datachannel:0"

    private static func require(_ condition: Bool) throws {
        if !condition { throw MessengerJingleRttError.unsupported }
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func token(_ value: String) -> Bool { matches(value, "^[A-Za-z0-9_.+-]{1,64}$") }

    private static func number(_ value: String, _ minimum: UInt64, _ maximum: UInt64) -> Bool {
        guard matches(value, "^[0-9]{1,10}$"), let parsed = UInt64(value) else { return false }
        return parsed >= minimum && parsed <= maximum
    }

    private static func address(_ value: String, host: Bool = false) -> Bool {
        if host && matches(value, "^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.local$") { return true }
        guard value.utf8.count <= 45 else { return false }
        var ipv4 = in_addr()
        var ipv6 = in6_addr()
        return inet_pton(AF_INET, value, &ipv4) == 1 || inet_pton(AF_INET6, value, &ipv6) == 1
    }

    private static func candidate(_ values: [String: String]) throws -> String {
        let allowed: Set<String> = ["id", "foundation", "component", "protocol", "priority", "ip", "port", "type", "generation", "rel-addr", "rel-port"]
        try require(Set(values.keys).isSubset(of: allowed) && token(values["id"] ?? "") && token(values["foundation"] ?? ""))
        try require(values["component"] == "1" && values["protocol"] == "udp" && values["generation"] == "0")
        try require(["host", "srflx", "prflx", "relay"].contains(values["type"] ?? "")
            && address(values["ip"] ?? "", host: values["type"] == "host")
            && number(values["port"] ?? "", 1, 65535) && number(values["priority"] ?? "", 1, 4294967295))
        var line = "a=candidate:\(values["foundation"]!) 1 udp \(values["priority"]!) \(values["ip"]!) \(values["port"]!) typ \(values["type"]!)"
        if values["rel-addr"] != nil || values["rel-port"] != nil {
            try require(address(values["rel-addr"] ?? "") && number(values["rel-port"] ?? "", 0, 65535))
            line += " raddr \(values["rel-addr"]!) rport \(values["rel-port"]!)"
        }
        return line + " generation 0"
    }

    private static func candidateFromSdp(_ line: String, index: Int) throws -> [String: String] {
        let parts = String(line.dropFirst(12)).components(separatedBy: " ")
        try require(parts.count >= 8 && parts.count % 2 == 0 && parts[6] == "typ")
        var values = ["id": "candidate-\(index)", "foundation": parts[0], "component": parts[1],
            "protocol": parts[2].lowercased(), "priority": parts[3], "ip": parts[4], "port": parts[5],
            "type": parts[7], "generation": "0"]
        var seen = Set<String>()
        for offset in stride(from: 8, to: parts.count, by: 2) {
            try require(seen.insert(parts[offset]).inserted)
            switch parts[offset] {
            case "raddr": values["rel-addr"] = parts[offset + 1]
            case "rport": values["rel-port"] = parts[offset + 1]
            case "generation": values["generation"] = parts[offset + 1]
            case "network-id", "network-cost": try require(number(parts[offset + 1], 0, 65535))
            case "ufrag": try require(matches(parts[offset + 1], "^[A-Za-z0-9+/]{4,256}$"))
            default: throw MessengerJingleRttError.unsupported
            }
        }
        _ = try candidate(values)
        return values
    }

    static func toSdp(_ xml: String, sid: String, action: String, expectedMid: String? = nil) throws -> String {
        try require(xml.utf8.count <= 65536 && token(sid)
            && ["session-initiate", "session-accept"].contains(action) && !xml.contains("<!") && !xml.contains("<?"))
        let delegate = MessengerJingleParser()
        let parser = XMLParser(data: Data(xml.utf8))
        parser.shouldProcessNamespaces = true
        parser.shouldResolveExternalEntities = false
        parser.delegate = delegate
        try require(parser.parse())
        guard let root = delegate.root else { throw MessengerJingleRttError.unsupported }
        try root.require("jingle", jingle, attributes: ["sid", "action", "initiator", "responder"])
        try require(root.attributes["sid"] == sid && root.attributes["action"] == action && root.children.count == 1)
        let content = try root.one("content", jingle)
        try content.require("content", jingle, attributes: ["name", "creator", "senders"])
        let mid = content.attributes["name"] ?? ""
        try require(token(mid) && (expectedMid == nil || expectedMid == mid) && content.attributes["creator"] == "initiator"
            && (content.attributes["senders"] == nil || content.attributes["senders"] == "both") && content.children.count == 2)
        let description = try content.one("description", rtt)
        try description.require("description", rtt, attributes: ["profile"])
        try require(description.attributes["profile"] == "dc-t140" && description.children.count == 2)
        let datachannel = try description.one("datachannel", rtt)
        try require(datachannel.children.isEmpty && datachannel.attributes == ["subprotocol": "t140", "reliability": "reliable", "order": "in-order", "label": "rtt"])
        let sync = try description.one("rtt-sync", rtt)
        try require(sync.children.isEmpty && sync.attributes == ["role": "conversation", "source": "human", "sync-mode": "co-session"])
        let transport = try content.one("transport", ice)
        try transport.require("transport", ice, attributes: ["ufrag", "pwd"])
        let ufrag = transport.attributes["ufrag"] ?? "", password = transport.attributes["pwd"] ?? ""
        try require(matches(ufrag, "^[A-Za-z0-9+/]{4,256}$") && matches(password, "^[A-Za-z0-9+/]{22,256}$"))
        let fingerprint = try transport.one("fingerprint", dtls)
        try fingerprint.require("fingerprint", dtls, attributes: ["hash", "setup"])
        let hash = fingerprint.text.trimmingCharacters(in: .whitespacesAndNewlines), setup = fingerprint.attributes["setup"] ?? ""
        try require(fingerprint.children.isEmpty && fingerprint.attributes["hash"] == "sha-256"
            && matches(hash, "^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$")
            && (action == "session-initiate" ? setup == "actpass" : ["active", "passive"].contains(setup)))
        let mapping = try transport.one("sctpmap", sctp), binding = try transport.one("channel", channel)
        try mapping.require("sctpmap", sctp, attributes: ["number", "protocol"])
        let port = mapping.attributes["number"] ?? ""
        try require(mapping.children.isEmpty && number(port, 1, 65535) && mapping.attributes["protocol"] == "webrtc-datachannel"
            && binding.children.isEmpty && binding.attributes == ["id": "0", "negotiated": "true", "ordered": "true", "protocol": "t140"])
        let candidates = transport.children.filter { $0.name == "candidate" && $0.namespace == ice }
        try require(!candidates.isEmpty && candidates.count <= 64 && transport.children.count == candidates.count + 3)
        var ids = Set<String>()
        var lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
            "c=IN IP4 0.0.0.0", "a=mid:\(mid)", "a=sctp-port:\(port)", "a=max-message-size:4096",
            "a=ice-ufrag:\(ufrag)", "a=ice-pwd:\(password)", "a=fingerprint:sha-256 \(hash)", "a=setup:\(setup)"]
        for entry in candidates {
            try require(entry.children.isEmpty && ids.insert(entry.attributes["id"] ?? "").inserted)
            lines.append(try candidate(entry.attributes))
        }
        return (lines + ["a=end-of-candidates", ""]).joined(separator: "\r\n")
    }

    static func fromSdp(_ sdpText: String, sid: String, action: String) throws -> String {
        try require(sdpText.utf8.count <= 65536 && token(sid))
        let lines = sdpText.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }.filter { !$0.isEmpty }
        try require(lines.allSatisfy { !matches($0, "[\\x00-\\x1f\\x7f]") })
        let media = lines.filter { $0.hasPrefix("m=") }
        try require(media.count == 1 && matches(media[0], "^m=application [1-9][0-9]* UDP/DTLS/SCTP webrtc-datachannel$")
            && !lines.contains { matches($0, "^a=(sendonly|recvonly|inactive|crypto:|ice-lite|dcmap:|dcsa:)") })
        func once(_ prefix: String) throws -> String {
            let found = lines.filter { $0.hasPrefix(prefix) }
            try Self.require(found.count == 1)
            return String(found[0].dropFirst(prefix.count))
        }
        let mid = try once("a=mid:"), ufrag = try once("a=ice-ufrag:"), password = try once("a=ice-pwd:")
        let hash = try once("a=fingerprint:"), setup = try once("a=setup:"), port = try once("a=sctp-port:")
        try require(hash.hasPrefix("sha-256 "))
        if lines.contains(where: { $0.hasPrefix("a=max-message-size:") }) {
            let limit = try once("a=max-message-size:")
            try require(limit == "0" || number(limit, 4096, 4294967295))
        }
        func escape(_ value: String) -> String {
            value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "\"", with: "&quot;")
                .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
        }
        var xml = "<jingle xmlns=\"\(jingle)\" sid=\"\(escape(sid))\" action=\"\(escape(action))\"><content creator=\"initiator\" name=\"\(escape(mid))\" senders=\"both\">"
        xml += "<description xmlns=\"\(rtt)\" profile=\"dc-t140\"><datachannel subprotocol=\"t140\" reliability=\"reliable\" order=\"in-order\" label=\"rtt\"/><rtt-sync role=\"conversation\" source=\"human\" sync-mode=\"co-session\"/></description>"
        xml += "<transport xmlns=\"\(ice)\" ufrag=\"\(escape(ufrag))\" pwd=\"\(escape(password))\"><fingerprint xmlns=\"\(dtls)\" hash=\"sha-256\" setup=\"\(escape(setup))\">\(escape(String(hash.dropFirst(8))))</fingerprint>"
        xml += "<sctpmap xmlns=\"\(sctp)\" number=\"\(escape(port))\" protocol=\"webrtc-datachannel\"/><channel xmlns=\"\(channel)\" id=\"0\" negotiated=\"true\" ordered=\"true\" protocol=\"t140\"/>"
        let candidates = lines.filter { $0.hasPrefix("a=candidate:") && matches($0, "(?i) 1 udp ") }
        try require(candidates.count <= 64)
        for (index, line) in candidates.enumerated() {
            let values = try candidateFromSdp(line, index: index)
            xml += "<candidate " + values.keys.sorted().map { "\($0)=\"\(escape(values[$0]!))\"" }.joined(separator: " ") + "/>"
        }
        xml += "</transport></content></jingle>"
        _ = try toSdp(xml, sid: sid, action: action)
        return xml
    }
}
