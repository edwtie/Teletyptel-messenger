import Foundation

public enum NativeGroupFailure: Error, Equatable, Sendable {
    case invalidRoom, unavailable, denied, nicknameConflict, removed, changedNickname, limit, disconnected, timedOut

    public var label: String {
        switch self {
        case .invalidRoom: return "Controleer het groepsadres en je schermnaam."
        case .unavailable: return "Deze bestaande groep is niet beschikbaar."
        case .denied: return "Geen toegang tot deze groep. Vraag de beheerder om toegang."
        case .nicknameConflict: return "Deze schermnaam is al in gebruik. Kies een andere naam."
        case .removed: return "Je deelname is door de groep beëindigd."
        case .changedNickname: return "Je schermnaam is gewijzigd. Open de groep opnieuw."
        case .limit: return "De limiet van deze groepschat-preview is bereikt."
        case .disconnected: return "Niet verbonden met de groep. Je concept blijft in deze sessie bewaard."
        case .timedOut: return "De groep antwoordt niet. Probeer opnieuw."
        }
    }
}

public protocol NativeGroupSending: NativeChatSending {
    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws
    func sendGroup(room: String, body: String, identifier: String) async throws
    func leaveGroup(room: String) async
}

public protocol NativeGroupMessageChanging: NativeGroupSending {
    func retractGroupMessage(room: String, target: String, identifier: String) async throws
}

public struct NativeGroupSnapshot: Equatable, Sendable {
    public let room: String
    public let nickname: String
    public let participants: [String]
    public let canSpeak: Bool
    public var ownRole: String = "participant"
    public var ownAffiliation: String = "none"
    public var occupants: [NativeGroupOccupant] = []
    public var supportsRetraction = false
}

public struct NativeGroupText: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public let room: String
    public let nickname: String
    public let identifier: String?
    public var archiveID: String?
    public var body: String
    public let date: Date
    public let own: Bool
    public var state: NativeMessageState
    public var occupantID: String? = nil
    public var hidden = false
    public var retracted = false
    public var actionPending = false
    public var actionRequestID: String? = nil
    public var actionNotice: String? = nil
}

public enum NativeGroupEvent: Sendable {
    case retracted(target: String, occupantID: String)
    case subject(String)
    case snapshot(NativeGroupSnapshot)
    case message(NativeGroupText)
    case rejected(String)
    case ended(NativeGroupFailure?)
}

struct NativeMUCOutput {
    var frames: [String] = []
    var events: [NativeGroupEvent] = []
}

struct NativeMUCStream {
    enum Phase: Equatable { case checking, joining, joined, ended }
    private(set) var phase: Phase = .checking
    let room: String
    let boundJID: String
    private(set) var nickname: String
    let identifier = "muc-info-" + UUID().uuidString
    private var participants: [String: String] = [:]
    private var affiliations: [String: String] = [:]
    private let owner: String
    private let creating: Bool
    private var stableOccupants = false
    private var retractionsSupported = false
    private var creationConfigured = false

    init(room: String, nickname: String, boundJID: String, creating: Bool = false) throws {
        guard let owner = NativeChatCodec.bareJID(boundJID), owner != boundJID,
              NativeChatCodec.bareJID(room) == room, Self.validNickname(nickname),
              room.components(separatedBy: "@").last == "conference." + owner.components(separatedBy: "@").last! else {
            throw NativeGroupFailure.invalidRoom
        }
        self.room = room
        self.nickname = nickname
        self.boundJID = boundJID
        self.owner = owner
        self.creating = creating
    }

    var request: String {
        "<iq xmlns='jabber:client' type='get' to='\(Self.escape(room))' id='\(identifier)'><query xmlns='http://jabber.org/protocol/disco#info'/></iq>"
    }

    var leave: String {
        "<presence xmlns='jabber:client' type='unavailable' to='\(Self.escape(room + "/" + nickname))'/>"
    }

    var canSpeak: Bool { phase == .joined && (!creating || creationConfigured) && ["participant", "moderator"].contains(participants[nickname] ?? "") }
    mutating func confirmCreation() { creationConfigured = true }
    var snapshot: NativeGroupSnapshot {
        NativeGroupSnapshot(room: room, nickname: nickname, participants: participants.keys.sorted(), canSpeak: canSpeak,
            ownRole: participants[nickname] ?? "visitor", ownAffiliation: affiliations[nickname] ?? "none",
            occupants: participants.keys.sorted().map { NativeGroupOccupant(nickname: $0, role: participants[$0]!, affiliation: affiliations[$0] ?? "none") },
            supportsRetraction: stableOccupants && retractionsSupported)
    }

