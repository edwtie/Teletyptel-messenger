import XCTest
@testable import TeleTypTelCore

private enum CloudSyncTestFailure: Error {
    case timedOut(String), missingFetch(Int), missingSave(Int)
}

private actor CloudSyncClientFixture: NativeCloudHistoryServing {
    struct Fetch: Equatable, Sendable {
        let peer: String
        let kind: String
        let before: String?
    }

    struct Save: Equatable, Sendable {
        let message: NativeCloudMessage
        let expectedVersion: String?
    }

    struct Snapshot: Sendable {
        let fetches: [Fetch]
        let saves: [Save]
        let completedFetches: Set<Int>
        let completedSaves: Set<Int>
        let cancelledFetches: Set<Int>
        let cancelledSaves: Set<Int>
    }

    private var fetches: [Fetch] = []
    private var saves: [Save] = []
    private var pendingFetches: [Int: CheckedContinuation<NativeCloudHistoryPage, Error>] = [:]
    private var pendingSaves: [Int: CheckedContinuation<NativeCloudMessage, Error>] = [:]
    private var completedFetches: Set<Int> = []
    private var completedSaves: Set<Int> = []
    private var cancelledFetches: Set<Int> = []
    private var cancelledSaves: Set<Int> = []
    private var stopped = false

    func fetch(peer: String, kind: String, before: String?) async throws -> NativeCloudHistoryPage {
        let index = fetches.count
        fetches.append(Fetch(peer: peer, kind: kind, before: before))
        defer {
            completedFetches.insert(index)
            if Task.isCancelled { cancelledFetches.insert(index) }
        }
        guard !stopped else { throw CancellationError() }
        return try await withCheckedThrowingContinuation { pendingFetches[index] = $0 }
    }

    func save(_ message: NativeCloudMessage, expectedVersion: String?) async throws -> NativeCloudMessage {
        let index = saves.count
        saves.append(Save(message: message, expectedVersion: expectedVersion))
        defer {
            completedSaves.insert(index)
            if Task.isCancelled { cancelledSaves.insert(index) }
        }
        guard !stopped else { throw CancellationError() }
        return try await withCheckedThrowingContinuation { pendingSaves[index] = $0 }
    }

    func completeFetch(_ index: Int, with result: Result<NativeCloudHistoryPage, NativeCloudHistoryFailure>) throws {
        guard let continuation = pendingFetches.removeValue(forKey: index) else {
            throw CloudSyncTestFailure.missingFetch(index)
        }
        switch result {
        case .success(let page): continuation.resume(returning: page)
        case .failure(let failure): continuation.resume(throwing: failure)
        }
    }

    func completeSave(_ index: Int, with result: Result<NativeCloudMessage, NativeCloudHistoryFailure>) throws {
        guard let continuation = pendingSaves.removeValue(forKey: index) else {
            throw CloudSyncTestFailure.missingSave(index)
        }
        switch result {
        case .success(let message): continuation.resume(returning: message)
        case .failure(let failure): continuation.resume(throwing: failure)
        }
    }

    func cancelPending() {
        stopped = true
        let reads = pendingFetches.values
        let writes = pendingSaves.values
        pendingFetches.removeAll()
        pendingSaves.removeAll()
        for continuation in reads { continuation.resume(throwing: CancellationError()) }
        for continuation in writes { continuation.resume(throwing: CancellationError()) }
    }

    func snapshot() -> Snapshot {
        Snapshot(fetches: fetches, saves: saves, completedFetches: completedFetches,
                 completedSaves: completedSaves, cancelledFetches: cancelledFetches,
                 cancelledSaves: cancelledSaves)
    }
}

private struct CloudSyncApplication: Equatable {
    let messages: [NativeCloudMessage]
    let peer: String
    let kind: String
    let earlier: Bool
}

final class NativeCloudSyncTests: XCTestCase {
    private let owner = "owner@localhost"
    private let peer = "peer@localhost"
    private let version = String(repeating: "a", count: 64)
    private let nextVersion = String(repeating: "b", count: 64)

    private func message(id: String = "message-1", text: String = "Original body",
                         peer: String = "peer@localhost", kind: String = "contact",
                         sender: String = "owner@localhost", version: String? = nil,
                         metadata: [String: NativeCloudValue] = [:]) throws -> NativeCloudMessage {
        var fields: [String: NativeCloudValue] = [
            "messageId": .string(id), "conversationPeer": .string(peer),
            "conversationName": .string(peer), "conversationKind": .string(kind),
            "direction": .string("self"), "from": .string(sender),
            "text": .string(text), "timestamp": .string("2026-11-01T10:20:30.123Z"),
            "status": .string("sent"), "deliveryStatus": .string("sent"),
            "edited": .bool(false), "retracted": .bool(false), "reactions": .object([:]),
            "attachment": .null, "location": .null, "callInfo": .null,
            "jingleHistory": .null, "retraction": .null, "stylingDisabled": .bool(false)
        ]
        for (field, value) in metadata { fields[field] = value }
        if let version = version { fields["version"] = .string(version) }
        return try NativeCloudMessage(fields: fields)
    }

    private func page(_ messages: [NativeCloudMessage] = [], cursor: String? = nil,
                      saveChat: Bool = true) -> NativeCloudHistoryPage {
        NativeCloudHistoryPage(messages: messages, nextCursor: cursor, saveChat: saveChat)
    }

    private func edited(_ message: NativeCloudMessage, text: String) -> NativeCloudMessage {
        var result = message
        result.fields["text"] = .string(text)
        result.fields["edited"] = .bool(true)
        return result
    }

