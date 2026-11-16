import AVFAudio
import CallKit
import PushKit

@MainActor
private final class NativeCallKitSystem: NativeCallSystem {
    let provider: CXProvider
    private let controller = CXCallController()

    init() {
        let configuration = CXProviderConfiguration(localizedName: "TeleTypTel")
        configuration.supportsVideo = true
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        provider = CXProvider(configuration: configuration)
    }

    func report(id: UUID, hasVideo: Bool, completion: @escaping (Bool) -> Void) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "TeleTypTel")
        update.localizedCallerName = "TeleTypTel"
        update.hasVideo = hasVideo
        update.supportsDTMF = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        provider.reportNewIncomingCall(with: id, update: update) { error in
            Task { @MainActor in completion(error == nil) }
        }
    }

    func start(id: UUID, peer: String, hasVideo: Bool, completion: @escaping (Bool) -> Void) {
        let action = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: peer))
        action.isVideo = hasVideo
        controller.request(CXTransaction(action: action)) { error in
            Task { @MainActor in completion(error == nil) }
        }
    }

    func connected(id: UUID) {
        provider.reportOutgoingCall(with: id, connectedAt: Date())
    }

    func requestHeld(id: UUID, held: Bool) {
        controller.request(CXTransaction(action: CXSetHeldCallAction(call: id, onHold: held))) { _ in }
    }

    func setDtmfEnabled(id: UUID, enabled: Bool, hasVideo: Bool, canHold: Bool) {
        let update = CXCallUpdate()
        update.supportsDTMF = enabled
        update.hasVideo = hasVideo
        update.supportsHolding = canHold
        update.supportsGrouping = false
        update.supportsUngrouping = false
        provider.reportCall(with: id, updated: update)
    }

    func end(id: UUID, reason: NativeCallEndReason) {
        let mapped: CXCallEndedReason
        switch reason {
        case .failed: mapped = .failed
        case .remoteEnded: mapped = .remoteEnded
        case .unanswered: mapped = .unanswered
        }
        provider.reportCall(with: id, endedAt: Date(), reason: mapped)
    }
}