    func message(body: String, identifier: String) throws -> String {
        guard canSpeak else { throw NativeGroupFailure.denied }
        guard NativeChatCodec.validBody(body), UUID(uuidString: identifier) != nil else { throw NativeChatFailure.invalidMessage }
        return "<message xmlns='jabber:client' type='groupchat' to='\(Self.escape(room))' id='\(identifier)'><body>\(Self.escape(body))</body></message>"
    }

    mutating func receive(_ root: ProbeElement) -> NativeMUCOutput {
        guard phase != .ended, root.namespace == "jabber:client",
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == boundJID,
              let from = root.attributes["from"], NativeChatCodec.bareJID(from) == room else { return NativeMUCOutput() }
        if phase == .checking {
            guard root.name == "iq", from == room, root.attributes["id"] == identifier else { return NativeMUCOutput() }
            if creating {
                guard root.attributes["type"] == "error", root.children.contains(where: { $0.name == "error" && $0.children.contains(where: { $0.name == "item-not-found" && $0.namespace == "urn:ietf:params:xml:ns:xmpp-stanzas" }) }) else { return end(.denied, sendLeave: false) }
                phase = .joining
                return NativeMUCOutput(frames: ["<presence xmlns='jabber:client' to='\(Self.escape(room + "/" + nickname))'><x xmlns='http://jabber.org/protocol/muc'><history maxstanzas='0'/></x></presence>"])
            }
            guard root.attributes["type"] == "result",
                  let query = root.children.first(where: { $0.name == "query" && $0.namespace == "http://jabber.org/protocol/disco#info" }),
                  query.children.contains(where: { $0.name == "feature" && $0.namespace == "http://jabber.org/protocol/disco#info" && $0.attributes["var"] == "http://jabber.org/protocol/muc" }) else {
                return end(.unavailable, sendLeave: false)
            }
            stableOccupants = query.children.contains { $0.name == "feature" && $0.namespace == "http://jabber.org/protocol/disco#info" && $0.attributes["var"] == "urn:xmpp:occupant-id:0" }
            retractionsSupported = query.children.contains { $0.name == "feature" && $0.namespace == "http://jabber.org/protocol/disco#info" && $0.attributes["var"] == NativeMessageActionCodec.retraction }
            phase = .joining
            return NativeMUCOutput(frames: ["<presence xmlns='jabber:client' to='\(Self.escape(room + "/" + nickname))'><x xmlns='http://jabber.org/protocol/muc'><history maxstanzas='0'/></x></presence>"])
        }
        if root.name == "presence", root.attributes["type"] == "error" {
            guard from == room || from == room + "/" + nickname else { return NativeMUCOutput() }
            let conflict = root.children.contains { $0.name == "error" && $0.children.contains { $0.name == "conflict" && $0.namespace == "urn:ietf:params:xml:ns:xmpp-stanzas" } }
            return end(conflict ? .nicknameConflict : .denied, sendLeave: true)
        }
        if phase == .joined, root.name == "message", root.attributes["type"] == "error", from == room,
           let identifier = root.attributes["id"], NativeArchiveQuery.validID(identifier) {
            return NativeMUCOutput(events: [.rejected(identifier)])
        }
        if phase == .joined, root.name == "message", root.attributes["type"] == "groupchat",
           from == room || participants[String(from.dropFirst(room.count + 1))] != nil {
            let subjects = root.children.filter { $0.name == "subject" && $0.namespace == "jabber:client" }
            if subjects.count == 1, subjects[0].children.isEmpty, subjects[0].text.utf8.count <= 512 {
                return NativeMUCOutput(events: [.subject(subjects[0].text)])
            }
        }
        guard from.hasPrefix(room + "/") else { return NativeMUCOutput() }
        let nick = String(from.dropFirst(room.count + 1))
        guard Self.validNickname(nick) else { return NativeMUCOutput() }
        if root.name == "presence" { return presence(root, nick: nick) }
        guard phase == .joined, root.name == "message", root.attributes["type"] == "groupchat",
              participants[nick] != nil else { return NativeMUCOutput() }
        let occupantIDs = root.children.filter { $0.name == "occupant-id" && $0.namespace == "urn:xmpp:occupant-id:0" }
        let occupantID = stableOccupants && occupantIDs.count == 1 ? occupantIDs.first?.attributes["id"] : nil
        let validOccupant = occupantID.flatMap { NativeMessageActionCodec.validID($0) ? $0 : nil }
        if NativeMessageActionCodec.hasChange(root) {
            guard stableOccupants, retractionsSupported, let occupant = validOccupant,
                  case .retract(let target) = NativeMessageActionCodec.decode(root) else { return NativeMUCOutput() }
            return NativeMUCOutput(events: [.retracted(target: target, occupantID: occupant)])
        }
        let bodies = root.children.filter { $0.name == "body" && $0.namespace == "jabber:client" }
        guard let body = bodies.first(where: { $0.attributes["xml:lang"] == nil }) ?? bodies.first,
              body.children.isEmpty, NativeChatCodec.validBody(body.text) else { return NativeMUCOutput() }
        let messageID = root.attributes["id"].flatMap { NativeArchiveQuery.validID($0) ? $0 : nil }
        var date = Date()
        let delays = root.children.filter { $0.name == "delay" && $0.namespace == "urn:xmpp:delay" }
        if let delay = delays.first {
            guard delays.count == 1, let stamp = delay.attributes["stamp"], stamp.utf8.count <= 64 else { return NativeMUCOutput() }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let fractional = formatter.date(from: stamp)
            formatter.formatOptions = [.withInternetDateTime]
            guard let parsed = fractional ?? formatter.date(from: stamp) else { return NativeMUCOutput() }
            date = parsed
        }
        return NativeMUCOutput(events: [.message(NativeGroupText(id: UUID(), room: room, nickname: nick,
            identifier: messageID, archiveID: NativeArchiveQuery.trustedArchiveID(root, owner: room),
            body: body.text, date: date, own: nick == nickname, state: nick == nickname ? .submitted : .incoming, occupantID: validOccupant))])
    }

