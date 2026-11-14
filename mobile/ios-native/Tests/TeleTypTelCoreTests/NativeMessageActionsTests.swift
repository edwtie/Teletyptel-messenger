import XCTest
@testable import TeleTypTelCore

final class NativeMessageActionsTests: XCTestCase {
    private let peer = "peer@localhost"
    private func decode(_ payload: String, from: String = "peer@localhost/device", to: String = "owner@localhost/phone", identifier: String = "change-1") throws -> NativeChatEvent? {
        NativeChatCodec.decode(try ProbeXML.parse("<message xmlns='jabber:client' type='chat' from='\(from)' to='\(to)' id='\(identifier)'>\(payload)</message>"), owner: "owner@localhost", boundJID: "owner@localhost/phone")
    }
    private func submitted(_ store: inout NativeChatStore, body: String = "Origineel") throws -> NativeChatMessage {
        let message = try store.enqueueBody(body, peer: peer)
        store.finish(message.id, submitted: true)
        return message
    }
    private func page(_ messages: [NativeArchivedText]) -> NativeArchivePage {
        NativeArchivePage(owner: "owner@localhost", peer: peer, messages: messages, first: messages.first?.archiveID, hasEarlier: false)
    }

    func testCodecEscapesAndDistinguishesCorrectionsAndRetractions() throws {
        let request = UUID().uuidString
        for change in [NativeMessageChange.correct(target: "original<&'", body: "Nieuwe tekst 👋 <&>"), .retract(target: "original<&'")] {
            let xml = try NativeMessageActionCodec.encode(to: peer, change: change, identifier: request)
            let root = try ProbeXML.parse(xml)
            XCTAssertEqual(root.attributes["type"], "chat")
            XCTAssertEqual(root.attributes["to"], peer)
            XCTAssertEqual(NativeMessageActionCodec.decode(root), change)
            XCTAssertTrue(xml.contains("original&lt;&amp;&apos;"))
        }
        XCTAssertThrowsError(try NativeMessageActionCodec.encode(to: "peer@localhost/resource", change: .retract(target: "one"), identifier: request))
        XCTAssertThrowsError(try NativeMessageActionCodec.encode(to: peer, change: .correct(target: "one", body: ""), identifier: request))
        XCTAssertThrowsError(try NativeMessageActionCodec.encode(to: peer, change: .retract(target: ""), identifier: request))
        XCTAssertThrowsError(try NativeMessageActionCodec.encode(to: peer, change: .retract(target: "one"), identifier: "not-uuid"))
    }

    func testDecoderRejectsAmbiguousForeignAndNestedChangesWithoutShowingFallback() throws {
        let retract = "<retract xmlns='urn:xmpp:message-retract:1' id='original'/>"
        guard case .change(let author, let identifier, .retract(let target)) = try XCTUnwrap(decode(retract + "<body>Untrusted fallback</body>")) else { return XCTFail("Missing retraction") }
        XCTAssertEqual(author, peer); XCTAssertEqual(identifier, "change-1"); XCTAssertEqual(target, "original")
        for payload in [retract + retract, retract + "<replace xmlns='urn:xmpp:message-correct:0' id='original'/>",
                        "<retract xmlns='urn:xmpp:message-retract:1' id='original'><nested/></retract>",
                        "<replace xmlns='urn:xmpp:message-correct:0' id='original'/><body>One</body><body>Two</body>"] {
            XCTAssertNil(try decode(payload))
        }
        XCTAssertNil(try decode(retract, to: "stranger@localhost"))
        XCTAssertNil(try decode(retract, from: "owner@localhost/other"))
        XCTAssertNil(try decode(retract, identifier: "original"))
    }

