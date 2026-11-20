import Combine
import Foundation
import TeleTypTelCore

@MainActor
public final class HybridSession {
    public var onStateChange: ((HybridSnapshot) -> Void)?
    private let model: NativeLoginModel
    private let configuration: ServerConfiguration
    private let nativeLogout: () -> Void
    private let nativeSettings: (() -> Void)?
    private var observation: AnyCancellable?
    private var requestIDs: [UUID] = []
    private var sequence = 0
    private var lastPublished: HybridSnapshot?

    public init(model: NativeLoginModel, configuration: ServerConfiguration, nativeLogout: @escaping () -> Void,
                nativeSettings: (() -> Void)? = nil) {
        self.model = model
        self.configuration = configuration
        self.nativeLogout = nativeLogout
        self.nativeSettings = nativeSettings
        observation = Publishers.CombineLatest3(model.$phase, model.$roster, model.$isBackground).sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.publish() }
        }
    }

    public func handle(_ data: Data, document: URL?, mainFrame: Bool) throws -> HybridReply {
        guard HybridDocumentPolicy.permits(document, mainFrame: mainFrame) else { throw HybridFailure.untrustedDocument }
        let request = try HybridRequest.decode(data)
        guard !requestIDs.contains(request.id) else { throw HybridFailure.replayedRequest }
        requestIDs.append(request.id)
        if requestIDs.count > 128 { requestIDs.removeFirst() }
        switch request.command {
        case "session.login":
            guard !model.isBackground else { throw HybridFailure.invalidState }
            switch model.phase {
            case .idle, .signedOut, .failed:
                model.login(address: configuration.origin.absoluteString, domain: configuration.domain,
                            jid: request.arguments["jid"]!, password: request.arguments["password"]!)
            default:
                throw HybridFailure.sessionBusy
            }
        case "session.verifySecondFactor":
            guard model.isAwaitingSecondFactor, !model.isBackground else { throw HybridFailure.invalidState }
            model.verifySecondFactor(code: request.arguments["code"]!)
        case "session.cancel":
            guard !model.isBackground, !model.isReconnecting,
                  model.isWorking || model.isAwaitingSecondFactor else { throw HybridFailure.invalidState }
            model.reset()
        case "session.logout":
            guard model.phase != .signedOut else { throw HybridFailure.invalidState }
            nativeLogout()
            if model.phase != .signedOut { model.disconnect() }
        case "session.snapshot":
            break
        case "app.openSettings":
            guard !model.isWorking, !model.isBackground, !model.isSecondFactorPending else { throw HybridFailure.sessionBusy }
            guard let nativeSettings = nativeSettings else { throw HybridFailure.unavailable }
            nativeSettings()
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
        return HybridSnapshot(version: 1, sequence: sequence, phase: phase, errorCode: errorCode,
                              chatAvailable: false, callsAvailable: false, socialLoginAvailable: false,
                              settingsAvailable: nativeSettings != nil, roster: roster())
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
                return HybridContact(jid: contact.jid, name: name.isEmpty ? contact.jid : name, presence: contact.presence.rawValue)
            }
            return HybridRoster(status: "ready", contacts: projected)
        }
    }

    private func publish() {
        let current = makeSnapshot(sequence: 0)
        guard current != lastPublished else { return }
        lastPublished = current
        sequence += 1
        onStateChange?(snapshot())
    }
}
