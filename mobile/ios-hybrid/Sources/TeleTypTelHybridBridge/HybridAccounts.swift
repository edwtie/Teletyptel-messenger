import Combine
import CryptoKit
import Foundation

public struct HybridProfile: Codable, Equatable {
    public let jid: String
    public let name: String
    public let phone: String
    public let language: String
    public let color: String
}

public struct HybridSIPContact: Codable, Equatable {
    public let id: UUID
    public let name: String
    public let destination: String

    public init(id: UUID, name: String, destination: String) throws {
        let cleanName = name.trimmingCharacters(in: .whitespaces)
        guard !cleanName.isEmpty, HybridRequest.text(cleanName, maximumBytes: 120),
              !cleanName.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains),
              let target = Self.normalized(destination) else { throw HybridFailure.invalidRequest }
        self.id = id
        self.name = cleanName
        self.destination = target
    }

    static func normalized(_ input: String) -> String? {
        guard HybridRequest.text(input, maximumBytes: 254) else { return nil }
        var destination = input.trimmingCharacters(in: .whitespaces)
        if destination.lowercased().hasPrefix("sip:") { destination.removeFirst(4) }
        if destination.contains("@") {
            let parts = destination.split(separator: "@", omittingEmptySubsequences: false)
            guard parts.count == 2,
                  parts[0].range(of: #"\A[A-Za-z0-9._+%-]{1,128}\z"#, options: .regularExpression) != nil,
                  parts[1].split(separator: ".", omittingEmptySubsequences: false).allSatisfy({
                      $0.range(of: #"\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\z"#, options: .regularExpression) != nil
                  }) else { return nil }
            return "\(parts[0])@\(parts[1].lowercased())"
        }
        let number = destination.filter { !" ()-".contains($0) }
        guard number.range(of: #"\A\+?[0-9]{2,20}\z"#, options: .regularExpression) != nil else { return nil }
        return number
    }
}

struct HybridSIPDirectory {
    static let limit = 100
    private let storage: UserDefaults

    init(storage: UserDefaults = .standard) { self.storage = storage }

    private func key(origin: URL, account: String) -> String {
        "teletyptel.sip-contacts." + SHA256.hash(data: Data((origin.absoluteString + "\n" + account).utf8))
            .map { String(format: "%02x", $0) }.joined()
    }

    func contacts(origin: URL, account: String) -> [HybridSIPContact] {
        guard let data = storage.data(forKey: key(origin: origin, account: account)), data.count <= 65536,
              let contacts = try? JSONDecoder().decode([HybridSIPContact].self, from: data),
              contacts.count <= Self.limit else { return [] }
        return contacts.compactMap { try? HybridSIPContact(id: $0.id, name: $0.name, destination: $0.destination) }
    }

    func save(_ contact: HybridSIPContact, origin: URL, account: String) throws {
        var entries = contacts(origin: origin, account: account)
        if let index = entries.firstIndex(where: { $0.id == contact.id }) { entries[index] = contact }
        else {
            guard entries.count < Self.limit else { throw HybridFailure.unavailable }
            entries.append(contact)
        }
        storage.set(try JSONEncoder().encode(entries), forKey: key(origin: origin, account: account))
    }

    func remove(_ id: UUID, origin: URL, account: String) throws {
        let entries = contacts(origin: origin, account: account).filter { $0.id != id }
        storage.set(try JSONEncoder().encode(entries), forKey: key(origin: origin, account: account))
    }
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
    public var sipContactsAvailable = false
    public var sipContacts: [HybridSIPContact] = []
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
    func prepareLogin(jid: String, password: String, remember: Bool) throws
    func command(_ name: String, arguments: [String: String]) throws
    func cancelAuthentication()
    func logout()
}
