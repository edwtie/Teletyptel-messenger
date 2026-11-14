import Foundation

public enum NativeDeliveryStatus: String, Codable, Equatable, Sendable {
    case unconfirmed, delivered, displayed
    public var label: String {
        switch self {
        case .unconfirmed: return "Verzonden · ontvangst niet bevestigd"
        case .delivered: return "Afgeleverd bij de andere client"
        case .displayed: return "Weergegeven door de andere client"
        }
    }
}

public enum NativeChatInteraction: Codable, Equatable, Sendable {
    case reactions(target: String, values: [String])
    case receipt(target: String, displayed: Bool)
    var target: String { switch self { case .reactions(let target, _), .receipt(let target, _): return target } }
}

public protocol NativeChatInteracting: NativeChatSending {
    func interact(to peer: String, interaction: NativeChatInteraction, identifier: String) async throws
}

public struct NativeChatPreferences: Codable, Equatable, Sendable {
    public var keepHistory = true
    public var sendDelivery = true
    public var sendDisplayed = false
    public init() {}
}

enum NativeInteractionCodec {
    static let reactions = "urn:xmpp:reactions:0"
    static let receipts = "urn:xmpp:receipts"
    static let markers = "urn:xmpp:chat-markers:0"
    static let picker = ["👍", "❤️", "😂", "😮", "😢", "🙏"]
    static func validReaction(_ value: String) -> Bool {
        value.count == 1 && value.utf8.count <= 64 && value.unicodeScalars.contains(where: { $0.properties.isEmojiPresentation || $0.value == 0x2764 }) &&
            !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    }
    static func hasInteraction(_ root: ProbeElement) -> Bool {
        root.children.contains { ($0.namespace == reactions) || ($0.name == "received" && $0.namespace == receipts) ||
            (["displayed", "received", "acknowledged"].contains($0.name) && $0.namespace == markers) }
    }
    static func decode(_ root: ProbeElement) -> NativeChatInteraction? {
        let elements = root.children.filter { $0.namespace == reactions || ($0.name == "received" && $0.namespace == receipts) ||
            (["displayed", "received", "acknowledged"].contains($0.name) && $0.namespace == markers) }
        guard elements.count == 1, let element = elements.first, let target = element.attributes["id"], NativeMessageActionCodec.validID(target) else { return nil }
        if element.name == "reactions", element.namespace == reactions {
            guard element.children.count <= 16, element.children.allSatisfy({ $0.name == "reaction" && $0.namespace == reactions && $0.children.isEmpty && validReaction($0.text) }),
                  Set(element.children.map(\.text)).count == element.children.count else { return nil }
            return .reactions(target: target, values: element.children.map(\.text))
        }
        guard element.children.isEmpty else { return nil }
        if element.name == "received", element.namespace == receipts { return .receipt(target: target, displayed: false) }
        if element.name == "displayed", element.namespace == markers { return .receipt(target: target, displayed: true) }
        return nil
    }
    static func encode(to peer: String, interaction: NativeChatInteraction, identifier: String, group: Bool = false) throws -> String {
        guard NativeChatCodec.bareJID(peer) == peer, UUID(uuidString: identifier) != nil,
              NativeMessageActionCodec.validID(interaction.target) else { throw NativeChatFailure.invalidMessage }
        let payload: String
        switch interaction {
        case .reactions(let target, let values):
            guard values.count <= 16, Set(values).count == values.count, values.allSatisfy(validReaction) else { throw NativeChatFailure.invalidMessage }
            payload = "<reactions xmlns='\(reactions)' id='\(NativeMessageActionCodec.escape(target))'>" + values.map { "<reaction>\(NativeMessageActionCodec.escape($0))</reaction>" }.joined() + "</reactions><store xmlns='urn:xmpp:hints'/>"
        case .receipt(let target, let displayed):
            guard !group || displayed else { throw NativeChatFailure.invalidMessage }
            payload = "<\(displayed ? "displayed" : "received") xmlns='\(displayed ? markers : receipts)' id='\(NativeMessageActionCodec.escape(target))'/>"
        }
        return "<message xmlns='jabber:client' type='\(group ? "groupchat" : "chat")' to='\(NativeMessageActionCodec.escape(peer))' id='\(identifier)'>\(payload)</message>"
    }
}
