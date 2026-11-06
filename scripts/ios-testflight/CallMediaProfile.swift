import Foundation

enum MessengerCallMediaProfile: String, CaseIterable {
    case audio
    case video
    case audioRtt = "audio-rtt"
    case total

    var contents: Set<String> {
        switch self {
        case .audio: return ["audio"]
        case .video: return ["audio", "video"]
        case .audioRtt: return ["audio", "rtt"]
        case .total: return ["audio", "video", "rtt"]
        }
    }

    var hasVideo: Bool { contents.contains("video") }

    func accepts(negotiated: String, ready: [String]) -> Bool {
        let readyContents = Set(ready)
        return negotiated == rawValue && readyContents.count == ready.count && readyContents == contents
    }
}
