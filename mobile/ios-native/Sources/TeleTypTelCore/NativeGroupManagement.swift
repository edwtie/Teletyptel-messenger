import Combine
import Foundation

public struct NativeGroupOccupant: Equatable, Sendable, Identifiable {
    public let nickname: String
    public let role: String
    public let affiliation: String
    public var id: String { nickname }
}

public struct NativeDiscoveredRoom: Equatable, Sendable, Identifiable {
    public let room: String
    public let name: String
    public var id: String { room }
}

public struct NativeRoomConfiguration: Equatable, Sendable {
    public var name: String
    public var description: String
    public var membersOnly: Bool
    public var moderated: Bool
    public var publicRoom: Bool
    public var persistent: Bool
    public var allowInvites: Bool
    var fields: [String: [String]]
}

public enum NativeGroupCommand: Sendable {
    case discover
    case configuration(String)
    case configure(String, NativeRoomConfiguration)
    case members(String, String)
    case affiliation(String, String, String)
    case role(String, String, String)
    var room: String? {
        switch self {
        case .discover: return nil
        case .configuration(let room), .configure(let room, _), .members(let room, _),
             .affiliation(let room, _, _), .role(let room, _, _): return room
        }
    }
}

public enum NativeGroupReply: Sendable {
    case rooms([NativeDiscoveredRoom])
    case configuration(NativeRoomConfiguration)
    case members([String])
    case confirmed
}

public protocol NativeGroupManaging: NativeGroupInviting {
    func manageGroup(_ command: NativeGroupCommand) async throws -> NativeGroupReply
    func createGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws
    func setGroupSubject(room: String, subject: String) async throws
}

enum NativeGroupManagementCodec {
    static let admin = "http://jabber.org/protocol/muc#admin"
    static let owner = "http://jabber.org/protocol/muc#owner"
    static let data = "jabber:x:data"
    static let disco = "http://jabber.org/protocol/disco#items"
    static func target(_ command: NativeGroupCommand, account: String) throws -> String {
        guard let domain = NativeChatCodec.bareJID(account)?.components(separatedBy: "@").last else { throw NativeGroupFailure.invalidRoom }
        if let room = command.room {
            guard NativeInvitationCodec.isRoom(room, owner: account) else { throw NativeGroupFailure.invalidRoom }
            return room
        }
        return "conference." + domain
    }
    static func request(_ command: NativeGroupCommand, account: String, identifier: String) throws -> String {
        let target = try target(command, account: account)
        let escape = NativeMUCStream.escape
        var type = "get"
        let query: String
        switch command {
        case .discover: query = "<query xmlns='\(disco)'/>"
        case .configuration: query = "<query xmlns='\(owner)'/>"
        case .configure(_, let configuration):
            guard configuration.name.utf8.count <= 120, configuration.description.utf8.count <= 1024,
                  configuration.fields.count <= 64 else { throw NativeGroupFailure.limit }
            var fields = configuration.fields
            fields["FORM_TYPE"] = ["http://jabber.org/protocol/muc#roomconfig"]
            for (key, value) in ["roomname": configuration.name, "roomdesc": configuration.description,
                "membersonly": configuration.membersOnly ? "1" : "0", "moderatedroom": configuration.moderated ? "1" : "0",
                "publicroom": configuration.publicRoom ? "1" : "0", "persistentroom": configuration.persistent ? "1" : "0",
                "allowinvites": configuration.allowInvites ? "1" : "0"] {
                let name = "muc#roomconfig_" + key
                if fields[name] != nil { fields[name] = [value] }
            }
            let encoded = fields.keys.sorted().map { key in
                "<field var='\(escape(key))'>" + fields[key]!.map { "<value>\(escape($0))</value>" }.joined() + "</field>"
            }.joined()
            guard encoded.utf8.count <= 24576 else { throw NativeGroupFailure.limit }
            type = "set"; query = "<query xmlns='\(owner)'><x xmlns='\(data)' type='submit'>\(encoded)</x></query>"
        case .members(_, let affiliation):
            guard ["member", "admin", "outcast"].contains(affiliation) else { throw NativeGroupFailure.denied }
            query = "<query xmlns='\(admin)'><item affiliation='\(affiliation)'/></query>"
        case .affiliation(_, let jid, let affiliation):
            guard NativeChatCodec.bareJID(jid) == jid, jid != account, ["none", "member", "admin", "outcast"].contains(affiliation) else { throw NativeGroupFailure.denied }
            type = "set"; query = "<query xmlns='\(admin)'><item jid='\(escape(jid))' affiliation='\(affiliation)'/></query>"
        case .role(_, let nickname, let role):
            guard NativeMUCStream.validNickname(nickname), ["none", "visitor", "participant", "moderator"].contains(role) else { throw NativeGroupFailure.denied }
            type = "set"; query = "<query xmlns='\(admin)'><item nick='\(escape(nickname))' role='\(role)'/></query>"
        }
        return "<iq xmlns='jabber:client' type='\(type)' to='\(escape(target))' id='\(escape(identifier))'>\(query)</iq>"
    }
    static func decode(_ root: ProbeElement, command: NativeGroupCommand, account: String) throws -> NativeGroupReply {
        guard root.name == "iq", root.namespace == "jabber:client", root.attributes["from"] == (try target(command, account: account)),
              root.attributes["type"] == "result" else { throw NativeGroupFailure.denied }
        switch command {
        case .discover:
            guard let query = root.children.first(where: { $0.name == "query" && $0.namespace == disco }), query.children.count <= 200 else { throw NativeGroupFailure.limit }
            var rooms: [NativeDiscoveredRoom] = []
            for item in query.children where item.name == "item" && item.namespace == disco {
                guard let room = item.attributes["jid"], NativeInvitationCodec.isRoom(room, owner: account), !rooms.contains(where: { $0.room == room }) else { continue }
                rooms.append(NativeDiscoveredRoom(room: room, name: String((item.attributes["name"] ?? room).prefix(120))))
            }
            return .rooms(rooms)
        case .configuration:
            guard let query = root.children.first(where: { $0.name == "query" && $0.namespace == owner }),
                  let form = query.children.first(where: { $0.name == "x" && $0.namespace == data && $0.attributes["type"] == "form" }), form.children.count <= 80 else { throw NativeGroupFailure.unavailable }
            var fields: [String: [String]] = [:]
            for field in form.children where field.name == "field" && field.namespace == data {
                if field.attributes["type"] == "fixed" { continue }
                guard let key = field.attributes["var"], key.utf8.count <= 128, fields[key] == nil else { throw NativeGroupFailure.unavailable }
                let values = field.children.filter { $0.name == "value" && $0.namespace == data }.map(\.text)
                guard values.count <= 16, values.allSatisfy({ $0.utf8.count <= 2048 }), field.attributes["type"] != "text-private" || values.allSatisfy(\.isEmpty) else { throw NativeGroupFailure.unavailable }
                fields[key] = values
            }
            guard fields["FORM_TYPE"] == ["http://jabber.org/protocol/muc#roomconfig"] else { throw NativeGroupFailure.unavailable }
            guard !["1", "true"].contains(fields["muc#roomconfig_passwordprotectedroom"]?.first ?? ""),
                  (fields["muc#roomconfig_roomsecret"] ?? []).allSatisfy(\.isEmpty) else { throw NativeGroupFailure.unavailable }
            func value(_ suffix: String) -> String { fields["muc#roomconfig_" + suffix]?.first ?? "" }
            func flag(_ suffix: String) -> Bool { ["1", "true"].contains(value(suffix)) }
            return .configuration(NativeRoomConfiguration(name: value("roomname"), description: value("roomdesc"), membersOnly: flag("membersonly"), moderated: flag("moderatedroom"), publicRoom: flag("publicroom"), persistent: flag("persistentroom"), allowInvites: flag("allowinvites"), fields: fields))
        case .members:
            guard let query = root.children.first(where: { $0.name == "query" && $0.namespace == admin }), query.children.count <= 128 else { throw NativeGroupFailure.limit }
            return .members(query.children.filter { $0.name == "item" && $0.namespace == admin }.compactMap { item in
                guard let jid = item.attributes["jid"], NativeChatCodec.bareJID(jid) == jid else { return nil }; return jid
            })
        default: return .confirmed
        }
    }
}

