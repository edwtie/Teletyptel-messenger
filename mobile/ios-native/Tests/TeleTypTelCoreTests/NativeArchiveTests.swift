import XCTest
@testable import TeleTypTelCore

final class NativeArchiveTests: XCTestCase {
    private let owner = "owner@localhost"
    private let peer = "peer@localhost"

    func testArchivedRetractionIsAnAuthorScopedChangeNotItsFallbackBody() throws {
        var query = try query()
        let xml = result(query).replacingOccurrences(of: "<body>Hallo 👋</body>", with: "<retract xmlns='urn:xmpp:message-retract:1' id='older'/><body>Untrusted fallback</body>")
        _ = try query.consume(xml)
        let archived = try XCTUnwrap(query.consume(fin(query)))
        XCTAssertEqual(archived.messages[0].change, .retract(target: "older"))
        XCTAssertEqual(archived.messages[0].body, "")
        XCTAssertFalse(archived.messages[0].outgoing)
        var bad = try self.query()
        let malformed = result(bad).replacingOccurrences(of: "<body>Hallo 👋</body>", with: "<retract xmlns='urn:xmpp:message-retract:1' id='older'/><retract xmlns='urn:xmpp:message-retract:1' id='older'/>")
        XCTAssertThrowsError(try bad.consume(malformed))
    }

    private func query(before: String? = nil) throws -> NativeArchiveQuery {
        try NativeArchiveQuery(owner: owner, boundJID: owner + "/phone", peer: peer, before: before)
    }

    private func result(_ query: NativeArchiveQuery, id: String = "a1", outgoing: Bool = false,
                        identifier: String = "original", body: String = "Hallo 👋") -> String {
        "<message xmlns='jabber:client' from='\(owner)' to='\(owner)/phone'>" +
        "<result xmlns='urn:xmpp:mam:2' queryid='\(query.queryID)' id='\(id)'>" +
        "<forwarded xmlns='urn:xmpp:forward:0'><delay xmlns='urn:xmpp:delay' stamp='2026-11-01T10:20:30.123Z'/>" +
        "<message xmlns='jabber:client' from='\(outgoing ? owner : peer)/other' to='\(outgoing ? peer : owner)/tablet' type='chat' id='\(identifier)'>" +
        "<body>\(body)</body></message></forwarded></result></message>"
    }

    private func fin(_ query: NativeArchiveQuery, first: String? = "a1", last: String? = "a1", complete: String = "true") -> String {
        let cursors = (first.map { "<first>\($0)</first>" } ?? "") + (last.map { "<last>\($0)</last>" } ?? "")
        return "<iq xmlns='jabber:client' from='\(owner)' id='\(query.identifier)' type='result'>" +
            "<fin xmlns='urn:xmpp:mam:2' complete='\(complete)'><set xmlns='http://jabber.org/protocol/rsm'>" + cursors + "</set></fin></iq>"
    }

    func testRequestIsOwnerScopedPeerFilteredBoundedAndRequestsLatestPage() throws {
        let query = try query()
        let root = try ProbeXML.parse(query.request)
        XCTAssertEqual(root.attributes["to"], owner)
        XCTAssertEqual(root.attributes["type"], "set")
        XCTAssertTrue(query.request.contains("<max>50</max><before></before>"))
        XCTAssertTrue(query.request.contains("<field var='with'><value>peer@localhost</value>"))
        XCTAssertTrue(query.request.contains("type='hidden'"))
        let previous = try self.query(before: "opaque<&'")
        XCTAssertTrue(previous.request.contains("opaque&lt;&amp;&apos;"))
        XCTAssertThrowsError(try NativeArchiveQuery(owner: owner, boundJID: "other@localhost/device", peer: peer))
        XCTAssertThrowsError(try self.query(before: String(repeating: "a", count: 513)))
        XCTAssertThrowsError(try self.query(before: "bad\u{0}id"))
    }

    func testAuthenticatedPagePreservesDirectionOriginalIdentityAndServerTime() throws {
        var query = try query()
        XCTAssertNil(try query.consume(result(query)))
        XCTAssertNil(try query.consume(result(query, id: "a2", outgoing: true)))
        let page = try XCTUnwrap(query.consume(fin(query, last: "a2")))
        XCTAssertEqual(page.owner, owner)
        XCTAssertEqual(page.peer, peer)
        XCTAssertEqual(page.messages.map(\.outgoing), [false, true])
        XCTAssertEqual(page.messages.map(\.archiveID), ["a1", "a2"])
        XCTAssertEqual(page.messages[0].identifier, "original")
        XCTAssertEqual(page.messages[0].body, "Hallo 👋")
        XCTAssertEqual(page.messages[0].date.timeIntervalSince1970, 1793528430.123, accuracy: 0.001)
        XCTAssertFalse(page.hasEarlier)
        XCTAssertNil(try query.consume(result(query)))
    }