    private func saved(_ message: NativeCloudMessage, version: String) -> NativeCloudMessage {
        var result = message
        result.fields["version"] = .string(version)
        return result
    }

    @MainActor
    private func waitUntil(_ description: String, file: StaticString = #filePath, line: UInt = #line,
                           _ condition: @MainActor () async -> Bool) async throws {
        for _ in 0..<1000 {
            if await condition() { return }
            await Task.yield()
        }
        XCTFail("Cloud sync did not reach: \(description)", file: file, line: line)
        throw CloudSyncTestFailure.timedOut(description)
    }

    @MainActor
    private func settle() async {
        for _ in 0..<64 { await Task.yield() }
    }

    @MainActor
    private func withSync(otherClients: [CloudSyncClientFixture] = [],
                          _ body: @MainActor (NativeCloudSync, CloudSyncClientFixture) async throws -> Void) async throws {
        let sync = NativeCloudSync()
        let client = CloudSyncClientFixture()
        var catalogApplied = false
        sync.applyConversations = { _ in catalogApplied = true }
        sync.configure(client, owner: owner)
        do {
            try await waitUntil("default empty conversation catalog") { catalogApplied }
            sync.applyConversations = nil
            XCTAssertTrue(sync.conversations.isEmpty)
            XCTAssertNil(sync.notice)
            try await body(sync, client)
        } catch {
            await cleanup(sync, clients: [client] + otherClients)
            throw error
        }
        await cleanup(sync, clients: [client] + otherClients)
    }

    @MainActor
    private func cleanup(_ sync: NativeCloudSync, clients: [CloudSyncClientFixture]) async {
        sync.stop()
        await settle()
        for client in clients { await client.cancelPending() }
        for _ in 0..<1000 {
            var completed = true
            for client in clients {
                let snapshot = await client.snapshot()
                if snapshot.completedFetches.count != snapshot.fetches.count ||
                    snapshot.completedSaves.count != snapshot.saves.count { completed = false }
            }
            if completed { await settle(); return }
            await Task.yield()
        }
        XCTFail("Cloud sync fixture left unfinished client calls")
    }

    @MainActor
    private func load(_ sync: NativeCloudSync, client: CloudSyncClientFixture,
                      messages: [NativeCloudMessage] = [], cursor: String? = nil) async throws {
        sync.load(peer: peer, kind: "contact")
        try await waitUntil("initial GET") { await client.snapshot().fetches.count == 1 }
        try await client.completeFetch(0, with: .success(page(messages, cursor: cursor)))
        try await waitUntil("initial import") { sync.state(peer: self.peer, kind: "contact").ready }
    }

