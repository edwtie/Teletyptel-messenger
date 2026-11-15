import SwiftUI
import UserNotifications
import UIKit

@MainActor
final class NativeMessageNotifications: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = NativeMessageNotifications()
    @Published private(set) var enabled = UserDefaults.standard.bool(forKey: "teletyptel.native.messageNotificationConsent")
    @Published private(set) var status: String?
    private var lastNotification = Date.distantPast
    private var generation = UUID()
    private var permissionGeneration = UUID()
    private weak var login: NativeLoginModel?
    private let center = UNUserNotificationCenter.current()

    func connect(_ login: NativeLoginModel) {
        self.login = login
        center.delegate = self
        login.onIncomingMessage = { [weak self, weak login] message in
            guard let self = self, let login = login, self.enabled, login.isConnected,
                  !login.chat.preferences.doNotDisturb, !login.isBlocked(message.peer),
                  !login.chat.preferences.mutedPeers.contains(message.peer),
                  !(UIApplication.shared.applicationState == .active && login.visibleConversation == message.peer),
                  Date().timeIntervalSince(self.lastNotification) >= 2 else { return }
            self.lastNotification = Date()
            let content = UNMutableNotificationContent()
            let language = UserDefaults.standard.string(forKey: "teletyptel.native.interfaceLanguage") ?? "system"
            let english = language == "en" || (language == "system" && Locale.preferredLanguages.first?.hasPrefix("nl") != true)
            content.title = english ? "New TeleTypTel message" : "Nieuw TeleTypTel-bericht"
            content.body = english ? "Open TeleTypTel to read your message." : "Open TeleTypTel om je bericht te lezen."
            let identifier = "teletyptel-message-" + message.id.uuidString
            let attempt = self.generation
            self.center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil)) { [weak self] error in
                Task { @MainActor in
                    guard let self = self else { return }
                    if self.generation != attempt || !self.enabled { self.center.removeDeliveredNotifications(withIdentifiers: [identifier]); return }
                    if error != nil { self.status = "Berichtmelding niet getoond. Controleer je iOS-meldingsinstellingen." }
                }
            }
        }
    }

    func enable() async {
        permissionGeneration = UUID()
        let attempt = permissionGeneration
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge])
            guard permissionGeneration == attempt, !Task.isCancelled else { return }
            enabled = granted
            UserDefaults.standard.set(granted, forKey: "teletyptel.native.messageNotificationConsent")
            status = granted ? "Berichtmeldingen ingeschakeld zolang de app berichten kan ontvangen." : "Meldingen geweigerd. Pas dit zo nodig aan in iOS-instellingen."
        } catch { if permissionGeneration == attempt { status = "Meldingen niet ingeschakeld." } }
    }

    func disable() {
        permissionGeneration = UUID()
        enabled = false
        UserDefaults.standard.set(false, forKey: "teletyptel.native.messageNotificationConsent")
        clear()
    }

    func clear() {
        generation = UUID()
        lastNotification = .distantPast
        center.getDeliveredNotifications { [center] notifications in
            center.removeDeliveredNotifications(withIdentifiers: notifications.map(\.request.identifier).filter { $0.hasPrefix("teletyptel-message-") })
        }
        center.getPendingNotificationRequests { [center] requests in
            center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix("teletyptel-message-") })
        }
        center.setBadgeCount(0)
    }

    func updateBadge() {
        guard enabled, let login = login, login.isConnected else { return }
        let total = Set(login.chat.messages.map(\.peer)).reduce(0) { $0 + login.chat.unreadCount(peer: $1) } + login.groups.rooms.reduce(0) { $0 + $1.unreadCount }
        center.setBadgeCount(min(total, 999))
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                           withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        Task { @MainActor in completionHandler(self.enabled ? [.banner, .list] : []) }
    }
}
