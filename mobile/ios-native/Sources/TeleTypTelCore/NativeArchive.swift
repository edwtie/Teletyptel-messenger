import Foundation

public enum NativeArchiveFailure: Error, Equatable {
    case unavailable, invalidResponse, busy, unstable
}

public protocol NativeArchiveSending: NativeChatSending {
    func fetchArchive(peer: String, before: String?) async throws -> NativeArchivePage
}

public struct NativeArchivedText: Equatable, Sendable {
    public let archiveID: String
    public let identifier: String?
    public let peer: String
    public let body: String
    public let date: Date
    public let outgoing: Bool
    public var change: NativeMessageChange? = nil
    public var retracted = false
}

public struct NativeArchivePage: Equatable, Sendable {
    public let owner: String
    public let peer: String
    public let messages: [NativeArchivedText]
    public let first: String?
    public let hasEarlier: Bool
}

public enum NativeHistoryState: Equatable, Sendable {
    case idle, loading, ready, unavailable, failed
}

struct NativeArchiveQuery {
    static let namespace = "urn:xmpp:mam:2"
    static let maximum = 50
    let owner: String
    let peer: String
    let boundJID: String
    let identifier = "mam-" + UUID().uuidString
    let queryID = UUID().uuidString
    let before: String?
    private var archiveIDs: [String] = []
    private var messages: [NativeArchivedText] = []
    private var bytes = 0
    private var finished = false

    init(owner: String, boundJID: String, peer: String, before: String? = nil) throws {
        guard NativeChatCodec.bareJID(owner) == owner, NativeChatCodec.bareJID(boundJID) == owner,
              boundJID != owner, NativeChatCodec.bareJID(peer) == peer, peer != owner,
              before == nil || Self.validID(before!) else { throw NativeChatFailure.invalidMessage }
        self.owner = owner
        self.boundJID = boundJID
        self.peer = peer
        self.before = before
    }

    var request: String {
        "<iq xmlns='jabber:client' type='set' to='\(Self.escape(owner))' id='\(identifier)'>" +
        "<query xmlns='\(Self.namespace)' queryid='\(queryID)'><x xmlns='jabber:x:data' type='submit'>" +
        "<field var='FORM_TYPE' type='hidden'><value>\(Self.namespace)</value></field>" +
        "<field var='with'><value>\(Self.escape(peer))</value></field></x>" +
        "<set xmlns='http://jabber.org/protocol/rsm'><max>\(Self.maximum)</max>" +
        "<before>\(Self.escape(before ?? ""))</before></set></query></iq>"
    }

    mutating func consume(_ xml: String) throws -> NativeArchivePage? {
        guard !finished else { return nil }
        let root = try ProbeXML.parse(xml)
        guard root.namespace == "jabber:client",
              root.attributes["from"] == nil || root.attributes["from"] == owner,
              root.attributes["to"] == nil || root.attributes["to"] == owner || root.attributes["to"] == boundJID else { return nil }
        if root.name == "message" {
            let results = root.children.filter { $0.name == "result" && $0.namespace == Self.namespace && $0.attributes["queryid"] == queryID }
            guard !results.isEmpty else { return nil }
            guard results.count == 1, root.children.count == 1,
                  let archiveID = results[0].attributes["id"], Self.validID(archiveID),
                  !archiveIDs.contains(archiveID), archiveIDs.count < Self.maximum else { throw NativeArchiveFailure.invalidResponse }
            bytes += xml.utf8.count
            guard bytes <= 524288 else { throw NativeArchiveFailure.invalidResponse }
            let forwarded = try Self.only(results[0], "forwarded", "urn:xmpp:forward:0")
            guard results[0].children.count == 1, forwarded.children.count == 2 else { throw NativeArchiveFailure.invalidResponse }
            let delay = try Self.only(forwarded, "delay", "urn:xmpp:delay")
            guard delay.children.isEmpty, let stamp = delay.attributes["stamp"], stamp.utf8.count <= 64,
                  let date = Self.date(stamp) else { throw NativeArchiveFailure.invalidResponse }
            let message = try Self.only(forwarded, "message", "jabber:client")
            archiveIDs.append(archiveID)
            if let text = try decode(message, archiveID: archiveID, date: date) { messages.append(text) }
            return nil
        }
        guard root.name == "iq", root.attributes["id"] == identifier else { return nil }
        if root.attributes["type"] == "error" { finished = true; throw NativeArchiveFailure.unavailable }
        guard root.attributes["type"] == "result", root.children.count == 1 else { throw NativeArchiveFailure.invalidResponse }
        let fin = try Self.only(root, "fin", Self.namespace)
        guard [nil, "true", "false", "1", "0"].contains(fin.attributes["complete"]),
              [nil, "true", "false", "1", "0"].contains(fin.attributes["stable"]) else { throw NativeArchiveFailure.invalidResponse }
        if ["false", "0"].contains(fin.attributes["stable"] ?? "") { throw NativeArchiveFailure.unstable }
        let set = try Self.only(fin, "set", "http://jabber.org/protocol/rsm")
        let first = try Self.cursor(set, "first")
        let last = try Self.cursor(set, "last")
        guard first == archiveIDs.first, last == archiveIDs.last,
              first == nil || first != before else { throw NativeArchiveFailure.invalidResponse }
        let firstElement = set.children.first { $0.name == "first" && $0.namespace == "http://jabber.org/protocol/rsm" }
        let atBeginning = firstElement?.attributes["index"] == "0"
        let complete = ["true", "1"].contains(fin.attributes["complete"] ?? "")
        finished = true
        return NativeArchivePage(owner: owner, peer: peer, messages: messages,
                                 first: first, hasEarlier: !complete && !atBeginning && first != nil)
    }

