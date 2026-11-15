import Foundation
import XCTest
@testable import TeleTypTelCore

@MainActor
private final class InterpreterAPIFixture: NativeInterpreterServing {
    let identifier = String(repeating: "a", count: 48)
    let csrf = String(repeating: "b", count: 64)
    var offered = false
    var assigned = false
    var active = false
    var incoming = false
    var wrongSID = false
    var wrongSignal = false
    var fail = false
    var joins = 0
    var leaves = 0
    var requests = 0
    private func decode<Value: Decodable>(_ body: [String: Any]) throws -> Value {
        try JSONDecoder().decode(Value.self, from: JSONSerialization.data(withJSONObject: body))
    }
    private var room: [String: Any] {
        ["room_id": identifier, "call_id": wrongSID ? "another-call" : "test-call", "requester": incoming ? "peer-id" : "own-id",
         "peer": incoming ? "own-id" : "peer-id", "interpreter_id": assigned ? ("translator-id" as Any) : NSNull(),
         "status": active ? "active" : assigned ? "ready" : "waiting", "requester_jid": incoming ? "peer@localhost" : "owner@localhost",
         "peer_jid": incoming ? "owner@localhost" : "peer@localhost"]
    }
    func dashboard() async throws -> NativeInterpreterDashboard {
        if fail { throw NativeInterpreterFailure.unavailable }
        return try decode(["ok": true, "accountId": "own-id", "csrfToken": csrf, "jid": "owner@localhost", "rooms": offered ? [room] : []])
    }
    func snapshot(_ room: String) async throws -> NativeInterpreterSnapshot {
        var members: [[String: Any]] = [["account_id": "own-id", "joined": active ? 1 : 0, "display_name": "Owner"],
                                       ["account_id": "peer-id", "joined": active ? "1" : "0", "display_name": "Peer"]]
        if assigned { members.append(["account_id": "translator-id", "joined": 1, "display_name": "Bevoegde tolk"]) }
        let signal: [[String: Any]] = wrongSignal ? [["signal_id": String(repeating: "c", count: 32), "sender": "foreign-id", "payload": "{\"type\":\"offer\",\"sdp\":\"v=0\"}"]] : []
        return try decode(["ok": true, "accountId": "own-id", "csrfToken": csrf, "room": self.room, "members": members, "signals": signal])
    }
    func request(peer: String, sid: String) async throws -> String {
        XCTAssertEqual(peer, "peer@localhost"); XCTAssertEqual(sid, "test-call")
        requests += 1; offered = true; return identifier
    }
    func join(room: String, sid: String) async throws { joins += 1 }
    func leave(room: String) async throws { leaves += 1 }
    func signal(room: String, recipient: String, payload: NativeInterpreterPayload) async throws { XCTAssertEqual(recipient, "translator-id") }
    func rtc() async throws -> NativeInterpreterRTC { try decode(["ok": true, "iceServers": [], "iceTransportPolicy": "all"]) }
}

@MainActor
private final class InterpreterMediaFixture: NativeInterpreterMediaDriving {
    var connected = false
    var failed = false
    var remoteText = ""
    var starts = 0
    var stops = 0
    var texts: [String] = []
    func start(offerer: Bool, rtc: NativeInterpreterRTC, send: @escaping (NativeInterpreterPayload) async throws -> Void,
               changed: @escaping () -> Void) async throws { starts += 1; connected = true; changed() }
    func receive(_ payload: NativeInterpreterPayload) async throws {}
    func sendText(_ text: String) { texts.append(text) }
    func stop() { stops += 1; connected = false; remoteText = "" }
}

