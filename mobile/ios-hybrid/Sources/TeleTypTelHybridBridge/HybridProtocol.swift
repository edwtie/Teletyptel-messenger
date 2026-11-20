import Foundation

public enum HybridFailure: String, Error {
    case invalidRequest, untrustedDocument, replayedRequest, sessionBusy, invalidState, unavailable
}

public enum HybridDocumentPolicy {
    public static func permits(_ url: URL?, mainFrame: Bool) -> Bool {
        guard mainFrame, let url = url,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return parts.scheme == "capacitor" && parts.host == "localhost" && parts.port == nil
            && parts.user == nil && parts.password == nil && parts.path == "/chat.html"
            && parts.percentEncodedPath == "/chat.html" && parts.query == nil && parts.fragment == nil
    }
}

struct HybridRequest: Decodable, CustomStringConvertible, CustomDebugStringConvertible {
    let version: Int
    let id: UUID
    let command: String
    let arguments: [String: String]
    let epoch: UUID?
    let kind: String

    var description: String { "HybridRequest(redacted)" }
    var debugDescription: String { description }

    private struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: Key.self)
        let keys = Set(values.allKeys.map(\.stringValue))
        guard keys == Set(["version", "id", "command", "arguments"]) || keys == Set(["version", "id", "command", "arguments", "epoch"]) else {
            throw HybridFailure.invalidRequest
        }
        version = try values.decode(Int.self, forKey: Key(stringValue: "version")!)
        id = try values.decode(UUID.self, forKey: Key(stringValue: "id")!)
        command = try values.decode(String.self, forKey: Key(stringValue: "command")!)
        var rawArguments = try values.decode([String: String].self, forKey: Key(stringValue: "arguments")!)
        guard rawArguments["kind"] == nil || command.hasPrefix("chat.") else { throw HybridFailure.invalidRequest }
        kind = rawArguments.removeValue(forKey: "kind") ?? "direct"
        guard ["direct", "group"].contains(kind), kind == "direct" || command.hasPrefix("chat.") else { throw HybridFailure.invalidRequest }
        arguments = rawArguments
        epoch = try values.decodeIfPresent(UUID.self, forKey: Key(stringValue: "epoch")!)
        guard version == 1 else { throw HybridFailure.invalidRequest }
        if ["session.cancel", "session.logout", "session.verifySecondFactor"].contains(command) || ["chat.", "calls.", "groups.", "files.", "translation.", "auth.", "account.", "contacts."].contains(where: command.hasPrefix) {
            guard epoch != nil else { throw HybridFailure.invalidRequest }
        }
        switch command {
        case "auth.social":
            guard Set(arguments.keys) == Set(["provider"]), ["google", "facebook"].contains(arguments["provider"] ?? "") else { throw HybridFailure.invalidRequest }
        case "auth.biometric", "auth.forget", "auth.privacy", "account.refresh", "account.avatar":
            guard arguments.isEmpty else { throw HybridFailure.invalidRequest }
        case "history.search":
            guard Set(arguments.keys) == Set(["query", "archived"]), let query = arguments["query"], Self.text(query, maximumBytes: 256),
                  ["true", "false"].contains(arguments["archived"] ?? "") else { throw HybridFailure.invalidRequest }
        case "history.open", "history.archive", "history.earlier", "history.refresh", "history.chat":
            guard Set(arguments.keys) == (command == "history.archive" ? Set(["id", "archived"]) : Set(["id"])),
                  UUID(uuidString: arguments["id"] ?? "") != nil else { throw HybridFailure.invalidRequest }
            if command == "history.archive", !["true", "false"].contains(arguments["archived"] ?? "") { throw HybridFailure.invalidRequest }
        case "history.close":
            guard arguments.isEmpty else { throw HybridFailure.invalidRequest }
        case "auth.recover":
            guard Set(arguments.keys) == Set(["jid"]), let jid = arguments["jid"], !jid.isEmpty, Self.text(jid, maximumBytes: 320) else { throw HybridFailure.invalidRequest }
        case "auth.register":
            guard Set(arguments.keys) == Set(["jid", "name", "password", "consent"]), Self.peer(arguments["jid"]),
                  let name = arguments["name"], !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, Self.text(name, maximumBytes: 120),
                  let password = arguments["password"], !password.isEmpty, Self.text(password, maximumBytes: 1024), arguments["consent"] == "true" else { throw HybridFailure.invalidRequest }
        case "account.save":
            guard Set(arguments.keys) == Set(["name", "phone", "language", "color"]), let name = arguments["name"], !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  Self.text(name, maximumBytes: 120), let phone = arguments["phone"], Self.text(phone, maximumBytes: 64),
                  ["nl", "en", "de", "fr", "es", "it", "pt", "pl", "tr", "ar", "uk", "zh-CN"].contains(arguments["language"] ?? ""),
                  arguments["color"]?.range(of: #"\A#[a-fA-F0-9]{6}\z"#, options: .regularExpression) != nil else { throw HybridFailure.invalidRequest }
        case "account.panel":
            guard Set(arguments.keys) == Set(["panel"]), ["settings", "security", "dialer"].contains(arguments["panel"] ?? "") else { throw HybridFailure.invalidRequest }
        case "contacts.rename", "contacts.block", "contacts.remove", "contacts.dnd":
            let required = command == "contacts.rename" ? Set(["jid", "name"]) : command == "contacts.block" ? Set(["jid", "blocked"]) : command == "contacts.remove" ? Set(["jid"]) : Set(["enabled"])
            guard Set(arguments.keys) == required else { throw HybridFailure.invalidRequest }
            if command != "contacts.dnd", !Self.peer(arguments["jid"]) { throw HybridFailure.invalidRequest }
            if command == "contacts.rename" { guard let name = arguments["name"], Self.text(name, maximumBytes: 120) else { throw HybridFailure.invalidRequest } }
            if command == "contacts.block", !["true", "false"].contains(arguments["blocked"] ?? "") { throw HybridFailure.invalidRequest }
            if command == "contacts.dnd", !["true", "false"].contains(arguments["enabled"] ?? "") { throw HybridFailure.invalidRequest }
        case "contacts.add":
            guard Set(arguments.keys) == Set(["jid", "name", "presence"]), Self.peer(arguments["jid"]), let name = arguments["name"], Self.text(name, maximumBytes: 120),
                  ["true", "false"].contains(arguments["presence"] ?? "") else { throw HybridFailure.invalidRequest }
        case "contacts.respond":
            guard Set(arguments.keys) == Set(["jid", "allow"]), Self.peer(arguments["jid"]), ["true", "false"].contains(arguments["allow"] ?? "") else { throw HybridFailure.invalidRequest }
        case "groups.join":
            guard Set(arguments.keys) == Set(["room", "nickname", "create"]), Self.peer(arguments["room"]),
                  let nickname = arguments["nickname"], !nickname.isEmpty, nickname.utf8.count <= 128,
                  !nickname.contains("/"), Self.text(nickname), !nickname.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains),
                  ["true", "false"].contains(arguments["create"] ?? "") else { throw HybridFailure.invalidRequest }
        case "groups.configuration":
            guard Set(arguments.keys) == Set(["room"]), Self.peer(arguments["room"]) else { throw HybridFailure.invalidRequest }
        case "groups.configure":
            guard Set(arguments.keys) == Set(["room", "token", "name", "description", "membersOnly", "moderated", "publicRoom", "persistent", "allowInvites", "confirmed"]),
                  Self.peer(arguments["room"]), UUID(uuidString: arguments["token"] ?? "") != nil, arguments["confirmed"] == "true",
                  let name = arguments["name"], Self.text(name, maximumBytes: 120), let description = arguments["description"], Self.text(description, maximumBytes: 1024),
                  ["membersOnly", "moderated", "publicRoom", "persistent", "allowInvites"].allSatisfy({ ["true", "false"].contains(arguments[$0] ?? "") }) else { throw HybridFailure.invalidRequest }
        case "groups.members", "groups.affiliation":
            let required = command == "groups.members" ? Set(["room", "affiliation"]) : Set(["room", "peer", "affiliation", "confirmed"])
            guard Set(arguments.keys) == required, Self.peer(arguments["room"]),
                  (command == "groups.members" ? ["member", "admin", "outcast"] : ["none", "member", "admin", "outcast"]).contains(arguments["affiliation"] ?? "") else { throw HybridFailure.invalidRequest }
            if command == "groups.affiliation", (!Self.peer(arguments["peer"]) || arguments["confirmed"] != "true") { throw HybridFailure.invalidRequest }
        case "groups.call", "groups.leave", "groups.subject", "groups.invite", "groups.role":
            let required = ["groups.call", "groups.leave"].contains(command) ? Set(["room"]) : command == "groups.subject" ? Set(["room", "subject"])
                : command == "groups.invite" ? Set(["room", "peer"]) : Set(["room", "nickname", "role"])
            guard Set(arguments.keys) == required, Self.peer(arguments["room"]) else { throw HybridFailure.invalidRequest }
            if command == "groups.subject" { guard let text = arguments["subject"], Self.text(text), text.utf8.count <= 512 else { throw HybridFailure.invalidRequest } }
            if command == "groups.invite", !Self.peer(arguments["peer"]) { throw HybridFailure.invalidRequest }
            if command == "groups.role" {
                guard let nick = arguments["nickname"], !nick.isEmpty, nick.utf8.count <= 128, Self.text(nick),
                      ["none", "visitor", "participant", "moderator"].contains(arguments["role"] ?? "") else { throw HybridFailure.invalidRequest }
            }
        case "translation.settings":
            guard Set(arguments.keys) == Set(["mode", "language", "consent", "liveConsent", "ownLiveConsent"]),
                  ["off", "manual", "automatic"].contains(arguments["mode"] ?? ""),
                  ["nl", "en", "de", "fr", "es", "it", "pt", "pl", "tr", "ar", "uk", "zh-CN"].contains(arguments["language"] ?? ""),
                  ["consent", "liveConsent", "ownLiveConsent"].allSatisfy({ ["true", "false"].contains(arguments[$0] ?? "") }),
                  arguments["mode"] == "off" || arguments["consent"] == "true" else { throw HybridFailure.invalidRequest }
        case "translation.message", "files.open":
            guard Set(arguments.keys) == Set(["id"]), UUID(uuidString: arguments["id"] ?? "") != nil else { throw HybridFailure.invalidRequest }
        case "files.pick", "translation.disable":
            guard arguments.isEmpty else { throw HybridFailure.invalidRequest }
        case "session.login":
            guard Set(arguments.keys) == Set(["jid", "password"]) || Set(arguments.keys) == Set(["jid", "password", "remember"]) else { throw HybridFailure.invalidRequest }
            guard arguments["remember"] == nil || ["true", "false"].contains(arguments["remember"]!) else { throw HybridFailure.invalidRequest }
            guard
                  let jid = arguments["jid"], !jid.isEmpty, jid.utf8.count <= 1023,
                  let password = arguments["password"], !password.isEmpty, password.utf8.count <= 1024,
                  !jid.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
                  !password.unicodeScalars.contains(where: { $0.value == 0 }) else { throw HybridFailure.invalidRequest }
        case "session.verifySecondFactor":
            guard Set(arguments.keys) == Set(["code"]), let code = arguments["code"],
                  code.utf8.count == 6, code.utf8.allSatisfy({ (48...57).contains($0) }) else {
                throw HybridFailure.invalidRequest
            }
        case "chat.open", "calls.start":
            let expected = command == "chat.open" ? Set(["peer"]) : Set(["peer", "mode"])
            guard Set(arguments.keys) == expected, Self.peer(arguments["peer"]) else { throw HybridFailure.invalidRequest }
            if command == "calls.start", !["audio", "video", "audio-rtt", "total"].contains(arguments["mode"] ?? "") {
                throw HybridFailure.invalidRequest
            }
        case "chat.draft", "chat.send":
            guard Set(arguments.keys) == Set(["peer", "body"]), Self.peer(arguments["peer"]),
                  let body = arguments["body"], Self.text(body),
                  command == "chat.draft" || !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw HybridFailure.invalidRequest
            }
        case "chat.displayed":
            guard Set(arguments.keys) == Set(["peer", "ids"]), Self.peer(arguments["peer"]),
                  let raw = arguments["ids"] else { throw HybridFailure.invalidRequest }
            let ids = raw.split(separator: ",", omittingEmptySubsequences: false)
            guard !ids.isEmpty, ids.count <= 50, Set(ids).count == ids.count,
                  ids.allSatisfy({ UUID(uuidString: String($0)) != nil }) else { throw HybridFailure.invalidRequest }
        case "chat.edit", "chat.hide", "chat.retract", "chat.forward", "chat.react":
            let extra = command == "chat.edit" ? "body" : command == "chat.forward" ? "target" : command == "chat.react" ? "emoji" : nil
            let expected = extra.map { Set(["peer", "id", $0]) } ?? Set(["peer", "id"])
            guard Set(arguments.keys) == expected, Self.peer(arguments["peer"]),
                  UUID(uuidString: arguments["id"] ?? "") != nil else { throw HybridFailure.invalidRequest }
            if command == "chat.edit" {
                guard let body = arguments["body"], Self.text(body), !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw HybridFailure.invalidRequest }
            }
            if command == "chat.forward", !Self.peer(arguments["target"]) { throw HybridFailure.invalidRequest }
            if command == "chat.react" {
                guard let emoji = arguments["emoji"], !emoji.isEmpty, emoji.utf8.count <= 32, Self.text(emoji) else { throw HybridFailure.invalidRequest }
            }
        case "calls.control":
            guard Set(arguments.keys).isSubset(of: Set(["id", "action", "value"])),
                  arguments["id"] != nil, arguments["action"] != nil,
                  UUID(uuidString: arguments["id"] ?? "") != nil,
                  let action = arguments["action"], ["answer", "end", "mute", "camera", "switchCamera", "rtt", "dtmf", "fit", "interpreter"].contains(action) else { throw HybridFailure.invalidRequest }
            if action == "rtt" {
                guard let value = arguments["value"], Self.text(value, maximumBytes: 131072), value.unicodeScalars.count <= 32768 else { throw HybridFailure.invalidRequest }
            }
            else if action == "dtmf" { guard let value = arguments["value"], value.count == 1, "0123456789*#ABCD".contains(value) else { throw HybridFailure.invalidRequest } }
            else if action == "fit" { guard ["contain", "cover"].contains(arguments["value"] ?? "") else { throw HybridFailure.invalidRequest } }
            else if arguments["value"] != nil { throw HybridFailure.invalidRequest }
        case "calls.layout":
            guard Set(arguments.keys) == Set(["id", "x", "y", "width", "height", "viewportWidth", "viewportHeight"]),
                  UUID(uuidString: arguments["id"] ?? "") != nil else { throw HybridFailure.invalidRequest }
            _ = try HybridVideoPlacement(arguments: arguments)
        case "session.snapshot", "session.cancel", "session.logout", "app.openSettings", "chat.close", "calls.reset":
            guard arguments.isEmpty else { throw HybridFailure.invalidRequest }
        default:
            throw HybridFailure.unavailable
        }
    }

    static func decode(_ data: Data) throws -> Self {
        guard !data.isEmpty, data.count <= 262144 else { throw HybridFailure.invalidRequest }
        do { return try JSONDecoder().decode(Self.self, from: data) }
        catch let failure as HybridFailure { throw failure }
        catch { throw HybridFailure.invalidRequest }
    }

    static func peer(_ value: String?) -> Bool {
        guard let value = value else { return false }
        return !value.isEmpty && value.utf8.count <= 1023 && !value.contains("/")
            && !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0) })
    }

    static func text(_ value: String, maximumBytes: Int = 8192) -> Bool {
        value.utf8.count <= maximumBytes && value.unicodeScalars.allSatisfy {
            $0.value == 9 || $0.value == 10 || $0.value == 13 || (0x20...0xD7FF).contains($0.value)
                || (0xE000...0xFFFD).contains($0.value) || (0x10000...0x10FFFF).contains($0.value)
        }
    }
}

public struct HybridSnapshot: Codable, Equatable {
    public let version: Int
    public let sequence: Int
    public let epoch: String
    public let phase: String
    public let errorCode: String?
    public let chatAvailable: Bool
    public let callsAvailable: Bool
    public let socialLoginAvailable: Bool
    public let settingsAvailable: Bool
    public let roster: HybridRoster
    public let conversation: HybridConversation?
    public let call: HybridCallState
    public var groups: [HybridGroup] = []
    public var groupsAvailable = false
    public var groupNotice: String? = nil
    public var extras = HybridExtrasState()
    public var account = HybridAccountState()
    public var history = HybridHistoryState()
    public var groupAdministration: HybridGroupAdministrationState?
}

public struct HybridContact: Codable, Equatable {
    public let jid: String
    public let name: String
    public let presence: String
    public let canCall: Bool
}

public struct HybridRoster: Codable, Equatable {
    public let status: String
    public let contacts: [HybridContact]
}

public struct HybridReply: Encodable {
    public let version: Int
    public let id: String
    public let snapshot: HybridSnapshot
}
