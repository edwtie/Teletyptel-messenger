import Foundation
import Combine

enum NativeInterfaceTheme: String, CaseIterable {
    case automatic, light, dark
    var title: String { switch self { case .automatic: return "Systeem"; case .light: return "Licht"; case .dark: return "Donker" } }
}

enum NativeChatBackground: String, CaseIterable {
    case automatic = "auto", none, soft = "wide-1", open = "wide-2", right = "wide-3", mobile
    var title: String {
        switch self { case .automatic: return "Automatisch"; case .none: return "Geen"; case .soft: return "Wereld zacht"
        case .open: return "Wereld open"; case .right: return "Wereld rechts"; case .mobile: return "Mobiel staand" }
    }
    func asset(wide: Bool) -> String? {
        switch self {
        case .automatic: return wide ? "ChatBackgroundWide" : "ChatBackground"
        case .none: return nil
        case .soft: return "ChatBackgroundWide"
        case .open: return "ChatBackgroundOpen"
        case .right: return "ChatBackgroundRight"
        case .mobile: return "ChatBackground"
        }
    }
}

struct NativeConversationSummary: Identifiable {
    let peer: String
    let kind: String
    var name: String
    var preview = ""
    var date: Date? = nil
    var id: String { NativeConversationArchive.key(peer: peer, kind: kind) }
    static func list(contacts: [NativeContact], groups: [NativeGroupConversation], messages: [NativeChatMessage], catalog: [NativeCloudConversation]) -> [Self] {
        var result: [String: Self] = [:]
        for value in catalog { let item = Self(peer: value.peer, kind: value.kind, name: value.name.isEmpty ? value.peer : value.name); result[item.id] = item }
        for contact in contacts { let item = Self(peer: contact.jid, kind: "contact", name: contact.displayName); result[item.id] = item }
        for group in groups {
            var item = Self(peer: group.room, kind: "group", name: group.room.components(separatedBy: "@")[0])
            if let last = group.messages.filter({ !$0.hidden }).max(by: { $0.date < $1.date }) {
                item.date = last.date; item.preview = last.retracted ? "Bericht ingetrokken" : (last.own ? "Ik: " : last.nickname + ": ") + last.body
            }
            result[item.id] = item
        }
        for message in messages where !message.hidden {
            let key = NativeConversationArchive.key(peer: message.peer, kind: "contact")
            var item = result[key] ?? Self(peer: message.peer, kind: "contact", name: message.peer)
            if item.date == nil || message.date >= item.date! {
                item.date = message.date; item.preview = message.retracted ? "Bericht ingetrokken" : (message.state == .incoming ? "" : "Ik: ") + message.body
                result[key] = item
            }
        }
        return result.values.sorted {
            if $0.date != $1.date { return ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
            return $0.id < $1.id
        }
    }
}

@MainActor
final class NativeConversationArchive: ObservableObject {
    @Published private(set) var entries = Set<String>()
    private let defaults: UserDefaults
    private var scope: String?
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    nonisolated static func key(peer: String, kind: String) -> String { kind + "\u{0}" + peer }
    static func valid(_ key: String) -> Bool {
        let parts = key.components(separatedBy: "\u{0}")
        return parts.count == 2 && ["contact", "group"].contains(parts[0]) && NativeChatCodec.bareJID(parts[1]) == parts[1]
    }
    func configure(_ scope: NativeHistoryScope?) {
        let next = scope.map { "teletyptel.native.archive." + $0.filename }
        guard next != self.scope else { return }
        self.scope = next; entries = []
        if let next = next, let values = defaults.stringArray(forKey: next), values.count <= 512 {
            entries = Set(values.filter(Self.valid))
        }
    }
    func contains(peer: String, kind: String) -> Bool { entries.contains(Self.key(peer: peer, kind: kind)) }
    func set(peer: String, kind: String, archived: Bool) {
        let key = Self.key(peer: peer, kind: kind)
        guard let scope = scope, Self.valid(key), !archived || entries.count < 512 || entries.contains(key) else { return }
        if archived { entries.insert(key) } else { entries.remove(key) }
        defaults.set(entries.sorted(), forKey: scope)
    }
}
