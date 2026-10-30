private func isBundledMessenger(_ url: URL?) -> Bool {
    guard let url = url else { return false }
    return url.scheme == "capacitor" && url.host == "localhost" && url.port == nil && url.path == "/chat.html"
}

final class MessengerScriptHandler: NSObject, WKScriptMessageHandler {
    private let delegate: WKScriptMessageHandler

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, isBundledMessenger(message.frameInfo.request.url) else { return }
        delegate.userContentController(userContentController, didReceive: message)
    }
}

private final class MessengerServerConnection: NSObject, URLSessionTaskDelegate {
    static let shared = MessengerServerConnection()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 120
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    func makeRequest(path: String, method: String = "GET", headers: [String: String] = [:],
                     body: Data? = nil, omitCookies: Bool = false, fileOnly: Bool = false) throws -> URLRequest {
        guard let address = Bundle.main.object(forInfoDictionaryKey: "TeleTypTelServerOrigin") as? String,
              let origin = URL(string: address), origin.scheme == "https", origin.user == nil, origin.password == nil,
              path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              url.scheme == origin.scheme, url.host == origin.host, url.port == origin.port,
              url.user == nil, url.password == nil, url.fragment == nil,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            throw URLError(.unsupportedURL)
        }
        let route = components.percentEncodedPath
        let allowed = #"^/api/([a-z-]+\.php|auth/(public-config\.php|google/native\.php))$|^/config/(account-profile\.json|google-maps\.json|providers/[a-zA-Z0-9_-]+\.json)$"#
        guard route.range(of: allowed, options: .regularExpression) != nil,
              !fileOnly || route == "/api/file.php",
              ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].contains(method),
              !route.hasPrefix("/config/") || method == "GET" else {
            throw URLError(.unsupportedURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = !omitCookies
        let allowedHeaders = ["accept", "content-type", "x-csrf-token", "x-teletyptel-native", "range"]
        for (name, value) in headers where allowedHeaders.contains(name.lowercased()) {
            guard !value.contains("\r"), !value.contains("\n") else { throw URLError(.badURL) }
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.setValue(address, forHTTPHeaderField: "Origin")
        request.setValue(address + "/chat.html", forHTTPHeaderField: "Referer")
        return request
    }

    func load(_ request: URLRequest, completion: @escaping (Data?, HTTPURLResponse?, Error?) -> Void) -> URLSessionDataTask {
        return session.dataTask(with: request) { data, response, error in
            guard let response = response as? HTTPURLResponse else {
                completion(nil, nil, error ?? URLError(.badServerResponse))
                return
            }
            guard !(300..<400).contains(response.statusCode) else {
                completion(nil, nil, URLError(.redirectToNonExistentLocation))
                return
            }
            completion(data, response, error)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func responseHeaders(_ response: HTTPURLResponse) -> [String: String] {
        var headers: [String: String] = [:]
        for (name, value) in response.allHeaderFields {
            let key = String(describing: name).lowercased()
            if ["content-type", "content-range", "accept-ranges", "content-disposition"].contains(key) {
                headers[key] = String(describing: value)
            }
        }
        headers["cache-control"] = "no-store"
        return headers
    }
}

@objc(TeleTypTelServerPlugin)
final class TeleTypTelServerPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelServerPlugin"
    let jsName = "TeleTypTelServer"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]
    private var tasks: [String: URLSessionDataTask] = [:]
    private var sharing = false

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard isBundledMessenger(self.bridge?.webView?.url), let identifier = call.getString("id"),
                  UUID(uuidString: identifier) != nil, self.tasks[identifier] == nil,
                  let path = call.getString("path"), let method = call.getString("method"),
                  let body = Data(base64Encoded: call.getString("body") ?? ""), body.count <= 8 * 1024 * 1024 else {
                call.reject("Invalid native server request.", "INVALID_REQUEST")
                return
            }
            do {
                let request = try MessengerServerConnection.shared.makeRequest(path: path, method: method,
                    headers: call.getObject("headers") as? [String: String] ?? [:],
                    body: body.isEmpty ? nil : body, omitCookies: call.getBool("omitCookies") ?? false)
                let task = MessengerServerConnection.shared.load(request) { data, response, error in
                    DispatchQueue.main.async {
                        self.tasks.removeValue(forKey: identifier)
                        guard error == nil, let response = response, let data = data,
                              isBundledMessenger(self.bridge?.webView?.url) else {
                            call.reject("Cannot reach the secure TeleTypTel server. Check Wi-Fi and certificate trust.", "SERVER_UNAVAILABLE")
                            return
                        }
                        call.resolve(["status": response.statusCode,
                            "headers": MessengerServerConnection.shared.responseHeaders(response),
                            "body": data.base64EncodedString()])
                    }
                }
                self.tasks[identifier] = task
                task.resume()
            } catch { call.reject("This server route is not available in the app.", "INVALID_REQUEST") }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard isBundledMessenger(self.bridge?.webView?.url) else { call.reject("Untrusted page."); return }
            if let identifier = call.getString("id") { self.tasks.removeValue(forKey: identifier)?.cancel() }
            call.resolve()
        }
    }

    @objc func shareFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard isBundledMessenger(self.bridge?.webView?.url), !self.sharing,
                  let path = call.getString("path"), let presenter = self.bridge?.viewController else {
                call.reject("File sharing is unavailable."); return
            }
            do {
                let request = try MessengerServerConnection.shared.makeRequest(path: path, fileOnly: true)
                self.sharing = true
                let task = MessengerServerConnection.shared.load(request) { data, response, error in
                    DispatchQueue.main.async {
                        guard error == nil, let response = response, response.statusCode == 200, let data = data,
                              isBundledMessenger(self.bridge?.webView?.url) else {
                            self.sharing = false
                            call.reject("The file could not be downloaded."); return
                        }
                        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                        do {
                            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                            let requestedName = (call.getString("name") ?? "download") as NSString
                            let name = requestedName.lastPathComponent
                            let safeName = name.isEmpty || name == "." || name == ".." ? "download" : name
                            let file = folder.appendingPathComponent(safeName)
                            try data.write(to: file, options: [.atomic, .completeFileProtection])
                            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                            sheet.popoverPresentationController?.sourceView = presenter.view
                            sheet.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                            sheet.completionWithItemsHandler = { _, completed, _, _ in
                                try? FileManager.default.removeItem(at: folder)
                                self.sharing = false
                                call.resolve(["shared": completed])
                            }
                            presenter.present(sheet, animated: true)
                        } catch {
                            try? FileManager.default.removeItem(at: folder)
                            self.sharing = false
                            call.reject("The file could not be prepared for sharing.")
                        }
                    }
                }
                task.resume()
            } catch { call.reject("This file is not hosted by the configured server.") }
        }
    }
}

