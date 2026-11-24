import Combine
import Foundation
import ImageIO
import UIKit

@MainActor
final class NativeHybridAccountAdapter: HybridAccountPort {
    let provider = NativeProviderSDK()
    let avatars = NativeAvatarCache()
    private let saved = NativeSavedLoginModel(vault: NativeBiometricLoginVault())
    private let profile = NativeAccountSettingsModel()
    private let lifecycle = NativeAccountLifecycle()
    private let editor = NativeContactEditor()
    private let requests = NativeContactRequests()
    private let sipDirectory = HybridSIPDirectory()
    private weak var login: NativeLoginModel?
    var configuration: ServerConfiguration { didSet { refresh() } }
    private var epoch: String?
    private var active = false
    private var lastPhase: NativeLoginModel.Phase?
    private var webSession: ObjectIdentifier?
    private var contactsConfigured = false
    private var operation: Task<Void, Never>?
    private var profileTask: Task<Void, Never>?
    private var observations: [AnyCancellable] = []
    private var imageSources: [String: String] = [:]
    private var images: [String: String] = [:]
    private var noticeChannel = "profile"
    private var presentation = false
    private var storageNotice: String?
    private let subject = CurrentValueSubject<HybridAccountState, Never>(HybridAccountState())
    var presentAvatar: (() -> Void)?
    var presentPrivacy: ((URL) -> Void)?
    var presentPanel: ((String) -> Void)?
    var dismissPresentation: (() -> Void)?

    init(login: NativeLoginModel, configuration: ServerConfiguration) {
        self.login = login; self.configuration = configuration
        for publisher in [saved.objectWillChange.eraseToAnyPublisher(), profile.objectWillChange.eraseToAnyPublisher(),
                          lifecycle.objectWillChange.eraseToAnyPublisher(), editor.objectWillChange.eraseToAnyPublisher(),
                          requests.objectWillChange.eraseToAnyPublisher(), avatars.objectWillChange.eraseToAnyPublisher()] {
            observations.append(publisher.sink { [weak self] _ in Task { @MainActor [weak self] in self?.refresh() } })
        }
    }

    var changes: AnyPublisher<HybridAccountState, Never> { subject.eraseToAnyPublisher() }
    var state: HybridAccountState { subject.value }
    func setPresentation(_ value: Bool) { presentation = value; refresh() }

    func restoreIfAllowed() {
        guard saved.canRestoreAutomatically, login?.phase == .idle, login?.isBackground == false else { return }
        try? command("auth.biometric", arguments: [:])
    }

    func update(epoch: String, active: Bool) {
        if self.epoch != epoch {
            cancelAuthentication(); clearConnected(); self.epoch = epoch; lastPhase = nil
        }
        if self.active && !active { clearConnected() }
        self.active = active
        if let login = login, lastPhase != login.phase {
            lastPhase = login.phase
            if active, let jid = login.currentOwner { saved.connected(jid: jid) }
            else if !login.isWorking && !login.isSecondFactorPending { saved.cancel() }
        }
        if active, let login = login {
            if !contactsConfigured, let sender = login.contactManager { requests.configure(sender); contactsConfigured = true }
            if let session = login.activeWebSession {
                if webSession != ObjectIdentifier(session) {
                    webSession = ObjectIdentifier(session); loadProfile()
                }
                if case .ready(let contacts) = login.roster { avatars.connect(session, owner: login.currentOwner, contacts: contacts.count <= 100 ? contacts : []) }
            }
        }
        refresh()
    }

    func prepareLogin(jid: String, password: String, remember: Bool) throws {
        saved.forget()
        storageNotice = saved.hasSavedLogin ? saved.notice : nil
        guard !saved.hasSavedLogin else { refresh(); throw HybridFailure.invalidState }
        saved.prepare(address: configuration.origin.absoluteString, domain: configuration.domain, jid: jid, password: password, consented: remember)
    }

    func cancelAuthentication() {
        operation?.cancel(); operation = nil; provider.cancel(); saved.cancel(); lifecycle.detach()
        refresh()
    }

    func logout() { cancelAuthentication(); saved.forget(); storageNotice = saved.hasSavedLogin ? saved.notice : nil; clearConnected(); refresh() }

    private func clearConnected() {
        profileTask?.cancel(); profileTask = nil; profile.detach(); editor.detach(); requests.detach(); avatars.detach()
        imageSources.removeAll(); images.removeAll(); webSession = nil; contactsConfigured = false
        dismissPresentation?()
    }

    private func loadProfile() {
        guard let login = login else { return }
        let scope = epoch
        profileTask?.cancel()
        profileTask = Task { [weak self] in
            guard let self = self else { return }
            await self.profile.connect(login.activeWebSession, accountID: login.activeAccountID)
            guard !Task.isCancelled, self.epoch == scope else { return }
            self.profileTask = nil; self.refresh()
        }
    }