    @MainActor
    func testReadingImportsHistoryWithoutSavingIt() async throws {
        try await withSync { sync, client in
            let stored = try self.message(version: self.version)
            var applications: [CloudSyncApplication] = []
            sync.apply = { messages, peer, kind, earlier in
                applications.append(CloudSyncApplication(messages: messages, peer: peer, kind: kind, earlier: earlier))
            }
            try await self.load(sync, client: client, messages: [stored])
            await self.settle()
            XCTAssertEqual(applications, [CloudSyncApplication(messages: [stored], peer: self.peer,
                                                               kind: "contact", earlier: false)])
            XCTAssertFalse(sync.state(peer: self.peer, kind: "contact").loading)
            XCTAssertNil(sync.state(peer: self.peer, kind: "contact").notice)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.fetches, [.init(peer: self.peer, kind: "contact", before: nil)])
            XCTAssertTrue(snapshot.saves.isEmpty)
        }
    }

    @MainActor
    func testExplicitLiveInsertWaitsForSaveChatPolicyBeforeSaving() async throws {
        try await withSync { sync, client in
            let live = try self.message(text: "Explicit live body")
            sync.record(live, previous: nil)
            try await self.waitUntil("policy GET") { await client.snapshot().fetches.count == 1 }
            await self.settle()
            let beforePolicy = await client.snapshot()
            XCTAssertTrue(beforePolicy.saves.isEmpty)
            XCTAssertTrue(sync.state(peer: self.peer, kind: "contact").loading)
            try await client.completeFetch(0, with: .success(self.page()))
            try await self.waitUntil("live save") { await client.snapshot().saves.count == 1 }
            let afterPolicy = await client.snapshot()
            XCTAssertEqual(afterPolicy.saves, [.init(message: live, expectedVersion: nil)])
            try await client.completeSave(0, with: .success(self.saved(live, version: self.version)))
            try await self.waitUntil("save confirmation") { sync.notice != nil }
            await self.settle()
            let completed = await client.snapshot()
            XCTAssertEqual(completed.saves.count, 1)
        }
    }

    @MainActor
    func testSaveChatFalseNeverUploadsQueuedOrSubsequentBodies() async throws {
        try await withSync { sync, client in
            sync.record(try self.message(text: "Private queued body"), previous: nil)
            try await self.waitUntil("disabled policy GET") { await client.snapshot().fetches.count == 1 }
            let beforePolicy = await client.snapshot()
            XCTAssertTrue(beforePolicy.saves.isEmpty)
            try await client.completeFetch(0, with: .success(self.page(saveChat: false)))
            try await self.waitUntil("disabled policy") { sync.state(peer: self.peer, kind: "contact").ready }
            sync.record(try self.message(id: "message-2", text: "Private subsequent body"), previous: nil)
            await self.settle()
            XCTAssertNotNil(sync.state(peer: self.peer, kind: "contact").notice)
            XCTAssertNotNil(sync.notice)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.fetches.count, 1)
            XCTAssertTrue(snapshot.saves.isEmpty)
        }
    }

    @MainActor
    func testConflictDoesNotOverwriteOrRetryEvenWithAnotherEditQueued() async throws {
        try await withSync { sync, client in
            let stored = try self.message(version: self.version)
            var applied: [NativeCloudMessage] = []
            sync.apply = { messages, _, _, _ in applied.append(contentsOf: messages) }
            try await self.load(sync, client: client, messages: [stored])
            let firstEdit = self.edited(stored, text: "First explicit edit")
            sync.record(firstEdit, previous: stored)
            try await self.waitUntil("CAS save") { await client.snapshot().saves.count == 1 }
            sync.record(self.edited(firstEdit, text: "Queued second edit"), previous: firstEdit)
            try await client.completeSave(0, with: .failure(.conflict))
            try await self.waitUntil("conflict notice") { sync.notice != nil }
            await self.settle()
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: firstEdit, expectedVersion: self.version)])
            XCTAssertEqual(snapshot.fetches.count, 1)
            XCTAssertEqual(applied, [stored])
            XCTAssertNotNil(sync.notice)
        }
    }

    @MainActor
    func testBackgroundStopCancelsGETAndIgnoresItsLatePolicyAndImport() async throws {
        try await withSync { sync, client in
            var applied: [NativeCloudMessage] = []
            sync.apply = { messages, _, _, _ in applied.append(contentsOf: messages) }
            sync.record(try self.message(text: "Queued before background"), previous: nil)
            try await self.waitUntil("background GET") { await client.snapshot().fetches.count == 1 }
            let revision = sync.revision
            sync.stop()
            XCTAssertFalse(sync.state(peer: self.peer, kind: "contact").loading)
            let notice = sync.notice
            let late = try self.message(version: self.version)
            try await client.completeFetch(0, with: .success(self.page([late])))
            try await self.waitUntil("cancelled late GET") { await client.snapshot().cancelledFetches.contains(0) }
            await self.settle()
            sync.load(peer: self.peer, kind: "contact", refresh: true)
            await self.settle()
            XCTAssertTrue(applied.isEmpty)
            XCTAssertFalse(sync.state(peer: self.peer, kind: "contact").ready)
            XCTAssertEqual(sync.revision, revision)
            XCTAssertEqual(sync.notice, notice)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.fetches.count, 1)
            XCTAssertTrue(snapshot.saves.isEmpty)
        }
    }

    @MainActor
    func testLogoutClearsStateAndLateGETCannotApply() async throws {
        try await withSync { sync, client in
            var applications = 0
            sync.apply = { _, _, _, _ in applications += 1 }
            sync.load(peer: self.peer, kind: "contact")
            try await self.waitUntil("logout GET") { await client.snapshot().fetches.count == 1 }
            sync.configure(nil, owner: nil)
            let revision = sync.revision
            try await client.completeFetch(0, with: .success(self.page([try self.message(version: self.version)])))
            try await self.waitUntil("cancelled logout GET") { await client.snapshot().cancelledFetches.contains(0) }
            await self.settle()
            sync.record(try self.message(text: "Must stay local after logout"), previous: nil)
            await self.settle()
            XCTAssertEqual(applications, 0)
            XCTAssertTrue(sync.states.isEmpty)
            XCTAssertEqual(sync.revision, revision)
            XCTAssertNil(sync.notice)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.fetches.count, 1)
            XCTAssertTrue(snapshot.saves.isEmpty)
        }
    }

    @MainActor
    func testLateOldAccountGETCannotApplyPolicyOrVersionToNewAccount() async throws {
        let nextClient = CloudSyncClientFixture()
        try await withSync(otherClients: [nextClient]) { sync, client in
            var applied: [NativeCloudMessage] = []
            sync.apply = { messages, _, _, _ in applied.append(contentsOf: messages) }
            sync.record(try self.message(text: "Old account queued body"), previous: nil)
            try await self.waitUntil("old account GET") { await client.snapshot().fetches.count == 1 }
            let nextOwner = "next-owner@localhost"
            sync.configure(nextClient, owner: nextOwner)
            sync.load(peer: self.peer, kind: "contact")
            try await self.waitUntil("new account GET") { await nextClient.snapshot().fetches.count == 1 }
            try await client.completeFetch(0, with: .success(self.page([try self.message(version: self.version)], saveChat: false)))
            try await self.waitUntil("cancelled old account GET") { await client.snapshot().cancelledFetches.contains(0) }
            await self.settle()
            XCTAssertTrue(applied.isEmpty)
            XCTAssertTrue(sync.state(peer: self.peer, kind: "contact").loading)
            XCTAssertFalse(sync.state(peer: self.peer, kind: "contact").ready)
            let current = try self.message(text: "New account body", sender: nextOwner, version: self.nextVersion)
            try await nextClient.completeFetch(0, with: .success(self.page([current])))
            try await self.waitUntil("new account import") { sync.state(peer: self.peer, kind: "contact").ready }
            let edit = self.edited(current, text: "New account explicit edit")
            sync.record(edit, previous: current)
            try await self.waitUntil("new account save") { await nextClient.snapshot().saves.count == 1 }
            let oldSnapshot = await client.snapshot()
            let nextSnapshot = await nextClient.snapshot()
            XCTAssertTrue(oldSnapshot.saves.isEmpty)
            XCTAssertEqual(applied, [current])
            XCTAssertEqual(nextSnapshot.saves, [.init(message: edit, expectedVersion: self.nextVersion)])
            try await nextClient.completeSave(0, with: .success(self.saved(edit, version: String(repeating: "c", count: 64))))
            try await self.waitUntil("new account confirmation") { sync.notice != nil }
        }
    }

    @MainActor
    func testGETStartedBeforeLiveEditCannotOverwriteItOrReplaceItsCASBase() async throws {
        try await withSync { sync, client in
            let stored = try self.message(version: self.version)
            var local = stored
            var imported: [NativeCloudMessage] = []
            sync.apply = { messages, _, _, _ in
                imported.append(contentsOf: messages)
                for message in messages where message.messageID == local.messageID { local = message }
            }
            try await self.load(sync, client: client, messages: [stored])
            sync.load(peer: self.peer, kind: "contact", refresh: true)
            try await self.waitUntil("refresh GET") { await client.snapshot().fetches.count == 2 }
            let live = self.edited(stored, text: "Live edit during GET")
            local = live
            sync.record(live, previous: stored)
            await self.settle()
            let held = await client.snapshot()
            XCTAssertTrue(held.saves.isEmpty)
            let stale = try self.message(text: "Stale remote body", version: self.nextVersion)
            try await client.completeFetch(1, with: .success(self.page([stale])))
            try await self.waitUntil("queued edit save") { await client.snapshot().saves.count == 1 }
            XCTAssertEqual(local, live)
            XCTAssertEqual(imported, [stored])
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: live, expectedVersion: self.version)])
            try await client.completeSave(0, with: .success(self.saved(live, version: String(repeating: "c", count: 64))))
            try await self.waitUntil("live edit confirmation") { sync.notice != nil }
        }
    }

    @MainActor
    func testExplicitBodyEditPreservesOpaqueStoredMetadataAndAdvancesCASVersion() async throws {
        try await withSync { sync, client in
            let metadata: [String: NativeCloudValue] = [
                "attachment": .object(["opaqueToken": .string("attachment-token"), "size": .number(42)]),
                "location": .object(["privateShape": .array([.number(1), .null])]),
                "callInfo": .object(["serverOnly": .bool(true)]),
                "jingleHistory": .array([.object(["opaque": .string("jingle-token")])]),
                "futureMetadata": .object(["nested": .array([.bool(false), .string("keep")])]),
                "reactions": .object(["peer@localhost": .array([.string("👍")])])
            ]
            let stored = try self.message(version: self.version, metadata: metadata)
            try await self.load(sync, client: client, messages: [stored])
            let localPrevious = try self.message()
            let localEdit = self.edited(localPrevious, text: "Explicit body replacement")
            sync.record(localEdit, previous: localPrevious)
            try await self.waitUntil("metadata-preserving save") { await client.snapshot().saves.count == 1 }
            let expected = self.edited(stored, text: localEdit.text)
            let first = await client.snapshot()
            XCTAssertEqual(first.saves, [.init(message: expected, expectedVersion: self.version)])
            try await client.completeSave(0, with: .success(self.saved(expected, version: self.nextVersion)))
            try await self.waitUntil("first edit confirmation") { sync.notice != nil }
            let secondEdit = self.edited(localEdit, text: "Another explicit replacement")
            sync.record(secondEdit, previous: localEdit)
            try await self.waitUntil("second CAS save") { await client.snapshot().saves.count == 2 }
            let second = await client.snapshot()
            let nextExpected = self.edited(self.saved(expected, version: self.nextVersion), text: secondEdit.text)
            XCTAssertEqual(second.saves[1], .init(message: nextExpected, expectedVersion: self.nextVersion))
            try await client.completeSave(1, with: .success(self.saved(nextExpected, version: String(repeating: "c", count: 64))))
        }
    }

    @MainActor
    func testImportedRecordReportedAsNewInsertDoesNotClearReactionsOrMetadata() async throws {
        try await withSync { sync, client in
            let stored = try self.message(version: self.version, metadata: [
                "reactions": .object(["peer@localhost": .array([.string("❤️")])]),
                "attachment": .object(["opaque": .string("retain-attachment")]),
                "futureMetadata": .array([.string("retain-future-data")])
            ])
            try await self.load(sync, client: client, messages: [stored])
            let leanImport = try self.message()
            sync.record(leanImport, previous: nil)
            await self.settle()
            let duplicate = await client.snapshot()
            XCTAssertTrue(duplicate.saves.isEmpty)
            XCTAssertNil(sync.notice)
            let edit = self.edited(leanImport, text: "Explicit edit after duplicate import")
            sync.record(edit, previous: leanImport)
            try await self.waitUntil("edit after duplicate insert") { await client.snapshot().saves.count == 1 }
            let expected = self.edited(stored, text: edit.text)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: expected, expectedVersion: self.version)])
            try await client.completeSave(0, with: .success(self.saved(expected, version: self.nextVersion)))
        }
    }

    @MainActor
    func testPendingDirectBaselinesAllowConfirmedReactionToPatchKnownCloudRowWithCAS() async throws {
        for (actionPending, reactionPending) in [(true, false), (false, true), (true, true)] {
            try await withSync { sync, client in
                var previous = NativeChatMessage(id: UUID(), stanzaID: "delivery-stanza", peer: self.peer,
                    body: "Unchanged reaction target", date: Date(timeIntervalSince1970: 1793528430.123), state: .submitted)
                previous.cloudID = "known-direct-row"
                previous.actionPending = actionPending
                previous.reactionPending = reactionPending
                previous.reactions = [self.peer: ["❤️"]]
                XCTAssertNil(NativeCloudRecordFactory.direct(previous, owner: self.owner))
                XCTAssertNil(NativeCloudRecordFactory.direct(previous, owner: self.owner, includingPending: false))
                let baseline = try XCTUnwrap(NativeCloudRecordFactory.direct(previous, owner: self.owner, includingPending: true))
                XCTAssertEqual(baseline.messageID, "known-direct-row")
                XCTAssertEqual(baseline.reactions, previous.reactions)
                XCTAssertNil(baseline.version)

                var stored = self.saved(baseline, version: self.version)
                stored.fields["attachment"] = .object(["opaque": .string("keep-direct-attachment")])
                stored.fields["futureMetadata"] = .object(["serverOnly": .bool(true)])
                stored.fields["deliveryStatus"] = .string("delivered")
                try await self.load(sync, client: client, messages: [stored])

                var confirmed = previous
                confirmed.actionPending = false
                confirmed.reactionPending = false
                confirmed.reactions[self.owner] = ["👍"]
                let candidate = try XCTUnwrap(NativeCloudRecordFactory.direct(confirmed, owner: self.owner))
                XCTAssertTrue(candidate.hasSameIdentity(as: baseline))
                XCTAssertEqual(candidate.text, stored.text)
                XCTAssertNotEqual(candidate.reactions, baseline.reactions)
                sync.record(candidate, previous: baseline)

                try await self.waitUntil("confirmed direct reaction CAS save") { await client.snapshot().saves.count == 1 }
                var expected = stored
                expected.fields["reactions"] = candidate.fields["reactions"]
                let snapshot = await client.snapshot()
                XCTAssertEqual(snapshot.saves, [.init(message: expected, expectedVersion: self.version)])
                try await client.completeSave(0, with: .success(self.saved(expected, version: self.nextVersion)))
                try await self.waitUntil("confirmed direct reaction saved") { sync.notice != nil }
                await self.settle()
                let completed = await client.snapshot()
                XCTAssertEqual(completed.fetches.count, 1)
                XCTAssertEqual(completed.saves.count, 1)
            }
        }
    }

    @MainActor
    func testPendingGroupBaselineAllowsConfirmedRetractionToPatchKnownCloudRowWithCAS() async throws {
        try await withSync { sync, client in
            let room = "room@conference.localhost"
            var previous = NativeGroupText(id: UUID(), room: room, nickname: "Me", identifier: "group-delivery-stanza",
                archiveID: nil, body: "Group retraction target", date: Date(timeIntervalSince1970: 1793528430.123),
                own: true, state: .submitted)
            previous.cloudID = "known-group-row"
            previous.actionPending = true
            previous.reactions = [self.peer: ["👍"]]
            XCTAssertNil(NativeCloudRecordFactory.group(previous))
            XCTAssertNil(NativeCloudRecordFactory.group(previous, includingPending: false))
            let baseline = try XCTUnwrap(NativeCloudRecordFactory.group(previous, includingPending: true))
            XCTAssertEqual(baseline.messageID, "known-group-row")
            XCTAssertEqual(baseline.reactions, previous.reactions)
            XCTAssertNil(baseline.version)

            var stored = self.saved(baseline, version: self.version)
            stored.fields["futureMetadata"] = .array([.string("keep-group-metadata")])
            sync.load(peer: room, kind: "group")
            try await self.waitUntil("known group row GET") { await client.snapshot().fetches.count == 1 }
            try await client.completeFetch(0, with: .success(self.page([stored])))
            try await self.waitUntil("known group row import") { sync.state(peer: room, kind: "group").ready }

            var confirmed = previous
            confirmed.actionPending = false
            confirmed.retracted = true
            confirmed.body = ""
            confirmed.reactions.removeAll()
            let candidate = try XCTUnwrap(NativeCloudRecordFactory.group(confirmed))
            XCTAssertTrue(candidate.hasSameIdentity(as: baseline))
            sync.record(candidate, previous: baseline)

            try await self.waitUntil("confirmed group retraction CAS save") { await client.snapshot().saves.count == 1 }
            var expected = stored
            for field in ["text", "retracted", "reactions", "status"] { expected.fields[field] = candidate.fields[field] }
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: expected, expectedVersion: self.version)])
            try await client.completeSave(0, with: .success(self.saved(expected, version: self.nextVersion)))
            try await self.waitUntil("confirmed group retraction saved") { sync.notice != nil }
            await self.settle()
            let completed = await client.snapshot()
            XCTAssertEqual(completed.fetches.count, 1)
            XCTAssertEqual(completed.saves.count, 1)
        }
    }

    @MainActor
    func testOlderGroupPaginationUsesReturnedCursorAndMarksApplyAsEarlier() async throws {
        try await withSync { sync, client in
            let room = "room@conference.localhost"
            let cursor = "opaque-earlier-cursor<&>"
            let recent = try self.message(peer: room, kind: "group", sender: room + "/Me", version: self.version)
            let older = try self.message(id: "older-message", peer: room, kind: "group", sender: room + "/Me", version: self.nextVersion)
            var applications: [CloudSyncApplication] = []
            sync.apply = { messages, peer, kind, earlier in
                applications.append(CloudSyncApplication(messages: messages, peer: peer, kind: kind, earlier: earlier))
            }
            sync.load(peer: room, kind: "group")
            try await self.waitUntil("latest group GET") { await client.snapshot().fetches.count == 1 }
            try await client.completeFetch(0, with: .success(self.page([recent], cursor: cursor)))
            try await self.waitUntil("latest group import") { sync.state(peer: room, kind: "group").ready }
            XCTAssertEqual(sync.state(peer: room, kind: "group").nextCursor, cursor)
            sync.load(peer: room, kind: "group", earlier: true)
            try await self.waitUntil("older group GET") { await client.snapshot().fetches.count == 2 }
            let requested = await client.snapshot()
            XCTAssertEqual(requested.fetches, [.init(peer: room, kind: "group", before: nil),
                                               .init(peer: room, kind: "group", before: cursor)])
            try await client.completeFetch(1, with: .success(self.page([older])))
            try await self.waitUntil("older group import") { !sync.state(peer: room, kind: "group").loading }
            XCTAssertEqual(applications, [
                CloudSyncApplication(messages: [recent], peer: room, kind: "group", earlier: false),
                CloudSyncApplication(messages: [older], peer: room, kind: "group", earlier: true)
            ])
            XCTAssertNil(sync.state(peer: room, kind: "group").nextCursor)
            XCTAssertFalse(sync.state(peer: self.peer, kind: "contact").ready)
            await self.settle()
            let snapshot = await client.snapshot()
            XCTAssertTrue(snapshot.saves.isEmpty)
        }
    }

    @MainActor
    func testOptOutCancelsUploadsKeepsReadsAndIgnoresLateResultsWithoutReplayingDroppedWrites() async throws {
        for lateFailure in [false, true] {
            try await withSync { sync, client in
                let stored = try self.message(version: self.version)
                var imported: [NativeCloudMessage] = []
                sync.apply = { messages, _, _, _ in imported.append(contentsOf: messages) }
                try await self.load(sync, client: client, messages: [stored])
                let inFlight = self.edited(stored, text: "Upload started before opt-out")
                sync.record(inFlight, previous: stored)
                try await self.waitUntil("save before opt-out") { await client.snapshot().saves.count == 1 }
                sync.record(try self.message(id: "dropped-queued-row", text: "Drop this queued upload"), previous: nil)
                sync.load(peer: self.peer, kind: "contact", refresh: true)
                try await self.waitUntil("read in flight before opt-out") { await client.snapshot().fetches.count == 2 }

                sync.setSavingEnabled(false)
                let optOutNotice = sync.notice
                XCTAssertNotNil(optOutNotice)
                XCTAssertTrue(sync.available)
                XCTAssertTrue(sync.state(peer: self.peer, kind: "contact").loading)
                sync.record(self.edited(inFlight, text: "Do not upload this disabled edit"), previous: inFlight)
                sync.record(try self.message(id: "disabled-new-row", text: "Do not upload this disabled insert"), previous: nil)

                let current = try self.message(text: "Current server body", version: self.nextVersion,
                    metadata: ["futureMetadata": .string("retain-read-metadata")])
                try await client.completeFetch(1, with: .success(self.page([current])))
                try await self.waitUntil("read completes while saving is disabled") {
                    !sync.state(peer: self.peer, kind: "contact").loading
                }
                XCTAssertEqual(imported, [stored, current])
                XCTAssertEqual(sync.notice, optOutNotice)
                let readSnapshot = await client.snapshot()
                XCTAssertTrue(readSnapshot.completedFetches.contains(1))
                XCTAssertFalse(readSnapshot.cancelledFetches.contains(1))
                XCTAssertEqual(readSnapshot.saves.count, 1)

                var obsolete = self.saved(inFlight, version: String(repeating: "c", count: 64))
                obsolete.fields["futureMetadata"] = .string("must-not-be-remembered")
                let lateResult: Result<NativeCloudMessage, NativeCloudHistoryFailure> = lateFailure
                    ? .failure(.conflict) : .success(obsolete)
                let revision = sync.revision
                try await client.completeSave(0, with: lateResult)
                try await self.waitUntil("cancelled opt-out save completes") { await client.snapshot().cancelledSaves.contains(0) }
                await self.settle()
                XCTAssertEqual(sync.notice, optOutNotice)
                XCTAssertEqual(sync.revision, revision)
                XCTAssertEqual(imported, [stored, current])

                sync.setSavingEnabled(true)
                sync.load(peer: self.peer, kind: "contact", refresh: true)
                try await self.waitUntil("read after re-enabling saving") { await client.snapshot().fetches.count == 3 }
                try await client.completeFetch(2, with: .success(self.page()))
                try await self.waitUntil("drain after re-enabling saving") {
                    !sync.state(peer: self.peer, kind: "contact").loading
                }
                await self.settle()
                let reenabled = await client.snapshot()
                XCTAssertEqual(reenabled.saves, [.init(message: inFlight, expectedVersion: self.version)])
                XCTAssertEqual(sync.notice, optOutNotice)

                let explicitEdit = self.edited(current, text: "New explicit upload after re-enabling")
                sync.record(explicitEdit, previous: current)
                try await self.waitUntil("new explicit upload with retained CAS base") { await client.snapshot().saves.count == 2 }
                let snapshot = await client.snapshot()
                XCTAssertEqual(snapshot.saves, [
                    .init(message: inFlight, expectedVersion: self.version),
                    .init(message: explicitEdit, expectedVersion: self.nextVersion)
                ])
                try await client.completeSave(1, with: .success(self.saved(explicitEdit, version: String(repeating: "d", count: 64))))
                try await self.waitUntil("new explicit upload confirmed") { sync.notice != optOutNotice }
                await self.settle()
                let completed = await client.snapshot()
                XCTAssertEqual(completed.saves.count, 2)
            }
        }
    }

    @MainActor
    func testOptOutStillAllowsDefaultConversationCatalogAndHistoryReadsOnConfigure() async throws {
        try await withSync { sync, client in
            sync.setSavingEnabled(false)
            var catalogs: [[NativeCloudConversation]] = []
            sync.applyConversations = { catalogs.append($0) }
            sync.configure(client, owner: self.owner)
            try await self.waitUntil("catalog available while saving is disabled") { catalogs.count == 1 }
            XCTAssertEqual(catalogs, [[]])
            XCTAssertTrue(sync.conversations.isEmpty)
            XCTAssertTrue(sync.available)
            XCTAssertNil(sync.notice)

            let stored = try self.message(version: self.version)
            var imported: [NativeCloudMessage] = []
            sync.apply = { messages, _, _, _ in imported.append(contentsOf: messages) }
            try await self.load(sync, client: client, messages: [stored])
            sync.record(self.edited(stored, text: "Still opted out after configure"), previous: stored)
            await self.settle()
            XCTAssertEqual(imported, [stored])
            XCTAssertTrue(sync.state(peer: self.peer, kind: "contact").ready)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.fetches.count, 1)
            XCTAssertTrue(snapshot.saves.isEmpty)
        }
    }

    func testLegacyThreeKeyPreferencesDefaultOnlineSavingWithoutLosingPrivacyFlags() throws {
        let decoder = JSONDecoder()
        let defaults = try decoder.decode(NativeChatPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(defaults.saveOnlineHistory)
        XCTAssertFalse(defaults.sendDisplayed)
        XCTAssertEqual(defaults, NativeChatPreferences())

        for keepHistory in [false, true] {
            for sendDelivery in [false, true] {
                for sendDisplayed in [false, true] {
                    let cachedJSON = """
                    {"keepHistory":\(keepHistory),"sendDelivery":\(sendDelivery),"sendDisplayed":\(sendDisplayed)}
                    """
                    let decoded = try decoder.decode(NativeChatPreferences.self, from: Data(cachedJSON.utf8))
                    XCTAssertTrue(decoded.saveOnlineHistory)
                    XCTAssertEqual(decoded.keepHistory, keepHistory)
                    XCTAssertEqual(decoded.sendDelivery, sendDelivery)
                    XCTAssertEqual(decoded.sendDisplayed, sendDisplayed)
                    var optedOut = decoded
                    optedOut.saveOnlineHistory = false
                    let roundTrip = try decoder.decode(NativeChatPreferences.self, from: JSONEncoder().encode(optedOut))
                    XCTAssertEqual(roundTrip, optedOut)
                }
            }
        }
    }

    @MainActor
    func testPartialLiveReactionOverlaysOnlyChangedActorOnKnownServerReactionsWithCAS() async throws {
        try await withSync { sync, client in
            let stored = try self.message(version: self.version, metadata: [
                "reactions": .object([self.peer: .array([.string("👍")])]),
                "futureMetadata": .object(["serverOnly": .bool(true)]),
                "attachment": .object(["opaque": .string("keep-server-attachment")])
            ])
            try await self.load(sync, client: client, messages: [stored])
            let leanPrevious = try self.message()
            XCTAssertTrue(leanPrevious.reactions.isEmpty)
            var candidate = leanPrevious
            candidate.fields["reactions"] = .object([self.owner: .array([.string("❤️")])])
            sync.record(candidate, previous: leanPrevious)

            try await self.waitUntil("actor-scoped reaction CAS save") { await client.snapshot().saves.count == 1 }
            var expected = stored
            expected.fields["reactions"] = .object([
                self.peer: .array([.string("👍")]), self.owner: .array([.string("❤️")])
            ])
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: expected, expectedVersion: self.version)])
            XCTAssertEqual(snapshot.saves[0].message.reactions, [self.peer: ["👍"], self.owner: ["❤️"]])
            try await client.completeSave(0, with: .success(self.saved(expected, version: self.nextVersion)))
            try await self.waitUntil("actor-scoped reaction confirmed") { sync.notice != nil }
            await self.settle()
            let completed = await client.snapshot()
            XCTAssertEqual(completed.saves.count, 1)
            XCTAssertEqual(completed.fetches.count, 1)
        }
    }

    @MainActor
    func testCoalescedInsertAndReactionDuringInitialGETRefusesUnbasedWriteThenUsesKnownCASForNextAction() async throws {
        try await withSync { sync, client in
            sync.load(peer: self.peer, kind: "contact")
            try await self.waitUntil("initial GET before native insert") { await client.snapshot().fetches.count == 1 }
            let native = try self.message(text: "Same body inserted by native and web")
            sync.record(native, previous: nil)
            var reacted = native
            reacted.fields["reactions"] = .object([self.owner: .array([.string("❤️")])])
            sync.record(reacted, previous: native)
            await self.settle()
            let held = await client.snapshot()
            XCTAssertEqual(held.fetches.count, 1)
            XCTAssertTrue(held.saves.isEmpty)

            let web = try self.message(text: native.text, version: self.version, metadata: [
                "reactions": .object([self.peer: .array([.string("👍")])]),
                "attachment": .object(["opaque": .string("retain-web-attachment")]),
                "futureMetadata": .object(["webOnly": .array([.string("retain"), .number(42)])])
            ])
            try await client.completeFetch(0, with: .success(self.page([web])))
            try await self.waitUntil("initial GET resolves coalesced native insert") {
                sync.state(peer: self.peer, kind: "contact").ready && !sync.state(peer: self.peer, kind: "contact").loading
            }
            await self.settle()
            let refused = await client.snapshot()
            XCTAssertTrue(refused.saves.isEmpty)
            let refusalNotice = sync.notice
            XCTAssertNotNil(refusalNotice)

            let explicitEdit = self.edited(reacted, text: "Separate explicit action after refusal")
            sync.record(explicitEdit, previous: reacted)
            try await self.waitUntil("separate explicit action uses fetched CAS base") { await client.snapshot().saves.count == 1 }
            let expected = self.edited(web, text: explicitEdit.text)
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: expected, expectedVersion: self.version)])
            XCTAssertEqual(snapshot.saves[0].message.reactions, web.reactions)
            XCTAssertEqual(snapshot.fetches.count, 1)
            try await client.completeSave(0, with: .success(self.saved(expected, version: self.nextVersion)))
            try await self.waitUntil("separate explicit action confirmed") { sync.notice != refusalNotice }
            await self.settle()
            let completed = await client.snapshot()
            XCTAssertEqual(completed.saves.count, 1)
        }
    }

    @MainActor
    func testServerDisabled403BlocksConversationUploadsAndDropsQueuedWritesBeforePolicyRefresh() async throws {
        try await withSync { sync, client in
            let stored = try self.message(version: self.version, metadata: [
                "futureMetadata": .string("keep-known-server-base")
            ])
            try await self.load(sync, client: client, messages: [stored])
            let inFlight = self.edited(stored, text: "Rejected because server disabled saving")
            sync.record(inFlight, previous: stored)
            try await self.waitUntil("save awaiting disabled response") { await client.snapshot().saves.count == 1 }
            sync.record(self.edited(inFlight, text: "Drop queued edit after 403"), previous: inFlight)
            sync.record(try self.message(id: "queued-before-403", text: "Drop queued insert after 403"), previous: nil)
            try await client.completeSave(0, with: .failure(.disabled))
            try await self.waitUntil("conversation saving disabled by server") {
                sync.state(peer: self.peer, kind: "contact").notice != nil && sync.notice != nil
            }
            XCTAssertTrue(sync.state(peer: self.peer, kind: "contact").ready)
            sync.record(try self.message(id: "blocked-after-403", text: "Policy must block subsequent insert"), previous: nil)
            sync.record(self.edited(inFlight, text: "Policy must block subsequent edit"), previous: inFlight)
            await self.settle()
            let disabledNotice = sync.notice
            let disabled = await client.snapshot()
            XCTAssertEqual(disabled.saves, [.init(message: inFlight, expectedVersion: self.version)])
            XCTAssertEqual(disabled.fetches.count, 1)

            sync.load(peer: self.peer, kind: "contact", refresh: true)
            try await self.waitUntil("explicit policy refresh after 403") { await client.snapshot().fetches.count == 2 }
            try await client.completeFetch(1, with: .success(self.page()))
            try await self.waitUntil("policy refresh completes without queue replay") {
                !sync.state(peer: self.peer, kind: "contact").loading
            }
            await self.settle()
            XCTAssertNil(sync.state(peer: self.peer, kind: "contact").notice)
            let refreshed = await client.snapshot()
            XCTAssertEqual(refreshed.saves.count, 1)

            let explicitEdit = self.edited(stored, text: "New explicit action after policy refresh")
            sync.record(explicitEdit, previous: stored)
            try await self.waitUntil("new CAS save after policy refresh") { await client.snapshot().saves.count == 2 }
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [
                .init(message: inFlight, expectedVersion: self.version),
                .init(message: explicitEdit, expectedVersion: self.version)
            ])
            try await client.completeSave(1, with: .success(self.saved(explicitEdit, version: self.nextVersion)))
            try await self.waitUntil("new action after disabled response confirmed") { sync.notice != disabledNotice }
            await self.settle()
            let completed = await client.snapshot()
            XCTAssertEqual(completed.saves.count, 2)
        }
    }

    @MainActor
    func testStopIgnoresLateSaveCompletionAndDoesNotReplayQueuedWritesAfterReconfigure() async throws {
        try await withSync { sync, client in
            try await self.load(sync, client: client)
            let live = try self.message(text: "Save already in flight")
            sync.record(live, previous: nil)
            try await self.waitUntil("in-flight save") { await client.snapshot().saves.count == 1 }
            sync.record(try self.message(id: "queued-message", text: "Never automatically replay"), previous: nil)
            sync.stop()
            let notice = sync.notice
            let revision = sync.revision
            XCTAssertNotNil(notice)
            try await client.completeSave(0, with: .success(self.saved(live, version: self.version)))
            try await self.waitUntil("cancelled late save") { await client.snapshot().cancelledSaves.contains(0) }
            await self.settle()
            XCTAssertEqual(sync.notice, notice)
            XCTAssertEqual(sync.revision, revision)
            sync.configure(client, owner: self.owner)
            sync.load(peer: self.peer, kind: "contact")
            try await self.waitUntil("fresh policy GET") { await client.snapshot().fetches.count == 2 }
            try await client.completeFetch(1, with: .success(self.page()))
            try await self.waitUntil("fresh policy import") { sync.state(peer: self.peer, kind: "contact").ready }
            await self.settle()
            let snapshot = await client.snapshot()
            XCTAssertEqual(snapshot.saves, [.init(message: live, expectedVersion: nil)])
            XCTAssertNil(sync.notice)
        }
    }
}
