import CallKit
import PushKit
import AVFAudio

final class MessengerVoipCalls: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = MessengerVoipCalls()

    private final class Incoming {
        let id: UUID
        let sid: String
        let expiresAt: TimeInterval
        let mediaProfile: MessengerCallMediaProfile
        let rtt: MessengerNativeRttSession?
        var phase = "ringing"
        var answer: CXAnswerCallAction?
        var timeout: DispatchWorkItem?

        init(id: UUID, sid: String, expiresAt: TimeInterval, mediaProfile: MessengerCallMediaProfile) {
            self.id = id
            self.sid = sid
            self.expiresAt = expiresAt
            self.mediaProfile = mediaProfile
            self.rtt = mediaProfile.contents.contains("rtt") ? MessengerNativeRttSession(callId: id, sid: sid) : nil
        }
    }

    private var provider: CXProvider?
    private var registry: PKPushRegistry?
    private var calls: [UUID: Incoming] = [:]
    private var ended: [[String: String]] = []
    private var token: String?
    private var control: MessengerCallControlCredential?
    private var controlRequest: MessengerCallControlRequest?
    private var controlTimer: DispatchWorkItem?
    private var controlRevision = 0
    private var controlStorageReady = false
    private var foregroundObserver: NSObjectProtocol?
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
        if foregroundObserver == nil {
            foregroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
                object: nil, queue: .main) { [weak self] _ in self?.scheduleControl() }
        }
        if control == nil && UserDefaults.standard.bool(forKey: consentKey) && !accountId.isEmpty && pendingAccountId.isEmpty,
           let stored = MessengerCallControlVault.read(account: accountId, device: deviceId) {
            control = stored
            ended = stored.ended
            controlStorageReady = true
        }
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
        controlRevision += 1
        controlTimer?.cancel()
        controlTimer = nil
        controlRequest?.cancel()
        controlRequest = nil
        control = nil
        controlStorageReady = false
        MessengerCallControlVault.clear()
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
            "nativeControlReady": control != nil && control!.expiresAt > Date().timeIntervalSince1970,
            "controlStorageReady": controlStorageReady,
            "calls": calls.values.map { call -> [String: Any] in
                ["callId": call.id.uuidString.lowercased(), "sid": call.sid,
                 "hasVideo": call.mediaProfile.hasVideo, "mediaProfile": call.mediaProfile.rawValue,
                 "rttReady": call.rtt?.isReady ?? false, "rttStatus": call.rtt?.status ?? "not-requested",
                 "requiredContents": call.mediaProfile.contents.sorted(), "expiresAt": call.expiresAt, "phase": call.phase]
            }]
        if let token = token { result["token"] = token }
        return result
    }

    func configureControl(account: String, device: String, credential: String, expiresAt: TimeInterval) -> Bool {
        guard enabled, account == accountId, device == deviceId, pendingAccountId.isEmpty,
              UserDefaults.standard.bool(forKey: consentKey),
              credential.range(of: "^[0-9a-f]{2,960}\\.[0-9a-f]{64}$", options: .regularExpression) != nil,
              expiresAt > Date().timeIntervalSince1970, expiresAt <= Date().timeIntervalSince1970 + 86500 else { return false }
        let stored = MessengerCallControlCredential(account: account, device: device, token: credential, expiresAt: expiresAt, ended: ended)
        guard MessengerCallControlVault.write(stored) else { controlStorageReady = false; return false }
        controlRevision += 1
        controlRequest?.cancel()
        controlRequest = nil
        control = stored
        controlStorageReady = true
        scheduleControl()
        return true
    }

    private func persistControl() {
        guard var stored = control, stored.account == accountId else { return }
        stored.ended = ended
        control = stored
        controlStorageReady = MessengerCallControlVault.write(stored)
    }

    private func scheduleControl(delay: TimeInterval = 0) {
        controlTimer?.cancel()
        guard enabled, control != nil, UserDefaults.standard.bool(forKey: consentKey), pendingAccountId.isEmpty else { return }
        let work = DispatchWorkItem { [weak self] in self?.reconcileNative() }
        controlTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func reconcileNative() {
        guard enabled, controlRequest == nil, let credential = control, credential.account == accountId,
              credential.expiresAt > Date().timeIntervalSince1970,
              UserDefaults.standard.bool(forKey: consentKey), pendingAccountId.isEmpty else { return }
        var pending: [String: [String: Any]] = [:]
        for call in calls.values where call.phase == "ringing" || call.phase == "answerRequested" {
            pending[call.id.uuidString.lowercased()] = ["callId": call.id.uuidString.lowercased(), "sid": call.sid, "end": false]
        }
        let events = ended
        for event in events {
            if let id = event["callId"], let sid = event["sid"] {
                pending[id] = ["callId": id, "sid": sid, "end": true]
            }
        }
        guard !pending.isEmpty else { return }
        let revision = controlRevision
        let request = MessengerCallControlRequest()
        controlRequest = request
        var backgroundTask = UIBackgroundTaskIdentifier.invalid
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "TeleTypTel call control") { [weak request] in request?.cancel() }
        request.start(token: credential.token, calls: Array(pending.values)) { [weak self, weak request] result in
            if backgroundTask != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                backgroundTask = .invalid
            }
            guard let self = self, self.controlRevision == revision, self.controlRequest === request else { return }
            self.controlRequest = nil
            if case .failure(let error) = result, (error as? URLError)?.code == .userAuthenticationRequired {
                self.control = nil
                self.controlStorageReady = false
                MessengerCallControlVault.clear()
                for id in Array(self.calls.keys) where self.calls[id]?.phase != "connected" { self.finish(id, reason: .failed) }
                self.changed?()
                return
            }
            if case .success(let results) = result {
                for item in results {
                    guard let id = item["callId"], let sid = item["sid"],
                          ["ended", "expired", "unavailable", "answered-elsewhere"].contains(item["state"] ?? "") else { continue }
                    if let uuid = UUID(uuidString: id), let call = self.calls[uuid], call.sid == sid,
                       call.phase == "ringing" || call.phase == "answerRequested" {
                        self.finish(uuid, reason: item["state"] == "answered-elsewhere" ? .answeredElsewhere : .remoteEnded)
                    }
                    let acknowledged = Set(events.filter { $0["callId"] == id && $0["sid"] == sid }.compactMap { $0["eventId"] })
                    self.ended.removeAll { acknowledged.contains($0["eventId"] ?? "") }
                }
                self.persistControl()
                self.changed?()
            }
            if self.calls.values.contains(where: { $0.phase == "ringing" || $0.phase == "answerRequested" }) {
                self.scheduleControl(delay: 2)
            } else if self.ended.contains(where: { event in !events.contains(where: { $0["eventId"] == event["eventId"] }) }) {
                self.scheduleControl()
            }
        }
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
        let mediaProfile = (payload["mediaProfile"] as? String).flatMap(MessengerCallMediaProfile.init(rawValue:))
        let now = Date().timeIntervalSince1970
        let valid = payload["type"] as? String == "incoming-call" && parsedId != nil
            && sid.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
            && expiresAt > now && expiresAt <= now + 60 && expiresAt.rounded() == expiresAt
            && payload["hasVideo"] is Bool && mediaProfile?.hasVideo == hasVideo
            && UserDefaults.standard.bool(forKey: consentKey)
        let existing = calls[id]
        let admitted = valid && existing == nil && calls.isEmpty
        let incoming = admitted ? mediaProfile.map { Incoming(id: id, sid: sid, expiresAt: expiresAt, mediaProfile: $0) } : nil
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
                defer { completion(); self.scheduleControl() }
                if existing != nil { return }
                if error != nil {
                    if let incoming = incoming, self.calls[id] === incoming {
                        self.finish(id, reason: .failed, report: false)
                    }
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
        scheduleControl()
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

    func mediaConnected(id: UUID, sid: String, negotiatedProfile: String, readyContents: [String]) -> Bool {
        guard let call = calls[id], call.sid == sid, call.phase == "answerRequested",
              call.mediaProfile.accepts(negotiated: negotiatedProfile, ready: readyContents),
              !call.mediaProfile.contents.contains("rtt") || call.rtt?.isReady == true,
              let answer = call.answer, call.expiresAt > Date().timeIntervalSince1970 else { return false }
        call.timeout?.cancel()
        call.timeout = nil
        call.answer = nil
        call.phase = "connected"
        answer.fulfill()
        changed?()
        return true
    }

    func attachRtt(id: UUID, sid: String, channel: MessengerT140Channel) -> Bool {
        precondition(Thread.isMainThread)
        guard let call = calls[id], call.sid == sid, call.phase == "answerRequested",
              let rtt = call.rtt, rtt.attach(channel, callId: id, sid: sid) else { return false }
        changed?()
        return true
    }

    func receiveRtt(id: UUID, sid: String, channel: MessengerT140Channel, data: Data) {
        precondition(Thread.isMainThread)
        guard let call = calls[id], call.sid == sid, let rtt = call.rtt else { return }
        _ = rtt.receive(data, from: channel, callId: id, sid: sid)
        changed?()
    }

    func rttTransportChanged(id: UUID, sid: String, channel: MessengerT140Channel, ended: Bool = false) {
        precondition(Thread.isMainThread)
        guard let call = calls[id], call.sid == sid, let rtt = call.rtt else { return }
        _ = rtt.transportChanged(channel, callId: id, sid: sid, ended: ended)
        changed?()
    }

    func rttState(id: UUID, sid: String) -> [String: Any]? {
        precondition(Thread.isMainThread)
        guard let call = calls[id], call.sid == sid, let rtt = call.rtt else { return nil }
        return ["callId": id.uuidString.lowercased(), "sid": sid, "status": rtt.status,
            "ready": rtt.isReady, "pending": rtt.hasPendingText, "ownText": rtt.ownText, "remoteText": rtt.remoteText]
    }

    func setRttText(id: UUID, sid: String, text: String) -> Bool {
        precondition(Thread.isMainThread)
        guard let call = calls[id], call.sid == sid, call.phase == "connected", let rtt = call.rtt else { return false }
        let sent = rtt.setText(text)
        changed?()
        return sent
    }

    func end(id: UUID, sid: String) -> Bool {
        guard calls[id]?.sid == sid else { return false }
        finish(id, reason: .remoteEnded)
        return true
    }

    func acknowledge(eventId: String) {
        ended.removeAll { $0["eventId"] == eventId }
        persistControl()
    }

    private func finish(_ id: UUID, reason: CXCallEndedReason, report: Bool = true) {
        guard let call = calls.removeValue(forKey: id) else { return }
        call.rtt?.close()
        call.timeout?.cancel()
        call.answer?.fail()
        ended.append(["eventId": UUID().uuidString.lowercased(), "callId": id.uuidString.lowercased(),
                      "sid": call.sid, "reason": String(reason.rawValue)])
        if ended.count > 32 { ended.removeFirst(ended.count - 32) }
        persistControl()
        if report { provider?.reportCall(with: id, endedAt: Date(), reason: reason) }
        scheduleControl()
        changed?()
    }
}

