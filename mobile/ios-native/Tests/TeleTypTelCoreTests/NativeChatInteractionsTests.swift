import XCTest
@testable import TeleTypTelCore

final class NativeChatInteractionsTests: XCTestCase {
    private let peer = "peer@localhost"
    private func decode(_ payload: String, from: String = "peer@localhost/device", to: String = "owner@localhost/phone") throws -> NativeChatEvent? {
        NativeChatCodec.decode(try ProbeXML.parse("<message xmlns='jabber:client' type='chat' from='\(from)' to='\(to)' id='event'>\(payload)</message>"), owner: "owner@localhost", boundJID: "owner@localhost/phone")
    }
    private func sent(_ store: inout NativeChatStore) throws -> NativeChatMessage {
        let message = try store.enqueueBody("Fictieve tekst", peer: peer)
        store.finish(message.id, submitted: true)
        return message
    }
    func testReactionsAndReceiptsRoundTripWithoutBodiesOrReceiptLoops() throws {
        for value in [NativeChatInteraction.reactions(target: "original<&'", values: ["👍", "❤️"]), .reactions(target: "original", values: []),
                      .receipt(target: "original", displayed: false), .receipt(target: "original", displayed: true)] {
            let root = try ProbeXML.parse(NativeInteractionCodec.encode(to: peer, interaction: value, identifier: UUID().uuidString))
            XCTAssertEqual(NativeInteractionCodec.decode(root), value)
            XCTAssertFalse(root.children.contains { ["body", "request", "markable"].contains($0.name) })
        }
    }
    func testMalformedAndForeignInteractionsAreNotFallbackMessages() throws {
        let valid = "<reactions xmlns='urn:xmpp:reactions:0' id='original'><reaction>👍</reaction></reactions>"
        for payload in [valid + valid, valid.replacingOccurrences(of: "👍", with: "plain text"),
                        valid.replacingOccurrences(of: "</reaction>", with: "</reaction><reaction>👍</reaction>"),
                        "<received xmlns='urn:xmpp:receipts' id='original'><nested/></received>",
                        "<received xmlns='urn:xmpp:chat-markers:0' id='original'/>",
                        "<acknowledged xmlns='urn:xmpp:chat-markers:0' id='original'/>",
                        valid + "<replace xmlns='urn:xmpp:message-correct:0' id='original'/>"] {
            XCTAssertNil(try decode(payload + "<body>Must not render</body>"))
        }
        XCTAssertNil(try decode(valid, from: "owner@localhost/other"))
        XCTAssertNil(try decode(valid, to: "stranger@localhost"))
    }
    func testEmojiBoundsAndGroupDeliveryReceiptAreRejected() throws {
        for values in [["👍", "👍"], ["AB"], ["\n"], Array(repeating: "👍", count: 17)] {
            XCTAssertThrowsError(try NativeInteractionCodec.encode(to: peer, interaction: .reactions(target: "original", values: values), identifier: UUID().uuidString))
        }
        XCTAssertThrowsError(try NativeInteractionCodec.encode(to: peer, interaction: .receipt(target: "original", displayed: false), identifier: UUID().uuidString, group: true))
    }
    func testReceiptsRequireExactPeerTargetAndNeverDowngradeReadStatus() throws {
        var store = NativeChatStore()
        let message = try sent(&store)
        store.receive(.interaction(peer: "stranger@localhost", identifier: "fake", value: .receipt(target: message.stanzaID!, displayed: true)))
        store.receive(.interaction(peer: peer, identifier: "missing", value: .receipt(target: "unknown", displayed: true)))
        XCTAssertEqual(store.messages[0].delivery, .unconfirmed)
        store.receive(.interaction(peer: peer, identifier: "received", value: .receipt(target: message.stanzaID!, displayed: false)))
        XCTAssertEqual(store.messages[0].delivery, .delivered)
        store.receive(.interaction(peer: peer, identifier: "displayed", value: .receipt(target: message.stanzaID!, displayed: true)))
        store.receive(.interaction(peer: peer, identifier: "late", value: .receipt(target: message.stanzaID!, displayed: false)))
        XCTAssertEqual(store.messages[0].delivery, .displayed)
        XCTAssertEqual(store.messages.count, 1)
    }
    func testDisplayedRangeDoesNotMarkIncomingOrAnotherConversation() throws {
        var store = NativeChatStore()
        _ = try sent(&store)
        store.receive(.message(peer: peer, identifier: "incoming", body: "Hoi"))
        let other = try store.enqueueBody("Ander gesprek", peer: "other@localhost")
        store.finish(other.id, submitted: true)
        let latest = try sent(&store)
        store.receive(.interaction(peer: peer, identifier: "displayed", value: .receipt(target: latest.stanzaID!, displayed: true)))
        XCTAssertEqual(store.messages.map(\.delivery), [.displayed, .unconfirmed, .unconfirmed, .displayed])
    }
    func testReactionsReplaceWholeActorSetAndEmptyRemoves() throws {
        var store = NativeChatStore()
        let message = try sent(&store)
        for values in [["👍", "❤️"], ["😂"], []] {
            store.receive(.interaction(peer: peer, identifier: UUID().uuidString, value: .reactions(target: message.stanzaID!, values: values)))
            XCTAssertEqual(store.messages[0].reactions[peer], values.isEmpty ? nil : values.sorted())
        }
        store.receive(.interaction(peer: "stranger@localhost", identifier: "fake", value: .reactions(target: message.stanzaID!, values: ["👍"])))
        XCTAssertTrue(store.messages[0].reactions.isEmpty)
    }
    func testReadMarkersAreOptInAndArchivedMessagesDoNotCauseDeliveryStorm() throws {
        var store = NativeChatStore()
        store.receive(.trackedMessage(peer: peer, identifier: "one", body: "Hoi", receipt: true, markable: true, archiveID: nil))
        let identifier = store.messages[0].id
        XCTAssertNil(store.takeReceipt(identifier, displayed: true))
        XCTAssertNotNil(store.takeReceipt(identifier, displayed: false))
        XCTAssertNil(store.takeReceipt(identifier, displayed: false))
        store.preferences.sendDisplayed = true
        XCTAssertNotNil(store.takeReceipt(identifier, displayed: true))
        XCTAssertNil(store.takeReceipt(identifier, displayed: true))
        try store.mergeArchive(NativeArchivePage(owner: "owner@localhost", peer: peer, messages: [
            NativeArchivedText(archiveID: "archive", identifier: "old", peer: peer, body: "Oud", date: Date(), outgoing: false, markable: true)
        ], first: "archive", hasEarlier: false))
        let archived = try XCTUnwrap(store.messages.first { $0.stanzaID == "old" })
        XCTAssertNil(store.takeReceipt(archived.id, displayed: false))
    }
    func testLateReactionSuccessAfterDisconnectOrDeletionDoesNotRestoreContent() throws {
        var store = NativeChatStore()
        let message = try sent(&store)
        let (_, request) = try store.beginReaction(message.id)
        store.interrupt()
        store.finishReaction(message.id, request: request, actor: "owner@localhost", values: ["👍"], submitted: true)
        XCTAssertTrue(store.messages[0].reactions.isEmpty)
        try store.hide(message.id)
        store.receive(.interaction(peer: peer, identifier: "late", value: .reactions(target: message.stanzaID!, values: ["👍"])))
        XCTAssertTrue(store.messages[0].reactions.isEmpty)
        XCTAssertEqual(store.messages[0].body, "")
    }
}
