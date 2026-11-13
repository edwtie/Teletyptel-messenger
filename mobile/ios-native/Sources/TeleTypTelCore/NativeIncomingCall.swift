import Foundation

enum NativeCallMedia: String, Codable, CaseIterable {
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
}

struct NativeCallInvitation: Equatable {
    let id: UUID
    let sid: String
    let expiresAt: TimeInterval
    let media: NativeCallMedia

    init?(id: UUID = UUID(), sid: String, expiresAt: TimeInterval,
          media: NativeCallMedia, now: TimeInterval) {
        guard now.isFinite, expiresAt.isFinite,
              sid.range(of: "\\A[A-Za-z0-9_-]{1,128}\\z", options: .regularExpression) != nil,
              expiresAt > now, expiresAt <= now + 60 else { return nil }
        self.id = id
        self.sid = sid
        self.expiresAt = expiresAt
        self.media = media
    }

    private struct Payload: Decodable {
        let type: String
        let callId: UUID
        let sid: String
        let expiresAt: Double
        let hasVideo: Bool
        let mediaProfile: NativeCallMedia
    }

    static func decode(_ data: Data, now: TimeInterval) -> Self? {
        guard data.count <= 4096,
              let payload = try? JSONDecoder().decode(Payload.self, from: data),
              payload.type == "incoming-call",
              payload.expiresAt.rounded() == payload.expiresAt,
              payload.hasVideo == payload.mediaProfile.hasVideo else { return nil }
        return Self(id: payload.callId, sid: payload.sid, expiresAt: payload.expiresAt,
                    media: payload.mediaProfile, now: now)
    }
}

struct NativeCallHandle: Equatable {
    let id: UUID
    let sid: String
    let generation: UUID
}

enum NativeCallPhase: Equatable {
    case reporting
    case ringing
    case answering
    case connected
}

struct NativeIncomingCallState: Equatable {
    let handle: NativeCallHandle
    let invitation: NativeCallInvitation
    var phase: NativeCallPhase
    var deadline: TimeInterval?
}

struct NativeCallLifecycle {
    private(set) var current: NativeIncomingCallState?
    private(set) var generation = UUID()
    private var account: String?
    private var retired: [UUID: TimeInterval] = [:]

    mutating func configure(account: String?, consented: Bool) {
        generation = UUID()
        current = nil
        retired.removeAll()
        guard consented, let account = account, !account.isEmpty,
              account.utf8.count <= 96,
              !account.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            self.account = nil
            return
        }
        self.account = account
    }

    mutating func receive(_ data: Data, registration: UUID, now: TimeInterval) -> NativeCallHandle? {
        guard let invitation = NativeCallInvitation.decode(data, now: now) else { return nil }
        return receive(invitation, registration: registration, now: now)
    }

    mutating func receive(_ invitation: NativeCallInvitation, registration: UUID,
                          now: TimeInterval) -> NativeCallHandle? {
        guard account != nil, registration == generation, now.isFinite,
              invitation.expiresAt > now, invitation.expiresAt <= now + 60,
              invitation.sid.range(of: "\\A[A-Za-z0-9_-]{1,128}\\z", options: .regularExpression) != nil else {
            return nil
        }
        retired = retired.filter { $0.value > now }
        guard current == nil, retired.count < 32, retired[invitation.id] == nil else { return nil }
        let handle = NativeCallHandle(id: invitation.id, sid: invitation.sid, generation: generation)
        current = NativeIncomingCallState(handle: handle, invitation: invitation,
                                         phase: .reporting, deadline: invitation.expiresAt)
        return handle
    }

    mutating func reported(_ handle: NativeCallHandle, succeeded: Bool, now: TimeInterval) -> Bool {
        guard matches(handle), current?.phase == .reporting else { return false }
        guard succeeded, beforeDeadline(now) else { _ = end(handle); return false }
        current?.phase = .ringing
        return true
    }

    mutating func requestAnswer(_ handle: NativeCallHandle, now: TimeInterval) -> Bool {
        guard matches(handle), current?.phase == .ringing else { return false }
        guard beforeDeadline(now), let invitation = current?.invitation else { _ = end(handle); return false }
        current?.phase = .answering
        current?.deadline = min(invitation.expiresAt, now + 15)
        return true
    }

    mutating func mediaReady(_ handle: NativeCallHandle, negotiated: NativeCallMedia,
                            readyContents: [String], rttReady: Bool, now: TimeInterval) -> Bool {
        guard matches(handle), current?.phase == .answering else { return false }
        guard beforeDeadline(now) else { _ = end(handle); return false }
        guard let requested = current?.invitation.media, requested == negotiated,
              Set(readyContents).count == readyContents.count,
              Set(readyContents) == requested.contents,
              !requested.contents.contains("rtt") || rttReady else { return false }
        current?.phase = .connected
        current?.deadline = nil
        return true
    }

    mutating func expire(_ handle: NativeCallHandle, now: TimeInterval) -> Bool {
        guard matches(handle), now.isFinite, let deadline = current?.deadline,
              now >= deadline else { return false }
        return end(handle)
    }

    @discardableResult
    mutating func end(_ handle: NativeCallHandle) -> Bool {
        guard matches(handle), let state = current else { return false }
        retired[handle.id] = state.invitation.expiresAt
        current = nil
        return true
    }

    private func matches(_ handle: NativeCallHandle) -> Bool {
        handle.generation == generation && current?.handle == handle
    }

    private func beforeDeadline(_ now: TimeInterval) -> Bool {
        guard now.isFinite, let deadline = current?.deadline else { return false }
        return now < deadline
    }
}
