import Foundation

@main
enum CallMediaProfileTests {
    static func main() {
        let expected: [String: Set<String>] = [
            "audio": ["audio"], "video": ["audio", "video"],
            "audio-rtt": ["audio", "rtt"], "total": ["audio", "video", "rtt"]
        ]
        for profile in MessengerCallMediaProfile.allCases {
            precondition(profile.contents == expected[profile.rawValue])
            precondition(profile.hasVideo == profile.contents.contains("video"))
            let contents = profile.contents.sorted()
            precondition(profile.accepts(negotiated: profile.rawValue, ready: contents))
            precondition(!profile.accepts(negotiated: profile.rawValue, ready: []))
            for content in contents {
                precondition(!profile.accepts(negotiated: profile.rawValue, ready: contents.filter { $0 != content }))
                precondition(!profile.accepts(negotiated: profile.rawValue, ready: contents + [content]))
            }
            precondition(!profile.accepts(negotiated: profile.rawValue, ready: contents + ["chat"]))
            for other in MessengerCallMediaProfile.allCases where other != profile {
                precondition(!profile.accepts(negotiated: other.rawValue, ready: contents))
            }
        }
        for value in ["", "rtt", "TOTAL", "unknown"] {
            precondition(MessengerCallMediaProfile(rawValue: value) == nil)
        }
        print("Native media contract checks passed")
    }
}