    func testForeignSenderAndUnsolicitedQueriesCannotInjectHistoryOrFinishQuery() throws {
        var query = try query()
        let foreign = result(query).replacingOccurrences(of: "from='owner@localhost'", with: "from='attacker@localhost'")
        XCTAssertNil(try query.consume(foreign))
        XCTAssertNil(try query.consume(result(query).replacingOccurrences(of: query.queryID, with: "other-query")))
        XCTAssertNil(try query.consume(fin(query).replacingOccurrences(of: "from='owner@localhost'", with: "from='localhost'")))
        XCTAssertNil(try query.consume(result(query).replacingOccurrences(of: "to='owner@localhost/phone'", with: "to='other@localhost'")))
        let page = try XCTUnwrap(query.consume(fin(query, first: nil, last: nil)))
        XCTAssertTrue(page.messages.isEmpty)
    }

    func testMalformedCorrelatedPagesFailInsteadOfPartiallyImporting() throws {
        let mutations: [(String) -> String] = [
            { $0.replacingOccurrences(of: "peer@localhost/other", with: "stranger@localhost/other") },
            { $0.replacingOccurrences(of: "2026-11-01T10:20:30.123Z", with: "not-a-date") },
            { $0.replacingOccurrences(of: "urn:xmpp:forward:0", with: "urn:foreign") },
            { $0.replacingOccurrences(of: "<body>Hallo 👋</body>", with: "<body><fake>Nested</fake></body>") },
            { $0.replacingOccurrences(of: "<body>Hallo 👋</body>", with: "<body>" + String(repeating: "x", count: 8193) + "</body>") }
        ]
        for mutation in mutations {
            var query = try query()
            XCTAssertThrowsError(try query.consume(mutation(result(query))))
        }
        var duplicate = try query()
        _ = try duplicate.consume(result(duplicate))
        XCTAssertThrowsError(try duplicate.consume(result(duplicate)))
        var cursor = try query()
        _ = try cursor.consume(result(cursor))
        XCTAssertThrowsError(try cursor.consume(fin(cursor, first: "forged")))
        var unstable = try query()
        _ = try unstable.consume(result(unstable))
        XCTAssertThrowsError(try unstable.consume(fin(unstable).replacingOccurrences(of: "complete='true'", with: "stable='false'"))) {
            XCTAssertEqual($0 as? NativeArchiveFailure, .unstable)
        }
    }

    func testPageLimitErrorEmptyPageAndEarlierCursorAreExplicit() throws {
        var query = try query()
        for index in 0..<50 { _ = try query.consume(result(query, id: "a\(index)", identifier: "m\(index)")) }
        XCTAssertThrowsError(try query.consume(result(query, id: "overflow")))
        var unavailable = try self.query()
        XCTAssertThrowsError(try unavailable.consume("<iq xmlns='jabber:client' from='\(owner)' id='\(unavailable.identifier)' type='error'><error type='cancel'/></iq>")) {
            XCTAssertEqual($0 as? NativeArchiveFailure, .unavailable)
        }
        var empty = try self.query()
        XCTAssertTrue(try XCTUnwrap(empty.consume(fin(empty, first: nil, last: nil))).messages.isEmpty)
        var earlier = try self.query(before: "a2")
        _ = try earlier.consume(result(earlier))
        XCTAssertTrue(try XCTUnwrap(earlier.consume(fin(earlier, complete: "false"))).hasEarlier)
    }

    func testLiveAndArchiveDeduplicateInBothArrivalOrdersWithoutCreatingReadReceipts() throws {
        var query = try query()
        _ = try query.consume(result(query))
        let page = try XCTUnwrap(query.consume(fin(query)))
        var liveFirst = NativeChatStore()
        liveFirst.receive(.message(peer: peer, identifier: "original", body: "Hallo 👋"))
        let identity = try XCTUnwrap(liveFirst.messages.first?.id)
        try liveFirst.mergeArchive(page)
        try liveFirst.mergeArchive(page)
        XCTAssertEqual(liveFirst.messages.count, 1)
        XCTAssertEqual(liveFirst.messages[0].id, identity)
        XCTAssertEqual(liveFirst.messages[0].archiveID, "a1")
        XCTAssertEqual(liveFirst.messages[0].date, page.messages[0].date)
        var archiveFirst = NativeChatStore()
        try archiveFirst.mergeArchive(page)
        archiveFirst.receive(.message(peer: peer, identifier: "original", body: "Hallo 👋"))
        archiveFirst.receive(.archivedIdentity(peer: peer, identifier: nil, body: "Hallo 👋", archiveID: "a1"))
        XCTAssertEqual(archiveFirst.messages.count, 1)
        archiveFirst.setDraft("Nog niet verzonden", peer: peer)
        let outgoing = try archiveFirst.enqueue(peer: peer)
        archiveFirst.finish(outgoing.id, submitted: false)
        let archived = NativeArchivedText(archiveID: "a2", identifier: outgoing.stanzaID, peer: peer,
            body: outgoing.body, date: Date(), outgoing: true)
        try archiveFirst.mergeArchive(NativeArchivePage(owner: owner, peer: peer, messages: [archived], first: "a2", hasEarlier: false))
        XCTAssertEqual(archiveFirst.messages.first { $0.id == outgoing.id }?.state, .uncertain)
        XCTAssertTrue(NativeMessageState.submitted.label.contains("ontvangst niet bevestigd"))
    }