    private mutating func presence(_ root: ProbeElement, nick: String) -> NativeMUCOutput {
        let extensions = root.children.filter { $0.name == "x" && $0.namespace == "http://jabber.org/protocol/muc#user" }
        guard extensions.count == 1 else { return NativeMUCOutput() }
        let items = extensions[0].children.filter { $0.name == "item" && $0.namespace == "http://jabber.org/protocol/muc#user" }
        guard items.count == 1 else { return NativeMUCOutput() }
        let item = items[0]
        let codes = extensions[0].children.filter { $0.name == "status" }.compactMap { $0.attributes["code"] }
        let own = codes.contains("110")
        if own {
            guard nick == nickname || codes.contains("210"),
                  item.attributes["jid"] == nil || item.attributes["jid"].flatMap(NativeChatCodec.bareJID) == owner else { return NativeMUCOutput() }
            if codes.contains("201") && !creating { return end(.unavailable, sendLeave: true) }
            if phase == .joining && creating && !codes.contains("201") { return end(.denied, sendLeave: true) }
            if root.attributes["type"] == "unavailable" {
                return end(codes.contains("303") ? .changedNickname : .removed, sendLeave: true)
            }
            nickname = nick
        }
        if root.attributes["type"] == "unavailable" {
            participants.removeValue(forKey: nick)
            affiliations.removeValue(forKey: nick)
        } else {
            guard root.attributes["type"] == nil,
                  let role = item.attributes["role"], ["moderator", "participant", "visitor"].contains(role) else { return NativeMUCOutput() }
            guard participants[nick] != nil || participants.count < 128 else { return end(.limit, sendLeave: true) }
            participants[nick] = role
            affiliations[nick] = ["owner", "admin", "member", "outcast", "none"].contains(item.attributes["affiliation"] ?? "") ? item.attributes["affiliation"]! : "none"
            if own { phase = .joined }
        }
        guard phase == .joined else { return NativeMUCOutput() }
        return NativeMUCOutput(events: [.snapshot(snapshot)])
    }

    private mutating func end(_ reason: NativeGroupFailure, sendLeave: Bool) -> NativeMUCOutput {
        phase = .ended
        participants.removeAll()
        return NativeMUCOutput(frames: sendLeave ? [leave] : [], events: [.ended(reason)])
    }

    static func validNickname(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf8.count <= 128 &&
        !value.contains("/") && !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }

    static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
