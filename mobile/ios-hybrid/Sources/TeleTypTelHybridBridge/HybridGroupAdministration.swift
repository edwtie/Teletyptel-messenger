import Foundation
#if !TELETYPTEL_HYBRID_EMBEDDED
import TeleTypTelCore
#endif

public struct HybridGroupConfiguration: Codable, Equatable {
    public let token: String
    public let name: String
    public let description: String
    public let membersOnly: Bool
    public let moderated: Bool
    public let publicRoom: Bool
    public let persistent: Bool
    public let allowInvites: Bool
    public let editableFields: [String]
}

public struct HybridGroupAdministrationState: Codable, Equatable {
    public let room: String
    public let busy: Bool
    public let canConfigure: Bool
    public let canManageMembers: Bool
    public let configuration: HybridGroupConfiguration?
    public let affiliation: String?
    public let members: [String]
}

@MainActor
final class HybridGroupAdministration {
    private let model: NativeLoginModel
    private var scope: String?
    private var configurationRequested = false
    private var affiliation: String?
    private var lease: (token: UUID, form: NativeRoomConfiguration, expires: Date)?
    init(model: NativeLoginModel) { self.model = model }

    func update(epoch: String, room: String?) {
        let next = room.map { epoch + ":" + $0 }
        if scope != next { invalidate(); scope = next }
    }

    private func invalidate() { lease = nil; configurationRequested = false; affiliation = nil }

    func snapshot(room: String) -> HybridGroupAdministrationState? {
        guard let group = model.groups.rooms.first(where: { $0.room == room }), let snapshot = group.snapshot else { invalidate(); return nil }
        let owner = snapshot.ownAffiliation == "owner"
        let administrator = ["owner", "admin"].contains(snapshot.ownAffiliation)
        if !owner { lease = nil; configurationRequested = false }
        if !administrator { affiliation = nil }
        let management = model.groups.management
        var configuration: HybridGroupConfiguration?
        if owner, configurationRequested, management.room == room, !management.busy, let form = management.configuration,
           HybridRequest.text(form.name, maximumBytes: 120), HybridRequest.text(form.description, maximumBytes: 1024) {
            if lease == nil || lease?.form != form { lease = (UUID(), form, Date().addingTimeInterval(300)) }
            if let lease = lease, lease.expires > Date() {
                configuration = HybridGroupConfiguration(token: lease.token.uuidString.lowercased(), name: form.name, description: form.description,
                    membersOnly: form.membersOnly, moderated: form.moderated, publicRoom: form.publicRoom, persistent: form.persistent,
                    allowInvites: form.allowInvites, editableFields: form.editableFields)
            }
        }
        let members = administrator && affiliation != nil && management.room == room && !management.busy ? Array(management.members.prefix(128)) : []
        return HybridGroupAdministrationState(room: room, busy: management.busy, canConfigure: owner, canManageMembers: administrator,
            configuration: configuration, affiliation: affiliation, members: members)
    }

    func command(_ name: String, room: String, arguments: [String: String]) throws {
        guard let group = model.groups.rooms.first(where: { $0.room == room }), let snapshot = group.snapshot,
              !model.groups.management.busy else { throw HybridFailure.invalidState }
        let management = model.groups.management
        let owner = snapshot.ownAffiliation == "owner"
        switch name {
        case "groups.configuration":
            guard owner else { throw HybridFailure.invalidState }
            invalidate(); configurationRequested = true; management.run(.configuration(room))
        case "groups.configure":
            guard owner, configurationRequested, let lease = lease, lease.expires > Date(), lease.token == UUID(uuidString: arguments["token"]!),
                  management.room == room, management.configuration == lease.form else { throw HybridFailure.invalidState }
            var form = lease.form
            form.name = arguments["name"]!; form.description = arguments["description"]!
            form.membersOnly = arguments["membersOnly"] == "true"; form.moderated = arguments["moderated"] == "true"
            form.publicRoom = arguments["publicRoom"] == "true"; form.persistent = arguments["persistent"] == "true"
            form.allowInvites = arguments["allowInvites"] == "true"
            let changes: [String: Bool] = ["name": form.name != lease.form.name, "description": form.description != lease.form.description,
                "membersOnly": form.membersOnly != lease.form.membersOnly, "moderated": form.moderated != lease.form.moderated,
                "publicRoom": form.publicRoom != lease.form.publicRoom, "persistent": form.persistent != lease.form.persistent,
                "allowInvites": form.allowInvites != lease.form.allowInvites]
            guard changes.allSatisfy({ !$0.value || form.editableFields.contains($0.key) }) else { throw HybridFailure.invalidRequest }
            invalidate(); management.run(.configure(room, form))
        case "groups.members":
            guard ["owner", "admin"].contains(snapshot.ownAffiliation) else { throw HybridFailure.invalidState }
            invalidate(); affiliation = arguments["affiliation"]!; management.run(.members(room, affiliation!))
        case "groups.affiliation":
            guard case .connected(let ownJID) = model.phase, ["owner", "admin"].contains(snapshot.ownAffiliation), let peer = arguments["peer"], peer != ownJID,
                  arguments["affiliation"] != "admin" || owner else { throw HybridFailure.invalidState }
            let knownMember = affiliation != nil && management.room == room && management.members.contains(peer)
            let knownContact: Bool
            if case .ready(let contacts) = model.roster { knownContact = contacts.contains { $0.jid == peer } } else { knownContact = false }
            guard knownMember || knownContact else { throw HybridFailure.invalidState }
            invalidate(); management.run(.affiliation(room, peer, arguments["affiliation"]!))
        default: throw HybridFailure.invalidRequest
        }
    }
}
