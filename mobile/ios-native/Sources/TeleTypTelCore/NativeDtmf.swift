import Foundation

enum NativeDtmf {
    static let duration: TimeInterval = 0.1
    static let gap: TimeInterval = 0.07
    static let maximumQueued = 16

    static func appending(_ tone: String, to queued: String) -> String? {
        let allowed = "0123456789*#ABCD"
        guard tone.utf8.count == 1, allowed.contains(tone), queued.utf8.count < maximumQueued,
              queued.allSatisfy({ allowed.contains($0) }) else { return nil }
        return queued + tone
    }
}
