import SwiftUI
import GoogleSignIn
import FacebookCore
import FacebookLogin

enum NativeProviderFailure: Error { case configuration, unavailable, denied }

final class NativeProviderAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if Bundle.main.object(forInfoDictionaryKey: "TeleTypTelFacebookEnabled") as? Bool == true {
            Settings.shared.isAutoLogAppEventsEnabled = false
            Settings.shared.isAdvertiserIDCollectionEnabled = false
            Settings.shared.isSKAdNetworkReportEnabled = false
            Settings.shared.loggingBehaviors = []
            AppEvents.shared.flushBehavior = .explicitOnly
            _ = ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)
        }
        return true
    }
}

@MainActor
final class NativeProviderSDK: ObservableObject, NativeProviderSigning {
    weak var anchor: UIViewController?
    private lazy var facebook = LoginManager()
    private var activeProvider: NativeIdentityProvider?
    private var pending: CheckedContinuation<String, Error>?
    private var operation = UUID()

    func configured(_ provider: NativeIdentityProvider) -> Bool {
        let bundle = Bundle.main
        guard let identity = bundle.bundleIdentifier,
              bundle.object(forInfoDictionaryKey: "TeleTypTelProviderBundleID") as? String == identity else { return false }
        if provider == .google {
            return bundle.object(forInfoDictionaryKey: "GIDClientID") as? String != nil &&
                bundle.object(forInfoDictionaryKey: "GIDServerClientID") as? String != nil
        }
        return bundle.object(forInfoDictionaryKey: "TeleTypTelFacebookEnabled") as? Bool == true
    }

    func signIn(provider: NativeIdentityProvider, clientID: String, nonce: String) async throws -> String {
        guard configured(provider), pending == nil,
              var presenter = anchor?.view.window?.rootViewController else { throw NativeProviderFailure.configuration }
        while let presented = presenter.presentedViewController { presenter = presented }
        let attempt = UUID()
        operation = attempt
        activeProvider = provider
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                if provider == .google {
                    guard let client = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                          Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String == clientID else {
                        finish(.failure(NativeProviderFailure.configuration), attempt: attempt)
                        return
                    }
                    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: client, serverClientID: clientID)
                    GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { [weak self] result, error in
                        Task { @MainActor in
                            guard let code = result?.serverAuthCode, !code.isEmpty, error == nil else {
                                self?.finish(.failure(NativeProviderFailure.denied), attempt: attempt)
                                return
                            }
                            self?.finish(.success(code), attempt: attempt)
                        }
                    }
                } else {
                    guard Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String == clientID,
                          let configuration = LoginConfiguration(permissions: ["public_profile", "email"], tracking: .limited, nonce: nonce) else {
                        finish(.failure(NativeProviderFailure.configuration), attempt: attempt)
                        return
                    }
                    facebook.logIn(viewController: presenter, configuration: configuration) { [weak self] result in
                        Task { @MainActor in
                            switch result {
                            case .success:
                                guard let token = AuthenticationToken.current, token.nonce == nonce else {
                                    self?.finish(.failure(NativeProviderFailure.denied), attempt: attempt)
                                    return
                                }
                                self?.finish(.success(token.tokenString), attempt: attempt)
                            case .cancelled: self?.finish(.failure(CancellationError()), attempt: attempt)
                            case .failed: self?.finish(.failure(NativeProviderFailure.denied), attempt: attempt)
                            }
                        }
                    }
                }
            }
        }, onCancel: { Task { @MainActor [weak self] in self?.cancel() } })
    }

    private func finish(_ result: Result<String, Error>, attempt: UUID) {
        guard operation == attempt, let continuation = pending else { return }
        pending = nil
        clearProvider()
        continuation.resume(with: result)
    }

    func cancel() {
        operation = UUID()
        let continuation = pending
        pending = nil
        clearProvider()
        continuation?.resume(throwing: CancellationError())
    }

    private func clearProvider() {
        if activeProvider == .google { GIDSignIn.sharedInstance.signOut() }
        if activeProvider == .facebook { facebook.logOut() }
        activeProvider = nil
    }

    func handle(_ url: URL) {
        if let client = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
           url.scheme == client.split(separator: ".").reversed().joined(separator: ".") {
            _ = GIDSignIn.sharedInstance.handle(url)
        } else if let appID = Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String,
                  url.scheme == "fb" + appID, configured(.facebook) {
            _ = ApplicationDelegate.shared.application(UIApplication.shared, open: url, options: [:])
        }
    }
}

struct NativeProviderPresenter: UIViewControllerRepresentable {
    let sdk: NativeProviderSDK
    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()
        sdk.anchor = controller
        return controller
    }
    func updateUIViewController(_ controller: UIViewController, context: Context) { sdk.anchor = controller }
}
