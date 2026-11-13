import Foundation

public enum NativeAccountFailure: Error, Equatable {
    case invalidCredentials
    case twoFactorRequired
    case rejected
    case invalidResponse
}

public struct NativeAuthenticatedAccount: CustomStringConvertible, CustomDebugStringConvertible {
    let configuration: ServerConfiguration
    let jid: String
    let password: String
    var accountID: String? = nil
    var webSession: NativeAccountWebSession? = nil

    public var description: String { "NativeAuthenticatedAccount(redacted)" }
    public var debugDescription: String { description }

    static func decode(_ data: Data, status: Int, configuration: ServerConfiguration) throws -> Self {
        guard data.count <= 1048576 else { throw NativeAccountFailure.invalidResponse }
        guard let reply = try? JSONDecoder().decode(Reply.self, from: data) else {
            throw NativeAccountFailure.invalidResponse
        }
        guard status == 200, reply.ok else {
            if reply.error == "invalid_credentials" { throw NativeAccountFailure.invalidCredentials }
            throw NativeAccountFailure.rejected
        }
        guard reply.twoFactorRequired != true else { throw NativeAccountFailure.twoFactorRequired }
        guard let account = reply.account,
              Self.validJID(account.jid, domain: configuration.domain),
              !account.password.isEmpty, account.password.utf8.count <= 1024,
              !account.password.unicodeScalars.contains(where: { $0.value == 0 }) else {
            throw NativeAccountFailure.invalidResponse
        }
        var value = Self(configuration: configuration, jid: account.jid, password: account.password)
        value.accountID = account.accountId
        return value
    }

    static func validJID(_ jid: String, domain: String) -> Bool {
        let parts = jid.split(separator: "@", omittingEmptySubsequences: false)
        return parts.count == 2 && parts[1] == domain && !parts[0].isEmpty && jid.utf8.count <= 1023 &&
            !jid.contains("/") && !jid.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0) })
    }

    private struct Reply: Decodable {
        let ok: Bool
        let twoFactorRequired: Bool?
        let error: String?
        let account: Account?
    }

    private struct Account: Decodable {
        let accountId: String?
        let jid: String
        let password: String
    }
}

public protocol NativeAccountAuthenticating {
    func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount
}

public struct NativeAccountClient: NativeAccountAuthenticating {
    public init() {}

    public func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        guard NativeAuthenticatedAccount.validJID(jid, domain: configuration.domain),
              !password.isEmpty, password.utf8.count <= 1024,
              !password.unicodeScalars.contains(where: { $0.value == 0 }) else {
            throw NativeAccountFailure.invalidCredentials
        }
        try Task.checkCancellation()
        let delegate = AccountRedirectGuard()
        let settings = URLSessionConfiguration.ephemeral
        settings.httpCookieStorage = nil
        settings.httpShouldSetCookies = false
        settings.urlCredentialStorage = nil
        settings.urlCache = nil
        settings.timeoutIntervalForRequest = 10
        settings.timeoutIntervalForResource = 15
        let session = URLSession(configuration: settings, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: configuration.origin.appendingPathComponent("api/account.php"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(configuration.origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "action": "login", "jid": jid, "password": password,
            "rememberPassword": false, "xmppDomain": configuration.domain,
            "xmppWebSocket": configuration.webSocket.absoluteString, "xmppTlsMode": "websocket"
        ])
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse else { throw NativeAccountFailure.invalidResponse }
        guard !(300...399).contains(response.statusCode) else { throw ConnectionFailure.redirectRejected }
        guard response.expectedContentLength <= 1048576 else { throw NativeAccountFailure.invalidResponse }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 1048576 else { throw NativeAccountFailure.invalidResponse }
            data.append(byte)
        }
        try Task.checkCancellation()
        return try NativeAuthenticatedAccount.decode(data, status: response.statusCode, configuration: configuration)
    }
}

private final class AccountRedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
