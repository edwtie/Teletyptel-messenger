import Combine
import Foundation

public struct HybridGroup: Codable, Equatable {
    public let room: String
    public let name: String
    public let joined: Bool
    public let joining: Bool
    public let canSpeak: Bool
    public let subject: String
    public let participants: [String]
    public let canModerate: Bool
}

public struct HybridExtrasState: Codable, Equatable {
    public var ready = false
    public var available = false
    public var mode = "off"
    public var language = "nl"
    public var consent = false
    public var liveConsent = false
    public var ownLiveConsent = false
    public var busy = false
    public var attachmentAvailable = false
    public var fileMessages: [String] = []
    public var translations: [String: String] = [:]
    public var ownRtt: String?
    public var remoteRtt: String?
    public var notice: String?
    public init() {}
}

public struct HybridExtrasContext: Equatable {
    public let epoch: String
    public let conversation: HybridConversation?
    public let call: HybridCallState
}

@MainActor
public protocol HybridExtrasPort: AnyObject {
    var state: HybridExtrasState { get }
    var changes: AnyPublisher<HybridExtrasState, Never> { get }
    var onStage: ((String, HybridExtrasContext) -> Bool)? { get set }
    func update(_ context: HybridExtrasContext?)
    func command(_ command: String, arguments: [String: String], context: HybridExtrasContext) throws
}
