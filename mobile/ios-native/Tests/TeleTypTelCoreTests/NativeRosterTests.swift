import XCTest
@testable import TeleTypTelCore

final class NativeRosterTests: XCTestCase {
    private func result(_ stream: NativeRosterStream, items: String = "", from: String = "", type: String = "result") throws -> ProbeElement {
        let identifier = try XCTUnwrap(try ProbeXML.parse(stream.request).attributes["id"])
        return try ProbeXML.parse("<iq xmlns='jabber:client' type='\(type)' id='\(identifier)' \(from)><query xmlns='jabber:iq:roster'>\(items)</query></iq>")
    }

    private func push(_ items: String, from: String = "", identifier: String = "push-1") throws -> ProbeElement {
        try ProbeXML.parse("<iq xmlns='jabber:client' type='set' id='\(identifier)' \(from)><query xmlns='jabber:iq:roster'>\(items)</query></iq>")
    }

    func testSnapshotContainsNamesGroupsFallbackNamesAndStableOrder() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        let output = stream.receive(try result(stream, items: "<item jid='zoe@localhost' name='Zoë &amp; vrienden' subscription='both'><group>Familie</group></item><item jid='anna@localhost'/>", from: "from='fixture@localhost'"))
        XCTAssertEqual(output.state, .ready([
            NativeContact(jid: "anna@localhost", name: "", groups: [], subscription: "none"),
            NativeContact(jid: "zoe@localhost", name: "Zoë & vrienden", groups: ["Familie"], subscription: "both")
        ]))
        XCTAssertTrue(output.frames.isEmpty)
        XCTAssertNil(stream.timeout())
    }

    func testWrongSenderOrCorrelationCannotCompleteSnapshot() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        for sender in ["peer@localhost", "fixture@localhost/other", "localhost"] {
            XCTAssertNil(stream.receive(try result(stream, from: "from='\(sender)'")).state)
        }
        XCTAssertNil(stream.receive(try ProbeXML.parse("<iq xmlns='jabber:client' type='result' id='other'><query xmlns='jabber:iq:roster'/></iq>")).state)
        XCTAssertEqual(stream.receive(try result(stream)).state, .ready([]))
    }

    func testMalformedOrDuplicateSnapshotIsUnavailableNotEmpty() throws {
        for items in ["<item/>", "<item jid='bad jid'/>", "<item jid='peer@localhost/resource'/>",
                      "<item jid='@localhost'/>", "<item jid='peer@localhost'/><item jid='peer@localhost'/>",
                      "<item jid='peer@localhost'><group><nested/></group></item>"] {
            var stream = NativeRosterStream(owner: "fixture@localhost")
            XCTAssertEqual(stream.receive(try result(stream, items: items)).state, .unavailable)
            let output = stream.receive(try push("<item jid='later@localhost'/>"))
            XCTAssertNil(output.state)
            XCTAssertTrue(output.frames[0].contains("service-unavailable"))
        }
    }

    func testTrustedPushAddsUpdatesRemovesAndAcknowledgesEscapedIdentifier() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        _ = stream.receive(try result(stream))
        let output = stream.receive(try push("<item jid='peer@localhost' name='Peer' subscription='both'/>", from: "from='fixture@localhost'", identifier: "push-&apos;&amp;"))
        XCTAssertEqual(output.state, .ready([NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both")]))
        let acknowledgment = try ProbeXML.parse(try XCTUnwrap(output.frames.first))
        XCTAssertEqual(acknowledgment.attributes["id"], "push-'&")
        XCTAssertEqual(acknowledgment.attributes["to"], "fixture@localhost")
        XCTAssertEqual(acknowledgment.attributes["type"], "result")
        XCTAssertEqual(stream.receive(try push("<item jid='peer@localhost' name='Changed'><group>Test</group></item>")).state,
                       .ready([NativeContact(jid: "peer@localhost", name: "Changed", groups: ["Test"], subscription: "none")]))
        XCTAssertEqual(stream.receive(try push("<item jid='peer@localhost' subscription='remove'/>")).state, .ready([]))
    }

    func testForgedPushIgnoredAndMalformedPushCannotPartiallyApply() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        _ = stream.receive(try result(stream))
        let forged = stream.receive(try push("<item jid='peer@localhost'/>", from: "from='peer@localhost'"))
        XCTAssertNil(forged.state)
        XCTAssertTrue(forged.frames.isEmpty)
        let malformed = stream.receive(try push("<item jid='peer@localhost'/><item jid='other@localhost'/>"))
        XCTAssertNil(malformed.state)
        XCTAssertTrue(malformed.frames[0].contains("bad-request"))
        XCTAssertEqual(stream.receive(try push("<item jid='peer@localhost' subscription='remove'/>")).state, .ready([]))
    }

    func testErrorTimeoutAndLateResultCannotAppearAsSuccessfulEmptyList() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        XCTAssertEqual(stream.receive(try result(stream, type: "error")).state, .unavailable)
        XCTAssertNil(stream.receive(try result(stream)).state)
        stream = NativeRosterStream(owner: "fixture@localhost")
        XCTAssertEqual(stream.timeout(), .unavailable)
        XCTAssertNil(stream.timeout())
        XCTAssertNil(stream.receive(try result(stream)).state)
    }

    func testContactAndGroupLimitsRejectRatherThanTruncate() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        let items = (0..<101).map { "<item jid='peer\($0)@localhost'/>" }.joined()
        XCTAssertEqual(stream.receive(try result(stream, items: items)).state, .unavailable)
        stream = NativeRosterStream(owner: "fixture@localhost")
        let groups = String(repeating: "<group>Test</group>", count: 17)
        XCTAssertEqual(stream.receive(try result(stream, items: "<item jid='peer@localhost'>\(groups)</item>")).state, .unavailable)
        stream = NativeRosterStream(owner: "fixture@localhost")
        _ = stream.receive(try result(stream, items: (0..<100).map { "<item jid='peer\($0)@localhost'/>" }.joined()))
        let overflow = stream.receive(try push("<item jid='extra@localhost'/>"))
        XCTAssertNil(overflow.state)
        XCTAssertTrue(overflow.frames[0].contains("resource-constraint"))
    }

    func testUnknownSubscriptionDoesNotGrantSubscription() throws {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        XCTAssertEqual(stream.receive(try result(stream, items: "<item jid='service.localhost' subscription='unknown'/>")).state,
                       .ready([NativeContact(jid: "service.localhost", name: "", groups: [], subscription: "none")]))
    }
}