    func testDirectionAndPeerArePartOfDeduplicationAndConflictsDoNotReplaceText() throws {
        var query = try query()
        _ = try query.consume(result(query))
        _ = try query.consume(result(query, id: "a2", outgoing: true))
        let page = try XCTUnwrap(query.consume(fin(query, last: "a2")))
        var store = NativeChatStore()
        try store.mergeArchive(page)
        XCTAssertEqual(store.messages.count, 2)
        let snapshot = store
        let foreign = NativeArchivedText(archiveID: "a1", identifier: "original", peer: "other@localhost", body: "Forged", date: Date(), outgoing: false)
        XCTAssertThrowsError(try store.mergeArchive(NativeArchivePage(owner: owner, peer: foreign.peer, messages: [foreign], first: "a1", hasEarlier: false)))
        XCTAssertEqual(store, snapshot)
        let changed = NativeArchivedText(archiveID: "a1", identifier: "original", peer: peer, body: "Changed", date: Date(), outgoing: false)
        try store.mergeArchive(NativeArchivePage(owner: owner, peer: peer, messages: [changed], first: "a1", hasEarlier: false))
        XCTAssertEqual(store.messages.first?.body, "Hallo 👋")
    }

    func testTotalByteBudgetAndStableOrderingOfEqualServerTimestamps() throws {
        var budget = try query()
        let padding = "<extra xmlns='urn:fixture'>" + String(repeating: "x", count: 12000) + "</extra>"
        var rejected = false
        for index in 0..<50 {
            let frame = result(budget, id: "large-\(index)", identifier: "m\(index)")
                .replacingOccurrences(of: "</body>", with: "</body>" + padding)
            do { _ = try budget.consume(frame) }
            catch {
                XCTAssertEqual(error as? NativeArchiveFailure, .invalidResponse)
                rejected = true
                break
            }
        }
        XCTAssertTrue(rejected)
        var ordered = try query()
        for index in 0..<50 { _ = try ordered.consume(result(ordered, id: "ordered-\(index)", identifier: "m\(index)")) }
        let page = try XCTUnwrap(ordered.consume(fin(ordered, first: "ordered-0", last: "ordered-49")))
        var store = NativeChatStore()
        try store.mergeArchive(page)
        XCTAssertEqual(store.messages.map(\.stanzaID), (0..<50).map { "m\($0)" })
        try store.mergeArchive(page)
        XCTAssertEqual(store.messages.map(\.stanzaID), (0..<50).map { "m\($0)" })
    }

    func testArchivedPageCannotEvictUncertainSendsOrExceedSessionBound() throws {
        var store = NativeChatStore()
        store.setDraft("Onzekere verzending bewaren", peer: peer)
        let uncertain = try store.enqueue(peer: peer)
        store.finish(uncertain.id, submitted: false)
        for index in 0..<199 { store.receive(.message(peer: peer, identifier: "live-\(index)", body: "Live")) }
        var query = try query()
        for index in 0..<50 { _ = try query.consume(result(query, id: "archive-\(index)", identifier: "old-\(index)")) }
        try store.mergeArchive(XCTUnwrap(query.consume(fin(query, first: "archive-0", last: "archive-49"))))
        XCTAssertEqual(store.messages.count, 200)
        XCTAssertTrue(store.historyLimited)
        XCTAssertEqual(store.messages.first(where: { $0.id == uncertain.id })?.state, .uncertain)
        XCTAssertEqual(store.messages.first(where: { $0.id == uncertain.id })?.body, "Onzekere verzending bewaren")
    }

    func testOnlyOwnerAttributedStableIDsAreUsedForLiveMessages() throws {
        let xml = "<message xmlns='jabber:client' from='peer@localhost/mobile' to='owner@localhost/phone'><body>Hello</body><stanza-id xmlns='urn:xmpp:sid:0' by='owner@localhost' id='stable'/></message>"
        let event = try XCTUnwrap(NativeChatCodec.decode(ProbeXML.parse(xml), owner: owner, boundJID: owner + "/phone"))
        guard case .archivedIdentity(_, _, _, let identifier) = event else { return XCTFail("Expected stable archive ID") }
        XCTAssertEqual(identifier, "stable")
        let foreign = xml.replacingOccurrences(of: "by='owner@localhost'", with: "by='peer@localhost'")
        guard case .message = try XCTUnwrap(NativeChatCodec.decode(ProbeXML.parse(foreign), owner: owner, boundJID: owner + "/phone")) else {
            return XCTFail("Foreign stable ID must be ignored")
        }
    }
}
