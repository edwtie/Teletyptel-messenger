import XCTest
@testable import TeleTypTelCore

final class NativeCallBootstrapTests: XCTestCase {
    private let callID = UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!
    private let deviceID = UUID(uuidString: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!
    private let nonce = String(repeating: "c", count: 32)
    private let generation = String(repeating: "d", count: 32)
    private let opening = "<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' id='fixture' from='example.test' version='1.0'/>"
    private let features = "<features xmlns='http://etherx.jabber.org/streams'><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>PLAIN</mechanism></mechanisms></features>"

    private func claims(_ profile: NativeCallMedia = .total) -> [String: Any] {
        ["version": 1, "scope": "call-xmpp-bootstrap-v1", "environment": "production", "domain": "example.test", "issuer": "fixture",
         "owner": "bob@example.test", "peer": "alice@example.test/caller", "callId": callID.uuidString.lowercased(), "sid": "call-1",
         "deviceId": deviceID.uuidString.lowercased(), "generation": generation, "profile": profile.rawValue, "nonce": nonce,
         "resource": "tc-call-" + nonce, "issuedAt": 100, "expiresAt": 120]
    }

    private func body(_ value: [String: Any], metadata: [String: Any]? = nil, prefix: String = "tcr1") throws -> Data {
        let encoded = try JSONSerialization.data(withJSONObject: value).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return try JSONSerialization.data(withJSONObject: ["credential": prefix + "." + encoded + "." + String(repeating: "a", count: 64),
                                                          "claims": metadata ?? value])
    }

    private func decode(_ data: Data, profile: NativeCallMedia = .total, now: TimeInterval = 100,
                        environment: String = "production", issuer: String = "fixture") throws -> NativeCallBootstrapGrant {
        let invitation = try XCTUnwrap(NativeCallInvitation(id: callID, sid: "call-1", expiresAt: 145, media: profile, now: 100))
        let registration = NativePushRegistration(deviceID: deviceID, generation: generation, expiresAt: 200, controlCredential: "not-an-xmpp-password")
        return try NativeCallBootstrapGrant.decode(data,
            configuration: ServerConfiguration(address: "https://example.invalid", domain: "example.test"), owner: "bob@example.test",
            invitation: invitation, registration: registration, issuer: issuer, environment: environment, now: now)
    }

    private func grant(_ profile: NativeCallMedia = .total) throws -> NativeCallBootstrapGrant {
        try decode(body(claims(profile)), profile: profile)
    }

    private func binding(_ stream: inout XMPPSessionStream) throws -> String {
        _ = try stream.receive(opening)
        let auth = try ProbeXML.parse(XCTUnwrap(try stream.receive(features).frames.first))
        let payload = try XCTUnwrap(Data(base64Encoded: auth.text))
        let text = try XCTUnwrap(String(data: payload, encoding: .utf8))
        XCTAssertTrue(text.hasPrefix("\0bob\0tcr1."))
        XCTAssertFalse(text.contains("not-an-xmpp-password"))
        XCTAssertEqual(try stream.receive("<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>").frames, [stream.opening])
        _ = try stream.receive(opening)
        let bind = try ProbeXML.parse(XCTUnwrap(try stream.receive("<features xmlns='http://etherx.jabber.org/streams'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'/></features>").frames.first))
        XCTAssertEqual(bind.children.first?.children.first?.text, "tc-call-" + nonce)
        return try XCTUnwrap(bind.attributes["id"])
    }

    private func bound(_ identifier: String, resource: String) -> String {
        "<iq xmlns='jabber:client' type='result' from='example.test' id='\(identifier)'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><jid>bob@example.test/\(resource)</jid></bind></iq>"
    }

    func testEveryProfilePreservesBoundContextAndRedactsCredential() throws {
        for profile in NativeCallMedia.allCases {
            let value = try grant(profile)
            XCTAssertEqual(value.owner, "bob@example.test")
            XCTAssertEqual(value.peer, "alice@example.test/caller")
            XCTAssertEqual(value.resource, "tc-call-" + nonce)
            XCTAssertEqual(value.expiresAt, 120)
            XCTAssertEqual(String(describing: value), "NativeCallBootstrapGrant(redacted)")
            XCTAssertEqual(String(reflecting: value), "NativeCallBootstrapGrant(redacted)")
        }
    }

    func testRejectsChangedAuthorityIdentityCallDeviceAndResource() throws {
        let mutations: [(String, Any)] = [("version", 2), ("scope", "call-control-v1"), ("environment", "sandbox"),
            ("domain", "foreign.test"), ("issuer", "foreign"), ("owner", "other@example.test"),
            ("peer", "bob@example.test/device"), ("peer", "alice@foreign.test/device"), ("peer", "alice@example.test"),
            ("callId", UUID().uuidString), ("sid", "different"), ("profile", "audio"), ("deviceId", UUID().uuidString),
            ("generation", String(repeating: "e", count: 32)), ("nonce", "short"), ("resource", "arbitrary"), ("extra", true)]
        for (field, value) in mutations {
            var changed = claims(); changed[field] = value
            XCTAssertThrowsError(try decode(body(changed)), field)
        }
        XCTAssertThrowsError(try decode(body(claims()), issuer: "elsewhere"))
        XCTAssertThrowsError(try decode(body(claims()), environment: "sandbox"))
    }

    func testRejectsMetadataMismatchMalformedTokenAndUnboundedPayload() throws {
        var copy = claims(); copy["peer"] = "charlie@example.test/phone"
        XCTAssertThrowsError(try decode(body(claims(), metadata: copy)))
        for token in ["old-control-token", "tcr1.." + String(repeating: "a", count: 64), "tcr1.e30=." + String(repeating: "a", count: 64),
                      "tcr1.e30.short", String(repeating: "x", count: 1025)] {
            let data = try JSONSerialization.data(withJSONObject: ["credential": token, "claims": claims()])
            XCTAssertThrowsError(try decode(data))
        }
        XCTAssertThrowsError(try decode(Data(repeating: 32, count: 4097)))
        var missing = claims(); missing.removeValue(forKey: "generation")
        XCTAssertThrowsError(try decode(body(missing)))
    }

    func testRejectsExpiredFutureOverlongAndNonfiniteClock() throws {
        for now in [TimeInterval(99), 120, 121, .infinity, .nan] {
            XCTAssertThrowsError(try decode(body(claims()), now: now))
        }
        for (field, value) in [("issuedAt", 101), ("issuedAt", 79), ("expiresAt", 121), ("expiresAt", 100)] {
            var changed = claims(); changed[field] = value
            XCTAssertThrowsError(try decode(body(changed)))
        }
        XCTAssertNoThrow(try decode(body(claims()), now: 119))
    }

    func testScopedStreamUsesSingleFixedResourceAndDoesNotOpenChatServices() throws {
        for profile in NativeCallMedia.allCases {
            let value = try grant(profile)
            var stream = XMPPSessionStream(bootstrap: value, now: { 100 })
            let identifier = try binding(&stream)
            let output = try stream.receive(bound(identifier, resource: value.resource))
            XCTAssertEqual(output.connectedJID, value.owner + "/" + value.resource)
            XCTAssertTrue(output.frames.isEmpty)
            XCTAssertNil(output.roster)
            XCTAssertNil(stream.rosterTimedOut())
            XCTAssertNil(try stream.receive("<message xmlns='jabber:client' from='alice@example.test/caller' type='chat'><body>private</body></message>").chat)
            XCTAssertTrue(try stream.receive("<iq xmlns='jabber:client' type='get' from='alice@example.test/caller' id='disco'><query xmlns='http://jabber.org/protocol/disco#info'/></iq>").frames.isEmpty)
            XCTAssertNoThrow(try stream.heartbeat())
        }
    }

    func testRejectsUnexpectedBoundResourceRatherThanAdoptingIt() throws {
        var stream = XMPPSessionStream(bootstrap: try grant(), now: { 100 })
        let identifier = try binding(&stream)
        XCTAssertThrowsError(try stream.receive(bound(identifier, resource: "other"))) {
            XCTAssertEqual($0 as? XMPPSessionFailure, .bindingRejected)
        }
        XCTAssertEqual(stream.phase, .closed)
    }

    func testExpiryDuringHandshakeAndHeartbeatClosesStream() throws {
        var time: TimeInterval = 100
        var stream = XMPPSessionStream(bootstrap: try grant(), now: { time })
        _ = try stream.receive(opening)
        time = 120
        XCTAssertThrowsError(try stream.receive(features))
        XCTAssertEqual(stream.phase, .closed)
        time = 100
        var connected = XMPPSessionStream(bootstrap: try grant(), now: { time })
        let identifier = try binding(&connected)
        _ = try connected.receive(bound(identifier, resource: "tc-call-" + nonce))
        time = 120
        XCTAssertThrowsError(try connected.heartbeat())
        XCTAssertEqual(connected.phase, .closed)
    }

    func testActiveLeasePinsOriginalIdentityAndCannotBecomeAnotherLoginCredential() throws {
        let bootstrap = try grant()
        var active = claims(); active["scope"] = "call-xmpp-active-v1"; active["issuedAt"] = 110; active["expiresAt"] = 135
        let data = try body(active, prefix: "tcl1")
        let lease = try bootstrap.activeLease(data, registrationExpiry: 200, now: 110)
        XCTAssertTrue(bootstrap.matches(lease))
        XCTAssertEqual(String(reflecting: lease), "NativeCallActiveLease(redacted)")
        XCTAssertThrowsError(try decode(data, now: 110))
        XCTAssertThrowsError(try bootstrap.activeLease(body(active), registrationExpiry: 200, now: 110))
        for (field, value) in [("owner", "other@example.test"), ("peer", "charlie@example.test/caller"),
            ("sid", "different"), ("profile", "audio"), ("nonce", String(repeating: "f", count: 32)),
            ("resource", "other"), ("generation", String(repeating: "f", count: 32)), ("scope", "call-xmpp-answer-v1")] {
            var changed = active; changed[field] = value
            XCTAssertThrowsError(try bootstrap.activeLease(body(changed, prefix: "tcl1"), registrationExpiry: 200, now: 110), field)
        }
        XCTAssertThrowsError(try bootstrap.activeLease(data, registrationExpiry: 134, now: 110))
        XCTAssertThrowsError(try bootstrap.activeLease(data, registrationExpiry: 200, now: 135))
        var extended = active; extended["unexpected"] = true
        XCTAssertThrowsError(try bootstrap.activeLease(body(extended, prefix: "tcl1"), registrationExpiry: 200, now: 110))
    }

    func testAcknowledgedLeaseExtendsOnlyAnUnexpiredBoundCallStream() throws {
        let bootstrap = try grant()
        var active = claims(); active["scope"] = "call-xmpp-active-v1"; active["issuedAt"] = 110; active["expiresAt"] = 135
        let lease = try bootstrap.activeLease(body(active, prefix: "tcl1"), registrationExpiry: 200, now: 110)
        var time: TimeInterval = 100
        var stream = XMPPSessionStream(bootstrap: bootstrap, now: { time })
        XCTAssertThrowsError(try stream.applyAcknowledgedCallLease(lease))
        let identifier = try binding(&stream)
        _ = try stream.receive(bound(identifier, resource: bootstrap.resource))
        time = 110
        try stream.applyAcknowledgedCallLease(lease)
        XCTAssertThrowsError(try stream.applyAcknowledgedCallLease(lease))
        time = 121
        XCTAssertNoThrow(try stream.heartbeat())
        time = 135
        XCTAssertThrowsError(try stream.applyAcknowledgedCallLease(lease))
        XCTAssertThrowsError(try stream.receive("<message xmlns='jabber:client'/>"))
        XCTAssertEqual(stream.phase, .closed)
    }
}
