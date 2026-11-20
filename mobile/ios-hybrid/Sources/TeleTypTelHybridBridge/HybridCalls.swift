import Combine
import Foundation

public struct HybridCallState: Codable, Equatable {
    public var phase: String = "idle"
    public var id: String?
    public var peer: String?
    public var mode: String?
    public var muted = false
    public var cameraEnabled = false
    public var remoteCamera = "unknown"
    public var rttReady = false
    public var canSwitchCamera = false
    public var canSendDtmf = false
    public var ownText = ""
    public var remoteText = ""
    public var videoFit = "contain"

    public init() {}
}

public struct HybridVideoPlacement: Equatable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
    public let viewportWidth: Double
    public let viewportHeight: Double

    public init(arguments: [String: String]) throws {
        func number(_ key: String) throws -> Double {
            guard let raw = arguments[key], let value = Double(raw), value.isFinite, value >= 0, value <= 10000 else {
                throw HybridFailure.invalidRequest
            }
            return value
        }
        x = try number("x"); y = try number("y")
        width = try number("width"); height = try number("height")
        viewportWidth = try number("viewportWidth"); viewportHeight = try number("viewportHeight")
        guard viewportWidth >= 1, viewportHeight >= 1, x + width <= viewportWidth + 1,
              y + height <= viewportHeight + 1 else { throw HybridFailure.invalidRequest }
    }
}

@MainActor
public protocol HybridCallPort: AnyObject {
    var state: HybridCallState { get }
    var changes: AnyPublisher<HybridCallState, Never> { get }
    func canCall(peer: String) -> Bool
    func start(peer: String, mode: String) throws
    func control(id: String, action: String, value: String?) throws
    func placeVideo(id: String, placement: HybridVideoPlacement) throws
    func resetFailure() throws
}

public extension HybridCallPort {
    func resetFailure() throws { throw HybridFailure.unavailable }
}

public struct HybridMessage: Codable, Equatable {
    public let id: String
    public let body: String
    public let outgoing: Bool
    public let timestamp: Double
    public let state: String
    public let delivery: String
    public let edited: Bool
    public let retracted: Bool
    public let reactions: [HybridReaction]
    public var sender: String? = nil
    public var canRetract: Bool = false
    public var canReact: Bool = false
}

public struct HybridReaction: Codable, Equatable {
    public let emoji: String
    public let count: Int
}

public struct HybridConversation: Codable, Equatable {
    public let peer: String
    public let draft: String
    public let messages: [HybridMessage]
    public let history: String
    public let canSend: Bool
    public let canChange: Bool
    public var kind = "direct"
}
