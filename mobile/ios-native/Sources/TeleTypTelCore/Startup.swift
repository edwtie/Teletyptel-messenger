import Foundation

public enum ConnectionFailure: Error, Equatable {
    case configuration
    case certificate
    case timeout
    case offline
    case protocolMismatch
    case invalidResponse
    case redirectRejected

    public static func classify(_ error: Error) -> ConnectionFailure {
        if let failure = error as? ConnectionFailure { return failure }
        let failure = error as NSError
        guard failure.domain == NSURLErrorDomain else { return .offline }
        switch failure.code {
        case NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid,
             NSURLErrorSecureConnectionFailed:
            return .certificate
        case NSURLErrorTimedOut:
            return .timeout
        default:
            return .offline
        }
    }
}

public struct ServerConfiguration: Equatable, Sendable {
    public let origin: URL
    public let webSocket: URL
    public let domain: String

    public init(address: String, domain: String) throws {
        let address = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let domain = domain.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard address.utf8.count <= 2048,
              let components = URLComponents(string: address),
              components.scheme == "https", let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              components.port == nil || (1...65535).contains(components.port!),
              let origin = components.url,
              !domain.isEmpty, domain.utf8.count <= 253,
              domain.split(separator: ".", omittingEmptySubsequences: false).allSatisfy({ label in
                  label.range(of: #"\A[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\z"#,
                              options: .regularExpression) != nil
              }) else { throw ConnectionFailure.configuration }
        var socket = components
        socket.scheme = "wss"
        socket.path = "/xmpp-websocket"
        guard let webSocket = socket.url else { throw ConnectionFailure.configuration }
        self.origin = origin
        self.webSocket = webSocket
        self.domain = domain
    }
}

public struct ProbeReport: Equatable, Sendable {
    public let mechanisms: Set<String>

    public init(mechanisms: Set<String>) {
        self.mechanisms = mechanisms
    }
}

public protocol ServerChecking {
    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport
}

public struct StartupState {
    public enum Phase: Equatable {
        case idle
        case checking
        case available
        case failed(ConnectionFailure)
        case cancelled
    }

    public private(set) var phase: Phase = .idle
    public private(set) var attempt: UUID?

    public init() {}

    public mutating func begin() -> UUID {
        let identifier = UUID()
        attempt = identifier
        phase = .checking
        return identifier
    }

    public mutating func complete(_ identifier: UUID, failure: ConnectionFailure? = nil) {
        guard attempt == identifier, phase == .checking else { return }
        attempt = nil
        phase = failure.map(Phase.failed) ?? .available
    }

    public mutating func cancel() {
        attempt = nil
        phase = .cancelled
    }

    public mutating func reset() {
        attempt = nil
        phase = .idle
    }
}
