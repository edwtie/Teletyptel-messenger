import Foundation
#if !TELETYPTEL_HYBRID_EMBEDDED
import TeleTypTelCore
#endif

extension HybridSession {
    func groupProjection() -> [HybridGroup] {
        model.groups.rooms.prefix(8).map { group in
            HybridGroup(room: group.room, name: String(group.room.split(separator: "@").first ?? "Groep"), joined: group.snapshot != nil,
                joining: group.joining, canSpeak: group.snapshot?.canSpeak == true, subject: group.subject,
                participants: Array((group.snapshot?.participants ?? []).prefix(200)), canModerate: group.snapshot?.ownRole == "moderator")
        }
    }

    func groupConversation(_ peer: String) -> HybridConversation? {
        guard let group = model.groups.rooms.first(where: { $0.room == peer }) else { return nil }
        let messages = group.messages.filter { !$0.hidden }.suffix(100).map { message in
            var counts: [String: Int] = [:]
            for values in message.reactions.values { for emoji in values { counts[emoji, default: 0] += 1 } }
            var value = HybridMessage(id: message.id.uuidString.lowercased(), body: message.retracted ? "Bericht verwijderd" : message.body,
                outgoing: message.own, timestamp: message.date.timeIntervalSince1970, state: message.state.rawValue, delivery: "unconfirmed",
                edited: message.edited == true, retracted: message.retracted, reactions: counts.keys.sorted().prefix(16).map { HybridReaction(emoji: $0, count: counts[$0]!) })
            value.sender = message.nickname
            value.canEdit = model.groups.canCorrect(room: peer, identifier: message.id)
            value.canRetract = model.groups.canRetract(room: peer, identifier: message.id)
            value.canReact = model.groups.canReact(room: peer, identifier: message.id)
            return value
        }
        var value = HybridConversation(peer: peer, draft: group.draft, messages: messages, history: "ready",
            canSend: model.canSend && model.groups.available && group.snapshot?.canSpeak == true, canChange: false)
        value.kind = "group"
        return value
    }

    func groupCommand(_ request: HybridRequest) throws {
        guard model.isConnected, !model.isBackground, model.groups.available, !callBusy else { throw HybridFailure.invalidState }
        var room = request.arguments["room"]!
        if request.command == "groups.join" {
            if !room.contains("@") { room = room.lowercased() + "@conference." + configuration.domain }
            guard room.split(separator: "@", omittingEmptySubsequences: false).count == 2,
                  room.components(separatedBy: "@").last == "conference." + configuration.domain else { throw HybridFailure.invalidRequest }
            model.groups.join(room: room, nickname: request.arguments["nickname"]!, create: request.arguments["create"] == "true")
            guard model.groups.rooms.contains(where: { $0.room == room && ($0.joining || $0.snapshot != nil) }) else { throw HybridFailure.invalidState }
            selectedPeer = room; selectedKind = "group"
            return
        }
        _ = try permittedPeer(room, kind: "group")
        guard selectedPeer == room, selectedKind == "group", let group = model.groups.rooms.first(where: { $0.room == room }) else { throw HybridFailure.invalidState }
        if ["groups.configuration", "groups.configure", "groups.members", "groups.affiliation"].contains(request.command) {
            try administration.command(request.command, room: room, arguments: request.arguments); return
        }
        switch request.command {
        case "groups.call":
            guard let snapshot = group.snapshot, snapshot.canSpeak, snapshot.participants.count <= 4,
                  presentRoomCall?(room) == true else { throw HybridFailure.invalidState }
        case "groups.leave": model.groups.leave(room: room)
        case "groups.subject":
            guard group.snapshot?.canSpeak == true else { throw HybridFailure.invalidState }
            model.groups.setSubject(request.arguments["subject"]!, room: room)
        case "groups.invite":
            let peer = try permittedPeer(request.arguments["peer"]!)
            guard group.snapshot?.canSpeak == true, model.groups.invitationModel.available else { throw HybridFailure.invalidState }
            model.groups.invite(room: room, peer: peer)
        case "groups.role":
            guard group.snapshot?.ownRole == "moderator", !model.groups.management.busy,
                  group.snapshot?.participants.contains(request.arguments["nickname"]!) == true else { throw HybridFailure.invalidState }
            model.groups.management.run(.role(room, request.arguments["nickname"]!, request.arguments["role"]!))
        default: throw HybridFailure.invalidRequest
        }
    }

    func groupMessageCommand(_ request: HybridRequest) throws {
        let peer = try permittedPeer(request.arguments["peer"]!, kind: "group")
        guard selectedPeer == peer, selectedKind == "group", !callBusy,
              let id = UUID(uuidString: request.arguments["id"]!),
              let message = model.groups.rooms.first(where: { $0.room == peer })?.messages.first(where: { $0.id == id && !$0.hidden }) else { throw HybridFailure.invalidState }
        switch request.command {
        case "chat.hide":
            model.groups.hideMessage(room: peer, identifier: id)
            guard model.groups.rooms.first(where: { $0.room == peer })?.messages.first(where: { $0.id == id })?.hidden == true else { throw HybridFailure.invalidState }
        case "chat.edit":
            guard let body = request.arguments["body"], model.groups.canCorrect(room: peer, identifier: id) else { throw HybridFailure.invalidState }
            model.groups.correct(room: peer, identifier: id, body: body)
            guard model.groups.rooms.first(where: { $0.room == peer })?.messages.first(where: { $0.id == id })?.actionPending == true else { throw HybridFailure.invalidState }
        case "chat.retract":
            guard model.groups.canRetract(room: peer, identifier: id) else { throw HybridFailure.invalidState }
            model.groups.retract(room: peer, identifier: id)
            guard model.groups.rooms.first(where: { $0.room == peer })?.messages.first(where: { $0.id == id })?.actionPending == true else { throw HybridFailure.invalidState }
        case "chat.react":
            guard model.groups.canReact(room: peer, identifier: id) else { throw HybridFailure.invalidState }
            model.groups.react(room: peer, identifier: id, emoji: request.arguments["emoji"]!)
            guard model.groups.rooms.first(where: { $0.room == peer })?.messages.first(where: { $0.id == id })?.actionPending == true else { throw HybridFailure.invalidState }
        case "chat.forward":
            let destination = try permittedPeer(request.arguments["target"]!)
            guard !message.retracted, model.forwardMessage(message.body, to: destination) else { throw HybridFailure.invalidState }
        default: throw HybridFailure.unavailable
        }
    }
}
