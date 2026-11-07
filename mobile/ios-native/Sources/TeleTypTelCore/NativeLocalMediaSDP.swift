import Foundation

enum NativeLocalMediaSDP {
    static func restrict(_ local: String) throws -> String {
        guard local.utf8.count <= 65536 else { throw NativeJingleMediaFailure.unsupported }
        let lines = local.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }.filter { !$0.isEmpty }
        guard !lines.contains(where: { $0.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) }) else {
            throw NativeJingleMediaFailure.unsupported
        }
        let mids = lines.filter { $0.hasPrefix("a=mid:") }.map { String($0.dropFirst(6)) }
        let groups = lines.filter { $0.hasPrefix("a=group:") }
        guard !mids.isEmpty, Set(mids).count == mids.count,
              groups.isEmpty || groups == ["a=group:BUNDLE " + mids.joined(separator: " ")],
              !lines.contains("a=bundle-only") else { throw NativeJingleMediaFailure.unsupported }
        let narrowed = lines.filter { line in
            if line.hasPrefix("a=group:") || line.hasPrefix("a=extmap:") || line == "a=extmap-allow-mixed" { return false }
            if line.hasPrefix("a=rtcp-fb:") && line.hasSuffix(" transport-cc") { return false }
            return true
        }
        return (narrowed + [""]).joined(separator: "\r\n")
    }
}
