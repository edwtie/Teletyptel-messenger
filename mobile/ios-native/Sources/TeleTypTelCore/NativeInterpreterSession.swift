import Foundation
import Combine

struct NativeInterpreterDashboard: Decodable {
    let ok: Bool
    let csrfToken: String
    let accountId: String
    let jid: String
    let rooms: [NativeInterpreterRoom]
}

@MainActor
protocol NativeInterpreterServing: AnyObject {
    func dashboard() async throws -> NativeInterpreterDashboard
    func snapshot(_ room: String) async throws -> NativeInterpreterSnapshot
    func request(peer: String, sid: String) async throws -> String
    func join(room: String, sid: String) async throws
    func leave(room: String) async throws
    func signal(room: String, recipient: String, payload: NativeInterpreterPayload) async throws
    func rtc() async throws -> NativeInterpreterRTC
}

@MainActor
final class NativeInterpreterAPI: NativeInterpreterServing {
    private let session: NativeAccountWebSession
    private let account: String
    private var csrf: String?
    init(session: NativeAccountWebSession, account: String) { self.session = session; self.account = account }
    private func checked(_ data: Data) throws -> Data {
        guard data.count <= 1048576, let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              body["ok"] as? Bool == true, let token = body["csrfToken"] as? String,
              token.range(of: #"\A[a-f0-9]{64}\z"#, options: .regularExpression) != nil else { throw NativeInterpreterFailure.invalid }
        csrf = token
        return data
    }
    func dashboard() async throws -> NativeInterpreterDashboard {
        let result = try JSONDecoder().decode(NativeInterpreterDashboard.self, from: checked(await session.request(.interpreter)))
        guard result.accountId == account, NativeChatCodec.bareJID(result.jid) == result.jid,
              result.rooms.count <= 20, Set(result.rooms.map(\.room_id)).count == result.rooms.count,
              result.rooms.allSatisfy(\.valid) else { throw NativeInterpreterFailure.invalid }
        return result
    }
    func snapshot(_ room: String) async throws -> NativeInterpreterSnapshot {
        let result = try JSONDecoder().decode(NativeInterpreterSnapshot.self,
            from: checked(await session.request(.interpreter, interpreterRoom: room)))
        guard result.accountId == account else { throw NativeInterpreterFailure.invalid }
        return result
    }
    private func post(_ input: [String: Any]) async throws -> [String: Any] {
        guard let csrf = csrf else { throw NativeInterpreterFailure.unavailable }
        let body = try JSONSerialization.data(withJSONObject: input)
        guard body.count <= 60000 else { throw NativeInterpreterFailure.invalid }
        let data = try checked(await session.request(.interpreter, body: body, csrf: csrf))
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
    func request(peer: String, sid: String) async throws -> String {
        guard NativeChatCodec.bareJID(peer) == peer, NativeJingleTransport.validSID(sid) else { throw NativeInterpreterFailure.invalid }
        let result = try await post(["action": "request", "provider": "internal", "peer": peer, "callId": sid])
        guard let room = result["roomId"] as? String, NativeInterpreterRoom.identifier(room) else { throw NativeInterpreterFailure.invalid }
        return room
    }
    func join(room: String, sid: String) async throws {
        guard NativeInterpreterRoom.identifier(room), NativeJingleTransport.validSID(sid) else { throw NativeInterpreterFailure.invalid }
        _ = try await post(["action": "join", "roomId": room, "callId": sid, "consent": true])
    }
    func leave(room: String) async throws {
        guard NativeInterpreterRoom.identifier(room) else { throw NativeInterpreterFailure.invalid }
        _ = try await post(["action": "leave", "roomId": room])
    }
    func signal(room: String, recipient: String, payload: NativeInterpreterPayload) async throws {
        guard NativeInterpreterRoom.identifier(room), NativeInterpreterRoom.account(recipient), recipient != account, payload.valid else {
            throw NativeInterpreterFailure.invalid
        }
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(payload))
        _ = try await post(["action": "signal", "roomId": room, "recipient": recipient, "payload": body])
    }
    func rtc() async throws -> NativeInterpreterRTC {
        let data = try await session.request(.rtc)
        guard data.count <= 65536 else { throw NativeInterpreterFailure.invalid }
        let result = try JSONDecoder().decode(NativeInterpreterRTC.self, from: data)
        guard result.valid else { throw NativeInterpreterFailure.invalid }
        return result
    }
}

@MainActor
final class NativeInterpreterSession: ObservableObject {
    @Published private(set) var notice = "Start of beantwoord eerst een gesprek."
    @Published private(set) var available = false
    @Published private(set) var room: NativeInterpreterRoom?
    @Published private(set) var needsConsent = false
    @Published private(set) var connected = false
    @Published private(set) var remoteText = ""
    @Published private(set) var interpreterName = "Gebarentolk"
    private var client: (any NativeInterpreterServing)?
    private weak var media: (any NativeInterpreterMediaDriving)?
    private var context: Context?
    private var generation = UUID()
    private var loop: Task<Void, Never>?
    private var agreed: String?
    private var joined = false
    private var starting = false
    private var busy = false
    private var seen = Set<String>()
    private let pollAutomatically: Bool
    private struct Context: Equatable { let sid: String; let owner: String; let peer: String; let account: String }