    func testOnlyMatchingAuthorAndDirectionCanChangeTextAndReplayCannotUndoEdit() throws {
        var store = NativeChatStore()
        let outgoing = try submitted(&store)
        store.receive(.message(peer: peer, identifier: "original", body: "Oude tekst"))
        store.receive(.change(peer: "stranger@localhost", identifier: "bad", change: .correct(target: "original", body: "Onjuist")))
        store.receive(.change(peer: peer, identifier: "bad-own", change: .retract(target: outgoing.stanzaID!)))
        XCTAssertEqual(store.messages.first?.body, "Origineel")
        XCTAssertEqual(store.messages.last(where: { $0.peer == peer })?.body, "Oude tekst")
        store.receive(.change(peer: peer, identifier: "edit-1", change: .correct(target: "original", body: "Nieuwe tekst")))
        store.receive(.change(peer: peer, identifier: "edit-2", change: .correct(target: "edit-1", body: "Laatste tekst")))
        store.receive(.change(peer: peer, identifier: "edit-1", change: .correct(target: "original", body: "Nieuwe tekst")))
        store.receive(.message(peer: peer, identifier: "original", body: "Oude tekst"))
        XCTAssertEqual(store.messages.filter { $0.peer == peer }.count, 2)
        XCTAssertEqual(store.messages.last(where: { $0.peer == peer })?.body, "Laatste tekst")
        XCTAssertTrue(store.messages.last(where: { $0.peer == peer })?.edited == true)
        store.receive(.change(peer: peer, identifier: "retract-1", change: .retract(target: "original")))
        XCTAssertTrue(store.messages.last(where: { $0.peer == peer })?.retracted == true)
        XCTAssertEqual(store.messages.last(where: { $0.peer == peer })?.body, "")
        XCTAssertEqual(store.messages.last(where: { $0.peer == "stranger@localhost" })?.body, "Onjuist")
    }

    func testLocalDeleteDoesNotSendRetractionOrResurrectOnArchiveMerge() throws {
        var store = NativeChatStore()
        let message = try submitted(&store)
        try store.hide(message.id)
        XCTAssertTrue(store.messages[0].hidden)
        XCTAssertFalse(store.messages[0].retracted)
        XCTAssertNil(store.messages[0].actionRequestID)
        try store.mergeArchive(page([NativeArchivedText(archiveID: "archived", identifier: message.stanzaID, peer: peer, body: message.body, date: Date(), outgoing: true)]))
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertTrue(store.messages[0].hidden)
        XCTAssertEqual(store.messages[0].body, "")
    }

    func testOnlyLastOwnSubmittedMessageIsEditableAndFailureDoesNotRewriteOriginal() throws {
        var store = NativeChatStore()
        let first = try submitted(&store)
        let last = try submitted(&store, body: "Laatste")
        XCTAssertFalse(store.canCorrect(first.id)); XCTAssertTrue(store.canRetract(first.id))
        XCTAssertTrue(store.canCorrect(last.id))
        let (_, correction, request) = try store.beginChange(last.id, correctedBody: "Gecorrigeerd")
        XCTAssertFalse(store.canCorrect(last.id))
        store.finishChange(last.id, change: correction, request: request, submitted: false)
        XCTAssertEqual(store.messages.last?.body, "Laatste")
        XCTAssertTrue(store.messages.last?.actionNotice?.contains("onzeker") == true)
        let (_, retry, next) = try store.beginChange(last.id, correctedBody: "Gecorrigeerd")
        store.finishChange(last.id, change: retry, request: next, submitted: true)
        XCTAssertEqual(store.messages.last?.body, "Gecorrigeerd")
        XCTAssertTrue(store.messages.last?.actionNotice?.contains("niet bevestigd") == true)
        XCTAssertEqual(store.messages.last?.stanzaID, next)
    }

    func testDisconnectedOrRejectedChangeCannotBeCompletedByLateSuccess() throws {
        var store = NativeChatStore()
        let first = try submitted(&store)
        let (_, retract, request) = try store.beginChange(first.id, correctedBody: nil)
        store.receive(.rejected(peer: peer, identifier: request))
        store.finishChange(first.id, change: retract, request: request, submitted: true)
        XCTAssertFalse(store.messages[0].retracted)
        XCTAssertEqual(store.messages[0].state, .submitted)
        let (_, again, next) = try store.beginChange(first.id, correctedBody: nil)
        store.interrupt()
        store.finishChange(first.id, change: again, request: next, submitted: true)
        XCTAssertFalse(store.messages[0].retracted)
        XCTAssertFalse(store.messages[0].actionPending)
    }

