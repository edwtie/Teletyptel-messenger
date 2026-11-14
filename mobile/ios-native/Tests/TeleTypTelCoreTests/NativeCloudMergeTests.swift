import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeCloudMergeTests: XCTestCase {
    private let owner = "owner@localhost"
    private let peer = "peer@localhost"
    private let room = "room@conference.localhost"

    private func record(_ identifier: String, peer: String? = nil, kind: String = "contact", own: Bool = false,
                        sender: String? = nil, text: String = "Cloud text", ordinal: Int = 0,
                        edited: Bool = false, retracted: Bool = false, delivery: String = "",
                        reactions: [String: [String]] = [:]) -> NativeCloudMessage {
        let target = peer ?? self.peer
        return NativeCloudMessage(fields: [
            "messageId": .string(identifier), "conversationPeer": .string(target), "conversationKind": .string(kind),
            "direction": .string(own ? "self" : "peer"), "from": .string(sender ?? (own ? owner : target)),
            "text": .string(text), "timestamp": .string(ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: 1_700_000_000 + Double(ordinal)))),
            "edited": .bool(edited), "retracted": .bool(retracted), "deliveryStatus": .string(delivery),
            "reactions": .object(reactions.mapValues { .array($0.map { .string($0) }) })
        ])
    }

    private func groupRecord(_ identifier: String, own: Bool = false, text: String = "Cloud group text",
                             ordinal: Int = 0, retracted: Bool = false) -> NativeCloudMessage {
        record(identifier, peer: room, kind: "group", own: own, sender: room + (own ? "/Me" : "/Peer"),
               text: text, ordinal: ordinal, retracted: retracted)
    }

    private func page(_ identifier: String, own: Bool = false, text: String = "Cloud text") -> NativeArchivePage {
        NativeArchivePage(owner: owner, peer: peer, messages: [NativeArchivedText(archiveID: "mam-" + identifier,
            identifier: identifier, peer: peer, body: text, date: Date(timeIntervalSince1970: 1_700_000_000), outgoing: own)],
            first: "mam-" + identifier, hasEarlier: false)
    }

    func testCloudOnlyDirectHasNoWireIdentityOrActionsAndRoundTrips() throws {
        var store = NativeChatStore()
        try store.mergeCloud([record("cloud-only", own: true), record("incoming")], owner: owner)
        let outgoing = store.messages[0]
        XCTAssertEqual(outgoing.cloudID, "cloud-only")
        XCTAssertEqual(outgoing.cloudMessageID, "cloud-only")
        for message in store.messages {
            XCTAssertNil(message.stanzaID); XCTAssertNil(message.archiveID)
            XCTAssertFalse(message.receiptRequested); XCTAssertFalse(message.markable)
            XCTAssertFalse(store.canCorrect(message.id)); XCTAssertFalse(store.canRetract(message.id))
            XCTAssertThrowsError(try store.beginReaction(message.id))
            XCTAssertNil(store.takeReceipt(message.id, displayed: false))
        }
        XCTAssertEqual(try JSONDecoder().decode(NativeChatStore.self, from: JSONEncoder().encode(store)), store)
    }

    func testCloudThenLiveAndMAMEnrichSameUUIDWithoutOverwritingCloudEdit() throws {
        var store = NativeChatStore()
        try store.mergeCloud([record("original", text: "Edited remotely", edited: true)], owner: owner)
        let identity = store.messages[0].id
        store.receive(.trackedMessage(peer: peer, identifier: "original", body: "Original text", receipt: true, markable: true, archiveID: "mam-original"))
        try store.mergeArchive(page("original", text: "Original text"))
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].id, identity)
        XCTAssertEqual(store.messages[0].stanzaID, "original")
        XCTAssertEqual(store.messages[0].archiveID, "mam-original")
        XCTAssertEqual(store.messages[0].body, "Edited remotely")
        XCTAssertTrue(store.messages[0].receiptRequested)
        XCTAssertTrue(store.messages[0].markable)
    }

    func testCloudThenMAMThenLiveDeduplicatesBothDirections() throws {
        var store = NativeChatStore()
        try store.mergeCloud([record("incoming"), record("outgoing", own: true)], owner: owner)
        let identities = store.messages.map(\.id)
        try store.mergeArchive(page("incoming")); try store.mergeArchive(page("outgoing", own: true))
        store.receive(.message(peer: peer, identifier: "incoming", body: "Cloud text"))
        try store.mergeCloud([record("incoming"), record("outgoing", own: true)], owner: owner)
        XCTAssertEqual(store.messages.map(\.id), identities)
        XCTAssertEqual(store.messages.map(\.stanzaID), ["incoming", "outgoing"])
        XCTAssertTrue(store.canRetract(identities[1]))
    }

    func testAuthenticCorrectionBeforeOriginalKeepsCloudIdentityAndUUID() throws {
        var store = NativeChatStore()
        try store.mergeCloud([record("original")], owner: owner)
        let identity = store.messages[0].id
        store.receive(.change(peer: peer, identifier: "correction", change: .correct(target: "original", body: "Corrected")))
        store.receive(.message(peer: peer, identifier: "original", body: "Cloud text"))
        try store.mergeArchive(page("original"))
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].id, identity)
        XCTAssertEqual(store.messages[0].cloudMessageID, "original")
        XCTAssertEqual(store.messages[0].stanzaID, "correction")
        XCTAssertEqual(store.messages[0].body, "Corrected")
    }

    func testOlderMAMBodyCannotAuthenticateCloudEditButVerifiedCorrectionCan() throws {
        var store = NativeChatStore()
        try store.mergeCloud([record("original", own: true, text: "Edited remotely", edited: true)], owner: owner)
        let identity = store.messages[0].id
        try store.mergeArchive(page("original", own: true, text: "Original"))
        XCTAssertNil(store.messages[0].stanzaID); XCTAssertNil(store.messages[0].archiveID)
        XCTAssertFalse(store.canRetract(identity)); XCTAssertFalse(store.canCorrect(identity))
        XCTAssertEqual(store.messages[0].body, "Edited remotely")
        let correction = NativeArchivedText(archiveID: "mam-correction", identifier: "correction", peer: peer,
            body: "Edited remotely", date: Date(), outgoing: true, change: .correct(target: "original", body: "Edited remotely"))
        try store.mergeArchive(NativeArchivePage(owner: owner, peer: peer, messages: [correction], first: "mam-correction", hasEarlier: false))
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].id, identity)
        XCTAssertEqual(store.messages[0].stanzaID, "correction")
        XCTAssertEqual(store.messages[0].cloudMessageID, "original")
        XCTAssertEqual(store.messages[0].body, "Edited remotely")
        XCTAssertTrue(store.canRetract(identity))
    }

    func testLiveThenCloudMatchesTrustedIDAndDoesNotRegressDelivery() throws {
        var store = NativeChatStore()
        let message = try store.enqueueBody("Original", peer: peer)
        store.finish(message.id, submitted: true)
        try store.mergeCloud([record(message.stanzaID!, own: true, text: "Edited", edited: true, delivery: "displayed")], owner: owner)
        try store.mergeCloud([record(message.stanzaID!, own: true, text: "Original", delivery: "delivered")], owner: owner)
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].id, message.id)
        XCTAssertEqual(store.messages[0].body, "Edited")
        XCTAssertEqual(store.messages[0].delivery, .displayed)
        XCTAssertTrue(store.messages[0].edited)
    }

    func testDirectionAndPeerCollisionsNeverMergeAndBadScopeIsTransactional() throws {
        var store = NativeChatStore()
        store.receive(.message(peer: peer, identifier: "same", body: "Native incoming"))
        let incoming = store.messages[0].id
        try store.mergeCloud([record("same", own: true), record("same", peer: "other@localhost")], owner: owner)
        XCTAssertEqual(store.messages.count, 3)
        XCTAssertEqual(store.messages.first { $0.id == incoming }?.body, "Native incoming")
        let before = store
        XCTAssertThrowsError(try store.mergeCloud([record("valid"), record("wrong-owner", own: true, sender: peer)], owner: owner))
        XCTAssertThrowsError(try store.mergeCloud([record("self-peer", peer: owner)], owner: owner))
        XCTAssertThrowsError(try store.mergeCloud([groupRecord("wrong-kind")], owner: owner))
        XCTAssertThrowsError(try store.mergeCloud((0...50).map { record("over-\($0)") }, owner: owner))
        XCTAssertEqual(store, before)
    }

    func testDirectDraftHiddenRetractionAndUncertainActionsArePreserved() throws {
        var store = NativeChatStore()
        store.setDraft("Keep draft", peer: peer)
        store.receive(.change(peer: peer, identifier: "retraction", change: .retract(target: "gone")))
        try store.mergeCloud([record("gone"), record("hidden")], owner: owner)
        let hidden = try XCTUnwrap(store.messages.first { $0.cloudID == "hidden" })
        try store.hide(hidden.id)
        let pending = try store.enqueueBody("Pending", peer: peer)
        let uncertain = try store.enqueueBody("Uncertain", peer: peer)
        store.finish(uncertain.id, submitted: false)
        let action = try store.enqueueBody("Action", peer: peer)
        store.finish(action.id, submitted: true)
        _ = try store.beginChange(action.id, correctedBody: "Local correction")
        let protected = store.messages.filter { [pending.id, uncertain.id, action.id, hidden.id].contains($0.id) }
        try store.mergeCloud([record("gone", edited: true), record("hidden", text: "Resurrection"),
            record(pending.stanzaID!, own: true, retracted: true), record(uncertain.stanzaID!, own: true, retracted: true),
            record(action.stanzaID!, own: true, retracted: true)], owner: owner)
        XCTAssertEqual(store.drafts[peer], "Keep draft")
        XCTAssertEqual(store.messages.filter { [pending.id, uncertain.id, action.id, hidden.id].contains($0.id) }, protected)
        let gone = try XCTUnwrap(store.messages.first { $0.cloudID == "gone" })
        XCTAssertTrue(gone.retracted); XCTAssertEqual(gone.body, "")
        store.receive(.message(peer: peer, identifier: "gone", body: "Original"))
        XCTAssertEqual(store.messages.first { $0.id == gone.id }?.body, "")
        XCTAssertEqual(store.messages.count, 5)
    }

    func testDirectEarlierPagesTrimNewestAndRefreshTrimsOldestGlobally() throws {
        var store = NativeChatStore()
        for start in stride(from: 0, to: 200, by: 50) {
            try store.mergeCloud((start..<(start + 50)).map { record("m\($0)", ordinal: $0) }, owner: owner)
        }
        try store.mergeCloud((-50..<0).map { record("m\($0)", ordinal: $0) }, owner: owner, earlier: true)
        XCTAssertEqual(store.messages.count, 200)
        XCTAssertEqual(store.messages.first?.cloudID, "m-50")
        XCTAssertEqual(store.messages.last?.cloudID, "m149")
        try store.mergeCloud((200..<250).map { record("m\($0)", peer: "other@localhost", ordinal: $0) }, owner: owner)
        XCTAssertEqual(store.messages.count, 200)
        XCTAssertEqual(store.messages.first?.cloudID, "m0")
        XCTAssertEqual(store.messages.last?.cloudID, "m249")
    }

    func testDirectFullProtectedWindowThrowsWithoutDroppingTombstonesOrDrafts() throws {
        var store = NativeChatStore()
        store.setDraft("Keep", peer: peer)
        for start in stride(from: 0, to: 200, by: 50) {
            try store.mergeCloud((start..<(start + 50)).map { record("gone\($0)", ordinal: $0, retracted: true) }, owner: owner)
        }
        let before = store
        for earlier in [false, true] {
            XCTAssertThrowsError(try store.mergeCloud([record("new", ordinal: -1)], owner: owner, earlier: earlier)) {
                XCTAssertEqual($0 as? NativeChatFailure, .historyFull)
            }
            XCTAssertEqual(store, before)
        }
    }

    @MainActor
    private func restoredGroup(messages: [NativeGroupText] = [], tombstones: [String: String] = [:]) -> NativeGroupModel {
        let model = NativeGroupModel()
        var group = NativeGroupConversation(room: room, nickname: "Me", snapshot: nil, joining: false)
        group.draft = "Keep group draft"; group.subject = "Keep subject"
        group.messages = messages; group.retractionTombstones = tombstones
        model.restoreHistory([NativeGroupHistory(group)], owner: owner)
        return model
    }

    @MainActor
    func testGroupCloudImportHasNoWireIDsPrivilegesOrLiveStateChanges() async throws {
        let fixture = CloudMergeGroupFixture()
        let model = restoredGroup()
        model.attach(fixture, owner: owner); model.join(room: room, nickname: "Me")
        await wait { model.rooms[0].snapshot != nil }
        let before = model.rooms[0]
        var accepted = 0
        model.acceptedHistoryChange = { _, _ in accepted += 1 }
        try model.mergeCloud([groupRecord("own", own: true), groupRecord("peer")], room: room, owner: owner)
        let group = model.rooms[0]
        XCTAssertEqual(group.snapshot, before.snapshot); XCTAssertEqual(group.nickname, before.nickname)
        XCTAssertEqual(group.subject, before.subject); XCTAssertEqual(group.joining, before.joining)
        XCTAssertEqual(group.draft, before.draft); XCTAssertEqual(accepted, 0)
        for text in group.messages {
            XCTAssertNil(text.identifier); XCTAssertNil(text.archiveID); XCTAssertNil(text.occupantID)
            XCTAssertFalse(model.canReact(room: room, identifier: text.id))
            XCTAssertFalse(model.canRetract(room: room, identifier: text.id))
            XCTAssertEqual(try JSONDecoder().decode(NativeGroupText.self, from: JSONEncoder().encode(text)), text)
        }
        model.disconnect(clear: true)
    }

    @MainActor
    func testAuthenticGroupEchoEnrichesSameUUIDAndAppliesRememberedRetraction() async throws {
        let fixture = CloudMergeGroupFixture()
        let model = restoredGroup(tombstones: ["server-peer": "stable-peer"])
        model.attach(fixture, owner: owner); model.join(room: room, nickname: "Me")
        await wait { model.rooms[0].snapshot != nil }
        try model.mergeCloud([groupRecord("own", own: true), groupRecord("peer")], room: room, owner: owner)
        let identities = model.rooms[0].messages.map(\.id)
        for own in [true, false] {
            let identifier = own ? "own" : "peer"
            await fixture.emit(.message(NativeGroupText(id: UUID(), room: room, nickname: own ? "Me" : "Peer", identifier: identifier,
                archiveID: "server-" + identifier, body: "Original", date: Date(), own: own,
                state: own ? .submitted : .incoming, occupantID: "stable-" + identifier)), room: room)
        }
        await wait { model.rooms[0].messages.allSatisfy { $0.archiveID != nil } }
        XCTAssertEqual(model.rooms[0].messages.map(\.id), identities)
        XCTAssertTrue(model.canRetract(room: room, identifier: identities[0]))
        XCTAssertTrue(model.rooms[0].messages[1].retracted)
        XCTAssertEqual(model.rooms[0].messages[1].body, "")
        try model.mergeCloud([groupRecord("peer", text: "Resurrection")], room: room, owner: owner)
        XCTAssertTrue(model.rooms[0].messages[1].retracted)
        model.disconnect(clear: true)
    }

    @MainActor
    func testGroupEarlierPagesAndProtectedWindowAreTransactional() async throws {
        let model = restoredGroup()
        for start in stride(from: 0, to: 200, by: 50) {
            try model.mergeCloud((start..<(start + 50)).map { groupRecord("m\($0)", ordinal: $0) }, room: room, owner: owner)
        }
        try model.mergeCloud((-50..<0).map { groupRecord("m\($0)", ordinal: $0) }, room: room, owner: owner, earlier: true)
        XCTAssertEqual(model.rooms[0].messages.first?.cloudID, "m-50")
        XCTAssertEqual(model.rooms[0].messages.last?.cloudID, "m149")
        try model.mergeCloud((200..<250).map { groupRecord("m\($0)", ordinal: $0) }, room: room, owner: owner)
        XCTAssertEqual(model.rooms[0].messages.count, 200)
        XCTAssertEqual(model.rooms[0].messages.first?.cloudID, "m0")
        let before = model.rooms
        XCTAssertThrowsError(try model.mergeCloud([groupRecord("valid"), record("wrong-kind")], room: room, owner: owner))
        XCTAssertThrowsError(try model.mergeCloud([groupRecord("wrong-owner")], room: room, owner: "other@localhost"))
        XCTAssertThrowsError(try model.mergeCloud([groupRecord("unknown")], room: "unknown@conference.localhost", owner: owner))
        XCTAssertThrowsError(try model.mergeCloud((0...50).map { groupRecord("over\($0)") }, room: room, owner: owner))
        XCTAssertEqual(model.rooms, before)
        let full = restoredGroup(tombstones: ["gone": "stable-peer"])
        for start in stride(from: 0, to: 200, by: 50) {
            try full.mergeCloud((start..<(start + 50)).map { groupRecord("gone\($0)", ordinal: $0, retracted: true) }, room: room, owner: owner)
        }
        let protected = full.rooms
        XCTAssertThrowsError(try full.mergeCloud([groupRecord("overflow")], room: room, owner: owner)) {
            XCTAssertEqual($0 as? NativeGroupFailure, .limit)
        }
        XCTAssertEqual(full.rooms, protected)
        XCTAssertEqual(full.rooms[0].retractionTombstones, ["gone": "stable-peer"])
    }

    @MainActor
    func testGroupDirectionAndNicknameCollisionsStaySeparateAndHiddenRowsStayHidden() async throws {
        let incoming = NativeGroupText(id: UUID(), room: room, nickname: "Peer", identifier: "same", archiveID: "trusted",
            body: "Native incoming", date: Date(), own: false, state: .incoming, occupantID: "stable-peer")
        let model = restoredGroup(messages: [incoming])
        try model.mergeCloud([groupRecord("same", own: true),
            record("same", peer: room, kind: "group", sender: room + "/Another")], room: room, owner: owner)
        XCTAssertEqual(model.rooms[0].messages.count, 3)
        XCTAssertEqual(model.rooms[0].messages.first { $0.id == incoming.id }, incoming)
        model.hideMessage(room: room, identifier: incoming.id)
        let before = model.rooms
        try model.mergeCloud([groupRecord("same", text: "Resurrection")], room: room, owner: owner)
        XCTAssertEqual(model.rooms, before)
        XCTAssertThrowsError(try model.mergeCloud([
            record("foreign", peer: room, kind: "group", sender: "other@conference.localhost/Peer")
        ], room: room, owner: owner))
        XCTAssertEqual(model.rooms, before)
    }

    @MainActor
    func testCatalogCreatesAtMostEightPassiveRoomsAndPreservesExistingRooms() async throws {
        let fixture = CloudMergeGroupFixture()
        let model = restoredGroup()
        model.attach(fixture, owner: owner); model.join(room: room, nickname: "Me")
        await wait { model.rooms[0].snapshot != nil }
        let existing = model.rooms[0]
        var accepted = 0
        model.acceptedHistoryChange = { _, _ in accepted += 1 }
        let catalog = [NativeCloudConversation(peer: room, kind: "group", name: "Changed name"),
            NativeCloudConversation(peer: peer, kind: "contact", name: "Peer"),
            NativeCloudConversation(peer: "invalid", kind: "group", name: "Invalid")] + (0..<10).map {
                NativeCloudConversation(peer: "catalog\($0)@conference.localhost", kind: "group", name: "Group")
            }
        model.rememberCloudConversations(catalog, owner: owner)
        XCTAssertEqual(model.rooms.count, 8)
        XCTAssertEqual(model.rooms[0], existing)
        XCTAssertEqual(accepted, 0)
        for group in model.rooms.dropFirst() {
            XCTAssertNil(group.snapshot); XCTAssertFalse(group.joining)
            XCTAssertEqual(group.nickname, "owner"); XCTAssertTrue(group.messages.isEmpty)
        }
        let before = model.rooms
        model.rememberCloudConversations(catalog, owner: "other@localhost")
        XCTAssertEqual(model.rooms, before)
        let offline = NativeGroupModel()
        let longOwner = String(repeating: "é", count: 80) + "@localhost"
        offline.rememberCloudConversations([NativeCloudConversation(peer: room, kind: "group", name: "Group")], owner: longOwner)
        XCTAssertEqual(offline.rooms[0].nickname.utf8.count, 128)
        XCTAssertNil(offline.rooms[0].snapshot); XCTAssertFalse(offline.rooms[0].joining)
        XCTAssertFalse(offline.available)
        model.disconnect(clear: true)
    }

    @MainActor
    func testAcceptedGroupCallbackExcludesImportsLocalActionsAndFailedSends() async throws {
        let fixture = CloudMergeGroupFixture()
        let model = restoredGroup()
        model.attach(fixture, owner: owner); model.join(room: room, nickname: "Me")
        await wait { model.rooms[0].snapshot != nil }
        var changes: [([NativeGroupText], [NativeGroupText])] = []
        model.acceptedHistoryChange = { changes.append(($0, $1)) }
        try model.mergeCloud([groupRecord("imported")], room: room, owner: owner)
        model.hideMessage(room: room, identifier: model.rooms[0].messages[0].id)
        model.setDraft("Submitted", room: room); model.send(room: room)
        await wait { !model.hasPendingSends }
        XCTAssertEqual(changes.count, 1)
        XCTAssertEqual(changes[0].0.last?.state, .sending)
        XCTAssertEqual(changes[0].1.last?.state, .submitted)
        await fixture.failSends()
        model.setDraft("Uncertain", room: room); model.send(room: room)
        await wait { !model.hasPendingSends }
        XCTAssertEqual(changes.count, 1)
        let text = NativeGroupText(id: UUID(), room: room, nickname: "Peer", identifier: "live", archiveID: "server-live",
            body: "Live", date: Date(), own: false, state: .incoming, occupantID: "stable-peer")
        await fixture.emit(.message(text), room: room)
        await wait { changes.count == 2 }
        await fixture.emit(.message(text), room: room)
        await fixture.emit(.reactions(target: "server-live", occupantID: "stable-peer", values: ["👍"]), room: room)
        await wait { changes.count == 3 }
        await fixture.emit(.retracted(target: "server-live", occupantID: "attacker"), room: room)
        await fixture.emit(.retracted(target: "server-live", occupantID: "stable-peer"), room: room)
        await wait { changes.count == 4 }
        await fixture.emit(.rejected(model.rooms[0].messages[1].identifier!), room: room)
        await fixture.emit(.subject("Barrier"), room: room)
        await wait { model.rooms[0].subject == "Barrier" }
        model.disconnect(clear: false); model.clearLocalHistory()
        XCTAssertEqual(changes.count, 4)
    }

    @MainActor
    private func wait(_ condition: () -> Bool) async {
        for _ in 0..<1000 {
            if condition() { return }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTFail("Cloud merge fixture did not reach expected state")
    }
}

private actor CloudMergeGroupFixture: NativeGroupMessageChanging, NativeGroupReacting {
    private var callbacks: [String: @Sendable (NativeGroupEvent) -> Void] = [:]
    private var failing = false
    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        callbacks[room] = onEvent
        onEvent(.snapshot(NativeGroupSnapshot(room: room, nickname: nickname, participants: [nickname, "Peer"], canSpeak: true,
            supportsRetraction: true, supportsReactions: true, ownOccupantID: "stable-own")))
    }
    func emit(_ event: NativeGroupEvent, room: String) { callbacks[room]?(event) }
    func failSends() { failing = true }
    func sendGroup(room: String, body: String, identifier: String) async throws {
        if failing { throw NativeGroupFailure.disconnected }
    }
    func leaveGroup(room: String) async {}
    func sendMessage(to jid: String, body: String, identifier: String) async throws { XCTFail("Unexpected direct send") }
    func retractGroupMessage(room: String, target: String, identifier: String) async throws {}
    func reactGroup(room: String, target: String, values: [String], identifier: String) async throws {}
}
