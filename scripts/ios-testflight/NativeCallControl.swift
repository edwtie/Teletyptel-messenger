import Foundation
import Security

struct MessengerCallControlCredential: Codable {
    let account: String
    let device: String
    let token: String
    let expiresAt: TimeInterval
    var ended: [[String: String]]
}

enum MessengerCallControlVault {
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.tiedragon.teletyptel.call-control.v1",
         kSecAttrAccount as String: Bundle.main.object(forInfoDictionaryKey: "TeleTypTelServerOrigin") as? String ?? "",
         kSecAttrSynchronizable as String: false]
    }

    static func read(account: String, device: String) -> MessengerCallControlCredential? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data, data.count <= 32768,
              let stored = try? JSONDecoder().decode(MessengerCallControlCredential.self, from: data),
              stored.account == account, stored.device == device, stored.ended.count <= 32 else { return nil }
        return stored
    }

    static func write(_ credential: MessengerCallControlCredential) -> Bool {
        guard credential.ended.count <= 32, let data = try? JSONEncoder().encode(credential), data.count <= 32768 else { return false }
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        return SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess
    }

    static func clear() { SecItemDelete(query as CFDictionary) }
}

final class MessengerCallControlRequest: NSObject, URLSessionDataDelegate {
    private var session: URLSession?
    private var data = Data()
    private var expected: [[String: Any]] = []
    private var completion: ((Result<[[String: String]], Error>) -> Void)?

    func start(token: String, calls: [[String: Any]], completion: @escaping (Result<[[String: String]], Error>) -> Void) {
        self.completion = completion
        expected = calls
        guard !calls.isEmpty, calls.count <= 64,
              let address = Bundle.main.object(forInfoDictionaryKey: "TeleTypTelServerOrigin") as? String,
              let origin = URL(string: address), origin.scheme == "https", origin.host != nil,
              origin.user == nil, origin.password == nil, origin.query == nil, origin.fragment == nil,
              origin.path.isEmpty || origin.path == "/",
              token.range(of: "^[0-9a-f]{2,960}\\.[0-9a-f]{64}$", options: .regularExpression) != nil,
              let endpoint = URL(string: "/api/call-control.php", relativeTo: origin)?.absoluteURL,
              let body = try? JSONSerialization.data(withJSONObject: ["calls": calls]), body.count <= 16384 else {
            finish(.failure(URLError(.badURL)))
            return
        }
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 10
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.httpBody = body
        let created = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        session = created
        created.dataTask(with: request).resume()
    }

    func cancel() { finish(.failure(URLError(.cancelled))) }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              http.mimeType == "application/json", response.expectedContentLength <= 16384 else {
            completionHandler(.cancel)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            finish(.failure(URLError([401, 403].contains(status) ? .userAuthenticationRequired : .badServerResponse)))
            return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
        guard data.count + chunk.count <= 16384 else {
            finish(.failure(URLError(.dataLengthExceedsMaximum)))
            return
        }
        data.append(chunk)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error { finish(.failure(error)); return }
        guard let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any], body["ok"] as? Bool == true,
              let results = body["calls"] as? [[String: String]], results.count == expected.count else {
            finish(.failure(URLError(.cannotParseResponse))); return
        }
        var seen = Set<String>()
        for result in results {
            guard let id = result["callId"], let sid = result["sid"], let state = result["state"],
                  seen.insert(id).inserted,
                  ["ringing", "accepted", "ended", "expired", "unavailable", "answered-elsewhere"].contains(state),
                  expected.contains(where: { $0["callId"] as? String == id && $0["sid"] as? String == sid }) else {
                finish(.failure(URLError(.cannotParseResponse))); return
            }
        }
        finish(.success(results))
    }

    private func finish(_ result: Result<[[String: String]], Error>) {
        guard let callback = completion else { return }
        completion = nil
        session?.invalidateAndCancel()
        session = nil
        data.removeAll()
        callback(result)
    }
}
