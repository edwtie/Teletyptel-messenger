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
        XCTAssertNil(NativeChatBackground.none.asset(viewportWidth: 834))
        XCTAssertEqual(NativeChatBackground.automatic.asset(viewportWidth: 834), "ChatBackgroundWide")
        XCTAssertEqual(NativeChatBackground.automatic.asset(viewportWidth: 390), "ChatBackground")
        XCTAssertEqual(NativeChatBackground.open.asset(viewportWidth: 390), "ChatBackgroundOpen")
        XCTAssertEqual(NativeChatBackground.right.asset(viewportWidth: 834), "ChatBackgroundRight")
        XCTAssertNil(NativeChatBackground(rawValue: "https://foreign.invalid/pixel"))
        XCTAssertNil(NativeInterfaceTheme(rawValue: "invalid"))
    }

    func testAutomaticBackgroundUsesWindowWidthIncludingRotationAndSplitView() {
        for width in [320.0, 375, 390, 430, 520] {
            XCTAssertEqual(NativeChatBackground.automatic.asset(viewportWidth: width), "ChatBackground")
        }
        for width in [520.1, 521, 724, 834, 1194, 1366] {
            XCTAssertEqual(NativeChatBackground.automatic.asset(viewportWidth: width), "ChatBackgroundWide")
        }
        for width in [0.0, -1, .infinity, .nan] {
            XCTAssertEqual(NativeChatBackground.automatic.asset(viewportWidth: width), "ChatBackgroundWide")
        }
        for width in [375.0, 834, 1194] {
            XCTAssertEqual(NativeChatBackground.mobile.asset(viewportWidth: width), "ChatBackground")
            XCTAssertEqual(NativeChatBackground.soft.asset(viewportWidth: width), "ChatBackgroundWide")
            XCTAssertNil(NativeChatBackground.none.asset(viewportWidth: width))
        }
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
