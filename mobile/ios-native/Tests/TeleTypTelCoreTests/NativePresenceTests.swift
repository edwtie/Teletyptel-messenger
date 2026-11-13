import XCTest
@testable import TeleTypTelCore

final class NativePresenceTests: XCTestCase {
    private func loaded(subscription: String = "both") throws -> NativeRosterStream {
        var stream = NativeRosterStream(owner: "fixture@localhost")
        let identifier = try XCTUnwrap(try ProbeXML.parse(stream.request).attributes["id"])
        let result = try ProbeXML.parse("<iq xmlns='jabber:client' type='result' id='\(identifier)'><query xmlns='jabber:iq:roster'><item jid='peer@localhost' subscription='\(subscription)'/></query></iq>")
        XCTAssertEqual(status(stream.receive(result)), .unknown)
        return stream
    }

    private func presence(_ sender: String = "peer@localhost/phone", type: String? = nil,
                          body: String = "") throws -> ProbeElement {
        let attribute = type.map { " type='\($0)'" } ?? ""
        return try ProbeXML.parse("<presence xmlns='jabber:client' from='\(sender)'\(attribute)>\(body)</presence>")
    }

    private func status(_ output: NativeRosterOutput) -> NativeContactPresence? {
        guard case .ready(let contacts) = output.state else { return nil }
        return contacts.first?.presence
    }

    private func endpoint(_ output: NativeRosterOutput) -> String? {
        guard case .ready(let contacts) = output.state else { return nil }
        return contacts.first?.callEndpoint
    }

    private func push(subscription: String = "both", name: String = "Changed") throws -> ProbeElement {
        try ProbeXML.parse("<iq xmlns='jabber:client' type='set' id='update'><query xmlns='jabber:iq:roster'><item jid='peer@localhost' name='\(name)' subscription='\(subscription)'/></query></iq>")
    }

    func testInitialStatusIsUnknownAndShowValuesAreMapped() throws {
        for (show, expected) in [("", NativeContactPresence.online), ("chat", .online),
                                 ("away", .away), ("xa", .extendedAway), ("dnd", .busy)] {
            var stream = try loaded()
            let body = show.isEmpty ? "" : "<show>\(show)</show>"
            XCTAssertEqual(status(stream.receive(try presence(body: body))), expected)
            XCTAssertNil(stream.receive(try presence(body: body)).state)
        }
    }

    func testOneDeviceGoingOfflineDoesNotHideOtherAvailableDevice() throws {
        var stream = try loaded()
        XCTAssertEqual(status(stream.receive(try presence(body: "<show>away</show>"))), .away)
        XCTAssertEqual(status(stream.receive(try presence("peer@localhost/tablet"))), .online)
        XCTAssertEqual(status(stream.receive(try presence("peer@localhost/tablet", type: "unavailable"))), .away)
        XCTAssertEqual(status(stream.receive(try presence(type: "unavailable"))), .offline)
        XCTAssertNil(stream.receive(try presence(type: "unavailable")).state)
    }

    func testCallEndpointUsesAnAvailableFullJIDAndClearsWhenUnavailable() throws {
        var stream = try loaded()
        XCTAssertEqual(endpoint(stream.receive(try presence("peer@localhost/phone", body: "<show>away</show>"))),
                       "peer@localhost/phone")
        XCTAssertEqual(endpoint(stream.receive(try presence("peer@localhost/tablet"))),
                       "peer@localhost/tablet")
        XCTAssertEqual(endpoint(stream.receive(try presence("peer@localhost/tablet", type: "unavailable"))),
                       "peer@localhost/phone")
        XCTAssertNil(endpoint(stream.receive(try presence("peer@localhost/phone", type: "unavailable"))))
    }

    func testBareUnavailableClearsAllResources() throws {
        var stream = try loaded()
        _ = stream.receive(try presence())
        _ = stream.receive(try presence("peer@localhost/tablet", body: "<show>dnd</show>"))
        XCTAssertEqual(status(stream.receive(try presence("peer@localhost", type: "unavailable"))), .offline)
        XCTAssertEqual(status(stream.receive(try presence(body: "<show>xa</show>"))), .extendedAway)
    }

    func testUnknownContactsAndUnsubscribedPresenceCannotChangeList() throws {
        for subscription in ["none", "from"] {
            var stream = try loaded(subscription: subscription)
            XCTAssertNil(stream.receive(try presence()).state)
        }
        var stream = try loaded(subscription: "to")
        for sender in ["", "stranger@localhost/phone", "peer@elsewhere/phone", "peer@localhost/", "fixture@localhost/phone"] {
            XCTAssertNil(stream.receive(try presence(sender)).state)
        }
        XCTAssertEqual(status(stream.receive(try presence())), .online)
        var pending = NativeRosterStream(owner: "fixture@localhost")
        XCTAssertNil(pending.receive(try presence()).state)
        XCTAssertEqual(pending.timeout(), .unavailable)
    }

    func testSubscriptionRequestsErrorsAndMalformedShowAreNotAvailability() throws {
        var stream = try loaded()
        for type in ["subscribe", "subscribed", "unsubscribe", "unsubscribed", "probe", "error", "available", ""] {
            XCTAssertNil(stream.receive(try presence(type: type)).state)
        }
        for body in ["<show/>", "<show>unknown</show>", "<show>away</show><show>chat</show>", "<show><nested/></show>"] {
            XCTAssertNil(stream.receive(try presence(body: body)).state)
        }
        XCTAssertNil(stream.receive(try ProbeXML.parse("<presence xmlns='foreign' from='peer@localhost/phone'/>")).state)
        XCTAssertEqual(status(stream.receive(try presence(body: "<status>Private status not displayed</status><priority>-1</priority>"))), .online)
    }

    func testRosterRenamePreservesPresenceButRevocationAndRemovalClearIt() throws {
        var stream = try loaded()
        _ = stream.receive(try presence())
        XCTAssertEqual(status(stream.receive(try push())), .online)
        XCTAssertEqual(status(stream.receive(try push(subscription: "none"))), .unknown)
        XCTAssertNil(stream.receive(try presence()).state)
        XCTAssertEqual(status(stream.receive(try push())), .unknown)
        XCTAssertEqual(status(stream.receive(try presence())), .online)
        XCTAssertEqual(stream.receive(try push(subscription: "remove")).state, .ready([]))
        XCTAssertNil(stream.receive(try presence()).state)
        XCTAssertEqual(status(stream.receive(try push())), .unknown)
    }

    func testResourceLimitCannotProduceFalseOfflineState() throws {
        var stream = try loaded()
        for index in 0..<64 { _ = stream.receive(try presence("peer@localhost/device-\(index)")) }
        XCTAssertEqual(status(stream.receive(try presence("peer@localhost/overflow"))), .unknown)
        for index in 0..<64 {
            XCTAssertNil(stream.receive(try presence("peer@localhost/device-\(index)", type: "unavailable")).state)
        }
        XCTAssertNil(stream.receive(try presence("peer@localhost/overflow", type: "unavailable")).state)
        XCTAssertEqual(status(stream.receive(try presence("peer@localhost", type: "unavailable"))), .offline)
        XCTAssertEqual(status(stream.receive(try presence())), .online)
    }

    func testNewSessionDoesNotInheritPreviousOnlineStatus() throws {
        var previous = try loaded()
        XCTAssertEqual(status(previous.receive(try presence())), .online)
        var next = try loaded()
        XCTAssertEqual(status(next.receive(try presence(body: "<show>dnd</show>"))), .busy)
        XCTAssertNotEqual(NativeContactPresence.unknown.label, NativeContactPresence.offline.label)
    }
}