final class MessengerMediaHandler: NSObject, WKURLSchemeHandler {
    private var tasks: [ObjectIdentifier: URLSessionDataTask] = [:]

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let identifier = ObjectIdentifier(urlSchemeTask as AnyObject)
        guard isBundledMessenger(webView.url), let url = urlSchemeTask.request.url,
              url.scheme == "teletyptel-media", url.host == "localhost", url.port == nil,
              url.user == nil, url.password == nil, url.fragment == nil,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            urlSchemeTask.didFailWithError(URLError(.unsupportedURL)); return
        }
        do {
            let path = parts.percentEncodedPath + (parts.percentEncodedQuery.map { "?" + $0 } ?? "")
            let request = try MessengerServerConnection.shared.makeRequest(path: path,
                headers: urlSchemeTask.request.allHTTPHeaderFields ?? [:], fileOnly: true)
            let task = MessengerServerConnection.shared.load(request) { data, response, error in
                DispatchQueue.main.async {
                    guard self.tasks.removeValue(forKey: identifier) != nil else { return }
                    guard error == nil, let response = response, let data = data else {
                        urlSchemeTask.didFailWithError(error ?? URLError(.badServerResponse)); return
                    }
                    let headers = MessengerServerConnection.shared.responseHeaders(response)
                    guard let localResponse = HTTPURLResponse(url: url, statusCode: response.statusCode,
                                                              httpVersion: nil, headerFields: headers) else {
                        urlSchemeTask.didFailWithError(URLError(.badServerResponse)); return
                    }
                    urlSchemeTask.didReceive(localResponse)
                    urlSchemeTask.didReceive(data)
                    urlSchemeTask.didFinish()
                }
            }
            tasks[identifier] = task
            task.resume()
        } catch { urlSchemeTask.didFailWithError(error) }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        tasks.removeValue(forKey: ObjectIdentifier(urlSchemeTask as AnyObject))?.cancel()
    }
}