    private func decode(_ message: ProbeElement, archiveID: String, date: Date) throws -> NativeArchivedText? {
        guard [nil, "normal", "chat"].contains(message.attributes["type"]) else { return nil }
        guard let from = message.attributes["from"].flatMap(NativeChatCodec.bareJID),
              let to = message.attributes["to"].flatMap(NativeChatCodec.bareJID),
              (from == owner && to == peer) || (from == peer && to == owner) else { throw NativeArchiveFailure.invalidResponse }
        let tombstones = message.children.filter { $0.name == "retracted" && $0.namespace == NativeMessageActionCodec.retraction }
        if !tombstones.isEmpty {
            guard tombstones.count == 1, tombstones[0].children.isEmpty,
                  let request = tombstones[0].attributes["id"], NativeMessageActionCodec.validID(request),
                  let identifier = message.attributes["id"], NativeMessageActionCodec.validID(identifier),
                  !message.children.contains(where: { $0.name == "retract" || $0.name == "replace" }) else { throw NativeArchiveFailure.invalidResponse }
            return NativeArchivedText(archiveID: archiveID, identifier: identifier, peer: peer,
                body: "", date: date, outgoing: from == owner, retracted: true)
        }
        if NativeMessageActionCodec.hasChange(message) {
            guard let identifier = message.attributes["id"], NativeMessageActionCodec.validID(identifier),
                  let change = NativeMessageActionCodec.decode(message), identifier != change.target else { throw NativeArchiveFailure.invalidResponse }
            return NativeArchivedText(archiveID: archiveID, identifier: identifier, peer: peer,
                body: "", date: date, outgoing: from == owner, change: change)
        }
        let bodies = message.children.filter { $0.name == "body" && $0.namespace == "jabber:client" }
        guard let body = bodies.first(where: { $0.attributes["xml:lang"] == nil }) ?? bodies.first else { return nil }
        guard body.children.isEmpty, NativeChatCodec.validBody(body.text) else { throw NativeArchiveFailure.invalidResponse }
        let identifier = message.attributes["id"].flatMap { Self.validID($0) ? $0 : nil }
        return NativeArchivedText(archiveID: archiveID, identifier: identifier, peer: peer,
                                  body: body.text, date: date, outgoing: from == owner)
    }

    static func trustedArchiveID(_ root: ProbeElement, owner: String) -> String? {
        let identifiers = root.children.filter { $0.name == "stanza-id" && $0.namespace == "urn:xmpp:sid:0" && $0.attributes["by"] == owner }
        guard identifiers.count == 1, identifiers[0].children.isEmpty,
              let identifier = identifiers[0].attributes["id"], validID(identifier) else { return nil }
        return identifier
    }

    static func validID(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 512 && !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }

    private static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private static func only(_ root: ProbeElement, _ name: String, _ namespace: String) throws -> ProbeElement {
        let matches = root.children.filter { $0.name == name && $0.namespace == namespace }
        guard matches.count == 1 else { throw NativeArchiveFailure.invalidResponse }
        return matches[0]
    }

    private static func cursor(_ root: ProbeElement, _ name: String) throws -> String? {
        let matches = root.children.filter { $0.name == name && $0.namespace == "http://jabber.org/protocol/rsm" }
        guard matches.count <= 1 else { throw NativeArchiveFailure.invalidResponse }
        guard let element = matches.first else { return nil }
        guard element.children.isEmpty, validID(element.text) else { throw NativeArchiveFailure.invalidResponse }
        return element.text
    }

    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

final class NativeArchiveCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    func cancel() { lock.lock(); cancelled = true; lock.unlock() }
}
