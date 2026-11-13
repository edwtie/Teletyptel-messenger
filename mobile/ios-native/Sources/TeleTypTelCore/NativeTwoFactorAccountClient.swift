import Foundation

enum NativeSecondFactorFailure: Error { case invalidCode, expired }

protocol NativeSecondFactorSession: AnyObject {
    func verify(code: String) async throws -> NativeAuthenticatedAccount
    func cancel()
}

enum NativeAccountLoginStep {
    case authenticated(NativeAuthenticatedAccount)
    case challenge(any NativeSecondFactorSession)
}

protocol NativeAccountChallenging: NativeAccountAuthenticating {
    func begin(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAccountLoginStep
}

public struct NativeTwoFactorAccountClient: NativeAccountChallenging {
    private let settings: () -> URLSessionConfiguration

    public init() { settings = { .ephemeral } }
    init(settings: @escaping () -> URLSessionConfiguration) { self.settings = settings }

    public func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        switch try await begin(configuration: configuration, jid: jid, password: password) {
        case .authenticated(let account): return account
        case .challenge(let challenge):
            challenge.cancel()
            throw NativeAccountFailure.twoFactorRequired
        }
    }

    func begin(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAccountLoginStep {
        guard NativeAuthenticatedAccount.validJID(jid, domain: configuration.domain),
              !password.isEmpty, password.utf8.count <= 1024,
              !password.unicodeScalars.contains(where: { $0.value == 0 }) else {
            throw NativeAccountFailure.invalidCredentials
        }
        try Task.checkCancellation()
        let settings = settings()
        settings.httpCookieStorage = nil
        settings.httpShouldSetCookies = false
        settings.urlCache = nil
        settings.urlCredentialStorage = nil
        settings.timeoutIntervalForRequest = 10
        settings.timeoutIntervalForResource = 15
        let session = URLSession(configuration: settings, delegate: NativeSecondFactorRedirectGuard(), delegateQueue: nil)
        do {
            let (data, status, response) = try await Self.request(session, configuration: configuration, input: [
                "action": "login", "jid": jid, "password": password, "rememberPassword": false,
                "xmppDomain": configuration.domain, "xmppWebSocket": configuration.webSocket.absoluteString,
                "xmppTlsMode": "websocket"
            ])
            guard let reply = try? JSONDecoder().decode(ChallengeReply.self, from: data) else {
                throw NativeAccountFailure.invalidResponse
            }
            if status == 200, reply.ok, reply.twoFactorRequired == true {
                guard reply.method == "authenticator" else { throw NativeAccountFailure.twoFactorRequired }
                guard let accountID = reply.accountId, !accountID.isEmpty, accountID.utf8.count <= 96,
                      !accountID.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
                      let cookie = Self.sessionCookie(response, origin: configuration.origin) else {
                    throw NativeAccountFailure.invalidResponse
                }
                try Task.checkCancellation()
                return .challenge(NativeHTTPSecondFactorSession(session: session, configuration: configuration,
                                                                jid: jid, accountID: accountID, cookie: cookie))
            }
            let account = try NativeAuthenticatedAccount.decode(data, status: status, configuration: configuration)
            guard account.jid == jid else { throw NativeAccountFailure.invalidResponse }
            session.invalidateAndCancel()
            return .authenticated(account)
        } catch {
            session.invalidateAndCancel()
            throw error
        }
    }

    static func request(_ session: URLSession, configuration: ServerConfiguration,
                        input: [String: Any], cookie: String? = nil) async throws -> (Data, Int, HTTPURLResponse) {
        try Task.checkCancellation()
        var request = URLRequest(url: configuration.origin.appendingPathComponent("api/account.php"))
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        if let cookie = cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        request.mainDocumentURL = configuration.origin
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(configuration.origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
                         forHTTPHeaderField: "Origin")
        request.httpBody = try JSONSerialization.data(withJSONObject: input)
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse,
              response.url == request.url, response.expectedContentLength <= 1048576 else {
            throw NativeAccountFailure.invalidResponse
        }
        guard !(300...399).contains(response.statusCode) else { throw ConnectionFailure.redirectRejected }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 1048576 else { throw NativeAccountFailure.invalidResponse }
            data.append(byte)
        }
        try Task.checkCancellation()
        return (data, response.statusCode, response)
    }

