import Combine
import Foundation

@MainActor
final class NativeHybridExtrasAdapter: HybridExtrasPort {
    var onStage: ((String, HybridExtrasContext) -> Bool)?
    var presentPicker: ((HybridExtrasContext) -> Void)?
    var presentFile: ((String, HybridExtrasContext) -> Void)?
    var dismissPresentation: (() -> Void)?
    private weak var login: NativeLoginModel?
    private let translation = NativeTranslationModel()
    private let subject = CurrentValueSubject<HybridExtrasState, Never>(HybridExtrasState())
    private var observation: AnyCancellable?
    private var context: HybridExtrasContext?
    private var scope: ObjectIdentifier?
    private var scopeEpoch: String?
    private var connecting: Task<Void, Never>?
    private var saving: Task<Void, Never>?
    private var notice: String?

    init(login: NativeLoginModel) {
        self.login = login
        observation = translation.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.refresh() }
        }
    }

    var changes: AnyPublisher<HybridExtrasState, Never> { subject.eraseToAnyPublisher() }

    var state: HybridExtrasState {
        guard let context = context else { return HybridExtrasState() }
        var value = HybridExtrasState()
        value.ready = translation.ready; value.available = translation.available
        value.mode = translation.preferences.mode; value.language = translation.preferences.targetLanguage
        value.consent = translation.sharingConsent; value.liveConsent = translation.preferences.liveRttConsent
        value.ownLiveConsent = translation.preferences.ownLiveRttConsent
        value.busy = connecting != nil || saving != nil
        value.attachmentAvailable = login?.canSend == true && login?.activeWebSession != nil
        value.notice = notice ?? translation.error
        if let config = login?.activeWebSession?.configuration {
            value.fileMessages = (context.conversation?.messages ?? []).filter { !$0.retracted && NativeFileReference.inMessage($0.body, configuration: config) != nil }.map(\.id)
        }
        guard translation.ready, translation.available, value.mode != "off", value.consent else { return value }
        for message in context.conversation?.messages ?? [] where !message.retracted {
            if let text = translated(key: message.id, original: message.body) { value.translations[message.id] = text }
        }
        if let id = context.call.id, context.call.phase == "active" {
            if value.ownLiveConsent { value.ownRtt = translated(key: "hybrid-own-" + id, original: window(context.call.ownText)) }
            if value.liveConsent { value.remoteRtt = translated(key: "hybrid-peer-" + id, original: window(context.call.remoteText)) }
        }
        return value
    }

    func update(_ context: HybridExtrasContext?) {
        let previous = self.context
        self.context = context
        guard let context = context else {
            if previous == nil && scope == nil { return }
            connecting?.cancel(); connecting = nil; saving?.cancel(); saving = nil
            scope = nil; scopeEpoch = nil; translation.detach(); notice = nil
            dismissPresentation?(); refresh()
            return
        }
        if context.call.id != previous?.call.id || context.conversation?.peer != previous?.conversation?.peer || context.conversation?.kind != previous?.conversation?.kind {
            translation.clearResults()
            dismissPresentation?()
        }
        if let session = login?.activeWebSession, let account = login?.activeAccountID,
           scope != ObjectIdentifier(session) || scopeEpoch != context.epoch {
            connecting?.cancel(); saving?.cancel(); saving = nil
            scope = ObjectIdentifier(session); scopeEpoch = context.epoch
            let epoch = context.epoch
            connecting = Task { [weak self] in
                guard let self = self else { return }
                await self.translation.connect(session, accountID: account)
                guard !Task.isCancelled, self.scopeEpoch == epoch, self.scope == ObjectIdentifier(session) else { return }
                self.connecting = nil; self.refresh()
            }
        }
        refresh()
    }

    private func window(_ text: String) -> String { String(String.UnicodeScalarView(text.unicodeScalars.suffix(2000))) }

    private func translated(key: String, original: String) -> String? {
        guard translation.isCurrent(key: key, text: original), let result = translation.results[key],
              HybridRequest.text(result.text, maximumBytes: 65536),
              !NativeTranslationModel.sameLanguage(result.sourceLanguage, translation.preferences.targetLanguage),
              result.targetLanguage == translation.preferences.targetLanguage else { return nil }
        return result.text
    }

    private func refresh() {
        if let context = context, translation.preferences.mode == "automatic", translation.sharingConsent {
            for message in (context.conversation?.messages ?? []).suffix(12) where !message.retracted {
                translation.discardStale(key: message.id, text: message.body)
                if translation.pendingCount < 4 { translation.translate(message.body, key: message.id, automatic: true) }
            }
            if let id = context.call.id, context.call.phase == "active" {
                for (direction, text, key) in [("self", window(context.call.ownText), "hybrid-own-" + id), ("peer", window(context.call.remoteText), "hybrid-peer-" + id)] {
                    translation.discardStale(key: key, text: text)
                    if !text.isEmpty, translation.pendingCount < 4 { translation.translate(text, key: key, automatic: true, liveDirection: direction) }
                }
            }
        }
        let value = state
        if value != subject.value { subject.send(value) }
    }

    func command(_ command: String, arguments: [String: String], context: HybridExtrasContext) throws {
        guard self.context?.epoch == context.epoch, login?.isConnected == true, login?.isBackground == false else { throw HybridFailure.invalidState }
        notice = nil
        switch command {
        case "translation.disable": translation.setSharingConsent(false)
        case "files.pick":
            guard state.attachmentAvailable, context.conversation?.canSend == true, let presentPicker = presentPicker else { throw HybridFailure.unavailable }
            presentPicker(context)
        case "files.open":
            guard let message = context.conversation?.messages.first(where: { $0.id == arguments["id"] && !$0.retracted }),
                  let config = login?.activeWebSession?.configuration, NativeFileReference.inMessage(message.body, configuration: config) != nil,
                  let presentFile = presentFile else { throw HybridFailure.invalidState }
            presentFile(message.body, context)
        case "translation.message":
            guard translation.ready, translation.available, translation.sharingConsent, translation.preferences.mode != "off",
                  let message = context.conversation?.messages.first(where: { $0.id == arguments["id"] && !$0.retracted }) else { throw HybridFailure.invalidState }
            translation.discardStale(key: message.id, text: message.body)
            translation.translate(message.body, key: message.id)
        case "translation.settings":
            guard saving == nil, translation.ready else { throw HybridFailure.unavailable }
            let consent = arguments["consent"] == "true"
            if !consent || arguments["mode"] == "off" { translation.setSharingConsent(false) }
            let prefs = NativeTranslationPreferences(targetLanguage: arguments["language"]!, mode: arguments["mode"]!,
                automaticConsent: arguments["mode"] == "automatic" && consent,
                liveRttConsent: arguments["liveConsent"] == "true", ownLiveRttConsent: arguments["ownLiveConsent"] == "true")
            let epoch = context.epoch
            saving = Task { [weak self] in
                guard let self = self else { return }
                await self.translation.save(prefs, consent: consent)
                guard !Task.isCancelled, self.scopeEpoch == epoch else { return }
                self.saving = nil; self.refresh()
            }
        default: throw HybridFailure.invalidRequest
        }
        refresh()
    }

    func stage(_ text: String, context: HybridExtrasContext) {
        if onStage?(text, context) != true { notice = "Link niet ingevoegd. Controleer je gesprek en de lengte van je concept."; refresh() }
    }
}
