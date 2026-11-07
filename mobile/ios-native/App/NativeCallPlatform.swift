import AVFAudio
import CallKit
import PushKit

@MainActor
private final class NativeCallKitSystem: NativeCallSystem {
    let provider: CXProvider

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
    private(set) var revocationRequired = false

    init(media: any NativeCallMediaDriver) {
        let system = NativeCallKitSystem()
        self.system = system
        coordinator = NativeCallCoordinator(system: system, media: media, clock: NativeCallScheduler())
        super.init()
        system.provider.setDelegate(self, queue: .main)
    }

    @discardableResult
    func enable(account: String, consented: Bool, tokenChanged: @escaping (Data?) -> Void) -> Bool {
        guard Bundle.main.object(forInfoDictionaryKey: "TeleTypTelNativeCallPushEnabled") as? Bool == true,
              consented, !revocationRequired, self.account == nil, !account.isEmpty,
              account.utf8.count <= 96,
              !account.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { return false }
        self.account = account
        self.tokenChanged = tokenChanged
        registration = coordinator.configure(account: account, consented: true)
        let created = PKPushRegistry(queue: .main)
        registry = created
        created.delegate = self
        created.desiredPushTypes = [.voIP]
        return true
    }

    func disable() {
        revocationRequired = revocationRequired || account != nil
        registration = nil
        registry?.desiredPushTypes = []
        registry = nil
        coordinator.reset()
        let notify = tokenChanged
        tokenChanged = nil
        notify?(nil)
    }

    func confirmRevocation(account: String) {
        guard registry == nil, self.account == account else { return }
        revocationRequired = false
        self.account = nil
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
