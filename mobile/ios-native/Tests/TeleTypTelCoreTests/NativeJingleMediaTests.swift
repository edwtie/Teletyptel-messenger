import XCTest
@testable import TeleTypTelCore

final class NativeJingleMediaTests: XCTestCase {
    private let certificateFingerprint = Array(repeating: "AB", count: 32).joined(separator: ":")

    private func fixture(_ profile: NativeCallMedia = .total, answer: Bool = false, count: Int = 1) -> String {
        var lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0"]
        for kind in ["audio", "video", "rtt"] where profile.contents.contains(kind) {
            lines += [kind == "rtt" ? "m=application 9 UDP/DTLS/SCTP webrtc-datachannel" : "m=\(kind) 9 UDP/TLS/RTP/SAVPF \(kind == "audio" ? "0" : "96")",
                "c=IN IP4 0.0.0.0", "a=mid:\(kind)"]
            if kind == "rtt" { lines += ["a=sctp-port:5000", "a=max-message-size:262144"] }
            else {
                lines += ["a=sendrecv", "a=rtcp-mux", kind == "audio" ? "a=rtpmap:0 PCMU/8000" : "a=rtpmap:96 VP8/90000"]
                if kind == "video" { lines += ["a=rtcp-fb:96 nack", "a=rtcp-fb:96 nack pli"] }
            }
            lines += ["a=ice-ufrag:abcd", "a=ice-pwd:abcdefghijklmnopqrstuv", "a=fingerprint:sha-256 \(certificateFingerprint)", "a=setup:\(answer ? "active" : "actpass")"]
            for index in 0..<count { lines += ["a=candidate:\(index + 1) 1 udp 2122260223 127.0.0.1 \(50000 + index) typ host generation 0"] }
            lines += ["a=end-of-candidates"]
        }
        return (lines + [""]).joined(separator: "\r\n")
    }

    private func offer(_ profile: NativeCallMedia = .total) throws -> NativeJingleMedia {
        try NativeJingleMedia.fromSDP(fixture(profile), sid: "call-1", action: "session-initiate", profile: profile)
    }

    private func decode(_ xml: String, profile: NativeCallMedia = .total) throws -> NativeJingleMedia {
        try NativeJingleMedia.decode(xml, sid: "call-1", action: "session-initiate", profile: profile)
    }

    func testAllFourProfilesRoundTripWithoutLosingRequiredMedia() throws {
        for profile in NativeCallMedia.allCases {
            for action in ["session-initiate", "session-accept"] {
                let source = try NativeJingleMedia.fromSDP(fixture(profile, answer: action == "session-accept"), sid: "call-1", action: action, profile: profile)
                let decoded = try NativeJingleMedia.decode(source.xml, sid: "call-1", action: action, profile: profile)
                XCTAssertEqual(Set(decoded.mids), profile.contents)
                XCTAssertEqual(decoded.sdp, source.sdp)
                XCTAssertEqual(try NativeJingleMedia.fromSDP(decoded.sdp, sid: "call-1", action: action, profile: profile).xml, source.xml)
            }
        }
    }

    func testAnswerMustKeepOfferedSIDProfileMidsAndCodecs() throws {
        let proposed = try offer()
        let accepted = try NativeJingleMedia.fromSDP(fixture(answer: true), sid: "call-1", action: "session-accept", profile: .total)
        XCTAssertNoThrow(try accepted.validateAnswer(to: proposed))
        XCTAssertThrowsError(try proposed.validateAnswer(to: accepted))
        for replacement in [fixture(answer: true).replacingOccurrences(of: "a=mid:video", with: "a=mid:other"),
                            fixture(answer: true).replacingOccurrences(of: "96", with: "97")] {
            let changed = try NativeJingleMedia.fromSDP(replacement, sid: "call-1", action: "session-accept", profile: .total)
            XCTAssertThrowsError(try changed.validateAnswer(to: proposed))
        }
        let other = try NativeJingleMedia.fromSDP(fixture(answer: true), sid: "call-2", action: "session-accept", profile: .total)
        XCTAssertThrowsError(try other.validateAnswer(to: proposed))
        let audio = try NativeJingleMedia.fromSDP(fixture(.audio, answer: true), sid: "call-1", action: "session-accept", profile: .audio)
        XCTAssertThrowsError(try audio.validateAnswer(to: proposed))
    }

