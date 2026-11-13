import Foundation

enum NativeAccountRoute: String {
    case account = "api/account.php"
    case google = "api/auth/google/native.php"
    case facebook = "api/auth/facebook/native.php"
    case translation = "api/translation.php"
}

actor NativeAccountWebSession: CustomStringConvertible, CustomDebugStringConvertible {
    nonisolated let configuration: ServerConfiguration
    private let session: URLSession
    private var cookie: String?
    private var closed = false
    private var generation = UUID()

    init(configuration: ServerConfiguration, cookie: String? = nil,
         settings: URLSessionConfiguration = .ephemeral) {
        self.configuration = configuration
        self.cookie = cookie
        settings.httpCookieStorage = nil
        settings.httpShouldSetCookies = false
        settings.urlCredentialStorage = nil
        settings.urlCache = nil
        settings.timeoutIntervalForRequest = 10
        settings.timeoutIntervalForResource = 20
        session = URLSession(configuration: settings, delegate: NativeWebSessionRedirectGuard(), delegateQueue: nil)
    }

    deinit { session.invalidateAndCancel() }
    nonisolated var description: String { "NativeAccountWebSession(redacted)" }
    nonisolated var debugDescription: String { description }
    var hasSessionCookie: Bool { !closed && cookie != nil }

    func request(_ route: NativeAccountRoute, body: Data? = nil, csrf: String? = nil,
                 accountID: String? = nil) async throws -> Data {
        try Task.checkCancellation()
        guard !closed, (body?.count ?? 0) <= 32768 else { throw NativeAccountFailure.rejected }
        let attempt = generation
        var components = URLComponents(url: configuration.origin.appendingPathComponent(route.rawValue), resolvingAgainstBaseURL: false)!
        if let accountID = accountID {
            guard route == .account, !accountID.isEmpty, accountID.utf8.count <= 96 else { throw NativeAccountFailure.invalidResponse }
            components.queryItems = [URLQueryItem(name: "accountId", value: accountID)]
        }
        guard let url = components.url else { throw NativeAccountFailure.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpShouldHandleCookies = false
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if route == .google || route == .facebook {
            request.setValue(route == .google ? "google" : "facebook", forHTTPHeaderField: "X-TeleTypTel-Native")
        }
        request.setValue(configuration.origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        if let cookie = cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if let csrf = csrf {
            guard csrf.range(of: #"\A[0-9a-f]{64}\z"#, options: .regularExpression) != nil else {
                throw NativeAccountFailure.invalidResponse
            }
            request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token")
        }
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse, response.url == url,
              response.expectedContentLength <= 1048576 else { throw NativeAccountFailure.invalidResponse }
        guard !(300...399).contains(response.statusCode) else { throw ConnectionFailure.redirectRejected }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 1048576 else { throw NativeAccountFailure.invalidResponse }
            data.append(byte)
        }
        try Task.checkCancellation()
        guard !closed, generation == attempt else { throw CancellationError() }
        if response.value(forHTTPHeaderField: "Set-Cookie") != nil {
            guard let updated = Self.sessionCookie(response, origin: configuration.origin) else {
                throw NativeAccountFailure.invalidResponse
            }
            cookie = updated
        }
        guard (200...299).contains(response.statusCode) else {
            let error = (try? JSONDecoder().decode(ErrorReply.self, from: data))?.error ?? "request_failed"
            throw NativeWebServiceFailure(status: response.statusCode, code: error)
        }
        return data
    }

    func close() {
        closed = true
        generation = UUID()
        cookie = nil
        session.invalidateAndCancel()
    }

    nonisolated static func sessionCookie(_ response: HTTPURLResponse, origin: URL) -> String? {
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

    private struct ErrorReply: Decodable { let error: String? }
}

struct NativeWebServiceFailure: Error {
    let status: Int
    let code: String
}

private final class NativeWebSessionRedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
