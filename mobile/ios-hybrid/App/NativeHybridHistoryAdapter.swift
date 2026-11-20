import Combine
import Foundation

@MainActor
final class NativeHybridHistoryAdapter: HybridHistoryPort {
    var onOpen: ((String, String) -> Bool)?
    var onArchive: ((String, String) -> Void)?
    private weak var login: NativeLoginModel?
    private let configuration: ServerConfiguration
    private let archive: NativeConversationArchive
    private var epoch: String?
    private var active = false
    private var query = ""
    private var archivedOnly = false
    private var identities: [String: String] = [:]
    private var selection: (id: String, peer: String, kind: String, name: String)?
    private let subject = CurrentValueSubject<HybridHistoryState, Never>(HybridHistoryState())
    private var observations: [AnyCancellable] = []
    var state: HybridHistoryState { subject.value }
    var changes: AnyPublisher<HybridHistoryState, Never> { subject.eraseToAnyPublisher() }

    init(login: NativeLoginModel, configuration: ServerConfiguration, defaults: UserDefaults = .standard) {
        self.login = login; self.configuration = configuration; archive = NativeConversationArchive(defaults: defaults)
        for publisher in [archive.objectWillChange.eraseToAnyPublisher(), login.cloudHistory.objectWillChange.eraseToAnyPublisher()] {
            observations.append(publisher.sink { [weak self] _ in Task { @MainActor [weak self] in self?.refresh() } })
        }
    }

    func update(epoch: String, active: Bool) {
        if self.epoch != epoch || self.active && !active {
            selection = nil; identities.removeAll(); query = ""; archivedOnly = false; archive.configure(nil)
        }
        self.epoch = epoch; self.active = active
        if active, let owner = login?.currentOwner { archive.configure(try? NativeHistoryScope(configuration: configuration, owner: owner)) }
        refresh()
    }

    private func summaries() -> [NativeConversationSummary] {
        guard active, let login = login else { return [] }
        let contacts: [NativeContact] = { if case .ready(let values) = login.roster { return values }; return [] }()
        var values = NativeConversationSummary.list(contacts: contacts, groups: login.groups.rooms, messages: login.chat.messages, catalog: login.cloudHistory.conversations)
        var keys = Set(values.map(\.id))
        for key in archive.entries.sorted() where !keys.contains(key) {
            let parts = key.components(separatedBy: "\u{0}")
            if parts.count == 2 { values.append(NativeConversationSummary(peer: parts[1], kind: parts[0], name: parts[1])); keys.insert(key) }
        }
        return Array(values.filter { ["contact", "group"].contains($0.kind) && NativeChatCodec.bareJID($0.peer) == $0.peer }.prefix(512))
    }

    private func bounded(_ text: String, bytes: Int) -> String {
        var value = String(String.UnicodeScalarView(text.unicodeScalars.filter { $0.value >= 32 || $0.value == 10 }.prefix(bytes)))
        while value.utf8.count > bytes { value.removeLast() }
        return value
    }

    private func canChat(_ peer: String, _ kind: String) -> Bool {
        guard let login = login, !login.isBlocked(peer) else { return false }
        if kind == "group" { return login.groups.rooms.prefix(8).contains { $0.room == peer && $0.snapshot != nil } }
        if case .ready(let contacts) = login.roster { return contacts.count <= 100 && peer != login.currentOwner && contacts.contains { $0.jid == peer } }
        return false
    }

