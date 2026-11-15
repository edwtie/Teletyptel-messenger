import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativePresentationTests: XCTestCase {
    func testExpandedRttRequiresAllKnownCamerasOffAndNeverHidesAnInterpreter() {
        XCTAssertTrue(NativeCallMedia.total.expandsRtt(cameraEnabled: false, remoteCameraEnabled: false, interpreterVideo: false))
        XCTAssertTrue(NativeCallMedia.audioRtt.expandsRtt(cameraEnabled: false, remoteCameraEnabled: nil, interpreterVideo: false))
        for remote in [true, nil] as [Bool?] {
            XCTAssertFalse(NativeCallMedia.total.expandsRtt(cameraEnabled: false, remoteCameraEnabled: remote, interpreterVideo: false))
        }
        XCTAssertFalse(NativeCallMedia.total.expandsRtt(cameraEnabled: true, remoteCameraEnabled: false, interpreterVideo: false))
        XCTAssertFalse(NativeCallMedia.total.expandsRtt(cameraEnabled: false, remoteCameraEnabled: false, interpreterVideo: true))
        XCTAssertFalse(NativeCallMedia.audio.expandsRtt(cameraEnabled: false, remoteCameraEnabled: false, interpreterVideo: false))
        XCTAssertFalse(NativeCallMedia.video.expandsRtt(cameraEnabled: false, remoteCameraEnabled: false, interpreterVideo: false))
    }

    func testBackgroundOptionsMapOnlyToBundledAssets() {
        XCTAssertNil(NativeChatBackground.none.asset(wide: true))
        XCTAssertEqual(NativeChatBackground.automatic.asset(wide: true), "ChatBackgroundWide")
        XCTAssertEqual(NativeChatBackground.automatic.asset(wide: false), "ChatBackground")
        XCTAssertEqual(NativeChatBackground.open.asset(wide: false), "ChatBackgroundOpen")
        XCTAssertEqual(NativeChatBackground.right.asset(wide: true), "ChatBackgroundRight")
        XCTAssertNil(NativeChatBackground(rawValue: "https://foreign.invalid/pixel"))
        XCTAssertNil(NativeInterfaceTheme(rawValue: "invalid"))
    }
    @MainActor func testArchiveIsScopedRestorableAndDoesNotTouchHistory() async throws {
        let suite = "native-archive-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let configuration = try ServerConfiguration(address: "https://example.invalid", domain: "localhost")
        let first = try NativeHistoryScope(configuration: configuration, owner: "first@localhost")
        let second = try NativeHistoryScope(configuration: configuration, owner: "second@localhost")
        let model = NativeConversationArchive(defaults: defaults)
        model.set(peer: "peer@localhost", kind: "contact", archived: true)
        XCTAssertTrue(model.entries.isEmpty)
        model.configure(first); model.set(peer: "peer@localhost", kind: "contact", archived: true)
        XCTAssertTrue(model.contains(peer: "peer@localhost", kind: "contact"))
        XCTAssertFalse(model.contains(peer: "peer@localhost", kind: "group"))
        model.configure(second); XCTAssertTrue(model.entries.isEmpty)
        model.configure(first); XCTAssertTrue(model.contains(peer: "peer@localhost", kind: "contact"))
        model.set(peer: "peer@localhost", kind: "contact", archived: false)
        XCTAssertTrue(model.entries.isEmpty)
        model.set(peer: "peer@localhost", kind: "injected", archived: true)
        XCTAssertTrue(model.entries.isEmpty)
        model.configure(nil); XCTAssertTrue(model.entries.isEmpty)
    }
    func testHistorySummariesHideRemovedContentAndOrderByLatestDate() throws {
        var store = NativeChatStore()
        let older = try store.enqueueBody("Oud", peer: "old@localhost")
        let newest = try store.enqueueBody("Geheim", peer: "new@localhost")
        store.finish(older.id, submitted: true); store.finish(newest.id, submitted: true)
        var messages = store.messages
        messages[0].date = Date(timeIntervalSince1970: 1)
        messages[1].date = Date(timeIntervalSince1970: 2); messages[1].retracted = true
        let list = NativeConversationSummary.list(contacts: [], groups: [], messages: messages, catalog: [])
        XCTAssertEqual(list.map(\.peer), ["new@localhost", "old@localhost"])
        XCTAssertEqual(list.first?.preview, "Bericht ingetrokken")
        XCTAssertFalse(list.contains { $0.preview.contains("Geheim") })
        messages[1].hidden = true
        XCTAssertEqual(NativeConversationSummary.list(contacts: [], groups: [], messages: messages, catalog: []).map(\.peer), ["old@localhost"])
    }
}
