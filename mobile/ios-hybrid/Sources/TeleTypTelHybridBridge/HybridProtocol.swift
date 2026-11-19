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
        guard Set(values.allKeys.map(\.stringValue)) == Set(["version", "id", "command", "arguments"]) else {
            throw HybridFailure.invalidRequest
        }
        version = try values.decode(Int.self, forKey: Key(stringValue: "version")!)
        id = try values.decode(UUID.self, forKey: Key(stringValue: "id")!)
        command = try values.decode(String.self, forKey: Key(stringValue: "command")!)
        arguments = try values.decode([String: String].self, forKey: Key(stringValue: "arguments")!)
        guard version == 1 else { throw HybridFailure.invalidRequest }
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
        case "session.snapshot", "session.cancel", "session.logout":
            guard arguments.isEmpty else { throw HybridFailure.invalidRequest }
        default:
            throw HybridFailure.unavailable
        }
    }

    static func decode(_ data: Data) throws -> Self {
        guard !data.isEmpty, data.count <= 8192 else { throw HybridFailure.invalidRequest }
        do { return try JSONDecoder().decode(Self.self, from: data) }
        catch let failure as HybridFailure { throw failure }
        catch { throw HybridFailure.invalidRequest }
    }
}

public struct HybridSnapshot: Codable, Equatable {
    public let version: Int
    public let sequence: Int
    public let phase: String
    public let errorCode: String?
    public let chatAvailable: Bool
    public let callsAvailable: Bool
    public let socialLoginAvailable: Bool
}

public struct HybridReply: Encodable {
    public let version: Int
    public let id: String
    public let snapshot: HybridSnapshot
}