    func testAnswerCannotAddUnadvertisedFeedback() throws {
        let text = fixture(answer: true).replacingOccurrences(of: "a=rtcp-fb:96 nack\r\n", with: "a=rtcp-fb:96 ccm fir\r\n")
        let accepted = try NativeJingleMedia.fromSDP(text, sid: "call-1", action: "session-accept", profile: .total)
        XCTAssertThrowsError(try accepted.validateAnswer(to: offer()))
    }

    func testWholeDescriptionCanPassBoundedAuthenticatedTransport() throws {
        let media = try NativeJingleMedia.fromSDP(fixture(count: 24), sid: "call-1", action: "session-initiate", profile: .total)
        var transport = NativeJingleTransport(owner: "local@localhost/phone")
        let binding = try transport.bind(peer: "remote@localhost/tablet", sid: "call-1")
        let outgoing = try transport.prepare(binding: binding, xml: media.xml)
        XCTAssertEqual(try ProbeXML.parse(outgoing.frame).children.first?.children.count, 3)
        XCTAssertFalse(transport.pending.isEmpty)
    }

    func testContentCountOrderAndUniqueMidAreRequired() throws {
        let source = try offer().xml
        XCTAssertThrowsError(try decode(source, profile: .audio))
        XCTAssertThrowsError(try decode(try offer(.audio).xml))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "name='video'", with: "name='audio'")))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "media='audio'", with: "media='video'")))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "creator='initiator'", with: "creator='responder'")))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "senders='both'", with: "senders='initiator'")))
    }

    func testNoMediaDowngradeOrPlaintextTransport() throws {
        for (original, replacement) in [("UDP/TLS/RTP/SAVPF", "RTP/AVP"), ("a=sendrecv", "a=recvonly"),
            ("a=sendrecv", "a=inactive"), ("a=rtcp-mux\r\n", ""), ("sha-256", "sha-1"),
            ("a=setup:actpass", "a=setup:active"), ("PCMU/8000", "opus/48000/2"), ("VP8/90000", "H264/90000")] {
            XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture().replacingOccurrences(of: original, with: replacement),
                sid: "call-1", action: "session-initiate", profile: .total), replacement)
        }
        for extra in ["a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:secret", "a=fmtp:96 private=1", "a=unknown:1", "a=bundle-only"] {
            XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture() + extra + "\r\n", sid: "call-1", action: "session-initiate", profile: .total))
        }
    }

    func testUnsupportedBundlingAndSessionWideSecurityAreNotSilentlyDiscarded() throws {
        for attribute in ["a=group:BUNDLE audio video rtt", "a=fingerprint:sha-256 \(certificateFingerprint)", "a=ice-lite"] {
            let text = fixture().replacingOccurrences(of: "t=0 0\r\n", with: "t=0 0\r\n\(attribute)\r\n")
            XCTAssertThrowsError(try NativeJingleMedia.fromSDP(text, sid: "call-1", action: "session-initiate", profile: .total))
        }
    }

    func testRTTIsReliableOrderedNegotiatedT140Only() throws {
        let source = try offer().xml
        for (original, replacement) in [("profile='dc-t140'", "profile='rtp-t140'"), ("ordered='true'", "ordered='false'"),
            ("negotiated='true'", "negotiated='false'"), ("id='0' negotiated", "id='1' negotiated"),
            ("protocol='t140'", "protocol='chat'"), ("reliability='reliable'", "reliability='partial'"),
            ("sync-mode='co-session'", "sync-mode='none'"), ("source='human'", "source='machine'"),
            ("number='5000'", "number='0'"), ("label='rtt'", "label='chat'")] {
            XCTAssertThrowsError(try decode(source.replacingOccurrences(of: original, with: replacement)), replacement)
        }
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "ordered='true'", with: "ordered='true' maxRetransmits='0'")))
    }

    func testUnsafeXMLAndWrongSessionAreRefused() throws {
        let source = try offer().xml
        for text in [source.replacingOccurrences(of: "call-1", with: "call-2"), source.replacingOccurrences(of: "session-initiate", with: "session-accept"),
            "<!DOCTYPE x>" + source, source + source, source.replacingOccurrences(of: "<rtcp-mux/>", with: "<rtcp-mux>unexpected</rtcp-mux>"),
            source.replacingOccurrences(of: "<rtcp-mux/>", with: "<rtcp-mux/><rtcp-mux/>"),
            source.replacingOccurrences(of: "<rtcp-mux/>", with: "<rtcp-mux xmlns='evil'/>"),
            source.replacingOccurrences(of: "<transport ", with: "<transport injected='1' ")] {
            XCTAssertThrowsError(try decode(text))
        }
    }

    func testFingerprintsAndCredentialsCannotInjectXMLOrSDP() throws {
        let source = try offer().xml
        for replacement in ["short", "abcd&#10;a=inactive", "abcd&apos;attack", String(repeating: "a", count: 257)] {
            XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "ufrag='abcd'", with: "ufrag='\(replacement)'")))
        }
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: certificateFingerprint, with: "AB:CD")))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "abcdefghijklmnopqrstuv", with: "short")))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "name='video'", with: "name='v&#13;evil'")))
    }

    func testCandidateAddressTypesAndRelatedAddressValidation() throws {
        let source = try offer().xml
        for address in ["127.0.0.1", "2001:db8::1", "peer-1.local"] {
            XCTAssertNoThrow(try decode(source.replacingOccurrences(of: "ip='127.0.0.1'", with: "ip='\(address)'")))
        }
        for address in ["999.0.0.1", "peer.example.com", "127.0.0.1&#10;a=inactive", "2001:::1", "127.0.0.1&apos;bad"] {
            XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "ip='127.0.0.1'", with: "ip='\(address)'")))
        }
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "type='host'", with: "type='relay'").replacingOccurrences(of: "127.0.0.1", with: "peer.local")))
        XCTAssertThrowsError(try decode(source.replacingOccurrences(of: "type='host'", with: "type='srflx' rel-addr='192.0.2.1'")))
        let related = source.replacingOccurrences(of: "type='host'", with: "type='srflx' rel-addr='192.0.2.1' rel-port='0'")
        XCTAssertTrue(try decode(related).sdp.contains("raddr 192.0.2.1 rport 0"))
    }

    func testCandidateLimitsDuplicatesAndExtensions() throws {
        XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture(count: 25), sid: "call-1", action: "session-initiate", profile: .total))
        XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture(count: 0), sid: "call-1", action: "session-initiate", profile: .total))
        let two = try NativeJingleMedia.fromSDP(fixture(count: 2), sid: "call-1", action: "session-initiate", profile: .total)
        XCTAssertThrowsError(try decode(two.xml.replacingOccurrences(of: "candidate-1", with: "candidate-0")))
        for extra in ["generation 0", "unknown 1", "ufrag wrong"] {
            XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture().replacingOccurrences(of: "generation 0", with: "generation 0 \(extra)"),
                sid: "call-1", action: "session-initiate", profile: .total))
        }
        XCTAssertNoThrow(try NativeJingleMedia.fromSDP(fixture().replacingOccurrences(of: "generation 0", with: "generation 0 network-id 1 network-cost 10 ufrag abcd"),
            sid: "call-1", action: "session-initiate", profile: .total))
    }

    func testDuplicateSDPAttributesControlsAndInvalidIdentity() throws {
        for text in [fixture() + "a=mid:other\r\n", fixture() + "a=setup:active\r\n", fixture() + "a=unknown:\u{0}\r\n", String(repeating: "x", count: 65537)] {
            XCTAssertThrowsError(try NativeJingleMedia.fromSDP(text, sid: "call-1", action: "session-initiate", profile: .total))
        }
        for sid in ["", "quote'", "bad\n", String(repeating: "s", count: 129)] {
            XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture(), sid: sid, action: "session-initiate", profile: .total))
        }
        XCTAssertThrowsError(try NativeJingleMedia.fromSDP(fixture(), sid: "call-1", action: "transport-info", profile: .total))
        XCTAssertNoThrow(try NativeJingleMedia.fromSDP(fixture(), sid: String(repeating: "s", count: 128), action: "session-initiate", profile: .total))
    }

    func testDescriptionsDoNotExposeICECredentialsOrAddresses() throws {
        let media = try offer()
        XCTAssertEqual(String(describing: media), "NativeJingleMedia(redacted)")
        XCTAssertEqual(String(reflecting: media), "NativeJingleMedia(redacted)")
    }
}
