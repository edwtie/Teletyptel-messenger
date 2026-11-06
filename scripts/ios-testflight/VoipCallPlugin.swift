import CallKit
import PushKit
import AVFAudio

final class MessengerVoipCalls: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = MessengerVoipCalls()

    private final class Incoming {
        let id: UUID
        let sid: String
        let expiresAt: TimeInterval
        let hasVideo: Bool
        var phase = "ringing"
        var answer: CXAnswerCallAction?
        var timeout: DispatchWorkItem?

        init(id: UUID, sid: String, expiresAt: TimeInterval, hasVideo: Bool) {
            self.id = id
            self.sid = sid
            self.expiresAt = expiresAt
            self.hasVideo = hasVideo
        }
    }

    private var provider: CXProvider?
    private var registry: PKPushRegistry?
    private var calls: [UUID: Incoming] = [:]
    private var ended: [[String: String]] = []
    private var token: String?
    private var consentKey: String {
        "teletyptel.voip.registrationRequested." + (Bundle.main.object(forInfoDictionaryKey: "TeleTypTelServerOrigin") as? String ?? "")
    }
    private var accountKey: String { consentKey + ".account" }
    private var pendingKey: String { consentKey + ".pendingRevocation" }
    private var deviceKey: String { consentKey + ".device" }
    private var accountId: String { UserDefaults.standard.string(forKey: accountKey) ?? "" }
    private var pendingAccountId: String { UserDefaults.standard.string(forKey: pendingKey) ?? "" }
    private var deviceId: String {
        if let saved = UserDefaults.standard.string(forKey: deviceKey), UUID(uuidString: saved) != nil { return saved }
        let created = UUID().uuidString.lowercased()
        UserDefaults.standard.set(created, forKey: deviceKey)
        return created
    }
    var changed: (() -> Void)?
    var enabled: Bool { Bundle.main.object(forInfoDictionaryKey: "TeleTypTelCallPushEnabled") as? Bool == true }

    func start() {
        guard enabled else { return }
        if provider == nil {
            let configuration = CXProviderConfiguration(localizedName: "TeleTypTel")
            configuration.supportsVideo = true
            configuration.maximumCallGroups = 1
            configuration.maximumCallsPerCallGroup = 1
            configuration.supportedHandleTypes = [.generic]
            configuration.includesCallsInRecents = false
            let created = CXProvider(configuration: configuration)
            created.setDelegate(self, queue: .main)
            provider = created
        }
        if registry == nil && UserDefaults.standard.bool(forKey: consentKey) && !accountId.isEmpty && pendingAccountId.isEmpty {
            let created = PKPushRegistry(queue: .main)
            created.delegate = self
            registry = created
            created.desiredPushTypes = [.voIP]
        }
    }

    func register(account: String) -> Bool {
        guard enabled, !account.isEmpty, account.utf8.count <= 96, pendingAccountId.isEmpty,
              accountId.isEmpty || accountId == account else { return false }
        UserDefaults.standard.set(account, forKey: accountKey)
        UserDefaults.standard.set(true, forKey: consentKey)
        start()
        return true
    }

    func disable() {
        if !accountId.isEmpty { UserDefaults.standard.set(accountId, forKey: pendingKey) }
        UserDefaults.standard.removeObject(forKey: consentKey)
        UserDefaults.standard.removeObject(forKey: accountKey)
        registry?.desiredPushTypes = []
        registry = nil
        token = nil
        for id in Array(calls.keys) { finish(id, reason: .failed) }
        ended.removeAll()
        changed?()
    }

    func revocationConfirmed(account: String) -> Bool {
        guard pendingAccountId == account, !account.isEmpty else { return false }
        UserDefaults.standard.removeObject(forKey: pendingKey)
        changed?()
        return true
    }

    func snapshot() -> [String: Any] {
        var result: [String: Any] = ["enabled": enabled,
            "registered": registry != nil, "ended": ended, "deviceId": deviceId,
            "consented": UserDefaults.standard.bool(forKey: consentKey), "accountId": accountId,
            "pendingAccountId": pendingAccountId,
            "calls": calls.values.map { call -> [String: Any] in
                ["callId": call.id.uuidString.lowercased(), "sid": call.sid,
                 "hasVideo": call.hasVideo, "expiresAt": call.expiresAt, "phase": call.phase]
            }]
        if let token = token { result["token"] = token }
        return result
    }

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP, registry === self.registry, enabled,
              UserDefaults.standard.bool(forKey: consentKey) else { return }
        token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        changed?()
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP, registry === self.registry else { return }
        token = nil
        changed?()
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        report(payload.dictionaryPayload, completion: completion)
    }

    private func report(_ payload: [AnyHashable: Any], completion: @escaping () -> Void) {
        start()
        guard let provider = provider else { completion(); return }
        let parsedId = (payload["callId"] as? String).flatMap(UUID.init(uuidString:))
        let id = parsedId ?? UUID()
        let sid = payload["sid"] as? String ?? ""
        let expiresAt = (payload["expiresAt"] as? NSNumber)?.doubleValue ?? 0
        let hasVideo = payload["hasVideo"] as? Bool ?? false
        let now = Date().timeIntervalSince1970
        let valid = payload["type"] as? String == "incoming-call" && parsedId != nil
            && sid.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
            && expiresAt > now && expiresAt <= now + 60 && expiresAt.rounded() == expiresAt
            && payload["hasVideo"] is Bool && UserDefaults.standard.bool(forKey: consentKey)
        let existing = calls[id]
        let admitted = valid && existing == nil && calls.isEmpty
        let incoming = admitted ? Incoming(id: id, sid: sid, expiresAt: expiresAt, hasVideo: hasVideo) : nil
        if let incoming = incoming { calls[id] = incoming }
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "TeleTypTel")
        update.localizedCallerName = "TeleTypTel"
        update.hasVideo = hasVideo
        update.supportsDTMF = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        provider.reportNewIncomingCall(with: id, update: update) { error in
            DispatchQueue.main.async {
                defer { completion() }
                if existing != nil { return }
                if error != nil {
                    if let incoming = incoming, self.calls[id] === incoming { self.calls.removeValue(forKey: id) }
                    self.changed?()
                    return
                }
                guard let incoming = incoming, self.calls[id] === incoming else {
                    provider.reportCall(with: id, endedAt: Date(), reason: .failed)
                    return
                }
                if incoming.expiresAt <= Date().timeIntervalSince1970 {
                    self.finish(id, reason: .unanswered)
                    return
                }
                if incoming.phase == "ringing" {
                    self.scheduleTimeout(incoming, seconds: incoming.expiresAt - Date().timeIntervalSince1970)
                }
                self.changed?()
            }
        }
    }

    private func scheduleTimeout(_ call: Incoming, seconds: TimeInterval) {
        call.timeout?.cancel()
        let timeout = DispatchWorkItem { [weak self, weak call] in
            guard let self = self, let call = call, self.calls[call.id] === call else { return }
            self.finish(call.id, reason: call.phase == "ringing" ? .unanswered : .failed)
        }
        call.timeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, seconds), execute: timeout)
    }

    func providerDidReset(_ provider: CXProvider) {
        for id in Array(calls.keys) { finish(id, reason: .failed, report: false) }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let call = calls[action.callUUID], call.phase == "ringing",
              call.expiresAt > Date().timeIntervalSince1970 else { action.fail(); return }
        call.phase = "answerRequested"
        call.answer = action
        scheduleTimeout(call, seconds: min(15, call.expiresAt - Date().timeIntervalSince1970))
        changed?()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        finish(action.callUUID, reason: .remoteEnded, report: false)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        if let callAction = action as? CXCallAction { finish(callAction.callUUID, reason: .failed) }
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) { changed?() }
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) { changed?() }

    func mediaConnected(id: UUID, sid: String) -> Bool {
        guard let call = calls[id], call.sid == sid, call.phase == "answerRequested",
              let answer = call.answer, call.expiresAt > Date().timeIntervalSince1970 else { return false }
        call.timeout?.cancel()
        call.timeout = nil
        call.answer = nil
        call.phase = "connected"
        answer.fulfill()
        changed?()
        return true
    }

    func end(id: UUID, sid: String) -> Bool {
        guard calls[id]?.sid == sid else { return false }
        finish(id, reason: .remoteEnded)
        return true
    }

    func acknowledge(eventId: String) {
        ended.removeAll { $0["eventId"] == eventId }
    }

    private func finish(_ id: UUID, reason: CXCallEndedReason, report: Bool = true) {
        guard let call = calls.removeValue(forKey: id) else { return }
        call.timeout?.cancel()
        call.answer?.fail()
        ended.append(["eventId": UUID().uuidString.lowercased(), "callId": id.uuidString.lowercased(),
                      "sid": call.sid, "reason": String(reason.rawValue)])
        if ended.count > 32 { ended.removeFirst(ended.count - 32) }
        if report { provider?.reportCall(with: id, endedAt: Date(), reason: reason) }
        changed?()
    }
}