    func command(_ name: String, arguments: [String: String]) throws {
        guard let login = login, !login.isBackground else { throw HybridFailure.invalidState }
        noticeChannel = name.hasPrefix("contacts.") ? name : "profile"
        switch name {
        case "auth.social":
            guard let providerName = NativeIdentityProvider(rawValue: arguments["provider"]!), provider.configured(providerName) else { throw HybridFailure.unavailable }
            saved.forget(); storageNotice = saved.hasSavedLogin ? saved.notice : nil
            guard !saved.hasSavedLogin else { refresh(); throw HybridFailure.invalidState }
            login.loginSocial(address: configuration.origin.absoluteString, domain: configuration.domain, provider: providerName, signer: provider)
        case "auth.biometric":
            guard saved.hasSavedLogin else { throw HybridFailure.unavailable }
            let scope = epoch
            saved.unlock { [weak self] value in
                guard let self = self, self.epoch == scope, !login.isBackground, !login.isConnected, !login.isWorking,
                      value.address == self.configuration.origin.absoluteString, value.domain == self.configuration.domain else { return }
                login.login(address: value.address, domain: value.domain, jid: value.jid, password: value.password)
            }
        case "auth.forget": saved.forget(); storageNotice = saved.hasSavedLogin ? saved.notice : nil
        case "auth.privacy":
            guard let presentPrivacy = presentPrivacy else { throw HybridFailure.unavailable }
            presentPrivacy(configuration.origin.appendingPathComponent("privacy.html"))
        case "auth.register", "auth.recover":
            guard operation == nil else { throw HybridFailure.sessionBusy }
            if name == "auth.register" {
                guard configuration.domain == "localhost", NativeAccountLifecycle.validPassword(arguments["password"]!) else { throw HybridFailure.invalidRequest }
            }
            let scope = epoch
            operation = Task { [weak self] in
                guard let self = self else { return }
                if name == "auth.recover" { await self.lifecycle.requestRecovery(configuration: self.configuration, jid: arguments["jid"]!) }
                else { await self.lifecycle.register(configuration: self.configuration, jid: arguments["jid"]!, name: arguments["name"]!, password: arguments["password"]!) }
                guard !Task.isCancelled, self.epoch == scope else { return }
                self.operation = nil; self.refresh()
            }
        case "account.refresh":
            guard active, profileTask == nil, operation == nil else { throw HybridFailure.invalidState }
            loadProfile(); avatars.refreshOwner()
        case "account.save":
            guard active, operation == nil, !profile.busy, var value = profile.profile else { throw HybridFailure.invalidState }
            value.displayName = arguments["name"]!; value.phoneNumber = arguments["phone"]!
            value.preferredLanguage = arguments["language"]!; value.avatarColor = arguments["color"]!
            guard value.valid else { throw HybridFailure.invalidRequest }
            let scope = epoch
            operation = Task { [weak self] in
                guard let self = self else { return }
                await self.profile.save(value)
                guard !Task.isCancelled, self.epoch == scope else { return }
                self.operation = nil; self.avatars.refreshOwner(); self.refresh()
            }
        case "account.avatar":
            guard active, login.activeWebSession != nil, let presentAvatar = presentAvatar else { throw HybridFailure.unavailable }
            presentAvatar()
        case "account.panel":
            guard active, let presentPanel = presentPanel, ["settings", "security", "dialer"].contains(arguments["panel"]!) else { throw HybridFailure.unavailable }
            presentPanel(arguments["panel"]!)
        case "account.sip.save", "account.sip.remove":
            guard active, let identifier = arguments["id"],
                  let owner = login.activeAccountID, let origin = login.connectedConfiguration?.origin else { throw HybridFailure.invalidState }
            if name == "account.sip.save" {
                guard let id = identifier.isEmpty ? UUID() : UUID(uuidString: identifier) else { throw HybridFailure.invalidRequest }
                let contact = try HybridSIPContact(id: id, name: arguments["name"] ?? "", destination: arguments["destination"] ?? "")
                try sipDirectory.save(contact, origin: origin, account: owner)
            } else {
                guard let id = UUID(uuidString: identifier) else { throw HybridFailure.invalidRequest }
                try sipDirectory.remove(id, origin: origin, account: owner)
            }
        case "contacts.rename", "contacts.remove", "contacts.block", "contacts.dnd":
            guard active, !login.contactActionBusy, login.canSend, login.contactManager != nil else { throw HybridFailure.invalidState }
            if name == "contacts.dnd" { login.setDoNotDisturb(arguments["enabled"] == "true"); break }
            let jid = arguments["jid"]!
            guard case .ready(let contacts) = login.roster, contacts.contains(where: { $0.jid == jid }), jid != login.currentOwner else { throw HybridFailure.invalidState }
            if name == "contacts.rename" {
                guard NativeContactEditing.valid(jid: jid, name: arguments["name"]!, owner: login.currentOwner ?? "") else { throw HybridFailure.invalidRequest }
                login.renameContact(jid, name: arguments["name"]!)
            } else if name == "contacts.block" { login.setBlocked(jid, blocked: arguments["blocked"] == "true") }
            else { login.removeContact(jid) }
            guard login.contactActionBusy else { throw HybridFailure.invalidState }
        case "contacts.add":
            guard active, !editor.busy, NativeContactEditing.canAdd(arguments["jid"]!, roster: login.roster),
                  NativeContactEditing.valid(jid: arguments["jid"]!, name: arguments["name"]!, owner: login.currentOwner ?? "") else { throw HybridFailure.invalidState }
            editor.detach()
            editor.add(jid: arguments["jid"]!, name: arguments["name"]!, requestPresence: arguments["presence"] == "true", owner: login.currentOwner!, sender: login.contactManager)
        case "contacts.respond":
            guard active, operation == nil, !requests.busy, requests.peers.contains(arguments["jid"]!) else { throw HybridFailure.invalidState }
            let scope = epoch
            operation = Task { [weak self] in
                guard let self = self else { return }
                await self.requests.respond(arguments["jid"]!, allow: arguments["allow"] == "true")
                guard !Task.isCancelled, self.epoch == scope else { return }
                self.operation = nil; self.refresh()
            }
        default: throw HybridFailure.invalidRequest
        }
        refresh()
    }

