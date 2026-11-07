import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

enum NativeJingleMediaFailure: Error { case unsupported }

struct NativeJingleMedia: CustomStringConvertible, CustomDebugStringConvertible {
    static let jingle = "urn:xmpp:jingle:1"
    static let rtp = "urn:xmpp:jingle:apps:rtp:1"
    static let ice = "urn:xmpp:jingle:transports:ice-udp:1"
    static let dtls = "urn:xmpp:jingle:apps:dtls:0"
    static let feedback = "urn:xmpp:jingle:apps:rtp:rtcp-fb:0"
    static let rtt = "urn:xmpp:jingle:apps:rtt-sync:0"
    static let sctp = "urn:xmpp:jingle:transports:dtls-sctp:1"
    static let channel = "urn:xmpp:jingle:transports:webrtc-datachannel:0"
    private static let feedbackValues: Set<String> = ["nack", "nack pli", "ccm fir", "goog-remb"]

    struct Content {
        let kind: String
        let mid: String
        let payload: String
        let feedback: [String]
        let port: String
        let ufrag: String
        let password: String
        let fingerprint: String
        let setup: String
        let candidates: [[String: String]]
    }

    let sid: String
    let action: String
    let profile: NativeCallMedia
    private let contents: [Content]
    var mids: [String] { contents.map(\.mid) }
    var description: String { "NativeJingleMedia(redacted)" }
    var debugDescription: String { description }

    static func decode(_ xml: String, sid: String, action: String, profile: NativeCallMedia) throws -> Self {
        try identity(sid: sid, action: action)
        let root = try ProbeXML.parse(xml)
        try node(root, "jingle", jingle, attributes: ["sid", "action", "initiator", "responder"])
        try require(root.attributes["sid"] == sid && root.attributes["action"] == action)
        let kinds = kinds(profile)
        try require(root.children.count == kinds.count)
        var contents: [Content] = []
        for (index, element) in root.children.enumerated() {
            let kind = kinds[index]
            try node(element, "content", jingle, attributes: ["creator", "name", "senders"])
            try require(element.attributes["creator"] == "initiator" &&
                (element.attributes["senders"] == nil || element.attributes["senders"] == "both") && element.children.count == 2)
            let media = try one(element, "description", kind == "rtt" ? rtt : rtp)
            var payload = "", feedback: [String] = [], port = ""
            if kind == "rtt" {
                try node(media, "description", rtt, attributes: ["profile"])
                try require(media.attributes["profile"] == "dc-t140" && media.children.count == 2)
                try exact(try one(media, "datachannel", rtt), ["subprotocol": "t140", "reliability": "reliable", "order": "in-order", "label": "rtt"])
                try exact(try one(media, "rtt-sync", rtt), ["role": "conversation", "source": "human", "sync-mode": "co-session"])
            } else {
                try node(media, "description", rtp, attributes: ["media"])
                try require(media.attributes["media"] == kind && media.children.count == 2)
                try exact(try one(media, "rtcp-mux", rtp), [:])
                let codec = try one(media, "payload-type", rtp)
                try node(codec, "payload-type", rtp, attributes: ["id", "name", "clockrate", "channels"])
                payload = codec.attributes["id"] ?? ""
                try require((codec.attributes["channels"] == nil || codec.attributes["channels"] == "1") &&
                    codec.attributes["name"]?.uppercased() == (kind == "audio" ? "PCMU" : "VP8") &&
                    codec.attributes["clockrate"] == (kind == "audio" ? "8000" : "90000"))
                for entry in codec.children {
                    try node(entry, "rtcp-fb", Self.feedback, attributes: ["type", "subtype"])
                    try require(entry.children.isEmpty)
                    feedback.append([entry.attributes["type"], entry.attributes["subtype"]].compactMap { $0 }.joined(separator: " "))
                }
            }
            let transport = try one(element, "transport", ice)
            try node(transport, "transport", ice, attributes: ["ufrag", "pwd"])
            let fingerprint = try one(transport, "fingerprint", dtls)
            try node(fingerprint, "fingerprint", dtls, attributes: ["hash", "setup"], text: true)
            try require(fingerprint.attributes["hash"] == "sha-256" && fingerprint.children.isEmpty)
            if kind == "rtt" {
                let mapping = try one(transport, "sctpmap", sctp)
                port = mapping.attributes["number"] ?? ""
                try exact(mapping, ["number": port, "protocol": "webrtc-datachannel"])
                try exact(try one(transport, "channel", channel), ["id": "0", "negotiated": "true", "ordered": "true", "protocol": "t140"])
            }
            let candidates = transport.children.filter { $0.name == "candidate" && $0.namespace == ice }
            try require(transport.children.count == candidates.count + (kind == "rtt" ? 3 : 1))
            for candidate in candidates {
                try exact(candidate, candidate.attributes)
            }
            contents.append(Content(kind: kind, mid: element.attributes["name"] ?? "", payload: payload,
                feedback: feedback, port: port, ufrag: transport.attributes["ufrag"] ?? "", password: transport.attributes["pwd"] ?? "",
                fingerprint: fingerprint.text.trimmingCharacters(in: .whitespacesAndNewlines), setup: fingerprint.attributes["setup"] ?? "",
                candidates: candidates.map(\.attributes)))
        }
        let result = Self(sid: sid, action: action, profile: profile, contents: contents)
        try result.validate()
        return result
    }

