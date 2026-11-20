import Combine
import Foundation

public struct HybridArchivedConversation: Codable, Equatable {
    public let peer: String
    public let kind: String
}

public struct HybridHistoryEntry: Codable, Equatable {
    public let id: String
    public let peer: String
    public let kind: String
    public let name: String
    public let preview: String
    public let timestamp: Double?
    public let archived: Bool
}

public struct HybridHistoryMessage: Codable, Equatable {
    public let id: String
    public let body: String
    public let outgoing: Bool
    public let timestamp: Double
    public let sender: String?
}

public struct HybridHistoryWindow: Codable, Equatable {
    public let id: String
    public let title: String
    public let messages: [HybridHistoryMessage]
    public let loading: Bool
    public let hasEarlier: Bool
    public let canChat: Bool
    public let notice: String?
}

public struct HybridHistoryState: Codable, Equatable {
    public var available = false
    public var query = ""
    public var archivedOnly = false
    public var entries: [HybridHistoryEntry] = []
    public var archived: [HybridArchivedConversation] = []
    public var window: HybridHistoryWindow?
    public var notice: String?
    public init() {}
}

@MainActor
public protocol HybridHistoryPort: AnyObject {
    var state: HybridHistoryState { get }
    var changes: AnyPublisher<HybridHistoryState, Never> { get }
    var onOpen: ((String, String) -> Bool)? { get set }
    var onArchive: ((String, String) -> Void)? { get set }
    func update(epoch: String, active: Bool)
    func command(_ name: String, arguments: [String: String]) throws
}