@objc(TeleTypTelVoipCallPlugin)
final class TeleTypTelVoipCallPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelVoipCallPlugin"
    let jsName = "TeleTypTelVoipCalls"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureControl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "revocationConfirmed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mediaConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rttState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRttText", returnType: CAPPluginReturnPromise),
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

    @objc func configureControl(_ call: CAPPluginCall) {
        perform(call) {
            guard let account = call.getString("accountId"), let device = call.getString("deviceId"),
                  let credential = call.getString("token"), let expiresAt = call.getDouble("expiresAt"),
                  MessengerVoipCalls.shared.configureControl(account: account, device: device, credential: credential, expiresAt: expiresAt) else {
                call.reject("Call control could not be stored securely.", "CONTROL_UNAVAILABLE"); return
            }
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
                  let profile = call.getString("negotiatedProfile"), let contents = call.getArray("readyContents", String.self),
                  MessengerVoipCalls.shared.mediaConnected(id: id, sid: sid, negotiatedProfile: profile, readyContents: contents) else {
                call.reject("Call is stale or negotiated media is incomplete.", "MEDIA_NOT_READY"); return
            }
            call.resolve()
        }
    }

    @objc func rttState(_ call: CAPPluginCall) {
        perform(call) {
            guard let id = call.getString("callId").flatMap(UUID.init(uuidString:)), let sid = call.getString("sid"),
                  let state = MessengerVoipCalls.shared.rttState(id: id, sid: sid) else {
                call.reject("RTT session is no longer available.", "STALE_CALL"); return
            }
            call.resolve(state)
        }
    }

    @objc func setRttText(_ call: CAPPluginCall) {
        perform(call) {
            guard let id = call.getString("callId").flatMap(UUID.init(uuidString:)), let sid = call.getString("sid"),
                  let text = call.getString("text"), text.utf8.count <= 131072 else {
                call.reject("Invalid RTT request.", "INVALID_TEXT"); return
            }
            let queued = MessengerVoipCalls.shared.setRttText(id: id, sid: sid, text: text)
            guard let state = MessengerVoipCalls.shared.rttState(id: id, sid: sid) else {
                call.reject("RTT session is no longer available.", "STALE_CALL"); return
            }
            call.resolve(["queued": queued, "state": state])
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