@objc(TeleTypTelVoipCallPlugin)
final class TeleTypTelVoipCallPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelVoipCallPlugin"
    let jsName = "TeleTypTelVoipCalls"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "revocationConfirmed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mediaConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    override func load() {
        MessengerVoipCalls.shared.changed = { [weak self] in
            guard let self = self, self.trusted() else { return }
            self.notifyListeners("changed", data: [:])
        }
    }

    private func trusted() -> Bool {
        return isBundledMessenger(bridge?.webView?.url) && MessengerBiometricSession.shared.permitsRequests
    }

    private func perform(_ call: CAPPluginCall, operation: @escaping () -> Void) {
        DispatchQueue.main.async {
            guard self.trusted() else { call.reject("Unlock the bundled Messenger first.", "UNTRUSTED_OR_LOCKED"); return }
            operation()
        }
    }

    @objc func register(_ call: CAPPluginCall) {
        perform(call) {
            guard MessengerVoipCalls.shared.enabled else { call.reject("Background calls are not enabled in this build.", "DISABLED"); return }
            guard let account = call.getString("accountId"), MessengerVoipCalls.shared.register(account: account) else {
                call.reject("Account consent or previous revocation required.", "ACCOUNT_MISMATCH"); return
            }
            call.resolve(MessengerVoipCalls.shared.snapshot())
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard isBundledMessenger(self.bridge?.webView?.url) else { call.reject("Untrusted page."); return }
            MessengerVoipCalls.shared.disable()
            call.resolve()
        }
    }

    @objc func state(_ call: CAPPluginCall) {
        perform(call) { call.resolve(MessengerVoipCalls.shared.snapshot()) }
    }

    @objc func revocationConfirmed(_ call: CAPPluginCall) {
        perform(call) {
            guard let account = call.getString("accountId"), MessengerVoipCalls.shared.revocationConfirmed(account: account) else {
                call.reject("Revocation account does not match.", "ACCOUNT_MISMATCH"); return
            }
            call.resolve()
        }
    }

    @objc func mediaConnected(_ call: CAPPluginCall) {
        perform(call) {
            guard let id = call.getString("callId").flatMap(UUID.init(uuidString:)), let sid = call.getString("sid"),
                  MessengerVoipCalls.shared.mediaConnected(id: id, sid: sid) else {
                call.reject("Call is no longer awaiting media.", "STALE_CALL"); return
            }
            call.resolve()
        }
    }

    @objc func acknowledge(_ call: CAPPluginCall) {
        perform(call) {
            guard let eventId = call.getString("eventId"), UUID(uuidString: eventId) != nil else {
                call.reject("Invalid event identifier.", "INVALID_EVENT"); return
            }
            MessengerVoipCalls.shared.acknowledge(eventId: eventId)
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        perform(call) {
            guard let id = call.getString("callId").flatMap(UUID.init(uuidString:)), let sid = call.getString("sid"),
                  MessengerVoipCalls.shared.end(id: id, sid: sid) else {
                call.reject("Call is no longer active.", "STALE_CALL"); return
            }
            call.resolve()
        }
    }
}
