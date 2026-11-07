import XCTest
@testable import TeleTypTelCore

final class NativeJingleTransportTests: XCTestCase {
    private let owner = "local@localhost/phone"
    private let peer = "remote@localhost/tablet"

    private func payload(sid: String = "call-1", action: String = "session-info") -> String {
        "<jingle xmlns='urn:xmpp:jingle:1' sid='\(sid)' action='\(action)'/>"
    }

    private func request(identifier: String = "incoming-1", sender: String = "remote@localhost/tablet",
                         recipient: String = "local@localhost/phone", sid: String = "call-1",
                         action: String = "session-info") -> String {
        "<iq xmlns='jabber:client' type='set' from='\(sender)' to='\(recipient)' id='\(identifier)'>\(payload(sid: sid, action: action))</iq>"
    }

    private func result(_ identifier: String, sender: String = "remote@localhost/tablet",
                        recipient: String = "local@localhost/phone", body: String = "", type: String = "result") -> String {
        "<iq xmlns='jabber:client' type='\(type)' from='\(sender)' to='\(recipient)' id='\(identifier)'>\(body)</iq>"
    }

    func testExplicitFullPeerAndSIDBindingRequired() throws {
        var transport = NativeJingleTransport(owner: owner)
        XCTAssertThrowsError(try transport.prepare(binding: UUID(), xml: payload()))
        for bad in ["remote@localhost", owner, "remote@localhost/", "remote@localhost/tab let"] {
            XCTAssertThrowsError(try transport.bind(peer: bad, sid: "call-1"))
        }
        for bad in ["", "call/1", String(repeating: "x", count: 129)] {
            XCTAssertThrowsError(try transport.bind(peer: peer, sid: bad))
        }
        let binding = try transport.bind(peer: peer, sid: "call-1")
        XCTAssertThrowsError(try transport.bind(peer: peer, sid: "call-2"))
        let outgoing = try transport.prepare(binding: binding, xml: payload())
        XCTAssertEqual(try ProbeXML.parse(outgoing.frame).attributes["to"], peer)
        XCTAssertTrue(transport.pending.contains(outgoing.identifier))
    }

    func testAcknowledgementRequiresExactPeerRecipientAndIdentifier() throws {
        var transport = NativeJingleTransport(owner: owner)
        let binding = try transport.bind(peer: peer, sid: "call-1")
        let outgoing = try transport.prepare(binding: binding, xml: payload())
        for xml in [result(outgoing.identifier, sender: "remote@localhost/other"),
                    result(outgoing.identifier, sender: "remote@localhost"),
                    result(outgoing.identifier, sender: "evil@localhost/tablet"),
                    result(outgoing.identifier, recipient: "local@localhost/other"),
                    result("another-id"), result(outgoing.identifier, body: payload())] {
            XCTAssertNil(transport.receive(xml, now: 1).completed)
            XCTAssertTrue(transport.pending.contains(outgoing.identifier))
        }
        let acknowledgement = transport.receive(result(outgoing.identifier), now: 1)
        XCTAssertEqual(acknowledgement.completed, outgoing.identifier)
        XCTAssertNil(acknowledgement.failure)
        XCTAssertNil(acknowledgement.request)
        XCTAssertTrue(transport.pending.isEmpty)
        XCTAssertNil(transport.receive(result(outgoing.identifier), now: 1).completed)
    }

    func testErrorAcknowledgementIsNotSuccess() throws {
        var transport = NativeJingleTransport(owner: owner)
        let binding = try transport.bind(peer: peer, sid: "call-1")
        let outgoing = try transport.prepare(binding: binding, xml: payload())
        XCTAssertNil(transport.receive(result(outgoing.identifier, type: "error"), now: 1).completed)
        let reply = transport.receive(result(outgoing.identifier,
            body: "<error type='cancel'><not-acceptable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error>", type: "error"), now: 1)
        XCTAssertEqual(reply.completed, outgoing.identifier)
        XCTAssertEqual(reply.failure, .rejected)
    }