    func testLateErrorForAnEarlierEditDoesNotRejectTheOriginalSend() throws {
        var store = NativeChatStore()
        let message = try submitted(&store)
        let (_, edit, identifier) = try store.beginChange(message.id, correctedBody: "Nieuw")
        store.finishChange(message.id, change: edit, request: identifier, submitted: true)
        let (_, retract, request) = try store.beginChange(message.id, correctedBody: nil)
        store.receive(.rejected(peer: peer, identifier: identifier))
        XCTAssertEqual(store.messages[0].state, .submitted)
        XCTAssertTrue(store.messages[0].actionPending)
        store.receive(.rejected(peer: peer, identifier: message.id.uuidString))
        store.finishChange(message.id, change: retract, request: request, submitted: true)
        XCTAssertEqual(store.messages[0].state, .rejected)
        XCTAssertFalse(store.messages[0].retracted)
    }

    func testForwardEnqueuePreservesDraftAndEditsRemainBounded() throws {
        var store = NativeChatStore()
        store.setDraft("Mijn concept", peer: peer)
        let message = try submitted(&store, body: "Doorgestuurd:\nOrigineel")
        XCTAssertEqual(store.drafts[peer], "Mijn concept")
        for edit in 0..<16 {
            let (_, change, request) = try store.beginChange(message.id, correctedBody: "Correctie \(edit)")
            store.finishChange(message.id, change: change, request: request, submitted: true)
        }
        XCTAssertEqual(store.messages[0].previousIDs.count, 16)
        XCTAssertFalse(store.canCorrect(message.id))
        XCTAssertThrowsError(try store.beginChange(message.id, correctedBody: "Meer"))
    }

    func testRetractionBeforeOriginalAndArchivedChangesAcrossPagesStayAuthorScoped() throws {
        var store = NativeChatStore()
        store.receive(.change(peer: peer, identifier: "retract-1", change: .retract(target: "late")))
        store.receive(.message(peer: peer, identifier: "late", body: "Niet tonen"))
        XCTAssertTrue(store.messages[0].retracted)
        let time = Date().addingTimeInterval(10)
        let correction = NativeArchivedText(archiveID: "a2", identifier: "edit-1", peer: peer, body: "", date: time, outgoing: false, change: .correct(target: "original", body: "Nieuw"))
        let retraction = NativeArchivedText(archiveID: "a3", identifier: "retract-2", peer: peer, body: "", date: time.addingTimeInterval(1), outgoing: false, change: .retract(target: "edit-1"))
        try store.mergeArchive(page([correction, retraction]))
        XCTAssertEqual(store.messages.count, 2)
        let original = NativeArchivedText(archiveID: "a1", identifier: "original", peer: peer, body: "Oud", date: time.addingTimeInterval(-1), outgoing: false)
        try store.mergeArchive(page([original]))
        try store.mergeArchive(page([original, correction, retraction]))
        XCTAssertEqual(store.messages.count, 2)
        XCTAssertTrue(store.messages.last?.retracted == true)
        XCTAssertEqual(store.messages.last?.body, "")
        XCTAssertTrue(store.messages.last?.edited == true)
    }