    private func refresh() {
        guard active, let login = login else {
            let empty = HybridHistoryState(); if subject.value != empty { subject.send(empty) }; return
        }
        let values = summaries(); let keys = Set(values.map(\.id))
        identities = identities.filter { keys.contains($0.key) }
        for value in values where identities[value.id] == nil { identities[value.id] = UUID().uuidString.lowercased() }
        var state = HybridHistoryState(); state.available = true; state.query = query; state.archivedOnly = archivedOnly
        state.notice = login.cloudHistory.notice
        state.archived = archive.entries.sorted().compactMap { key in
            let parts = key.components(separatedBy: "\u{0}")
            return parts.count == 2 ? HybridArchivedConversation(peer: parts[1], kind: parts[0] == "contact" ? "direct" : "group") : nil
        }
        state.entries = values.filter { value in
            (!archivedOnly || archive.contains(peer: value.peer, kind: value.kind)) &&
            (query.isEmpty || (value.name + " " + value.peer + " " + value.preview).localizedCaseInsensitiveContains(query))
        }.prefix(200).map { value in
            HybridHistoryEntry(id: identities[value.id]!, peer: value.peer, kind: value.kind == "contact" ? "direct" : "group",
                name: bounded(value.name, bytes: 240), preview: bounded(value.preview, bytes: 512), timestamp: value.date?.timeIntervalSince1970,
                archived: archive.contains(peer: value.peer, kind: value.kind))
        }
        if let selected = selection {
            let cloud = login.cloudHistory.state(peer: selected.peer, kind: selected.kind)
            let messages: [HybridHistoryMessage]
            if selected.kind == "group" {
                messages = Array((login.groups.rooms.first { $0.room == selected.peer }?.messages ?? []).filter { !$0.hidden }.suffix(200)).map {
                    HybridHistoryMessage(id: $0.id.uuidString.lowercased(), body: $0.retracted ? "Bericht verwijderd" : $0.body,
                        outgoing: $0.own, timestamp: $0.date.timeIntervalSince1970, sender: $0.nickname)
                }
            } else {
                messages = login.chat.messages.filter { $0.peer == selected.peer && !$0.hidden }.suffix(200).map {
                    HybridHistoryMessage(id: $0.id.uuidString.lowercased(), body: $0.retracted ? "Bericht verwijderd" : $0.body,
                        outgoing: $0.state != .incoming, timestamp: $0.date.timeIntervalSince1970, sender: nil)
                }
            }
            state.window = HybridHistoryWindow(id: selected.id, title: bounded(selected.name, bytes: 240), messages: messages,
                loading: cloud.loading, hasEarlier: cloud.nextCursor != nil, canChat: canChat(selected.peer, selected.kind),
                notice: cloud.notice ?? (login.cloudHistory.available ? nil : "Alleen de beschikbare lokale geschiedenis. Er wordt niets verzonden of als gelezen bevestigd."))
        }
        if subject.value != state { subject.send(state) }
    }

    func command(_ name: String, arguments: [String: String]) throws {
        guard active, let login = login, login.isConnected, !login.isBackground else { throw HybridFailure.invalidState }
        if name == "history.close" { selection = nil; refresh(); return }
        if name == "history.search" {
            query = arguments["query"]!; archivedOnly = arguments["archived"] == "true"; refresh(); return
        }
        guard let id = arguments["id"] else { throw HybridFailure.invalidRequest }
        if ["history.earlier", "history.refresh", "history.chat"].contains(name) {
            guard let selected = selection, selected.id == id else { throw HybridFailure.invalidState }
            if name == "history.chat" {
                guard canChat(selected.peer, selected.kind), onOpen?(selected.peer, selected.kind == "contact" ? "direct" : "group") == true else { throw HybridFailure.invalidState }
                selection = nil
            } else {
                let current = login.cloudHistory.state(peer: selected.peer, kind: selected.kind)
                guard !current.loading, name != "history.earlier" || current.nextCursor != nil else { throw HybridFailure.invalidState }
                login.loadCloudHistory(peer: selected.peer, kind: selected.kind, earlier: name == "history.earlier", refresh: name == "history.refresh")
            }
            refresh(); return
        }
        guard let projected = state.entries.first(where: { $0.id == id }),
              let value = summaries().first(where: { identities[$0.id] == id }) else { throw HybridFailure.invalidState }
        if name == "history.archive" {
            let archived = arguments["archived"] == "true"
            archive.set(peer: value.peer, kind: value.kind, archived: archived)
            guard archive.contains(peer: value.peer, kind: value.kind) == archived else { throw HybridFailure.invalidState }
            if archived { onArchive?(value.peer, projected.kind) }
        } else if name == "history.open" {
            selection = (id, value.peer, value.kind, value.name)
            if value.kind == "group" { login.openCloudGroup(value.peer) }
            login.loadCloudHistory(peer: value.peer, kind: value.kind)
        } else { throw HybridFailure.invalidRequest }
        refresh()
    }
}