    func testNoAutomaticAcceptanceAndRequestIsRedacted() throws {
        var transport = NativeJingleTransport(owner: owner)
        let binding = try transport.bind(peer: peer, sid: "call-1")
        let output = transport.receive(request(action: "session-initiate"), now: 10)
        XCTAssertTrue(output.frames.isEmpty)
        let received = try XCTUnwrap(output.request)
        XCTAssertEqual(received.binding, binding)
        XCTAssertEqual(received.peer, peer)
        XCTAssertEqual(received.sid, "call-1")
        XCTAssertEqual(received.action, "session-initiate")
        XCTAssertEqual(String(describing: received), "NativeJingleRequest(redacted)")
        XCTAssertEqual(String(reflecting: received), "NativeJingleRequest(redacted)")
        let reply = try transport.reply(received, rejection: .notAcceptable, now: 11)
        XCTAssertTrue(reply.contains("not-acceptable"))
        XCTAssertEqual(try ProbeXML.parse(reply).attributes["type"], "error")
        XCTAssertThrowsError(try transport.reply(received, rejection: nil, now: 11))
    }

    func testIncomingDuplicatesAreNotDeliveredTwice() throws {
        var transport = NativeJingleTransport(owner: owner)
        _ = try transport.bind(peer: peer, sid: "call-1")
        let first = try XCTUnwrap(transport.receive(request(), now: 0).request)
        let waitingDuplicate = transport.receive(request(), now: 1)
        XCTAssertNil(waitingDuplicate.request)
        XCTAssertTrue(waitingDuplicate.frames.isEmpty)
        let reply = try transport.reply(first, rejection: nil, now: 2)
        let duplicate = transport.receive(request(), now: 3)
        XCTAssertNil(duplicate.request)
        XCTAssertEqual(duplicate.frames, [reply])
    }

    func testUnboundWrongPeerAndWrongSessionNeverReachConsumer() throws {
        var transport = NativeJingleTransport(owner: owner)
        XCTAssertTrue(transport.receive(request(), now: 0).frames.first?.contains("service-unavailable") == true)
        _ = try transport.bind(peer: peer, sid: "call-1")
        for xml in [request(sender: "other@localhost/device"), request(sid: "call-2"),
                    request(recipient: "local@localhost/other"), request(action: "unsupported")] {
            XCTAssertNil(transport.receive(xml, now: 0).request)
        }
    }

    func testSpoofedInitiatorAndResponderRejected() throws {
        var transport = NativeJingleTransport(owner: owner)
        let binding = try transport.bind(peer: peer, sid: "call-1")
        for (action, attribute) in [("session-initiate", "initiator"), ("session-accept", "responder")] {
            let forged = payload(action: action).replacingOccurrences(of: "/>", with: " \(attribute)='\(peer)'/>")
            XCTAssertThrowsError(try transport.prepare(binding: binding, xml: forged))
            let inbound = request(action: action).replacingOccurrences(of: "/>", with: " \(attribute)='\(owner)'/>")
            XCTAssertNil(transport.receive(inbound, now: 0).request)
        }
    }

    func testLogoutAndReplacementInvalidateOldRepliesAndCallbacks() throws {
        var transport = NativeJingleTransport(owner: owner)
        let first = try transport.bind(peer: peer, sid: "call-1")
        let incoming = try XCTUnwrap(transport.receive(request(), now: 0).request)
        let outgoing = try transport.prepare(binding: first, xml: payload())
        XCTAssertTrue(transport.unbind(UUID()).isEmpty)
        XCTAssertEqual(transport.unbind(first), [outgoing.identifier])
        let second = try transport.bind(peer: peer, sid: "call-2")
        XCTAssertNotEqual(first, second)
        XCTAssertThrowsError(try transport.reply(incoming, rejection: nil, now: 1))
        XCTAssertThrowsError(try transport.prepare(binding: first, xml: payload()))
        XCTAssertNil(transport.receive(result(outgoing.identifier), now: 1).completed)
        XCTAssertNil(transport.receive(request(), now: 1).request)
        XCTAssertNotNil(transport.receive(request(sid: "call-2"), now: 1).request)
    }

