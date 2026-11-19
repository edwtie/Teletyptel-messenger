import Combine
import Foundation
import TeleTypTelCore

@MainActor
public final class HybridSession {
    public var onStateChange: ((HybridSnapshot) -> Void)?
    private let model: NativeLoginModel
    private let configuration: ServerConfiguration
    private let nativeLogout: () -> Void
    private var observation: AnyCancellable?
    private var requestIDs: [UUID] = []
    private var sequence = 0
    private var lastPhase: NativeLoginModel.Phase?

    public init(model: NativeLoginModel, configuration: ServerConfiguration, nativeLogout: @escaping () -> Void) {
        self.model = model
        self.configuration = configuration
        self.nativeLogout = nativeLogout
        observation = model.$phase.sink { [weak self] _ in
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
            guard model.isWorking || model.isAwaitingSecondFactor else { throw HybridFailure.invalidState }
            model.reset()
        case "session.logout":
            guard model.phase != .signedOut else { throw HybridFailure.invalidState }
            nativeLogout()
            if model.phase != .signedOut { model.disconnect() }
        case "session.snapshot":
            break
        default:
            throw HybridFailure.unavailable
        }
        publish()
        return HybridReply(version: 1, id: request.id.uuidString.lowercased(), snapshot: snapshot())
    }

    public func snapshot() -> HybridSnapshot {
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
                              chatAvailable: false, callsAvailable: false, socialLoginAvailable: false)
    }

    private func publish() {
        guard model.phase != lastPhase else { return }
        lastPhase = model.phase
        sequence += 1
        onStateChange?(snapshot())
    }
}
