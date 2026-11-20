import Combine
import Foundation
#if !TELETYPTEL_HYBRID_EMBEDDED
import TeleTypTelCore
#endif

@MainActor
public final class HybridSession {
    public var onStateChange: ((HybridSnapshot) -> Void)?
    let model: NativeLoginModel
    let configuration: ServerConfiguration
    private let nativeLogout: () -> Void
    private let nativeSettings: (() -> Void)?
    private var observations: [AnyCancellable] = []
    private let calls: (any HybridCallPort)?
    private let extras: (any HybridExtrasPort)?
    private let account: (any HybridAccountPort)?
    private let history: (any HybridHistoryPort)?
    let administration: HybridGroupAdministration
    var selectedPeer: String?
    var selectedKind = "direct"
    public var presentRoomCall: ((String) -> Bool)?
    private var accountEpoch = UUID()
    private var requestIDs: [UUID] = []
    private var sequence = 0
    private var lastPublished: HybridSnapshot?

    public init(model: NativeLoginModel, configuration: ServerConfiguration, nativeLogout: @escaping () -> Void,
                nativeSettings: (() -> Void)? = nil, calls: (any HybridCallPort)? = nil, extras: (any HybridExtrasPort)? = nil, account: (any HybridAccountPort)? = nil, history: (any HybridHistoryPort)? = nil) {
        self.model = model
        administration = HybridGroupAdministration(model: model)
        self.configuration = configuration
        self.nativeLogout = nativeLogout
        self.nativeSettings = nativeSettings
        self.calls = calls
        self.extras = extras
        self.account = account
        self.history = history
        if let history = history {
            history.onOpen = { [weak self] peer, kind in
                guard let self = self, !self.callBusy, (try? self.permittedPeer(peer, kind: kind)) != nil else { return false }
                guard kind == "group" ? self.groupProjection().contains(where: { $0.room == peer && $0.joined }) : self.roster().contacts.contains(where: { $0.jid == peer }) else { return false }
                self.selectedPeer = peer; self.selectedKind = kind; self.model.visibleConversation = nil
                return true
            }
            history.onArchive = { [weak self] peer, kind in
                guard let self = self, self.selectedPeer == peer, self.selectedKind == kind else { return }
                self.selectedPeer = nil; self.model.visibleConversation = nil
            }
            observations.append(history.changes.sink { [weak self] _ in Task { @MainActor [weak self] in self?.publish() } })
            history.update(epoch: accountEpoch.uuidString.lowercased(), active: false)
        }
        if let account = account {
            observations.append(account.changes.sink { [weak self] _ in Task { @MainActor [weak self] in self?.publish() } })
            account.update(epoch: accountEpoch.uuidString.lowercased(), active: false)
        }
        observations.append(model.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.publish() }
        })
        observations.append(model.groups.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.publish() }
        })
        observations.append(model.groups.management.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.publish() }
        })
        observations.append(model.groups.invitationModel.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.publish() }
        })
        if let extras = extras {
            extras.onStage = { [weak self] text, context in self?.stageAttachment(text, context: context) ?? false }
            observations.append(extras.changes.sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.publish() }
            })
        }
        if let calls = calls {
            observations.append(calls.changes.sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.publish() }
            })
        }
    }

    public func handle(_ data: Data, document: URL?, mainFrame: Bool) throws -> HybridReply {
        guard HybridDocumentPolicy.permits(document, mainFrame: mainFrame) else { throw HybridFailure.untrustedDocument }
        let request = try HybridRequest.decode(data)
        if ["session.cancel", "session.logout", "session.verifySecondFactor"].contains(request.command) || ["chat.", "calls.", "groups.", "files.", "translation.", "auth.", "account.", "contacts.", "history."].contains(where: request.command.hasPrefix) {
            guard request.epoch == accountEpoch else { throw HybridFailure.invalidState }
        }
        guard !requestIDs.contains(request.id) else { throw HybridFailure.replayedRequest }
        requestIDs.append(request.id)
        if requestIDs.count > 128 { requestIDs.removeFirst() }
        switch request.command {
        case "history.search", "history.open", "history.archive", "history.earlier", "history.refresh", "history.chat", "history.close":
            guard let history = history, model.isConnected, !model.isBackground, !callBusy else { throw HybridFailure.invalidState }
            try history.command(request.command, arguments: request.arguments)
        case "auth.social", "auth.biometric", "auth.forget", "auth.privacy", "auth.recover", "auth.register":
            guard let account = account, !model.isBackground, !account.state.busy else { throw HybridFailure.unavailable }
            switch model.phase { case .idle, .signedOut, .failed: break; default: throw HybridFailure.sessionBusy }
            if request.command == "auth.social", !account.state.providers.contains(request.arguments["provider"]!) { throw HybridFailure.unavailable }
            if request.command == "auth.biometric", !account.state.savedLogin { throw HybridFailure.unavailable }
            if request.command == "auth.register", !account.state.registrationAvailable { throw HybridFailure.unavailable }
            if ["auth.social", "auth.biometric"].contains(request.command) {
                accountEpoch = UUID(); selectedPeer = nil
                account.update(epoch: accountEpoch.uuidString.lowercased(), active: false)
            }
            try account.command(request.command, arguments: request.arguments)
        case "account.refresh", "account.save", "account.avatar", "account.panel", "contacts.add", "contacts.respond", "contacts.rename", "contacts.block", "contacts.remove", "contacts.dnd":
            guard let account = account, model.isConnected, !model.isBackground, !callBusy else { throw HybridFailure.invalidState }
            try account.command(request.command, arguments: request.arguments)
        case "groups.call", "groups.join", "groups.leave", "groups.subject", "groups.invite", "groups.role", "groups.configuration", "groups.configure", "groups.members", "groups.affiliation":
            try groupCommand(request)
        case "files.pick", "files.open", "translation.settings", "translation.message", "translation.disable":
            guard let extras = extras, let context = extrasContext() else { throw HybridFailure.unavailable }
            if !["translation.settings", "translation.disable"].contains(request.command) { guard context.conversation != nil, !callBusy else { throw HybridFailure.invalidState } }
            if let id = request.arguments["id"] {
                guard context.conversation?.messages.contains(where: { $0.id == id.lowercased() && !$0.retracted }) == true else { throw HybridFailure.invalidState }
            }
            try extras.command(request.command, arguments: request.arguments, context: context)
        case "session.login":
            guard !model.isBackground, account?.state.busy != true else { throw HybridFailure.invalidState }
            switch model.phase {
            case .idle, .signedOut, .failed:
                accountEpoch = UUID()
                selectedPeer = nil
                account?.update(epoch: accountEpoch.uuidString.lowercased(), active: false)
                guard request.arguments["remember"] != "true" || account?.state.rememberAvailable == true else { throw HybridFailure.unavailable }
                try account?.prepareLogin(jid: request.arguments["jid"]!, password: request.arguments["password"]!, remember: request.arguments["remember"] == "true")
                model.login(address: configuration.origin.absoluteString, domain: configuration.domain,
                            jid: request.arguments["jid"]!, password: request.arguments["password"]!)
            default:
                throw HybridFailure.sessionBusy
            }
        case "session.verifySecondFactor":
            guard model.isAwaitingSecondFactor, !model.isBackground else { throw HybridFailure.invalidState }
            model.verifySecondFactor(code: request.arguments["code"]!)
        case "session.cancel":
            if account?.state.busy == true && !model.isConnected && !model.isBackground { account?.cancelAuthentication(); model.reset(); break }
            guard !model.isBackground, !model.isReconnecting,
                  model.isWorking || model.isAwaitingSecondFactor else { throw HybridFailure.invalidState }
            model.reset()
            account?.cancelAuthentication()
        case "session.logout":
            guard model.phase != .signedOut else { throw HybridFailure.invalidState }
            account?.logout()
            nativeLogout()
            accountEpoch = UUID()
            if model.phase != .signedOut { model.disconnect() }
            selectedPeer = nil
            model.visibleConversation = nil
        case "session.snapshot":
            break
        case "app.openSettings":
            guard !model.isWorking, !model.isBackground, !model.isSecondFactorPending else { throw HybridFailure.sessionBusy }
            guard let nativeSettings = nativeSettings else { throw HybridFailure.unavailable }
            nativeSettings()
        case "chat.open":
            let peer = try permittedPeer(request.arguments["peer"]!, kind: request.kind)
            guard !callBusy else { throw HybridFailure.sessionBusy }
            selectedPeer = peer
            selectedKind = request.kind
            model.visibleConversation = nil
            if selectedKind == "direct" { model.loadHistory(for: peer) }
            else if let group = model.groups.rooms.first(where: { $0.room == peer }), group.snapshot == nil, !group.joining, model.groups.available {
                model.groups.join(room: peer, nickname: group.nickname)
            }
        case "chat.close":
            selectedPeer = nil
            model.visibleConversation = nil
        case "chat.draft", "chat.send":
            let peer = try permittedPeer(request.arguments["peer"]!, kind: request.kind)
            guard selectedPeer == peer, selectedKind == request.kind, request.command == "chat.draft" || !callBusy else { throw HybridFailure.invalidState }
            let body = request.arguments["body"]!
            if selectedKind == "group" {
                if request.command == "chat.send" {
                    guard model.groups.available, model.groups.rooms.first(where: { $0.room == peer })?.snapshot?.canSpeak == true else { throw HybridFailure.invalidState }
                    let before = Set(model.groups.rooms.first(where: { $0.room == peer })!.messages.map(\.id))
                    model.groups.setDraft(body, room: peer); model.groups.send(room: peer)
                    guard model.groups.rooms.first(where: { $0.room == peer })!.messages.contains(where: { !before.contains($0.id) }) else { throw HybridFailure.invalidState }
                } else { model.groups.setDraft(body, room: peer) }
                break
            }
            if request.command == "chat.send" {
                guard model.canSend else { throw HybridFailure.invalidState }
                let previous = Set(model.chat.messages.map(\.id))
                model.setDraft(body, peer: peer)
                model.sendDraft(to: peer)
                guard model.chat.messages.contains(where: { $0.peer == peer && !previous.contains($0.id) }) else { throw HybridFailure.invalidState }
            } else { model.setDraft(body, peer: peer) }
        case "chat.displayed":
            let peer = try permittedPeer(request.arguments["peer"]!, kind: request.kind)
            guard selectedPeer == peer, selectedKind == request.kind, !callBusy, history?.state.window == nil, account?.state.presentation != true, account?.state.busy != true else { throw HybridFailure.invalidState }
            let ids = request.arguments["ids"]!.split(separator: ",").compactMap { UUID(uuidString: String($0)) }
            let visible = Set(conversation()?.messages.filter { !$0.outgoing }.map(\.id) ?? [])
            guard ids.allSatisfy({ visible.contains($0.uuidString.lowercased()) }) else { throw HybridFailure.invalidState }
            if selectedKind == "group" { model.groups.markRead(room: peer, identifiers: ids) }
            else { model.displayed(ids) }
        case "chat.edit", "chat.hide", "chat.retract", "chat.forward", "chat.react":
            if request.kind == "group" { try groupMessageCommand(request); break }
            let peer = try permittedPeer(request.arguments["peer"]!)
            guard selectedPeer == peer, selectedKind == request.kind, !callBusy, let id = UUID(uuidString: request.arguments["id"]!),
                  let target = model.chat.messages.first(where: { $0.id == id && $0.peer == peer && !$0.hidden }) else { throw HybridFailure.invalidState }
            if request.command == "chat.hide" {
                model.hideMessage(id)
                guard model.chat.messages.first(where: { $0.id == id })?.hidden == true else { throw HybridFailure.invalidState }
            }
            else if request.command == "chat.forward" {
                let destination = try permittedPeer(request.arguments["target"]!)
                guard !target.retracted, model.forwardMessage(target.body, to: destination) else { throw HybridFailure.invalidState }
            } else if request.command == "chat.react" {
                guard model.canSend, !target.retracted else { throw HybridFailure.invalidState }
                model.react(id, emoji: request.arguments["emoji"]!)
                guard model.chat.messages.first(where: { $0.id == id })?.reactionPending == true else { throw HybridFailure.invalidState }
            }
            else {
                guard model.canChangeMessages, target.state == .submitted, !target.retracted else { throw HybridFailure.invalidState }
                guard request.command == "chat.edit" ? model.chat.canCorrect(id) : model.chat.canRetract(id) else { throw HybridFailure.invalidState }
                model.changeMessage(id, correctedBody: request.command == "chat.edit" ? request.arguments["body"] : nil)
                guard model.chat.messages.first(where: { $0.id == id })?.actionPending == true else { throw HybridFailure.invalidState }
            }
        case "calls.start":
            let peer = try permittedPeer(request.arguments["peer"]!)
            guard !callBusy, let calls = calls, calls.canCall(peer: peer) else { throw HybridFailure.unavailable }
            model.visibleConversation = nil
            try calls.start(peer: peer, mode: request.arguments["mode"]!)
        case "calls.control", "calls.layout":
            guard model.isConnected, !model.isBackground, let calls = calls,
                  calls.state.id == request.arguments["id"] else { throw HybridFailure.invalidState }
            model.visibleConversation = nil
            if request.command == "calls.layout" { try calls.placeVideo(id: request.arguments["id"]!, placement: HybridVideoPlacement(arguments: request.arguments)) }
            else if request.arguments["action"] == "interpreter" {
                guard calls.state.phase == "active", calls.state.interpreter != "unavailable" else { throw HybridFailure.unavailable }
                try calls.control(id: request.arguments["id"]!, action: "interpreter", value: nil)
            }
            else { try calls.control(id: request.arguments["id"]!, action: request.arguments["action"]!, value: request.arguments["value"]) }
        case "calls.reset":
            guard model.isConnected, !model.isBackground, let calls = calls, calls.state.phase == "failed" else { throw HybridFailure.invalidState }
            try calls.resetFailure()
        default:
            throw HybridFailure.unavailable
        }
        publish()
        return HybridReply(version: 1, id: request.id.uuidString.lowercased(), snapshot: snapshot())
    }

    public func snapshot() -> HybridSnapshot {
        makeSnapshot(sequence: sequence)
    }

    private func makeSnapshot(sequence: Int) -> HybridSnapshot {
        var phase: String
        var errorCode: String?
        switch model.phase {
        case .idle: phase = "idle"
        case .checking: phase = "checking"
        case .authenticating: phase = "authenticating"
        case .awaitingSecondFactor:
            phase = "awaitingSecondFactor"
            if model.twoFactorError != nil { errorCode = "invalidSecondFactor" }
        case .connecting: phase = "connecting"
        case .connected: phase = "connected"
        case .signedOut: phase = "signedOut"
        case .suspended: phase = "suspended"
        case .failed(let failure):
            phase = "failed"
            switch failure {
            case .connection(.certificate): errorCode = "certificate"
            case .connection(.timeout): errorCode = "timeout"
            case .connection(.configuration): errorCode = "configuration"
            case .connection(.offline): errorCode = "offline"
            case .connection: errorCode = "serverResponse"
            case .account(.invalidCredentials), .xmpp(.authenticationRejected): errorCode = "invalidCredentials"
            case .account(.twoFactorRequired): errorCode = "secondFactorRequired"
            case .account: errorCode = "accountRejected"
            case .xmpp: errorCode = "connectionLost"
            }
        }
        var result = HybridSnapshot(version: 1, sequence: sequence, epoch: accountEpoch.uuidString.lowercased(), phase: phase, errorCode: errorCode,
                              chatAvailable: model.isConnected && !model.isBackground, callsAvailable: calls != nil && model.isConnected && !model.isBackground, socialLoginAvailable: account?.state.providers.isEmpty == false,
                              settingsAvailable: nativeSettings != nil, roster: roster(), conversation: conversation(),
                              call: model.isConnected && !model.isBackground ? (calls?.state ?? HybridCallState()) : HybridCallState())
        result.account = account?.state ?? HybridAccountState()
        if model.isConnected && !model.isBackground {
            result.groups = groupProjection()
            result.groupsAvailable = model.groups.available
            result.groupNotice = model.groups.management.status ?? model.groups.error ?? model.groups.invitationModel.notice
            if selectedKind == "group", let peer = selectedPeer, !callBusy { result.groupAdministration = administration.snapshot(room: peer) }
            result.extras = extras?.state ?? HybridExtrasState()
            if !callBusy { result.history = history?.state ?? HybridHistoryState() }
        }
        return result
    }

    var callBusy: Bool { calls.map { !["idle", "failed"].contains($0.state.phase) } ?? false }

    func permittedPeer(_ peer: String, kind: String = "direct") throws -> String {
        if kind == "group" {
            guard model.isConnected, !model.isBackground, model.groups.rooms.contains(where: { $0.room == peer }) else { throw HybridFailure.invalidState }
            return peer
        }
        guard model.isConnected, !model.isBackground, !model.isBlocked(peer),
              case .ready(let contacts) = model.roster, contacts.contains(where: { $0.jid == peer }) else { throw HybridFailure.invalidState }
        if case .connected(let owner) = model.phase, peer == owner { throw HybridFailure.invalidState }
        return peer
    }

    private func conversation() -> HybridConversation? {
        guard let peer = selectedPeer, (try? permittedPeer(peer, kind: selectedKind)) != nil, !callBusy else { return nil }
        if selectedKind == "group" { return groupConversation(peer) }
        let messages = model.chat.messages.filter { $0.peer == peer && !$0.hidden }.suffix(100).map { message in
            var counts: [String: Int] = [:]
            for values in message.reactions.values { for emoji in values { counts[emoji, default: 0] += 1 } }
            var result = HybridMessage(id: message.id.uuidString.lowercased(), body: message.retracted ? "Bericht verwijderd" : message.body,
                          outgoing: message.state != .incoming, timestamp: message.date.timeIntervalSince1970,
                          state: message.state.rawValue, delivery: message.delivery.rawValue,
                          edited: message.edited, retracted: message.retracted,
                          reactions: counts.keys.sorted().prefix(16).map { HybridReaction(emoji: $0, count: counts[$0]!) })
            result.canRetract = model.canChangeMessages && model.chat.canRetract(message.id)
            result.canEdit = model.canChangeMessages && model.chat.canCorrect(message.id)
            result.canReact = model.canSend && !message.retracted
            return result
        }
        let history: String
        switch model.historyStates[peer] ?? .idle {
        case .idle: history = "idle"
        case .loading: history = "loading"
        case .ready: history = "ready"
        case .unavailable: history = "unavailable"
        case .failed: history = "failed"
        }
        return HybridConversation(peer: peer, draft: model.chat.drafts[peer] ?? "", messages: messages,
                                  history: history, canSend: model.canSend, canChange: model.canChangeMessages)
    }

    private func roster() -> HybridRoster {
        guard case .connected(let owner) = model.phase, !model.isBackground else {
            return HybridRoster(status: "hidden", contacts: [])
        }
        switch model.roster {
        case .idle, .loading:
            return HybridRoster(status: "loading", contacts: [])
        case .unavailable:
            return HybridRoster(status: "unavailable", contacts: [])
        case .ready(let contacts):
            guard contacts.count <= 100, Set(contacts.map(\.jid)).count == contacts.count,
                  contacts.allSatisfy({ contact in
                      !contact.jid.isEmpty && contact.jid.utf8.count <= 1023 && !contact.jid.contains("/")
                          && !contact.jid.unicodeScalars.contains(where: {
                              CharacterSet.controlCharacters.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0)
                          })
                  }) else { return HybridRoster(status: "unavailable", contacts: []) }
            let projected = contacts.filter { $0.jid != owner }.map { contact in
                let scalars = contact.displayName.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.prefix(256)
                let name = String(String.UnicodeScalarView(scalars))
                return HybridContact(jid: contact.jid, name: name.isEmpty ? contact.jid : name, presence: contact.presence.rawValue,
                                     canCall: !model.isBlocked(contact.jid) && (calls?.canCall(peer: contact.jid) ?? false))
            }
            return HybridRoster(status: "ready", contacts: projected)
        }
    }

    private func publish() {
        account?.update(epoch: accountEpoch.uuidString.lowercased(), active: model.isConnected && !model.isBackground)
        if !model.isConnected || model.isBackground {
            selectedPeer = nil
            model.visibleConversation = nil
        }
        if callBusy { model.visibleConversation = nil }
        administration.update(epoch: accountEpoch.uuidString.lowercased(), room: model.isConnected && !model.isBackground && !callBusy && selectedKind == "group" ? selectedPeer : nil)
        history?.update(epoch: accountEpoch.uuidString.lowercased(), active: model.isConnected && !model.isBackground && !callBusy)
        extras?.update(extrasContext())
        let current = makeSnapshot(sequence: 0)
        guard current != lastPublished else { return }
        lastPublished = current
        sequence += 1
        onStateChange?(snapshot())
    }

    private func extrasContext() -> HybridExtrasContext? {
        guard model.isConnected, !model.isBackground else { return nil }
        return HybridExtrasContext(epoch: accountEpoch.uuidString.lowercased(), conversation: conversation(), call: calls?.state ?? HybridCallState())
    }

    private func stageAttachment(_ text: String, context: HybridExtrasContext) -> Bool {
        guard let original = context.conversation, let current = conversation(), current.canSend, !callBusy,
              context.epoch == accountEpoch.uuidString.lowercased(), original.peer == current.peer, original.kind == current.kind else { return false }
        let body = current.draft.isEmpty ? text : current.draft + "\n" + text
        guard HybridRequest.text(body) else { return false }
        if current.kind == "group" { model.groups.setDraft(body, room: current.peer) }
        else { model.setDraft(body, peer: current.peer) }
        publish()
        return true
    }
}
