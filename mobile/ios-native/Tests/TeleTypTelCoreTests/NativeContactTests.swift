import XCTest
@testable import TeleTypTelCore

private actor ContactSenderFixture: NativeContactManaging {
    var calls = 0
    var subscription = false
    var fail = false
    var responses: [Bool] = []
    init(fail: Bool = false) { self.fail = fail }
    func addContact(jid: String, name: String, requestPresence: Bool) async throws {
        calls += 1; subscription = requestPresence
        if fail { throw NativeContactFailure.timedOut }
    }
    func observeContactRequests(_ observer: @escaping @Sendable ([String]) -> Void) async { observer(["peer@localhost"]) }
    func respondToContactRequest(jid: String, allow: Bool) async throws { responses.append(allow) }
}

final class NativeContactTests: XCTestCase {
    func testNewContactDoesNotRenameExistingContactsOrExceedRosterCapacity() {
        let contact = NativeContact(jid: "peer@localhost", name: "Existing", groups: [], subscription: "none")
        XCTAssertFalse(NativeContactEditing.canAdd("PEER@localhost", roster: .ready([contact])))
        XCTAssertTrue(NativeContactEditing.canAdd("new@localhost", roster: .ready([contact])))
        XCTAssertFalse(NativeContactEditing.canAdd("new@localhost", roster: .loading))
        let full = (0..<100).map { NativeContact(jid: "peer\($0)@localhost", name: "Existing", groups: [], subscription: "none") }
        XCTAssertFalse(NativeContactEditing.canAdd("new@localhost", roster: .ready(full)))
    }
    func testRosterSetEscapesFieldsAndDoesNotGrantSubscription() throws {
        let xml = try NativeContactEditing.request(jid: "peer@localhost", name: "Naam <&'", owner: "owner@localhost", identifier: "contact-test")
        let root = try ProbeXML.parse(xml)
        XCTAssertEqual(root.attributes["type"], "set")
        XCTAssertEqual(root.children.first?.namespace, "jabber:iq:roster")
        XCTAssertEqual(root.children.first?.children.first?.attributes["name"], "Naam <&'")
        XCTAssertNil(root.children.first?.children.first?.attributes["subscription"])
        XCTAssertFalse(xml.contains("<presence"))
        for address in ["owner@localhost", "OWNER@localhost", "peer@localhost/device", "name", "bad\n@localhost"] {
            XCTAssertThrowsError(try NativeContactEditing.request(jid: address, name: "Name", owner: "owner@localhost", identifier: "contact-test"))
        }
        XCTAssertFalse(NativeContactEditing.valid(jid: "peer@localhost", name: String(repeating: "👋", count: 31), owner: "owner@localhost"))
        XCTAssertFalse(NativeContactEditing.valid(jid: "peer@localhost", name: "bad\u{FFFF}", owner: "owner@localhost"))
    }
    func testOnlyBoundServerAcknowledgementCanConfirmAnEdit() throws {
        func reply(_ attributes: String) throws -> Bool? {
            NativeContactEditing.response(try ProbeXML.parse("<iq xmlns='jabber:client' \(attributes)/>"), identifier: "edit-1", owner: "owner@localhost", bound: "owner@localhost/phone")
        }
        XCTAssertEqual(try reply("id='edit-1' type='result'"), true)
        XCTAssertEqual(try reply("id='edit-1' type='result' from='localhost' to='owner@localhost/phone'"), true)
        XCTAssertEqual(try reply("id='edit-1' type='error' from='owner@localhost'"), false)
        XCTAssertNil(try reply("id='edit-1' type='result' from='stranger@localhost'"))
        XCTAssertNil(try reply("id='edit-1' type='result' to='other@localhost/device'"))
        XCTAssertNil(try reply("id='old-edit' type='result'"))
        XCTAssertNil(try reply("id='edit-1' type='set'"))
    }
    func testSubscriptionRequestsMustTargetThisAccountAndCannotBeSelfOrResource() throws {
        func peer(_ attributes: String) throws -> String? {
            NativeContactEditing.subscriptionRequest(try ProbeXML.parse("<presence xmlns='jabber:client' type='subscribe' \(attributes)/>"), owner: "owner@localhost", bound: "owner@localhost/phone")
        }
        XCTAssertEqual(try peer("from='peer@localhost' to='owner@localhost'"), "peer@localhost")
        XCTAssertNil(try peer("from='owner@localhost'"))
        XCTAssertNil(try peer("from='peer@localhost/device'"))
        XCTAssertNil(try peer("from='peer@localhost' to='stranger@localhost'"))
    }
    @MainActor func testIncomingRequestNeedsExplicitResponse() async throws {
        let sender = ContactSenderFixture(), model = NativeContactRequests()
        model.configure(sender)
        for _ in 0..<100 where model.peers.isEmpty { try await Task.sleep(nanoseconds: 1_000_000) }
        XCTAssertEqual(model.peers, ["peer@localhost"])
        let before = await sender.responses
        XCTAssertTrue(before.isEmpty)
        await model.respond("unknown@localhost", allow: true)
        await model.respond("peer@localhost", allow: false)
        let after = await sender.responses
        XCTAssertEqual(after, [false]); XCTAssertTrue(model.peers.isEmpty)
        model.detach()
    }
    @MainActor func testEditorWaitsForSenderAndNeverDuplicatesSave() async throws {
        let sender = ContactSenderFixture(), model = NativeContactEditor()
        model.add(jid: "peer@localhost", name: "Peer", requestPresence: false, owner: "owner@localhost", sender: sender)
        model.add(jid: "peer@localhost", name: "Peer", requestPresence: true, owner: "owner@localhost", sender: sender)
        for _ in 0..<100 where model.busy { try await Task.sleep(nanoseconds: 1_000_000) }
        XCTAssertTrue(model.saved); XCTAssertFalse(model.busy)
        let calls = await sender.calls, requested = await sender.subscription
        XCTAssertEqual(calls, 1); XCTAssertFalse(requested)
        model.detach(); XCTAssertFalse(model.saved)
    }
    @MainActor func testUnconfirmedEditIsNotSuccessOrAutomaticallyRetried() async throws {
        let sender = ContactSenderFixture(fail: true), model = NativeContactEditor()
        model.add(jid: "peer@localhost", name: "Peer", requestPresence: true, owner: "owner@localhost", sender: sender)
        for _ in 0..<100 where model.busy { try await Task.sleep(nanoseconds: 1_000_000) }
        XCTAssertFalse(model.saved); XCTAssertTrue(model.notice?.contains("Niet bevestigd") == true)
        let calls = await sender.calls
        XCTAssertEqual(calls, 1)
        model.detach()
    }
}