    private static func sessionCookie(_ response: HTTPURLResponse, origin: URL) -> String? {
        guard let field = response.value(forHTTPHeaderField: "Set-Cookie"), field.utf8.count <= 4096 else { return nil }
        let matches = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": field], for: origin).filter {
            $0.name == "PHPSESSID" && $0.isSecure &&
            $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased() == origin.host?.lowercased() &&
            ($0.path == "/" || $0.path == "/api" || $0.path == "/api/") &&
            ($0.expiresDate == nil || $0.expiresDate! > Date()) &&
            $0.value.range(of: #"\A[A-Za-z0-9,-]{1,256}\z"#, options: .regularExpression) != nil
        }
        guard matches.count == 1, let cookie = matches.first else { return nil }
        return cookie.name + "=" + cookie.value
    }

    private struct ChallengeReply: Decodable {
        let ok: Bool
        let twoFactorRequired: Bool?
        let accountId: String?
        let method: String?
    }
}

private final class NativeHTTPSecondFactorSession: NativeSecondFactorSession,
    CustomStringConvertible, CustomDebugStringConvertible {
    private let session: URLSession
    private let configuration: ServerConfiguration
    private let jid: String
    private let accountID: String
    private let cookie: String
    private let deadline = ContinuousClock.now.advanced(by: .seconds(300))
    private let lock = NSLock()
    private var closed = false
    private var inFlight = false
    private var attempts = 0

    init(session: URLSession, configuration: ServerConfiguration, jid: String, accountID: String, cookie: String) {
        self.session = session
        self.configuration = configuration
        self.jid = jid
        self.accountID = accountID
        self.cookie = cookie
    }

    deinit { session.invalidateAndCancel() }
    var description: String { "NativeHTTPSecondFactorSession(redacted)" }
    var debugDescription: String { description }

    private func reserve() throws {
        lock.lock()
        defer { lock.unlock() }
        guard !closed, !inFlight, attempts < 5, ContinuousClock.now < deadline else {
            throw NativeSecondFactorFailure.expired
        }
        inFlight = true
        attempts += 1
    }

    private func retryAllowed() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        inFlight = false
        return !closed && attempts < 5 && ContinuousClock.now < deadline
    }

    func verify(code: String) async throws -> NativeAuthenticatedAccount {
        guard code.range(of: #"\A[0-9]{6}\z"#, options: .regularExpression) != nil else {
            throw NativeSecondFactorFailure.invalidCode
        }
        try reserve()
        do {
            let (data, status, _) = try await NativeTwoFactorAccountClient.request(session, configuration: configuration,
                input: ["action": "verify_login_two_factor", "accountId": accountID, "code": code], cookie: cookie)
            guard let reply = try? JSONDecoder().decode(VerificationReply.self, from: data) else {
                throw NativeAccountFailure.invalidResponse
            }
            if status == 400, !reply.ok, reply.error == "invalid_verification_code" {
                if retryAllowed() { throw NativeSecondFactorFailure.invalidCode }
                throw NativeSecondFactorFailure.expired
            }
            guard ContinuousClock.now < deadline else { throw NativeSecondFactorFailure.expired }
            let account = try NativeAuthenticatedAccount.decode(data, status: status, configuration: configuration)
            guard account.jid == jid else { throw NativeAccountFailure.invalidResponse }
            cancel()
            return account
        } catch NativeSecondFactorFailure.invalidCode {
            throw NativeSecondFactorFailure.invalidCode
        } catch {
            cancel()
            throw error
        }
    }

    func cancel() {
        lock.lock()
        closed = true
        lock.unlock()
        session.invalidateAndCancel()
    }

    private struct VerificationReply: Decodable { let ok: Bool; let error: String? }
}

private final class NativeSecondFactorRedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
