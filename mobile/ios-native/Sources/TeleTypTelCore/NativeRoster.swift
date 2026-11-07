import Foundation

public struct NativeContact: Identifiable, Equatable, Sendable {
    public let jid: String
    public let name: String
    public let groups: [String]
    public let subscription: String
    public var id: String { jid }
    public var displayName: String { name.isEmpty ? jid : name }
}

public enum NativeRosterState: Equatable, Sendable {
    case idle
    case loading
    case ready([NativeContact])
    case unavailable
}

struct NativeRosterOutput {
    var frames: [String] = []
    var state: NativeRosterState?
}

struct NativeRosterStream {
    private static let namespace = "jabber:iq:roster"
    private let owner: String
    private let identifier = "roster-" + UUID().uuidString
    private var pending = true
    private var loaded = false
    private var contacts: [String: NativeContact] = [:]

    init(owner: String) { self.owner = owner }

    var request: String {
        "<iq xmlns='jabber:client' type='get' id='\(identifier)'><query xmlns='\(Self.namespace)'/></iq>"
    }

    mutating func timeout() -> NativeRosterState? {
        guard pending else { return nil }
        pending = false
        return .unavailable
    }

    mutating func receive(_ root: ProbeElement) -> NativeRosterOutput {
        guard root.name == "iq", root.namespace == "jabber:client",
              root.attributes["from"] == nil || root.attributes["from"] == owner else { return NativeRosterOutput() }
        let type = root.attributes["type"]
        if pending, root.attributes["id"] == identifier, type == "result" || type == "error" {
            pending = false
            guard type == "result", let query = query(root), query.children.count <= 100 else {
                return NativeRosterOutput(state: .unavailable)
            }
            var snapshot: [String: NativeContact] = [:]
            for item in query.children {
                guard let contact = contact(item), snapshot[contact.jid] == nil else {
                    return NativeRosterOutput(state: .unavailable)
                }
                snapshot[contact.jid] = contact
            }
            contacts = snapshot
            loaded = true
            return NativeRosterOutput(state: state)
        }
        guard type == "set", let query = query(root), let pushID = root.attributes["id"], !pushID.isEmpty else {
            return NativeRosterOutput()
        }
        guard query.children.count == 1, let item = query.children.first, let contact = contact(item, allowRemoval: true) else {
            return NativeRosterOutput(frames: [reply(pushID, sender: root.attributes["from"], error: "bad-request")])
        }
        guard loaded else {
            return NativeRosterOutput(frames: [reply(pushID, sender: root.attributes["from"], error: "service-unavailable")])
        }
        if contact.subscription == "remove" { contacts.removeValue(forKey: contact.jid) }
        else {
            guard contacts[contact.jid] != nil || contacts.count < 100 else {
                return NativeRosterOutput(frames: [reply(pushID, sender: root.attributes["from"], error: "resource-constraint")])
            }
            contacts[contact.jid] = contact
        }
        return NativeRosterOutput(frames: [reply(pushID, sender: root.attributes["from"])], state: state)
    }

    private var state: NativeRosterState {
        .ready(contacts.values.sorted {
            let comparison = $0.displayName.localizedCaseInsensitiveCompare($1.displayName)
            return comparison == .orderedSame ? $0.jid < $1.jid : comparison == .orderedAscending
        })
    }

    private func query(_ root: ProbeElement) -> ProbeElement? {
        guard root.children.count == 1, let query = root.children.first,
              query.name == "query", query.namespace == Self.namespace else { return nil }
        return query
    }

    private func contact(_ item: ProbeElement, allowRemoval: Bool = false) -> NativeContact? {
        guard item.name == "item", item.namespace == Self.namespace,
              let jid = item.attributes["jid"], !jid.isEmpty, jid.utf8.count <= 1023,
              !jid.contains("/"), !jid.unicodeScalars.contains(where: {
                  CharacterSet.controlCharacters.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0)
              }), item.children.count <= 16,
              item.children.allSatisfy({ $0.name == "group" && $0.namespace == Self.namespace && $0.children.isEmpty && $0.text.utf8.count <= 256 }) else {
            return nil
        }
        let parts = jid.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count <= 2, parts.allSatisfy({ !$0.isEmpty }) else { return nil }
        let allowed = ["none", "to", "from", "both"] + (allowRemoval ? ["remove"] : [])
        let value = item.attributes["subscription"] ?? "none"
        let subscription = allowed.contains(value) ? value : "none"
        return NativeContact(jid: jid, name: item.attributes["name"] ?? "",
                             groups: item.children.map { $0.text }, subscription: subscription)
    }

    private func reply(_ identifier: String, sender: String?, error: String? = nil) -> String {
        let destination = sender.map { " to='\(Self.escape($0))'" } ?? ""
        let payload = error.map { condition in
            let type = condition == "bad-request" ? "modify" : (condition == "resource-constraint" ? "wait" : "cancel")
            return "<error type='\(type)'><\(condition) xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error>"
        } ?? ""
        return "<iq xmlns='jabber:client' type='\(error == nil ? "result" : "error")' id='\(Self.escape(identifier))'\(destination)>\(payload)</iq>"
    }

    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "'", with: "&apos;")
            .replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
}