@MainActor
final class NativeInterpreterTests: XCTestCase {
    private func connected(_ client: InterpreterAPIFixture, _ media: InterpreterMediaFixture) -> NativeInterpreterSession {
        let model = NativeInterpreterSession(pollAutomatically: false)
        model.connect(client: client, media: media, sid: "test-call", owner: "owner@localhost", peer: "peer@localhost", account: "own-id")
        return model
    }
    func testRequestAndThreeSeparateConsentsPrecedeMedia() async {
        let client = InterpreterAPIFixture(), media = InterpreterMediaFixture()
        let model = connected(client, media)
        model.sendText("not consented")
        await model.poll(); XCTAssertTrue(model.available)
        await model.request(); await model.request()
        XCTAssertEqual(client.requests, 1)
        await model.poll(); XCTAssertEqual(media.starts, 0); XCTAssertEqual(client.joins, 0)
        client.assigned = true
        await model.poll(); XCTAssertEqual(client.joins, 1); XCTAssertEqual(media.starts, 0)
        client.active = true
        await model.poll(); XCTAssertEqual(media.starts, 1); XCTAssertTrue(model.connected)
        await model.poll(); XCTAssertEqual(media.starts, 1)
        model.sendText("Eigen live tekst")
        XCTAssertEqual(media.texts, ["Eigen live tekst"])
        model.stop()
        XCTAssertFalse(model.connected); XCTAssertEqual(media.stops, 1)
        model.sendText("after stop"); XCTAssertEqual(media.texts.count, 1)
    }
    func testPartnerRequestRequiresOwnExplicitConsent() async {
        let client = InterpreterAPIFixture(), media = InterpreterMediaFixture()
        client.incoming = true; client.offered = true; client.assigned = true; client.active = true
        let model = connected(client, media)
        await model.poll()
        XCTAssertTrue(model.needsConsent); XCTAssertEqual(client.joins, 0); XCTAssertEqual(media.starts, 0)
        model.allow(); await model.poll()
        XCTAssertEqual(client.joins, 1); XCTAssertEqual(media.starts, 1)
        model.stop()
    }
    func testForeignSignalAndChangedCallCannotBecomeInterpreterMedia() async {
        let client = InterpreterAPIFixture(), media = InterpreterMediaFixture()
        let model = connected(client, media)
        await model.poll(); await model.request()
        client.assigned = true; client.active = true; client.wrongSignal = true
        await model.poll()
        XCTAssertFalse(model.connected); XCTAssertNil(model.room)
        XCTAssertEqual(media.starts, 0)
        XCTAssertTrue(model.notice.contains("oorspronkelijke gesprek"))
        let other = InterpreterAPIFixture(), secondMedia = InterpreterMediaFixture()
        other.offered = true; other.wrongSID = true
        let second = connected(other, secondMedia)
        await second.poll()
        XCTAssertNil(second.room); XCTAssertEqual(secondMedia.starts, 0)
        second.stop()
    }
    func testUnavailableServiceNeverStartsCaptureOrReportsConnected() async {
        let client = InterpreterAPIFixture(), media = InterpreterMediaFixture()
        client.fail = true
        let model = connected(client, media)
        await model.poll(); await model.request()
        XCTAssertFalse(model.available); XCTAssertFalse(model.connected); XCTAssertEqual(media.starts, 0)
        model.stop()
    }
    func testWireTextIsBoundedAndRemainsLiteral() async throws {
        let text = "{\"command\":\"leave\"} 👋\ne\u{301}"
        XCTAssertEqual(NativeInterpreterText.decode(try XCTUnwrap(NativeInterpreterText.encode(text))), text)
        XCTAssertNil(NativeInterpreterText.encode(String(repeating: "👋", count: 10001)))
        XCTAssertNil(NativeInterpreterText.decode(Data("{\"type\":\"command\",\"text\":\"leave\"}".utf8)))
        XCTAssertNil(NativeInterpreterText.decode(Data(repeating: 0, count: 131073)))
        XCTAssertFalse(NativeInterpreterPayload(type: "offer", sdp: "https://foreign.invalid").valid)
        XCTAssertFalse(NativeInterpreterPayload(type: "candidate", candidate: .init(candidate: "candidate:bad\nheader", sdpMid: nil, sdpMLineIndex: 0, usernameFragment: nil)).valid)
    }
}
