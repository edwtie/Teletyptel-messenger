import Combine
import Foundation

public struct HybridProfile: Codable, Equatable {
    public let jid: String
    public let name: String
    public let phone: String
    public let language: String
    public let color: String
}

public struct HybridAccountState: Codable, Equatable {
    public var providers: [String] = []
    public var entryAvailable = false
    public var registrationAvailable = false
    public var rememberAvailable = false
    public var savedLogin = false
    public var busy = false
    public var contactsAvailable = false
    public var nativePanels = false
    public var presentation = false
    public var blocked: [String] = []
    public var doNotDisturb = false
    public var owner: String?
    public var requests: [String] = []
    public var profile: HybridProfile?
    public var avatars: [String: String] = [:]
    public var notice: String?
    public init() {}
}

@MainActor
public protocol HybridAccountPort: AnyObject {
    var state: HybridAccountState { get }
    var changes: AnyPublisher<HybridAccountState, Never> { get }
    func update(epoch: String, active: Bool)
    func prepareLogin(jid: String, password: String, remember: Bool)
    func command(_ name: String, arguments: [String: String]) throws
    func cancelAuthentication()
    func logout()
}
