import Foundation
import CryptoKit
import Security

enum NativeIdentityProvider: String { case google, facebook }

@MainActor
protocol NativeProviderSigning: AnyObject {
    func signIn(provider: NativeIdentityProvider, clientID: String, nonce: String) async throws -> String
    func cancel()
}

@MainActor
protocol NativeGoogleAccountChoosing: NativeProviderSigning {
    func chooseGoogleAccount(at url: URL, clientID: String, challenge: String) async throws -> String
}

struct NativeGoogleAccountChoice {
    static let callbackScheme = "teletyptel-google"
    let verifier: String

    init() throws {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw NativeAccountFailure.invalidResponse }
        verifier = Self.base64URL(Data(bytes))
    }

    var codeChallenge: String { Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }

    func startURL(configuration: ServerConfiguration, challenge: String) throws -> URL {
        let route = configuration.origin.appendingPathComponent("api/auth/google/start")
        guard var destination = URLComponents(url: route, resolvingAgainstBaseURL: false) else {
            throw NativeAccountFailure.invalidResponse
        }
        destination.queryItems = [
            URLQueryItem(name: "mode", value: "ios_account_choice"),
            URLQueryItem(name: "challenge", value: challenge),
            URLQueryItem(name: "code_challenge", value: codeChallenge)
        ]
        guard let url = destination.url else { throw NativeAccountFailure.invalidResponse }
        return url
    }

    static func code(from callback: URL, challenge: String) throws -> String {
        guard callback.absoluteString.utf8.count <= 16384,
              let reply = URLComponents(url: callback, resolvingAgainstBaseURL: false),
              reply.scheme == callbackScheme, reply.host == "signin", reply.path == "/complete",
              reply.user == nil, reply.password == nil, reply.port == nil, reply.fragment == nil,
              let items = reply.queryItems, items.count == 2,
              items.filter({ $0.name == "state" }).count == 1,
              items.first(where: { $0.name == "state" })?.value == "tt-ios-" + challenge else {
            throw NativeAccountFailure.invalidResponse
        }
        if items.contains(where: { $0.name == "error" && $0.value == "access_denied" }) {
            throw CancellationError()
        }
        guard let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw NativeAccountFailure.rejected
        }
        return code
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

struct NativeSocialAccountClient {
    private let settings: () -> URLSessionConfiguration
    init(settings: @escaping () -> URLSessionConfiguration = { .ephemeral }) { self.settings = settings }

    @MainActor
    func login(configuration: ServerConfiguration, provider: NativeIdentityProvider,
               signer: any NativeProviderSigning) async throws -> NativeAccountLoginStep {
        let session = NativeAccountWebSession(configuration: configuration, settings: settings())
        let route: NativeAccountRoute = provider == .google ? .google : .facebook
        do {
            let chooser = provider == .google ? signer as? any NativeGoogleAccountChoosing : nil
            let choice = chooser == nil ? nil : try NativeGoogleAccountChoice()
            var start = ["action": "begin"]
            if let choice { start["browserChallenge"] = choice.codeChallenge }
            let data = try await session.request(route, body: JSONSerialization.data(withJSONObject: start))
            let begin = try JSONDecoder().decode(BeginReply.self, from: data)
            guard await session.hasSessionCookie else { throw NativeAccountFailure.invalidResponse }
            guard begin.ok, begin.challenge.range(of: #"\A[a-f0-9]{64}\z"#, options: .regularExpression) != nil,
                  let clientID = provider == .google ? begin.serverClientId : begin.appId,
                  !clientID.isEmpty, clientID.utf8.count <= 256 else { throw NativeAccountFailure.invalidResponse }
            var completion = ["action": "complete", "challenge": begin.challenge]
            let proof: String
            if begin.browserAccountChoice == true, let chooser, let choice {
                let url = try choice.startURL(configuration: configuration, challenge: begin.challenge)
                proof = try await chooser.chooseGoogleAccount(at: url, clientID: clientID, challenge: begin.challenge)
                completion["action"] = "complete_browser"
                completion["browserVerifier"] = choice.verifier
            } else {
                proof = try await signer.signIn(provider: provider, clientID: clientID, nonce: begin.challenge)
            }
            try Task.checkCancellation()
            guard !proof.isEmpty, proof.utf8.count <= (provider == .google ? 4096 : 16384),
                  !proof.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }) else {
                throw NativeAccountFailure.invalidResponse
            }
            completion[provider == .google ? "code" : "token"] = proof
            let body = try JSONSerialization.data(withJSONObject: completion)
            let completed = try await session.request(route, body: body)
            let reply = try JSONDecoder().decode(CompleteReply.self, from: completed)
            guard reply.ok, !reply.accountId.isEmpty, reply.accountId.utf8.count <= 96 else {
                throw NativeAccountFailure.invalidResponse
            }
            if reply.twoFactorRequired == true {
                guard reply.method == "authenticator" else { throw NativeAccountFailure.twoFactorRequired }
                return .challenge(NativeSocialSecondFactorSession(session: session, accountID: reply.accountId))
            }
            let accountData = try await session.request(.account, accountID: reply.accountId)
            return .authenticated(try Self.account(accountData, session: session, accountID: reply.accountId))
        } catch {
            await session.close()
            throw error
        }
    }

    static func account(_ data: Data, session: NativeAccountWebSession, accountID: String) throws -> NativeAuthenticatedAccount {
        var account = try NativeAuthenticatedAccount.decode(data, status: 200, configuration: session.configuration)
        guard account.accountID == accountID else { throw NativeAccountFailure.invalidResponse }
        account.webSession = session
        return account
    }

    private struct BeginReply: Decodable {
        let ok: Bool; let challenge: String; let serverClientId: String?; let appId: String?; let browserAccountChoice: Bool?
    }
    private struct CompleteReply: Decodable {
        let ok: Bool; let accountId: String; let twoFactorRequired: Bool?; let method: String?
    }
}

private final class NativeSocialSecondFactorSession: NativeSecondFactorSession {
    private let session: NativeAccountWebSession
    private let accountID: String
    private let lock = NSLock()
    private var cancelled = false
    private var attempts = 0
    private let deadline = ContinuousClock.now.advanced(by: .seconds(300))

    init(session: NativeAccountWebSession, accountID: String) { self.session = session; self.accountID = accountID }

    private func reserve() throws {
        lock.lock()
        defer { lock.unlock() }
        guard !cancelled, attempts < 5, ContinuousClock.now < deadline else { throw NativeSecondFactorFailure.expired }
        attempts += 1
    }

    func verify(code: String) async throws -> NativeAuthenticatedAccount {
        guard code.range(of: #"\A[0-9]{6}\z"#, options: .regularExpression) != nil else { throw NativeSecondFactorFailure.invalidCode }
        try reserve()
        do {
            let data = try await session.request(.account, body: JSONSerialization.data(withJSONObject:
                ["action": "verify_login_two_factor", "accountId": accountID, "code": code]))
            try Task.checkCancellation()
            guard ContinuousClock.now < deadline else { throw NativeSecondFactorFailure.expired }
            return try NativeSocialAccountClient.account(data, session: session, accountID: accountID)
        } catch let error as NativeWebServiceFailure where error.code == "invalid_verification_code" {
            throw NativeSecondFactorFailure.invalidCode
        } catch {
            cancel()
            throw error
        }
    }

    func cancel() {
        lock.lock()
        cancelled = true
        lock.unlock()
        Task { await session.close() }
    }
}