    init(pollAutomatically: Bool = true) { self.pollAutomatically = pollAutomatically }
    deinit { loop?.cancel() }
    func connect(client: any NativeInterpreterServing, media: any NativeInterpreterMediaDriving,
                 sid: String, owner: String, peer: String, account: String) {
        let value = Context(sid: sid, owner: owner, peer: peer, account: account)
        guard context != value else { return }
        stop()
        guard NativeJingleTransport.validSID(sid), NativeChatCodec.bareJID(owner) == owner,
              NativeChatCodec.bareJID(peer) == peer, owner != peer, NativeInterpreterRoom.account(account) else { return }
        context = value; self.client = client; self.media = media
        guard pollAutomatically else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.poll()
                do { try await Task.sleep(nanoseconds: 1_000_000_000) } catch { return }
            }
        }
    }

    func request() async {
        guard !busy, available, room == nil, agreed == nil, let context = context, let client = client else { return }
        busy = true
        let attempt = generation
        defer { if generation == attempt { busy = false } }
        do {
            let identifier = try await client.request(peer: context.peer, sid: context.sid)
            guard generation == attempt else { try? await client.leave(room: identifier); return }
            agreed = identifier
            notice = "Gebarentolk zoeken… Je oorspronkelijke gesprek gaat verder."
        } catch { if generation == attempt { notice = "Tolkaanvraag niet bevestigd. Je gesprek gaat verder." } }
    }

    func allow() { guard let room = room else { return }; agreed = room.room_id; needsConsent = false }

    func poll() async {
        guard !busy, let context = context, let client = client else { return }
        busy = true
        let attempt = generation
        defer { if generation == attempt { busy = false } }
        do {
            if room == nil {
                let dashboard = try await client.dashboard()
                guard generation == attempt else { return }
                guard dashboard.ok, dashboard.accountId == context.account, dashboard.jid == context.owner else { throw NativeInterpreterFailure.invalid }
                available = true
                let matches = dashboard.rooms.filter { $0.matches(owner: context.owner, peerJID: context.peer, account: context.account, sid: context.sid) }
                guard matches.count <= 1 else { throw NativeInterpreterFailure.invalid }
                room = matches.first
                if room == nil { notice = "Je kunt een bevoegde gebarentolk aan dit gesprek toevoegen."; return }
            }
            guard let expected = room else { return }
            let snapshot = try await client.snapshot(expected.room_id)
            guard generation == attempt else { return }
            guard snapshot.valid(for: expected, account: context.account) else { throw NativeInterpreterFailure.invalid }
            room = snapshot.room
            if snapshot.room.status == "ended" { stop(notify: false); notice = "De tolksessie is beëindigd. Je gesprek gaat verder."; return }
            needsConsent = agreed != expected.room_id
            guard !needsConsent else { notice = "Je gesprekspartner vraagt een tolk. Geef eerst toestemming voor beeld, geluid en live tekst."; return }
            if !joined, ["ready", "active"].contains(snapshot.room.status) {
                try await client.join(room: expected.room_id, sid: context.sid)
                guard generation == attempt else { return }
                joined = true
            }
            guard joined, snapshot.room.status == "active", let recipient = snapshot.room.interpreter_id else {
                notice = "Wachten op een tolk en toestemming van alle drie deelnemers…"; return
            }
            interpreterName = snapshot.members.first { $0.account_id == recipient }?.display_name ?? "Gebarentolk"
            if !starting {
                starting = true
                let rtc = try await client.rtc()
                guard generation == attempt, let media = media else { return }
                try await media.start(offerer: context.account < recipient, rtc: rtc, send: { [weak self] payload in
                    guard let self = self, self.generation == attempt, self.joined, self.agreed == expected.room_id else { throw NativeInterpreterFailure.expired }
                    try await client.signal(room: expected.room_id, recipient: recipient, payload: payload)
                }, changed: { [weak self] in
                    guard let self = self, self.generation == attempt else { return }
                    self.connected = self.media?.connected == true
                    self.remoteText = self.media?.remoteText ?? ""
                    if self.media?.failed == true {
                        self.stop(); self.notice = "De tolkverbinding is mislukt. Je gesprek blijft behouden."
                    }
                })
                guard generation == attempt else { return }
            }
            for signal in snapshot.signals where !seen.contains(signal.signal_id) {
                guard signal.signal_id.range(of: #"\A[a-f0-9]{32}\z"#, options: .regularExpression) != nil,
                      signal.sender == recipient, signal.payload.utf8.count <= 60000,
                      let data = signal.payload.data(using: .utf8) else { throw NativeInterpreterFailure.invalid }
                let payload = try JSONDecoder().decode(NativeInterpreterPayload.self, from: data)
                guard payload.valid else { throw NativeInterpreterFailure.invalid }
                try await media?.receive(payload)
                guard generation == attempt else { return }
                seen.insert(signal.signal_id)
            }
            connected = media?.connected == true
            notice = connected ? "Gebarentolk verbonden." : "Tolkverbinding wordt opgebouwd…"
        } catch {
            guard generation == attempt else { return }
            if room != nil { stop(); notice = "Tolkverbinding onderbroken. Je oorspronkelijke gesprek blijft behouden." }
            else { available = false; notice = "De tolkdienst is nu niet beschikbaar." }
        }
    }

    func sendText(_ text: String) {
        guard joined, room?.status == "active", agreed == room?.room_id else { return }
        media?.sendText(text)
    }
    func stop(notify: Bool = true) {
        let previous = room?.room_id ?? agreed
        let client = client
        generation = UUID(); loop?.cancel(); loop = nil
        media?.stop(); media = nil
        self.client = nil; context = nil; room = nil; agreed = nil
        joined = false; starting = false; busy = false; needsConsent = false; connected = false; available = false
        seen.removeAll(); remoteText = ""; interpreterName = "Gebarentolk"
        if notify, let previous = previous, let client = client { Task { try? await client.leave(room: previous) } }
    }
}
