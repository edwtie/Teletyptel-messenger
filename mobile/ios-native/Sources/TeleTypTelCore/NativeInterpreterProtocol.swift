import Foundation

enum NativeInterpreterFailure: Error { case invalid, unavailable, consent, expired, media }

struct NativeInterpreterPayload: Codable, Equatable {
    struct Candidate: Codable, Equatable {
        let candidate: String
        let sdpMid: String?
        let sdpMLineIndex: Int32?
        let usernameFragment: String?
    }
    let type: String
    var sdp: String? = nil
    var candidate: Candidate? = nil
    var valid: Bool {
        if type == "candidate", let value = candidate {
            return sdp == nil && value.candidate.hasPrefix("candidate:") && value.candidate.utf8.count <= 4096 &&
                !value.candidate.contains("\r") && !value.candidate.contains("\n") &&
                (value.sdpMLineIndex.map { (0...7).contains($0) } ?? true) &&
                (value.sdpMid.map { $0.utf8.count <= 32 } ?? true) &&
                (value.usernameFragment.map { $0.utf8.count <= 256 } ?? true)
        }
        return ["offer", "answer"].contains(type) && candidate == nil &&
            sdp.map { $0.hasPrefix("v=0") && $0.utf8.count <= 50000 && !$0.contains("\0") } == true
    }
}

struct NativeInterpreterRoom: Decodable, Equatable {
    let room_id: String
    let call_id: String
    let requester: String
    let peer: String
    let interpreter_id: String?
    let status: String
    let requester_jid: String?
    let peer_jid: String?

    func matches(owner: String, peerJID: String, account: String, sid: String) -> Bool {
        guard valid, call_id == sid, requester != peer else { return false }
        if requester == account { return requester_jid == owner && peer_jid == peerJID }
        return peer == account && peer_jid == owner && requester_jid == peerJID
    }
    var valid: Bool {
        Self.identifier(room_id) && NativeJingleTransport.validSID(call_id) &&
            Self.account(requester) && Self.account(peer) && ["waiting", "ready", "active", "ended"].contains(status) &&
            (interpreter_id.map { Self.account($0) && $0 != requester && $0 != peer } ?? (status == "waiting" || status == "ended"))
    }
    static func identifier(_ value: String) -> Bool { value.range(of: #"\A[a-f0-9]{48}\z"#, options: .regularExpression) != nil }
    static func account(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 96 && !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }
}

struct NativeInterpreterMember: Decodable {
    let account_id: String
    let display_name: String
    let joined: Bool
    enum CodingKeys: String, CodingKey { case account_id, display_name, joined }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        account_id = try container.decode(String.self, forKey: .account_id)
        display_name = try container.decode(String.self, forKey: .display_name)
        if let number = try? container.decode(Int.self, forKey: .joined), [0, 1].contains(number) { joined = number == 1 }
        else {
            let text = try container.decode(String.self, forKey: .joined)
            guard ["0", "1"].contains(text) else { throw NativeInterpreterFailure.invalid }
            joined = text == "1"
        }
    }
}

struct NativeInterpreterSignal: Decodable {
    let signal_id: String
    let sender: String
    let payload: String
}

struct NativeInterpreterSnapshot: Decodable {
    let ok: Bool
    let csrfToken: String
    let accountId: String
    let room: NativeInterpreterRoom
    let members: [NativeInterpreterMember]
    let signals: [NativeInterpreterSignal]
    func valid(for expected: NativeInterpreterRoom, account: String) -> Bool {
        guard ok, accountId == account, room.valid, room.room_id == expected.room_id,
              room.call_id == expected.call_id, room.requester == expected.requester, room.peer == expected.peer,
              expected.interpreter_id == nil || room.interpreter_id == expected.interpreter_id,
              (2...3).contains(members.count), signals.count <= 200 else { return false }
        let identifiers = members.map(\.account_id)
        let allowed = Set([room.requester, room.peer] + (room.interpreter_id.map { [$0] } ?? []))
        guard Set(identifiers) == allowed, identifiers.count == allowed.count,
              members.allSatisfy({ $0.display_name.utf8.count <= 480 }),
              Set(signals.map(\.signal_id)).count == signals.count else { return false }
        guard signals.allSatisfy({ signal in
            signal.signal_id.range(of: #"\A[a-f0-9]{32}\z"#, options: .regularExpression) != nil &&
                signal.sender == room.interpreter_id && signal.payload.utf8.count <= 60000 &&
                signal.payload.data(using: .utf8).flatMap { try? JSONDecoder().decode(NativeInterpreterPayload.self, from: $0) }?.valid == true
        }) else { return false }
        return room.status != "active" || (members.count == 3 && members.allSatisfy(\.joined))
    }
}

struct NativeInterpreterRTC: Decodable {
    struct Server: Decodable { let urls: URLs; let username: String?; let credential: String? }
    enum URLs: Decodable {
        case one(String), many([String])
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let value = try? container.decode(String.self) { self = .one(value) }
            else { self = .many(try container.decode([String].self)) }
        }
        var values: [String] { switch self { case .one(let value): return [value]; case .many(let values): return values } }
    }
    let ok: Bool
    let iceServers: [Server]
    let iceTransportPolicy: String?
    var valid: Bool {
        ok && iceServers.count <= 8 && [nil, "all", "relay"].contains(iceTransportPolicy) && iceServers.allSatisfy { server in
            !server.urls.values.isEmpty && server.urls.values.count <= 4 && server.urls.values.allSatisfy { value in
                value.utf8.count <= 2048 && !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) &&
                    ["stun", "stuns", "turn", "turns"].contains(URLComponents(string: value)?.scheme?.lowercased() ?? "")
            } && (server.username?.utf8.count ?? 0) <= 512 && (server.credential?.utf8.count ?? 0) <= 2048
        }
    }
}

enum NativeInterpreterText {
    static func encode(_ text: String) -> Data? {
        guard text.utf16.count <= 20000 else { return nil }
        return try? JSONSerialization.data(withJSONObject: ["type": "rtt", "text": text])
    }
    static func decode(_ data: Data) -> String? {
        guard data.count <= 131072, let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = body["type"] as? String, ["rtt", "final"].contains(type),
              let text = body["text"] as? String, text.utf16.count <= 20000 else { return nil }
        return text
    }
}

@MainActor
protocol NativeInterpreterMediaDriving: AnyObject {
    var connected: Bool { get }
    var failed: Bool { get }
    var remoteText: String { get }
    func start(offerer: Bool, rtc: NativeInterpreterRTC,
               send: @escaping (NativeInterpreterPayload) async throws -> Void, changed: @escaping () -> Void) async throws
    func receive(_ payload: NativeInterpreterPayload) async throws
    func sendText(_ text: String)
    func stop()
}