    static func fromSDP(_ text: String, sid: String, action: String, profile: NativeCallMedia) throws -> Self {
        try identity(sid: sid, action: action)
        try require(text.utf8.count <= 65536)
        let lines = text.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }.filter { !$0.isEmpty }
        try require(lines.allSatisfy { !$0.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) })
        var header: [String] = [], sections: [[String]] = []
        for line in lines {
            if line.hasPrefix("m=") { sections.append([line]) }
            else if sections.isEmpty { header.append(line) }
            else { sections[sections.count - 1].append(line) }
        }
        try require(header.first == "v=0" && header.filter { $0.hasPrefix("o=") }.count == 1 &&
            header.filter { $0.hasPrefix("s=") }.count == 1 && header.filter { $0.hasPrefix("t=") }.count == 1)
        try require(header.allSatisfy { $0.hasPrefix("v=") || $0.hasPrefix("o=") || $0.hasPrefix("s=") || $0.hasPrefix("t=") || $0.hasPrefix("a=msid-semantic:") })
        let kinds = kinds(profile)
        try require(sections.count == kinds.count)
        var contents: [Content] = []
        for (index, section) in sections.enumerated() {
            let kind = kinds[index]
            let prefixes = ["m=", "c=", "a=mid:", "a=ice-ufrag:", "a=ice-pwd:", "a=ice-options:", "a=fingerprint:",
                "a=setup:", "a=candidate:", "a=rtpmap:", "a=rtcp-fb:", "a=sctp-port:", "a=max-message-size:",
                "a=rtcp:", "a=extmap:", "a=msid:", "a=ssrc:", "a=ssrc-group:"]
            let flags: Set<String> = ["a=sendrecv", "a=rtcp-mux", "a=rtcp-rsize", "a=end-of-candidates", "a=extmap-allow-mixed"]
            try require(section.allSatisfy { line in flags.contains(line) || prefixes.contains(where: { line.hasPrefix($0) }) })
            let media = section[0].components(separatedBy: " ")
            try require(media.count == 4 && number(media[1], 1, 65535))
            try require(media[0] == "m=\(kind == "rtt" ? "application" : kind)" &&
                media[2] == (kind == "rtt" ? "UDP/DTLS/SCTP" : "UDP/TLS/RTP/SAVPF"))
            try require(!section.contains { matches($0, "a=(?:sendonly|recvonly|inactive|crypto:.*|ice-lite|bundle-only|dcmap:.*|dcsa:.*|fmtp:.*)") })
            let hash = try once(section, "a=fingerprint:")
            try require(hash.hasPrefix("sha-256 "))
            let payload = kind == "rtt" ? "" : media[3]
            var feedback: [String] = [], port = ""
            if kind == "rtt" {
                try require(media[3] == "webrtc-datachannel")
                port = try once(section, "a=sctp-port:")
                if section.contains(where: { $0.hasPrefix("a=max-message-size:") }) {
                    let size = try once(section, "a=max-message-size:")
                    try require(size == "0" || number(size, 4096, 4294967295))
                }
            } else {
                try require(section.filter { $0 == "a=rtcp-mux" }.count == 1 && section.filter { $0 == "a=sendrecv" }.count == 1)
                let codec = try once(section, "a=rtpmap:")
                try require(codec.uppercased() == "\(payload) \(kind == "audio" ? "PCMU/8000" : "VP8/90000")" ||
                    (kind == "audio" && codec.uppercased() == "\(payload) PCMU/8000/1"))
                for line in section where line.hasPrefix("a=rtcp-fb:") {
                    let prefix = "a=rtcp-fb:\(payload) "
                    try require(line.hasPrefix(prefix))
                    feedback.append(String(line.dropFirst(prefix.count)))
                }
            }
            let candidateLines = section.filter { $0.hasPrefix("a=candidate:") }
            try require(candidateLines.count <= 64)
            var candidates: [[String: String]] = []
            for line in candidateLines {
                let parts = String(line.dropFirst(12)).components(separatedBy: " ")
                try require(parts.count >= 8 && parts.count % 2 == 0 && parts[6] == "typ")
                if parts[1] != "1" || parts[2].lowercased() != "udp" { continue }
                var candidate = ["id": "candidate-\(candidates.count)", "foundation": parts[0], "component": parts[1],
                    "protocol": "udp", "priority": parts[3], "ip": parts[4], "port": parts[5], "type": parts[7], "generation": "0"]
                var seen = Set<String>()
                for offset in stride(from: 8, to: parts.count, by: 2) {
                    let key = parts[offset], value = parts[offset + 1]
                    try require(seen.insert(key).inserted)
                    switch key {
                    case "raddr": candidate["rel-addr"] = value
                    case "rport": candidate["rel-port"] = value
                    case "generation": candidate[key] = value
                    case "network-id", "network-cost": try require(number(value, 0, 65535))
                    case "ufrag": try require(value == once(section, "a=ice-ufrag:"))
                    default: throw NativeJingleMediaFailure.unsupported
                    }
                }
                candidates.append(candidate)
            }
            contents.append(Content(kind: kind, mid: try once(section, "a=mid:"), payload: payload, feedback: feedback, port: port,
                ufrag: try once(section, "a=ice-ufrag:"), password: try once(section, "a=ice-pwd:"),
                fingerprint: String(hash.dropFirst(8)), setup: try once(section, "a=setup:"), candidates: candidates))
        }
        let result = Self(sid: sid, action: action, profile: profile, contents: contents)
        try result.validate()
        _ = try decode(result.xml, sid: sid, action: action, profile: profile)
        return result
    }

    func validateAnswer(to offer: Self) throws {
        try Self.require(action == "session-accept" && offer.action == "session-initiate" && sid == offer.sid && profile == offer.profile && mids == offer.mids)
        for (answer, proposed) in zip(contents, offer.contents) {
            try Self.require(answer.kind == proposed.kind && answer.payload == proposed.payload && Set(answer.feedback).isSubset(of: Set(proposed.feedback)))
        }
    }

    var xml: String {
        var result = "<jingle xmlns='\(Self.jingle)' sid='\(sid)' action='\(action)'>"
        for item in contents {
            result += "<content creator='initiator' name='\(item.mid)' senders='both'>"
            if item.kind == "rtt" {
                result += "<description xmlns='\(Self.rtt)' profile='dc-t140'><datachannel subprotocol='t140' reliability='reliable' order='in-order' label='rtt'/><rtt-sync role='conversation' source='human' sync-mode='co-session'/></description>"
            } else {
                result += "<description xmlns='\(Self.rtp)' media='\(item.kind)'><payload-type id='\(item.payload)' name='\(item.kind == "audio" ? "PCMU" : "VP8")' clockrate='\(item.kind == "audio" ? "8000" : "90000")' channels='1'>"
                for feedback in item.feedback {
                    let parts = feedback.components(separatedBy: " ")
                    result += "<rtcp-fb xmlns='\(Self.feedback)' type='\(parts[0])'" + (parts.count == 2 ? " subtype='\(parts[1])'" : "") + "/>"
                }
                result += "</payload-type><rtcp-mux/></description>"
            }
            result += "<transport xmlns='\(Self.ice)' ufrag='\(item.ufrag)' pwd='\(item.password)'><fingerprint xmlns='\(Self.dtls)' hash='sha-256' setup='\(item.setup)'>\(item.fingerprint)</fingerprint>"
            if item.kind == "rtt" {
                result += "<sctpmap xmlns='\(Self.sctp)' number='\(item.port)' protocol='webrtc-datachannel'/><channel xmlns='\(Self.channel)' id='0' negotiated='true' ordered='true' protocol='t140'/>"
            }
            for candidate in item.candidates {
                result += "<candidate " + candidate.keys.sorted().map { "\($0)='\(candidate[$0]!)'" }.joined(separator: " ") + "/>"
            }
            result += "</transport></content>"
        }
        return result + "</jingle>"
    }

    var sdp: String {
        var lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0"]
        for item in contents {
            lines += [item.kind == "rtt" ? "m=application 9 UDP/DTLS/SCTP webrtc-datachannel" : "m=\(item.kind) 9 UDP/TLS/RTP/SAVPF \(item.payload)", "c=IN IP4 0.0.0.0", "a=mid:\(item.mid)"]
            if item.kind == "rtt" { lines += ["a=sctp-port:\(item.port)", "a=max-message-size:4096"] }
            else {
                lines += ["a=sendrecv", "a=rtcp-mux", "a=rtpmap:\(item.payload) \(item.kind == "audio" ? "PCMU/8000" : "VP8/90000")"]
                lines += item.feedback.map { "a=rtcp-fb:\(item.payload) \($0)" }
            }
            lines += ["a=ice-ufrag:\(item.ufrag)", "a=ice-pwd:\(item.password)", "a=fingerprint:sha-256 \(item.fingerprint)", "a=setup:\(item.setup)"]
            for candidate in item.candidates {
                var line = "a=candidate:\(candidate["foundation"]!) 1 udp \(candidate["priority"]!) \(candidate["ip"]!) \(candidate["port"]!) typ \(candidate["type"]!)"
                if let related = candidate["rel-addr"] { line += " raddr \(related) rport \(candidate["rel-port"]!)" }
                lines.append(line + " generation 0")
            }
            lines.append("a=end-of-candidates")
        }
        return (lines + [""]).joined(separator: "\r\n")
    }

    private func validate() throws {
        try Self.require(Set(mids).count == contents.count)
        for item in contents {
            try Self.require(Self.token(item.mid) && Self.matches(item.ufrag, "[A-Za-z0-9+/]{4,256}") && Self.matches(item.password, "[A-Za-z0-9+/]{22,256}"))
            try Self.require(Self.matches(item.fingerprint, "(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}") &&
                (action == "session-initiate" ? item.setup == "actpass" : ["active", "passive"].contains(item.setup)))
            try Self.require(item.kind == "rtt" ? Self.number(item.port, 1, 65535) :
                (item.kind == "audio" ? item.payload == "0" : Self.number(item.payload, 96, 127)))
            try Self.require(item.kind == "video" ? Set(item.feedback).isSubset(of: Self.feedbackValues) && Set(item.feedback).count == item.feedback.count : item.feedback.isEmpty)
            try Self.require(!item.candidates.isEmpty && item.candidates.count <= 24)
            var ids = Set<String>()
            for candidate in item.candidates {
                try Self.require(Set(candidate.keys).isSubset(of: ["id", "foundation", "component", "protocol", "priority", "ip", "port", "type", "generation", "rel-addr", "rel-port"]))
                try Self.require(Self.token(candidate["id"] ?? "") && ids.insert(candidate["id"] ?? "").inserted && Self.token(candidate["foundation"] ?? ""))
                try Self.require(candidate["component"] == "1" && candidate["protocol"] == "udp" && candidate["generation"] == "0" &&
                    ["host", "srflx", "prflx", "relay"].contains(candidate["type"] ?? "") && Self.number(candidate["port"] ?? "", 1, 65535) && Self.number(candidate["priority"] ?? "", 1, 4294967295))
                let ip = candidate["ip"] ?? ""
                try Self.require(Self.address(ip) || (candidate["type"] == "host" && Self.matches(ip, "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.local")))
                if candidate["rel-addr"] != nil || candidate["rel-port"] != nil {
                    try Self.require(Self.address(candidate["rel-addr"] ?? "") && Self.number(candidate["rel-port"] ?? "", 0, 65535))
                }
            }
        }
    }

    private static func kinds(_ profile: NativeCallMedia) -> [String] { ["audio", "video", "rtt"].filter { profile.contents.contains($0) } }
    private static func require(_ value: Bool) throws { if !value { throw NativeJingleMediaFailure.unsupported } }
    private static func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: "\\A(?:" + pattern + ")\\z", options: .regularExpression) != nil }
    private static func token(_ value: String) -> Bool { matches(value, "[A-Za-z0-9_.+-]{1,64}") }
    private static func number(_ value: String, _ minimum: UInt64, _ maximum: UInt64) -> Bool {
        guard matches(value, "[0-9]{1,10}"), let integer = UInt64(value) else { return false }
        return integer >= minimum && integer <= maximum
    }
    private static func identity(sid: String, action: String) throws {
        try require(matches(sid, "[A-Za-z0-9_-]{1,128}") && ["session-initiate", "session-accept"].contains(action))
    }
    private static func address(_ value: String) -> Bool {
        guard value.utf8.count <= 45 && !value.utf8.contains(0) else { return false }
        var ipv4 = in_addr(), ipv6 = in6_addr()
        return inet_pton(AF_INET, value, &ipv4) == 1 || inet_pton(AF_INET6, value, &ipv6) == 1
    }
    private static func once(_ lines: [String], _ prefix: String) throws -> String {
        let found = lines.filter { $0.hasPrefix(prefix) }
        try require(found.count == 1)
        return String(found[0].dropFirst(prefix.count))
    }
    private static func node(_ element: ProbeElement, _ name: String, _ namespace: String, attributes: Set<String>, text: Bool = false) throws {
        try require(element.name == name && element.namespace == namespace && Set(element.attributes.keys).isSubset(of: attributes) &&
            (text || element.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
    }
    private static func one(_ element: ProbeElement, _ name: String, _ namespace: String) throws -> ProbeElement {
        let found = element.children.filter { $0.name == name && $0.namespace == namespace }
        try require(found.count == 1)
        return found[0]
    }
    private static func exact(_ element: ProbeElement, _ attributes: [String: String]) throws {
        try require(element.attributes == attributes && element.children.isEmpty && element.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
}