    func testBoundedPendingRequestsAndCancellation() throws {
        var transport = NativeJingleTransport(owner: owner)
        let binding = try transport.bind(peer: peer, sid: "call-1")
        var identifiers: [String] = []
        for _ in 0..<8 { identifiers.append(try transport.prepare(binding: binding, xml: payload()).identifier) }
        XCTAssertThrowsError(try transport.prepare(binding: binding, xml: payload()))
        transport.cancel(identifiers[0])
        XCTAssertNil(transport.receive(result(identifiers[0]), now: 1).completed)
        XCTAssertNoThrow(try transport.prepare(binding: binding, xml: payload()))
        for index in 0..<8 { XCTAssertNotNil(transport.receive(request(identifier: "request-\(index)"), now: 0).request) }
        let overflow = transport.receive(request(identifier: "overflow"), now: 1)
        XCTAssertNil(overflow.request)
        XCTAssertTrue(overflow.frames.first?.contains("resource-constraint") == true)
    }

    func testMonotonicIncomingDeadlineAndLateReply() throws {
        var transport = NativeJingleTransport(owner: owner)
        _ = try transport.bind(peer: peer, sid: "call-1")
        let incoming = try XCTUnwrap(transport.receive(request(), now: 100).request)
        XCTAssertTrue(transport.expire(now: 107.99).isEmpty)
        XCTAssertThrowsError(try transport.reply(incoming, rejection: nil, now: 108)) {
            XCTAssertEqual($0 as? NativeJingleFailure, .timedOut)
        }
        let expired = transport.expire(now: 108)
        XCTAssertEqual(expired.count, 1)
        XCTAssertTrue(expired[0].contains("service-unavailable"))
        XCTAssertTrue(transport.expire(now: 109).isEmpty)
        XCTAssertThrowsError(try transport.reply(incoming, rejection: nil, now: 109))
        XCTAssertEqual(transport.receive(request(), now: 110).frames, expired)
    }

    func testReplayMemoryIsBoundedWithoutReDeliveringOldRequests() throws {
        var transport = NativeJingleTransport(owner: owner)
        _ = try transport.bind(peer: peer, sid: "call-1")
        for index in 0..<256 {
            let incoming = try XCTUnwrap(transport.receive(request(identifier: "request-\(index)"), now: 0).request)
            _ = try transport.reply(incoming, rejection: nil, now: 1)
        }
        let overflow = transport.receive(request(identifier: "request-256"), now: 2)
        XCTAssertNil(overflow.request)
        XCTAssertTrue(overflow.frames.first?.contains("resource-constraint") == true)
        XCTAssertNil(transport.receive(request(identifier: "request-0"), now: 2).request)
    }

    func testMalformedXMLNamespacesAndInjectedStanzasRejected() throws {
        var transport = NativeJingleTransport(owner: owner)
        let binding = try transport.bind(peer: peer, sid: "call-1")
        for xml in [payload() + "<presence/>", payload().replacingOccurrences(of: "urn:xmpp:jingle:1", with: "urn:wrong"),
                    "<!DOCTYPE jingle><jingle/>", "<jingle", String(repeating: "a", count: 65537)] {
            XCTAssertThrowsError(try transport.prepare(binding: binding, xml: xml))
            XCTAssertNil(transport.receive(xml, now: 0).request)
        }
        XCTAssertThrowsError(try transport.prepare(binding: binding, xml: request()))
        XCTAssertNil(transport.receive(request(), now: .nan).request)
        XCTAssertTrue(transport.pending.isEmpty)
    }

    func testRequestCannotBeAnsweredThroughAnotherConnection() throws {
        var first = NativeJingleTransport(owner: owner)
        var second = NativeJingleTransport(owner: owner)
        _ = try first.bind(peer: peer, sid: "call-1")
        _ = try second.bind(peer: peer, sid: "call-1")
        let received = try XCTUnwrap(first.receive(request(), now: 0).request)
        XCTAssertThrowsError(try second.reply(received, rejection: nil, now: 1))
    }
}
