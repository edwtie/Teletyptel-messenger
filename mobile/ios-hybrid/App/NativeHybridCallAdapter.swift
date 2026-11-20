import Combine
import Foundation
import UIKit
import WebRTC

@MainActor
final class NativeHybridVideoHost: UIView {
    private let remote = RTCMTLVideoView(frame: .zero)
    private let local = RTCMTLVideoView(frame: .zero)
    private var remoteTrack: RTCVideoTrack?
    private var localTrack: RTCVideoTrack?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        clipsToBounds = true
        backgroundColor = .black
        local.clipsToBounds = true
        local.layer.cornerRadius = 10
        local.backgroundColor = .black
        addSubview(remote)
        addSubview(local)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Use init()") }

    override func layoutSubviews() {
        super.layoutSubviews()
        remote.frame = bounds
        let width = min(140, bounds.width * 0.30)
        local.frame = remoteTrack == nil ? bounds : CGRect(x: max(0, bounds.width - width - 10), y: 10, width: width, height: min(bounds.height * 0.30, width * 0.75))
    }

    func update(_ presentation: NativeCallPresentation?, fit: String) {
        let remoteValue = presentation?.remoteCameraEnabled == false ? nil : presentation?.remoteVideo
        let localValue = presentation?.cameraEnabled == true ? presentation?.localVideo : nil
        if remoteTrack !== remoteValue {
            remoteTrack?.remove(remote); remoteTrack = remoteValue; remoteValue?.add(remote)
        }
        if localTrack !== localValue {
            localTrack?.remove(local); localTrack = localValue; localValue?.add(local)
        }
        remote.videoContentMode = fit == "cover" ? .scaleAspectFill : .scaleAspectFit
        local.videoContentMode = remoteValue == nil && fit == "contain" ? .scaleAspectFit : .scaleAspectFill
        local.isHidden = localValue == nil
        isHidden = remoteValue == nil && localValue == nil
        setNeedsLayout()
    }
}

@MainActor
final class NativeHybridCallAdapter: HybridCallPort {
    let videoView = NativeHybridVideoHost(frame: .zero)
    private let controller: NativeCallController
    private weak var login: NativeLoginModel?
    private let subject = CurrentValueSubject<HybridCallState, Never>(HybridCallState())
    private var observations: [AnyCancellable] = []
    private var identifier: UUID?
    private var systemIdentifier: UUID?
    private var requestedMode = "total"
    private var fit = "contain"
    private var answering: String?

    init(controller: NativeCallController, login: NativeLoginModel) {
        self.controller = controller
        self.login = login
        observations.append(Publishers.CombineLatest4(controller.$status, controller.$presentation, controller.$isMuted, controller.$isHeld).sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.refresh() }
        })
    }

    var changes: AnyPublisher<HybridCallState, Never> { subject.eraseToAnyPublisher() }

    var state: HybridCallState {
        var value = HybridCallState()
        let peer: String
        switch controller.status {
        case .idle: identifier = nil; systemIdentifier = nil; answering = nil; return value
        case .failed: identifier = nil; systemIdentifier = nil; answering = nil; value.phase = "failed"; return value
        case .calling(let target): value.phase = "calling"; peer = target
        case .ringing(let target): value.phase = "ringing"; peer = target
        case .active(let target): value.phase = "active"; peer = target
        }
        let currentSystem = controller.hybridCallIdentifier
        if identifier == nil || (systemIdentifier != nil && currentSystem != nil && systemIdentifier != currentSystem) {
            identifier = UUID()
        }
        if currentSystem != nil { systemIdentifier = currentSystem }
        value.id = identifier!.uuidString.lowercased()
        value.peer = NativeChatCodec.bareJID(peer) ?? "TeleTypTel"
        value.mode = controller.hybridCallProfile?.rawValue ?? requestedMode
        value.muted = controller.isMuted
        value.cameraEnabled = controller.presentation?.cameraEnabled ?? false
        value.remoteCamera = controller.presentation?.remoteCameraEnabled.map { $0 ? "on" : "off" } ?? "unknown"
        value.rttReady = controller.presentation?.rttReady ?? false
        value.canSwitchCamera = controller.presentation?.canSwitchCamera ?? false
        value.canSendDtmf = controller.presentation?.canSendDtmf ?? false
        value.ownText = controller.presentation?.ownText ?? ""
        value.remoteText = controller.presentation?.remoteText ?? ""
        value.videoFit = fit
        if value.phase != "ringing" { answering = nil }
        return value
    }

    func refresh() {
        let current = state
        videoView.update(["active", "calling"].contains(current.phase) ? controller.presentation : nil, fit: fit)
        subject.send(current)
    }

    func canCall(peer: String) -> Bool {
        guard let login = login, login.canSend, case .ready(let contacts) = login.roster,
              let contact = contacts.first(where: { $0.jid == peer }) else { return false }
        return controller.canCall(contact)
    }

    func start(peer: String, mode: String) throws {
        guard canCall(peer: peer), let profile = NativeCallMedia(rawValue: mode), let login = login,
              case .ready(let contacts) = login.roster, let contact = contacts.first(where: { $0.jid == peer }) else { throw HybridFailure.unavailable }
        requestedMode = mode
        fit = "contain"
        controller.startCall(contact, profile: profile)
        refresh()
    }

    func control(id: String, action: String, value: String?) throws {
        let current = state
        guard current.id == id else { throw HybridFailure.invalidState }
        switch action {
        case "end": controller.endFromHybrid()
        case "answer":
            guard current.phase == "ringing", answering != id else { throw HybridFailure.invalidState }
            answering = id
            controller.answerFromHybrid()
        case "mute": guard current.phase == "active" else { throw HybridFailure.invalidState }; controller.toggleMuted()
        case "camera": guard controller.presentation?.profile.hasVideo == true else { throw HybridFailure.invalidState }; controller.toggleCamera()
        case "switchCamera": guard current.canSwitchCamera else { throw HybridFailure.invalidState }; controller.switchCamera()
        case "rtt": guard current.rttReady, let value = value else { throw HybridFailure.invalidState }; controller.setRttText(value)
        case "dtmf": guard current.canSendDtmf, let value = value, controller.sendDtmf(value) else { throw HybridFailure.invalidState }
        case "fit": guard let value = value, ["contain", "cover"].contains(value) else { throw HybridFailure.invalidRequest }; fit = value
        default: throw HybridFailure.invalidRequest
        }
        refresh()
    }

    func resetFailure() throws {
        guard state.phase == "failed", !controller.hasLiveCall else { throw HybridFailure.invalidState }
        controller.clearHybridFailure()
        refresh()
    }

    func placeVideo(id: String, placement: HybridVideoPlacement) throws {
        guard state.id == id, let parent = videoView.superview else { throw HybridFailure.invalidState }
        let scale = Double(parent.bounds.width) / placement.viewportWidth
        guard scale >= 0.1, scale <= 10, placement.y * scale + placement.height * scale <= Double(parent.bounds.height) + 2 else {
            throw HybridFailure.invalidRequest
        }
        videoView.frame = CGRect(x: CGFloat(placement.x * scale), y: CGFloat(placement.y * scale), width: CGFloat(placement.width * scale), height: CGFloat(placement.height * scale))
        videoView.setNeedsLayout()
    }
}