    func testCorrectionWithoutLoadedOriginalIsVisibleAndLaterOriginalDoesNotDuplicateIt() throws {
        var store = NativeChatStore()
        store.receive(.change(peer: peer, identifier: "edit", change: .correct(target: "missing", body: "Nieuwe tekst")))
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].body, "Nieuwe tekst")
        XCTAssertTrue(store.messages[0].edited)
        store.receive(.message(peer: peer, identifier: "missing", body: "Oude tekst"))
        XCTAssertEqual(store.messages.count, 1)
        store.receive(.change(peer: peer, identifier: "retract", change: .retract(target: "missing")))
        XCTAssertTrue(store.messages[0].retracted)
    }

    func testRetractionAfterEditingTargetsRootAndArchivedCorrectionCannotResurrectIt() throws {
        var store = NativeChatStore()
        let message = try submitted(&store)
        let (_, edit, identifier) = try store.beginChange(message.id, correctedBody: "Gecorrigeerd")
        store.finishChange(message.id, change: edit, request: identifier, submitted: true)
        let (_, retract, request) = try store.beginChange(message.id, correctedBody: nil)
        XCTAssertEqual(retract, .retract(target: message.stanzaID!))
        store.finishChange(message.id, change: retract, request: request, submitted: true)
        XCTAssertTrue(store.messages[0].retracted)
        var restored = NativeChatStore()
        let time = Date()
        try restored.mergeArchive(page([
            NativeArchivedText(archiveID: "edit", identifier: identifier, peer: peer, body: "", date: time, outgoing: false,
                change: .correct(target: message.stanzaID!, body: "Gecorrigeerd")),
            NativeArchivedText(archiveID: "retract", identifier: request, peer: peer, body: "", date: time.addingTimeInterval(1), outgoing: false,
                change: .retract(target: message.stanzaID!))
        ]))
        XCTAssertEqual(restored.messages.count, 1)
        XCTAssertTrue(restored.messages[0].retracted)
        XCTAssertEqual(restored.messages[0].body, "")
    }

    func testCapabilityDiscoveryIsScopedAndAdvertisesBothActions() throws {
        let request = "<iq xmlns='jabber:client' from='peer@localhost/device' to='owner@localhost/phone' type='get' id='info'><query xmlns='http://jabber.org/protocol/disco#info'/></iq>"
        let reply = try XCTUnwrap(NativeMessageActionCodec.discovery(try ProbeXML.parse(request), owner: "owner@localhost", bound: "owner@localhost/phone"))
        XCTAssertTrue(reply.contains("type='result'"))
        XCTAssertTrue(reply.contains("urn:xmpp:message-correct:0"))
        XCTAssertTrue(reply.contains("urn:xmpp:message-retract:1"))
        XCTAssertTrue(NativeMessageActionCodec.presence.contains(NativeMessageActionCodec.verification))
        for invalid in [request.replacingOccurrences(of: "to='owner@localhost/phone'", with: "to='other@localhost'"),
                        request.replacingOccurrences(of: "disco#info'/>", with: "disco#info' node='unknown'/>"),
                        request.replacingOccurrences(of: "from='peer@localhost/device'", with: "from='invalid'")] {
            XCTAssertNil(NativeMessageActionCodec.discovery(try ProbeXML.parse(invalid), owner: "owner@localhost", bound: "owner@localhost/phone"))
        }
    }

    func testAvatarAcceptsOnlyBoundedRasterDataAndValidProfile() {
        XCTAssertEqual(NativePublicAvatar.initials("Edward Tie"), "ET")
        XCTAssertEqual(NativePublicAvatar.initials("Dovengroep"), "DO")
        XCTAssertEqual(NativePublicAvatar.initials("  "), "?")
        let png = Data([137, 80, 78, 71, 13, 10, 26, 10])
        let profile = NativePublicAvatar(jid: peer, displayName: "Fictieve gebruiker", avatarColor: "#2563eb", avatarDataUrl: "data:image/png;base64," + png.base64EncodedString())
        XCTAssertTrue(profile.valid); XCTAssertEqual(profile.imageData, png)
        for url in ["https://foreign.invalid/photo.png", "data:image/svg+xml;base64," + png.base64EncodedString(),
                    "data:image/jpeg;base64," + png.base64EncodedString(), "data:image/png;base64,!invalid"] {
            XCTAssertNil(NativePublicAvatar(jid: peer, displayName: "Naam", avatarColor: "#ffffff", avatarDataUrl: url).imageData)
        }
        XCTAssertFalse(NativePublicAvatar(jid: peer, displayName: "Naam", avatarColor: "javascript:bad", avatarDataUrl: "").valid)
        XCTAssertFalse(NativePublicAvatar(jid: peer, displayName: String(repeating: "a", count: 121), avatarColor: "#ffffff", avatarDataUrl: "").valid)
        XCTAssertNil(NativePublicAvatar(jid: peer, displayName: "Naam", avatarColor: "#ffffff", avatarDataUrl: "data:image/png;base64," + Data(repeating: 0, count: 393217).base64EncodedString()).imageData)
    }
}