    private func refresh() {
        var value = HybridAccountState()
        value.providers = [NativeIdentityProvider.google, .facebook].filter(provider.configured).map(\.rawValue)
        value.entryAvailable = true; value.registrationAvailable = configuration.domain == "localhost"
        value.rememberAvailable = true; value.savedLogin = saved.hasSavedLogin
        value.busy = operation != nil || profileTask != nil || saved.isWorking || editor.busy || requests.busy || login?.contactActionBusy == true
        value.nativePanels = presentPanel != nil
        value.presentation = presentation
        value.notice = active ? (noticeChannel == "contacts.add" ? editor.notice : noticeChannel == "contacts.respond" ? requests.notice : noticeChannel.hasPrefix("contacts.") ? login?.contactActionNotice : profile.status ?? saved.notice) : (lifecycle.status ?? saved.notice)
        if let storageNotice = storageNotice { value.notice = storageNotice }
        if active, let login = login {
            value.owner = login.currentOwner
            if let owner = login.activeAccountID, let origin = login.connectedConfiguration?.origin {
                value.sipContactsAvailable = true
                value.sipContacts = sipDirectory.contacts(origin: origin, account: owner)
            }
            value.contactsAvailable = login.canSend && login.contactManager != nil
            value.requests = Array(requests.peers.prefix(32))
            if case .ready(let contacts) = login.roster { value.blocked = contacts.prefix(100).filter { login.isBlocked($0.jid) }.map(\.jid) }
            value.doNotDisturb = login.chat.preferences.doNotDisturb
            if let profile = profile.profile, profile.jid == login.currentOwner, profile.accountId == login.activeAccountID {
                value.profile = HybridProfile(jid: profile.jid, name: profile.displayName, phone: profile.phoneNumber, language: profile.preferredLanguage, color: profile.avatarColor)
            }
            let allowed = Set((login.currentOwner.map { [$0] } ?? []) + { if case .ready(let contacts) = login.roster, contacts.count <= 100 { return contacts.map(\.jid) }; return [] }())
            imageSources = imageSources.filter { allowed.contains($0.key) && avatars.profiles[$0.key] != nil }
            images = images.filter { imageSources[$0.key] != nil }
            for (jid, avatar) in avatars.profiles where allowed.contains(jid) && imageSources[jid] != avatar.avatarDataUrl {
                imageSources[jid] = avatar.avatarDataUrl
                images[jid] = thumbnail(avatar.imageData)
            }
            var bytes = 0
            for jid in images.keys.sorted() {
                if let image = images[jid], bytes + image.utf8.count <= 786432 { value.avatars[jid] = image; bytes += image.utf8.count }
            }
        }
        if value != subject.value { subject.send(value) }
    }

    private func thumbnail(_ data: Data?) -> String? {
        guard let data = data, let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 96, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary),
              let encoded = UIImage(cgImage: image).jpegData(compressionQuality: 0.8), encoded.count <= 24000 else { return nil }
        return "data:image/jpeg;base64," + encoded.base64EncodedString()
    }
}