@MainActor
final class NativeCallPlatform: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    let coordinator: NativeCallCoordinator
    private let system: NativeCallKitSystem
    private var registry: PKPushRegistry?
    private var registration: UUID?
    private var tokenChanged: ((Data?) -> Void)?
    private var account: String?
    private var dtmfCapability: (id: UUID, enabled: Bool, hasVideo: Bool, canHold: Bool)?
    private(set) var revocationRequired = false

    init(media: any NativeCallMediaDriver) {
        let system = NativeCallKitSystem()
        self.system = system
        coordinator = NativeCallCoordinator(system: system, media: media, clock: NativeCallScheduler())
        super.init()
        system.provider.setDelegate(self, queue: .main)
    }

    @discardableResult
    func connectForeground(account: String) -> UUID? {
        guard !revocationRequired, registry == nil, !account.isEmpty,
              account.utf8.count <= 96,
              !account.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              self.account == nil || self.account == account else { return nil }
        if let registration = registration { return registration }
        self.account = account
        let created = coordinator.configure(account: account, consented: true)
        registration = created
        return created
    }

    @discardableResult
    func receive(_ invitation: NativeCallInvitation, completion: @escaping () -> Void) -> Bool {
        guard let registration = registration else { completion(); return false }
        coordinator.receive(invitation, registration: registration, completion: completion)
        return true
    }

    @discardableResult
    func startOutgoing(peer: String, sid: String, media: NativeCallMedia,
                       usingIntent: Bool = false,
                       completion: @escaping (Bool) -> Void) -> UUID? {
        guard registration != nil else { completion(false); return nil }
        return coordinator.startOutgoing(peer: peer, sid: sid, media: media, usingIntent: usingIntent, completion: completion)
    }

    @discardableResult
    func enable(account: String, consented: Bool, tokenChanged: @escaping (Data?) -> Void) -> Bool {
        if registry != nil, consented, !revocationRequired, registration != nil,
           let previous = self.account, let bare = NativeChatCodec.bareJID(account),
           NativeChatCodec.bareJID(previous) == bare {
            self.tokenChanged = tokenChanged
            return true
        }
        guard Bundle.main.object(forInfoDictionaryKey: "TeleTypTelNativeCallPushEnabled") as? Bool == true,
              consented, registry == nil,
              let activeRegistration = connectForeground(account: account) else { return false }
        self.tokenChanged = tokenChanged
        registration = activeRegistration
        let created = PKPushRegistry(queue: .main)
        registry = created
        created.delegate = self
        created.desiredPushTypes = [.voIP]
        return true
    }

    func disable() {
        let hadPushRegistration = registry != nil
        revocationRequired = revocationRequired || hadPushRegistration
        registration = nil
        registry?.desiredPushTypes = []
        registry = nil
        coordinator.reset()
        let notify = tokenChanged
        tokenChanged = nil
        notify?(nil)
        if !hadPushRegistration { account = nil }
    }

    func confirmRevocation(account: String) {
        guard registry == nil, self.account == account else { return }
        revocationRequired = false
        if registration == nil { self.account = nil }
    }

    func stopPushRegistration() {
        let hadPushRegistration = registry != nil
        revocationRequired = revocationRequired || hadPushRegistration
        registry?.desiredPushTypes = []
        registry = nil
        tokenChanged = nil
    }

    func setDtmfEnabled(id: UUID, enabled: Bool, hasVideo: Bool, canHold: Bool = false) {
        guard coordinator.currentHandle?.id == id else { return }
        let permitted = enabled && coordinator.isConnected
        let holding = canHold && coordinator.isConnected && !coordinator.holdPending
        guard dtmfCapability?.id != id || dtmfCapability?.enabled != permitted || dtmfCapability?.hasVideo != hasVideo || dtmfCapability?.canHold != holding else { return }
        dtmfCapability = (id, permitted, hasVideo, holding)
        system.setDtmfEnabled(id: id, enabled: permitted, hasVideo: hasVideo, canHold: holding)
    }

    func requestHeld(id: UUID, held: Bool) {
        guard coordinator.currentHandle?.id == id, coordinator.isConnected, !coordinator.holdPending else { return }
        system.requestHeld(id: id, held: held)
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        Task { @MainActor [weak self] in
            guard let self = self else { action.fail(); return }
            if await coordinator.setHeld(id: action.callUUID, held: action.isOnHold) { action.fulfill() }
            else { action.fail() }
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        MainActor.assumeIsolated {
            if action.type == .singleTone, coordinator.sendDtmf(id: action.callUUID, tone: action.digits) { action.fulfill() }
            else { action.fail() }
        }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials,
                                 for type: PKPushType) {
        MainActor.assumeIsolated {
            guard registry === self.registry, type == .voIP, registration != nil,
                  !pushCredentials.token.isEmpty, pushCredentials.token.count <= 512 else { return }
            tokenChanged?(pushCredentials.token)
        }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        MainActor.assumeIsolated {
            guard registry === self.registry, type == .voIP else { return }
            disable()
        }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload,
                                 for type: PKPushType, completion: @escaping () -> Void) {
        MainActor.assumeIsolated {
            guard type == .voIP else { completion(); return }
            let data = (try? JSONSerialization.data(withJSONObject: payload.dictionaryPayload)) ?? Data()
            let currentRegistration = registry === self.registry ? registration : nil
            coordinator.receive(data, registration: currentRegistration ?? UUID(), completion: completion)
        }
    }

    nonisolated func providerDidReset(_ provider: CXProvider) {
        MainActor.assumeIsolated { disable() }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        MainActor.assumeIsolated {
            guard coordinator.lifecycle.current?.handle.id == action.callUUID else { action.fail(); return }
            coordinator.answer(id: action.callUUID) { success in
                if success { action.fulfill() } else { action.fail() }
            }
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        MainActor.assumeIsolated {
            if coordinator.performStart(id: action.callUUID) { action.fulfill() }
            else { action.fail() }
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        MainActor.assumeIsolated {
            if coordinator.end(id: action.callUUID) { action.fulfill() }
            else { action.fail() }
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        MainActor.assumeIsolated {
            if coordinator.setMuted(id: action.callUUID, muted: action.isMuted) { action.fulfill() }
            else { action.fail() }
        }
    }

    nonisolated func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        MainActor.assumeIsolated {
            guard let call = action as? CXCallAction else { return }
            coordinator.end(id: call.callUUID, reason: .failed)
        }
    }

    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        MainActor.assumeIsolated { coordinator.audioActivated(true) }
    }

    nonisolated func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        MainActor.assumeIsolated { coordinator.audioActivated(false) }
    }
}
