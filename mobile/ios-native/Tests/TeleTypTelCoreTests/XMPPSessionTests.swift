import XCTest
@testable import TeleTypTelCore

final class XMPPSessionTests: XCTestCase {
    private let opening = "<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' id='fixture' from='localhost' version='1.0'/>"
    private let features = "<features xmlns='http://etherx.jabber.org/streams'><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>PLAIN</mechanism></mechanisms></features>"
    private let success = "<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>"
    private let binding = "<features xmlns='http://etherx.jabber.org/streams'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'/></features>"

    private func configuration() throws -> ServerConfiguration {
        try ServerConfiguration(address: "https://example.invalid", domain: "localhost")
    }

    private func account() throws -> NativeAuthenticatedAccount {
        let data = Data(#"{"ok":true,"account":{"jid":"fixture@localhost","password":"fake-only"}}"#.utf8)
        return try NativeAuthenticatedAccount.decode(data, status: 200, configuration: configuration())
    }

    private func reachBinding(_ stream: inout XMPPSessionStream) throws -> String {
        XCTAssertNil(try stream.receive(opening).connectedJID)
        XCTAssertNil(try stream.receive(features).connectedJID)
        XCTAssertEqual(try stream.receive(success).frames, [stream.opening])
        XCTAssertNil(try stream.receive(opening).connectedJID)
        let frame = try XCTUnwrap(try stream.receive(binding).frames.first)
        return try XCTUnwrap(try ProbeXML.parse(frame).attributes["id"])
    }

    private func bound(_ identifier: String, jid: String = "fixture@localhost/device") -> String {
        "<iq xmlns='jabber:client' type='result' id='\(identifier)'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><jid>\(jid)</jid></bind></iq>"
    }

    private func online() throws -> XMPPSessionStream {
        var stream = XMPPSessionStream(account: try account())
        let identifier = try reachBinding(&stream)
        _ = try stream.receive(bound(identifier))
        return stream
    }

    func testAccountGateRejectsTwoFactorEvenWhenCredentialsPresent() throws {
        for reply in [#"{"ok":true,"twoFactorRequired":true}"#,
                      #"{"ok":true,"twoFactorRequired":true,"account":{"jid":"fixture@localhost","password":"fake"}}"#] {
            XCTAssertThrowsError(try NativeAuthenticatedAccount.decode(Data(reply.utf8), status: 200, configuration: configuration())) {
                XCTAssertEqual($0 as? NativeAccountFailure, .twoFactorRequired)
            }
        }
    }

    func testDirectChatRoutesWithoutAcknowledgingHeartbeatAndStopsOnClose() throws {
        var stream = try online()
        let ping = try ProbeXML.parse(stream.heartbeat())
        let xml = "<message xmlns='jabber:client' from='peer@localhost/tablet' type='chat' id='chat'><body>Hallo</body></message>"
        let output = try stream.receive(xml)
        XCTAssertNotNil(output.chat)
        XCTAssertFalse(output.heartbeatAcknowledged)
        XCTAssertTrue(output.frames.isEmpty)
        let identifier = try XCTUnwrap(ping.attributes["id"])
        XCTAssertTrue(try stream.receive("<iq xmlns='jabber:client' type='result' id='\(identifier)'/>").heartbeatAcknowledged)
        stream.close()
        XCTAssertThrowsError(try stream.receive(xml))
    }

    func testJingleIQRoutesOnlyAfterBindingAndDoesNotAcknowledgeHeartbeat() throws {
        var stream = try online()
        let ping = try ProbeXML.parse(stream.heartbeat())
        let xml = "<iq xmlns='jabber:client' from='peer@localhost/tablet' type='set' id='call'><jingle xmlns='urn:xmpp:jingle:1' action='session-initiate' sid='call-1'/></iq>"
        let output = try stream.receive(xml)
        XCTAssertEqual(output.unhandledIQ, xml)
        XCTAssertFalse(output.heartbeatAcknowledged)
        XCTAssertNil(output.chat)
        XCTAssertTrue(output.frames.isEmpty)
        let identifier = try XCTUnwrap(ping.attributes["id"])
        let acknowledged = try stream.receive("<iq xmlns='jabber:client' type='result' id='\(identifier)'/>")
        XCTAssertTrue(acknowledged.heartbeatAcknowledged)
        XCTAssertNil(acknowledged.unhandledIQ)
        stream.close()
        XCTAssertThrowsError(try stream.receive(xml))
        var unauthenticated = XMPPSessionStream(account: try account())
        XCTAssertThrowsError(try unauthenticated.receive(xml))
    }

    func testRosterIsRequestedOnlyAfterBindingAndTimeoutDoesNotBreakSession() throws {
        var stream = XMPPSessionStream(account: try account(), loadRoster: true)
        let identifier = try reachBinding(&stream)
        let output = try stream.receive(bound(identifier))
        XCTAssertEqual(output.roster, .loading)
        XCTAssertEqual(output.frames.count, 2)
        let request = try ProbeXML.parse(output.frames[0])
        XCTAssertEqual(request.children.first?.namespace, "jabber:iq:roster")
        XCTAssertEqual(stream.rosterTimedOut(), .unavailable)
        XCTAssertEqual(stream.phase, .online)
        XCTAssertNoThrow(try stream.heartbeat())
        stream.close()
        XCTAssertNil(stream.rosterTimedOut())
        XCTAssertThrowsError(try stream.receive(output.frames[0]))
    }

    func testPresenceUpdatesRosterWithoutAcknowledgingHeartbeat() throws {
        var stream = XMPPSessionStream(account: try account(), loadRoster: true)
        let identifier = try reachBinding(&stream)
        let output = try stream.receive(bound(identifier))
        let request = try ProbeXML.parse(output.frames[0])
        let rosterID = try XCTUnwrap(request.attributes["id"])
        _ = try stream.receive("<iq xmlns='jabber:client' type='result' id='\(rosterID)'><query xmlns='jabber:iq:roster'><item jid='peer@localhost' subscription='both'/></query></iq>")
        let ping = try ProbeXML.parse(stream.heartbeat())
        XCTAssertNil(try stream.receive("<presence xmlns='jabber:client' from='peer@localhost/phone' to='other@localhost'/>").roster)
        let update = try stream.receive("<presence xmlns='jabber:client' from='peer@localhost/phone' to='fixture@localhost/device'/>")
        XCTAssertEqual(update.roster, .ready([NativeContact(jid: "peer@localhost", name: "", groups: [], subscription: "both", presence: .online,
                                                           callEndpoint: "peer@localhost/phone")]))
        XCTAssertFalse(update.heartbeatAcknowledged)
        XCTAssertTrue(update.frames.isEmpty)
        let pingID = try XCTUnwrap(ping.attributes["id"])
        XCTAssertTrue(try stream.receive("<iq xmlns='jabber:client' type='result' id='\(pingID)'/>").heartbeatAcknowledged)
        stream.close()
        XCTAssertThrowsError(try stream.receive("<presence xmlns='jabber:client' from='peer@localhost/phone'/>"))
    }

    func testAccountRejectsMalformedForeignAndUnsuccessfulResponses() throws {
        for reply in ["{}", "<html/>", #"{"ok":false}"#, #"{"ok":true,"account":{"jid":"fixture@other","password":"fake"}}"#,
                      #"{"ok":true,"account":{"jid":"fixture@localhost","password":""}}"#,
                      #"{"ok":true,"account":{"jid":"fixture@localhost/resource","password":"fake"}}"#] {
            XCTAssertThrowsError(try NativeAuthenticatedAccount.decode(Data(reply.utf8), status: 200, configuration: configuration()))
        }
        let reply = Data(#"{"ok":false,"error":"invalid_credentials"}"#.utf8)
        XCTAssertThrowsError(try NativeAuthenticatedAccount.decode(reply, status: 401, configuration: configuration())) {
            XCTAssertEqual($0 as? NativeAccountFailure, .invalidCredentials)
        }
        XCTAssertEqual(String(describing: try account()), "NativeAuthenticatedAccount(redacted)")
        XCTAssertEqual(String(reflecting: try account()), "NativeAuthenticatedAccount(redacted)")
    }

    func testAuthenticationEncodingAndBindingRequiredBeforeOnline() throws {
        var stream = XMPPSessionStream(account: try account())
        _ = try stream.receive(opening)
        let frame = try XCTUnwrap(try stream.receive(features).frames.first)
        let auth = try ProbeXML.parse(frame)
        XCTAssertEqual(auth.attributes["mechanism"], "PLAIN")
        XCTAssertEqual(Data(base64Encoded: auth.text), Data("\0fixture\0fake-only".utf8))
        XCTAssertEqual(stream.phase, .authenticating)
        _ = try stream.receive(success)
        XCTAssertEqual(stream.phase, .reopening)
        _ = try stream.receive(opening)
        let bindFrame = try XCTUnwrap(try stream.receive(binding).frames.first)
        let identifier = try XCTUnwrap(try ProbeXML.parse(bindFrame).attributes["id"])
        XCTAssertEqual(stream.phase, .binding)
        let result = try stream.receive(bound(identifier))
        XCTAssertEqual(result.connectedJID, "fixture@localhost/device")
        XCTAssertEqual(result.frames, ["<presence xmlns='jabber:client'/>"])
        XCTAssertEqual(stream.phase, .online)
    }

    func testWrongOrderAndAuthenticationFailureAreTerminal() throws {
        var stream = XMPPSessionStream(account: try account())
        XCTAssertThrowsError(try stream.receive(success))
        XCTAssertEqual(stream.phase, .closed)
        XCTAssertThrowsError(try stream.receive(opening))
        stream = XMPPSessionStream(account: try account())
        _ = try stream.receive(opening)
        _ = try stream.receive(features)
        XCTAssertThrowsError(try stream.receive("<failure xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><not-authorized/></failure>")) {
            XCTAssertEqual($0 as? XMPPSessionFailure, .authenticationRejected)
        }
        XCTAssertEqual(stream.phase, .closed)
    }

    func testUnsupportedMechanismAndForeignOpeningDoNotSendCredentials() throws {
        var stream = XMPPSessionStream(account: try account())
        _ = try stream.receive(opening)
        XCTAssertThrowsError(try stream.receive(features.replacingOccurrences(of: "PLAIN", with: "SCRAM-SHA-256"))) {
            XCTAssertEqual($0 as? XMPPSessionFailure, .unsupportedAuthentication)
        }
        stream = XMPPSessionStream(account: try account())
        XCTAssertThrowsError(try stream.receive(opening.replacingOccurrences(of: "localhost", with: "other")))
    }

    func testBindingRejectsWrongIDAccountNamespaceAndError() throws {
        for kind in ["id", "jid", "namespace", "error", "resource"] {
            var stream = XMPPSessionStream(account: try account())
            let identifier = try reachBinding(&stream)
            var reply = bound(identifier)
            switch kind {
            case "id": reply = bound("wrong")
            case "jid": reply = bound(identifier, jid: "other@localhost/device")
            case "namespace": reply = reply.replacingOccurrences(of: "xmpp-bind", with: "foreign")
            case "error": reply = reply.replacingOccurrences(of: "type='result'", with: "type='error'")
            default: reply = bound(identifier, jid: "fixture@localhost")
            }
            XCTAssertThrowsError(try stream.receive(reply))
            XCTAssertEqual(stream.phase, .closed)
        }
    }

    func testHeartbeatIgnoresSpoofedAndUnrelatedResponses() throws {
        var stream = try online()
        let frame = try stream.heartbeat()
        let identifier = try XCTUnwrap(try ProbeXML.parse(frame).attributes["id"])
        XCTAssertFalse(try stream.receive("<iq xmlns='jabber:client' type='result' id='other'/>").heartbeatAcknowledged)
        XCTAssertFalse(try stream.receive("<iq xmlns='jabber:client' type='result' id='\(identifier)' from='stranger@localhost'/>").heartbeatAcknowledged)
        XCTAssertTrue(try stream.receive("<iq xmlns='jabber:client' type='error' id='\(identifier)' from='localhost'/>").heartbeatAcknowledged)
        XCTAssertNoThrow(try stream.heartbeat())
        XCTAssertThrowsError(try stream.heartbeat()) {
            XCTAssertEqual($0 as? XMPPSessionFailure, .heartbeatTimeout)
        }
        XCTAssertEqual(stream.phase, .closed)
    }

    func testIncomingPingEscapingAndClosedSession() throws {
        var stream = try online()
        let result = try stream.receive("<iq xmlns='jabber:client' type='get' id='a&amp;b' from='peer@localhost/r'><ping xmlns='urn:xmpp:ping'/></iq>")
        let reply = try ProbeXML.parse(try XCTUnwrap(result.frames.first))
        XCTAssertEqual(reply.attributes["id"], "a&b")
        XCTAssertEqual(reply.attributes["to"], "peer@localhost/r")
        XCTAssertThrowsError(try stream.receive("<close xmlns='urn:ietf:params:xml:ns:xmpp-framing'/>"))
        XCTAssertEqual(stream.phase, .closed)
    }

    func testParserLimitsApplyAfterAuthenticationToo() throws {
        for frame in [String(repeating: "x", count: 65537),
                      "<!DOCTYPE message [<!ENTITY x SYSTEM 'file:///private'>]><message xmlns='jabber:client'>&x;</message>",
                      "<message xmlns='jabber:client'>" + String(repeating: "<body/>", count: 129) + "</message>"] {
            var stream = try online()
            XCTAssertThrowsError(try stream.receive(frame))
            XCTAssertEqual(stream.phase, .closed)
        }
    }

    func testCancellationBeforeSessionStartDoesNotConnect() async throws {
        let account = try account()
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            try await NativeXMPPConnection().run(account: account) { _ in XCTFail("Cancelled connection became ready") }
        }
        do { try await task.value; XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
    }

    func testCancellationBeforeAccountRequestDoesNotAuthenticate() async throws {
        let configuration = try configuration()
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await NativeAccountClient().login(configuration: configuration, jid: "fixture@localhost", password: "fake")
        }
        do { _ = try await task.value; XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
    }
}
