import Foundation

enum NativeDialing {
    static let letters = ["1": "", "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ", "*": "", "0": "+", "#": ""]
    static func normalized(_ input: String) -> String? {
        guard !input.isEmpty, input.utf8.count <= 64 else { return nil }
        var result = ""
        for character in input.uppercased() {
            let value = String(character)
            if [" ", "-", "(", ")"].contains(value) { continue }
            if "0123456789*#".contains(character) { result += value }
            else if value == "+", result.isEmpty { result += value }
            else if let digit = letters.first(where: { $0.key != "0" && $0.value.contains(character) })?.key { result += digit }
            else { return nil }
        }
        return !result.isEmpty && result.count <= 40 ? result : nil
    }
    static func localServer(_ configuration: ServerConfiguration) -> Bool {
        guard configuration.origin.scheme == "https", let host = configuration.origin.host?.lowercased() else { return false }
        if ["localhost", "[::1]", "::1"].contains(host) { return true }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        let octets = parts.compactMap { UInt8($0) }
        guard parts.count == 4, octets.count == 4 else { return false }
        return octets[0] == 10 || octets[0] == 127 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1]))
    }
}

struct NativeSIPLabRoute: Equatable {
    let gateway: String
    let extensionNumber: String
    init(configuration: ServerConfiguration, gateway: String, number: String) throws {
        guard NativeDialing.localServer(configuration), NativeJingleTransport.fullJID(gateway),
              let bare = NativeChatCodec.bareJID(gateway), NativeAuthenticatedAccount.validJID(bare, domain: configuration.domain),
              NativeDialing.normalized(number) == "600" else { throw NativeJingleFailure.invalidRequest }
        self.gateway = gateway; extensionNumber = "600"
    }
    var contact: NativeContact {
        NativeContact(jid: NativeChatCodec.bareJID(gateway)!, name: "Asterisk-echo " + extensionNumber,
            groups: [], subscription: "none", presence: .unknown, callEndpoint: gateway)
    }
}
