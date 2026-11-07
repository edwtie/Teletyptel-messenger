import XCTest
@testable import TeleTypTelCore

final class NativeChatTests: XCTestCase {
    private let peer = "peer@localhost"

    private func decode(_ xml: String) throws -> NativeChatEvent? {
        NativeChatCodec.decode(try ProbeXML.parse(xml), owner: "owner@localhost", boundJID: "owner@localhost/phone")
    }

    func testEncodingEscapesTextAndRoundTripsUnicode() throws {
        let body = "Hoi 👋 <tekst> & 'quotes' \"test\"\nTweede regel"
        let identifier = UUID().uuidString
        let xml = try NativeChatCodec.encode(to: peer, body: body, identifier: identifier)
        XCTAssertTrue(xml.contains("&lt;tekst&gt; &amp; &apos;quotes&apos;"))
        let root = try ProbeXML.parse(xml)
        XCTAssertEqual(root.attributes["to"], peer)
        XCTAssertEqual(root.attributes["id"], identifier)
        XCTAssertEqual(root.children.first?.text, body)
    }

    func testEncodingRejectsInvalidBodiesRecipientsAndIdentifiers() {
        for body in ["", " \n", "bad\u{0}text", String(repeating: "a", count: 8193)] {
            XCTAssertThrowsError(try NativeChatCodec.encode(to: peer, body: body, identifier: UUID().uuidString))
        }
        for recipient in ["localhost", "@localhost", "peer@", "peer@localhost/resource", "peer @localhost"] {
            XCTAssertThrowsError(try NativeChatCodec.encode(to: recipient, body: "Text", identifier: UUID().uuidString))
        }
        XCTAssertThrowsError(try NativeChatCodec.encode(to: peer, body: "Text", identifier: "'inject'"))
        XCTAssertNoThrow(try NativeChatCodec.encode(to: peer, body: String(repeating: "a", count: 8192), identifier: UUID().uuidString))
    }

    func testDecodeRequiresDirectMessageForThisAccount() throws {
        let xml = "<message xmlns='jabber:client' from='peer@localhost/tablet' to='owner@localhost/phone' type='chat' id='one'><body>Hallo</body></message>"
        guard case .message(let sender, let identifier, let body) = try XCTUnwrap(decode(xml)) else {
            return XCTFail("Expected a direct message")
        }
        XCTAssertEqual(sender, peer)
        XCTAssertEqual(identifier, "one")
        XCTAssertEqual(body, "Hallo")
        for changed in [xml.replacingOccurrences(of: "owner@localhost/phone", with: "other@localhost"),
                        xml.replacingOccurrences(of: "type='chat'", with: "type='groupchat'"),
                        xml.replacingOccurrences(of: "jabber:client", with: "urn:invalid"),
                        xml.replacingOccurrences(of: "peer@localhost/tablet", with: "owner@localhost/tablet"),
                        xml.replacingOccurrences(of: "<body>Hallo</body>", with: "<body><nested>Hallo</nested></body>")] {
            XCTAssertNil(try decode(changed))
        }
        XCTAssertNil(try decode("<message xmlns='jabber:client' from='peer@localhost'><received xmlns='urn:xmpp:carbons:2'><forwarded xmlns='urn:xmpp:forward:0'><message xmlns='jabber:client'><body>Not direct</body></message></forwarded></received></message>"))
    }

    func testDraftAndOutgoingStateAreNotDeliveryReceipts() throws {
        var store = NativeChatStore()
        store.setDraft("Een bericht", peer: peer)
        let message = try store.enqueue(peer: peer)
        XCTAssertNil(store.drafts[peer])
        XCTAssertEqual(store.messages.first?.state, .sending)
        store.finish(message.id, submitted: true)
        XCTAssertEqual(store.messages.first?.state, .submitted)
        XCTAssertTrue(NativeMessageState.submitted.label.contains("niet bevestigd"))
        store.receive(.rejected(peer: "other@localhost", identifier: message.id.uuidString))
        XCTAssertEqual(store.messages.first?.state, .submitted)
        store.receive(.rejected(peer: peer, identifier: message.id.uuidString))
        store.finish(message.id, submitted: true)
        XCTAssertEqual(store.messages.first?.state, .rejected)
    }

    func testServerErrorCorrelatesByPeerAndIdentifier() throws {
        let event = try XCTUnwrap(decode("<message xmlns='jabber:client' type='error' from='peer@localhost' id='message-id'><error type='cancel'/></message>"))
        guard case .rejected(let sender, let identifier) = event else { return XCTFail("Expected rejection") }
        XCTAssertEqual(sender, peer)
        XCTAssertEqual(identifier, "message-id")
        XCTAssertNil(try decode("<message xmlns='jabber:client' type='error' from='peer@localhost'><error type='cancel'/></message>"))
    }

    func testInterruptionPreservesUncertainTextAndIgnoresLateCompletion() throws {
        var store = NativeChatStore()
        store.setDraft("Bewaren", peer: peer)
        let message = try store.enqueue(peer: peer)
        store.interrupt()
        store.finish(message.id, submitted: true)
        XCTAssertEqual(store.messages.first?.state, .uncertain)
        XCTAssertEqual(store.messages.first?.body, "Bewaren")
        XCTAssertEqual(store.pendingCount, 0)
    }

    func testPendingLimitDoesNotEraseUnsentDraft() throws {
        var store = NativeChatStore()
        for index in 0..<8 {
            store.setDraft("Message \(index)", peer: peer)
            _ = try store.enqueue(peer: peer)
        }
        store.setDraft("Nog niet verstuurd", peer: peer)
        XCTAssertThrowsError(try store.enqueue(peer: peer)) {
            XCTAssertEqual($0 as? NativeChatFailure, .busy)
        }
        XCTAssertEqual(store.drafts[peer], "Nog niet verstuurd")
        XCTAssertEqual(store.pendingCount, 8)
    }

    func testDuplicateMessagesAreScopedToSender() {
        var store = NativeChatStore()
        store.receive(.message(peer: peer, identifier: "same", body: "Hallo"))
        store.receive(.message(peer: peer, identifier: "same", body: "Hallo"))
        store.receive(.message(peer: "other@localhost", identifier: "same", body: "Hallo"))
        XCTAssertEqual(store.messages.count, 2)
    }

    func testHistoryBoundPreservesUncertainMessage() throws {
        var store = NativeChatStore()
        store.setDraft("Bewaren", peer: peer)
        let message = try store.enqueue(peer: peer)
        store.finish(message.id, submitted: false)
        for index in 0..<220 { store.receive(.message(peer: peer, identifier: "\(index)", body: "Bericht \(index)")) }
        XCTAssertEqual(store.messages.count, 200)
        XCTAssertTrue(store.historyLimited)
        XCTAssertEqual(store.messages.first?.body, "Bewaren")
        XCTAssertEqual(store.messages.first?.state, .uncertain)
    }

    func testFullUncertainHistoryRefusesNewSendWithoutLosingDraft() throws {
        var store = NativeChatStore()
        for index in 0..<200 {
            store.setDraft("Bewaren \(index)", peer: peer)
            let message = try store.enqueue(peer: peer)
            store.finish(message.id, submitted: false)
        }
        store.setDraft("Nog niet verstuurd", peer: peer)
        XCTAssertThrowsError(try store.enqueue(peer: peer)) {
            XCTAssertEqual($0 as? NativeChatFailure, .historyFull)
        }
        XCTAssertEqual(store.messages.count, 200)
        XCTAssertEqual(store.drafts[peer], "Nog niet verstuurd")
    }
}
