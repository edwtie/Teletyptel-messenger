import Foundation

@main
enum NativeJingleRttTests {
    static func main() throws {
        let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: String]
        let xml = fixture["xml"]!, sdp = fixture["sdp"]!, sid = fixture["sid"]!, mid = fixture["mid"]!
        func decode(_ value: String) throws -> String {
            try MessengerJingleRtt.toSdp(value, sid: sid, action: "session-initiate", expectedMid: mid)
        }
        func check(_ condition: Bool) { precondition(condition) }
        check(try decode(xml) == sdp)
        let encoded = try MessengerJingleRtt.fromSdp(sdp, sid: sid, action: "session-initiate")
        check(try decode(encoded) == sdp)
        let answer = sdp.replacingOccurrences(of: "a=setup:actpass", with: "a=setup:active")
        let answerXml = try MessengerJingleRtt.fromSdp(answer, sid: sid, action: "session-accept")
        check(try MessengerJingleRtt.toSdp(answerXml, sid: sid, action: "session-accept", expectedMid: mid) == answer)
        for (before, after) in [
            ("sid=\"native-rtt-test\"", "sid=\"another-call\""),
            ("session-initiate", "session-accept"), ("name=\"0\"", "name=\"other\""),
            ("urn:xmpp:jingle:1", "urn:attacker:jingle:1"), ("rtt-sync:0", "rtt-sync:9"),
            ("creator=\"initiator\"", "creator=\"responder\""), ("senders=\"both\"", "senders=\"none\""),
            ("label=\"rtt\"", "label=\"chat\""), ("co-session", "media-clock"),
            ("reliable", "unreliable"), ("in-order", "unordered"), ("id=\"0\"", "id=\"2\""),
            ("ordered=\"true\"", "ordered=\"false\""), ("negotiated=\"true\"", "negotiated=\"false\""),
            ("id=\"0\"", "id=\"0\" maxRetransmits=\"1\""), ("human", "translation"),
            ("sha-256", "sha-1"), ("actpass", "active"), ("ufrag=\"abcd\"", "ufrag=\"a\""),
            ("number=\"5000\"", "number=\"0\""), ("127.0.0.1", "999.0.0.1"),
            ("port=\"50000\"", "port=\"70000\""), ("generation=\"0\"", "generation=\"1\""),
            ("</transport>", "<unknown/></transport>"), ("</content>", "<content/></content>"),
            ("<content ", "<content disposition=\"session\" "),
            ("<description ", "unexpected text<description "),
            ("<jingle ", "<!DOCTYPE jingle [<!ENTITY attack SYSTEM 'file:///private/test'>]><jingle "),
            ("<datachannel ", "<![CDATA[not allowed]]><datachannel ")
        ] {
            precondition((try? decode(xml.replacingOccurrences(of: before, with: after))) == nil, "invalid XML accepted: \(before)")
        }
        precondition((try? decode(String(repeating: " ", count: 65537) + xml)) == nil)
        precondition((try? decode(xml + xml)) == nil)
        let candidateStart = xml.range(of: "<candidate ")!.lowerBound
        let candidateEnd = xml.range(of: "/></transport>")!.lowerBound
        let candidate = String(xml[candidateStart..<candidateEnd]) + "/>"
        precondition((try? decode(xml.replacingOccurrences(of: candidate, with: ""))) == nil)
        precondition((try? decode(xml.replacingOccurrences(of: candidate, with: candidate + candidate))) == nil)
        let excessive = (0..<65).map { candidate.replacingOccurrences(of: "candidate-0", with: "candidate-\($0)") }.joined()
        precondition((try? decode(xml.replacingOccurrences(of: candidate, with: excessive))) == nil)
        for address in ["::1", "peer-123.local"] {
            let variant = xml.replacingOccurrences(of: "127.0.0.1", with: address)
            check(try decode(variant).contains(address))
        }
        for addition in ["a=mid:duplicate\r\n", "m=audio 9 UDP/TLS/RTP/SAVPF 0\r\n", "a=crypto:bad\r\n", "a=inactive\r\n", "a=dcmap:0 bad\r\n", "a=ice-lite\r\n"] {
            precondition((try? MessengerJingleRtt.fromSdp(sdp + addition, sid: sid, action: "session-initiate")) == nil)
        }
        precondition((try? MessengerJingleRtt.fromSdp(sdp.replacingOccurrences(of: "a=mid:0", with: "a=mid:0\u{0}"), sid: sid, action: "session-initiate")) == nil)
        precondition((try? MessengerJingleRtt.fromSdp(sdp.replacingOccurrences(of: "a=max-message-size:4096", with: "a=max-message-size:128"), sid: sid, action: "session-initiate")) == nil)
        print("Native Jingle RTT codec checks passed")
    }
}
