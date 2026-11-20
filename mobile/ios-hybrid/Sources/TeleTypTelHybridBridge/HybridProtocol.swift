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
        arguments = try values.decode([String: String].self, forKey: Key(stringValue: "arguments")!)
        epoch = try values.decodeIfPresent(UUID.self, forKey: Key(stringValue: "epoch")!)
        guard version == 1 else { throw HybridFailure.invalidRequest }
        if command.hasPrefix("chat.") || command.hasPrefix("calls.") {
            guard epoch != nil else { throw HybridFailure.invalidRequest }
        }
        switch command {
        case "session.login":
            guard Set(arguments.keys) == Set(["jid", "password"]),
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
                  let action = arguments["action"], ["answer", "end", "mute", "camera", "switchCamera", "rtt", "dtmf", "fit"].contains(action) else { throw HybridFailure.invalidRequest }
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