@MainActor
public final class NativeGroupManagementModel: ObservableObject {
    @Published public private(set) var discovered: [NativeDiscoveredRoom] = []
    @Published public private(set) var configuration: NativeRoomConfiguration?
    @Published public private(set) var members: [String] = []
    @Published public private(set) var busy = false
    @Published public private(set) var room: String?
    @Published public private(set) var status: String?
    private var sender: (any NativeGroupManaging)?
    private var generation = UUID()
    private var task: Task<Void, Never>?
    deinit { task?.cancel() }
    func attach(_ sender: any NativeGroupManaging) { disconnect(); self.sender = sender }
    func disconnect() { generation = UUID(); task?.cancel(); task = nil; sender = nil; busy = false; configuration = nil; discovered = []; members = []; status = nil; room = nil }
    public func run(_ command: NativeGroupCommand) {
        guard !busy, let sender = sender else { status = "Groepsbeheer niet beschikbaar. Verbind opnieuw."; return }
        busy = true; configuration = nil; members = []; status = nil
        room = command.room
        let attempt = generation
        task = Task { [weak self] in
            do {
                let reply = try await sender.manageGroup(command)
                guard let self = self, self.generation == attempt, !Task.isCancelled else { return }
                switch reply {
                case .rooms(let rooms): self.discovered = rooms
                case .configuration(let configuration): self.configuration = configuration
                case .members(let members): self.members = members
                case .confirmed: self.status = "Wijziging bevestigd door de groepsserver."
                }
            } catch {
                guard let self = self, self.generation == attempt, !Task.isCancelled else { return }
                self.status = "Niet bevestigd. Controleer je groepsrechten en verbinding; er wordt niet automatisch opnieuw verzonden."
            }
            guard let self = self, self.generation == attempt else { return }
            self.busy = false; self.task = nil
        }
    }
}
