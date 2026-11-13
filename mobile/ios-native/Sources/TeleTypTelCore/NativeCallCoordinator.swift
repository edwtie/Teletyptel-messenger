import Foundation

enum NativeCallEndReason { case failed, remoteEnded, unanswered }

enum NativeCallMediaEvent {
    case ready(NativeCallMedia, contents: [String], rttReady: Bool)
    case failed
    case ended
}

@MainActor
protocol NativeCallSystem: AnyObject {
    func report(id: UUID, hasVideo: Bool, completion: @escaping (Bool) -> Void)
    func start(id: UUID, peer: String, hasVideo: Bool, completion: @escaping (Bool) -> Void)
    func connected(id: UUID)
    func end(id: UUID, reason: NativeCallEndReason)
}

@MainActor
protocol NativeCallMediaDriver: AnyObject {
    func start(handle: NativeCallHandle, media: NativeCallMedia,
               event: @escaping (NativeCallMediaEvent) -> Void)
    func stop(handle: NativeCallHandle)
    func audioActivated(_ active: Bool)
    func setMuted(_ muted: Bool) -> Bool
}

@MainActor
protocol NativeCallDeadline: AnyObject { func cancel() }

@MainActor
protocol NativeCallScheduling {
    var now: TimeInterval { get }
    func schedule(after seconds: TimeInterval, perform: @escaping () -> Void) -> any NativeCallDeadline
}

@MainActor
struct NativeCallScheduler: NativeCallScheduling {
    var now: TimeInterval { Date().timeIntervalSince1970 }

    func schedule(after seconds: TimeInterval, perform: @escaping () -> Void) -> any NativeCallDeadline {
        NativeCallTimer(seconds: seconds, perform: perform)
    }
}

@MainActor
private final class NativeCallTimer: NativeCallDeadline {
    private var task: Task<Void, Never>?

    init(seconds: TimeInterval, perform: @escaping () -> Void) {
        task = Task {
            do { try await Task.sleep(nanoseconds: UInt64(max(0, min(seconds, 60)) * 1_000_000_000)) }
            catch { return }
            guard !Task.isCancelled else { return }
            perform()
        }
    }

    func cancel() { task?.cancel(); task = nil }
    deinit { task?.cancel() }
}

@MainActor
final class NativeCallCoordinator {
    private enum OutgoingPhase { case requesting, connecting, connected }

    private struct OutgoingState {
        let handle: NativeCallHandle
        let peer: String
        let media: NativeCallMedia
        var phase: OutgoingPhase
        var deadline: TimeInterval
    }

    private(set) var lifecycle = NativeCallLifecycle()
    private let system: any NativeCallSystem
    private let media: any NativeCallMediaDriver
    private let clock: any NativeCallScheduling
    private var deadline: (any NativeCallDeadline)?
    private var answerCompletion: ((Bool) -> Void)?
    private var outgoing: OutgoingState?
    private var outgoingCompletion: ((Bool) -> Void)?
    var changed: (() -> Void)?

    var currentHandle: NativeCallHandle? { lifecycle.current?.handle ?? outgoing?.handle }
    var isConnected: Bool {
        lifecycle.current?.phase == .connected || outgoing?.phase == .connected
    }

    init(system: any NativeCallSystem, media: any NativeCallMediaDriver,
         clock: any NativeCallScheduling) {
        self.system = system
        self.media = media
        self.clock = clock
    }

    @discardableResult
    func configure(account: String?, consented: Bool) -> UUID {
        if let handle = currentHandle { finish(handle, reason: .failed) }
        media.audioActivated(false)
        lifecycle.configure(account: account, consented: consented)
        changed?()
        return lifecycle.generation
    }

    @discardableResult
    func startOutgoing(peer: String, sid: String, media requested: NativeCallMedia,
                       completion: @escaping (Bool) -> Void) -> UUID? {
        guard lifecycle.current == nil, outgoing == nil,
              NativeJingleTransport.fullJID(peer), NativeJingleTransport.validSID(sid) else {
            completion(false)
            return nil
        }
        let handle = NativeCallHandle(id: UUID(), sid: sid, generation: lifecycle.generation)
        outgoing = OutgoingState(handle: handle, peer: peer, media: requested,
                                 phase: .requesting, deadline: clock.now + 20)
        outgoingCompletion = completion
        scheduleOutgoing(handle)
        changed?()
        var completed = false
        system.start(id: handle.id, peer: peer, hasVideo: requested.hasVideo) { [weak self] success in
            guard !completed else { return }
            completed = true
            guard let self = self else { return }
            guard self.outgoing?.handle == handle else { return }
            let callback = self.outgoingCompletion
            self.outgoingCompletion = nil
            if success { callback?(true) }
            else {
                callback?(false)
                self.finish(handle, reason: .failed)
            }
        }
        return handle.id
    }

    @discardableResult
    func performStart(id: UUID) -> Bool {
        guard var state = outgoing, state.handle.id == id, state.phase == .requesting else { return false }
        state.phase = .connecting
        state.deadline = min(state.deadline, clock.now + 15)
        outgoing = state
        scheduleOutgoing(state.handle)
        changed?()
        media.start(handle: state.handle, media: state.media) { [weak self] event in
            guard let self = self, self.outgoing?.handle == state.handle else { return }
            switch event {
            case .ready(let profile, let contents, let rttReady):
                guard self.outgoing?.phase == .connecting else { return }
                guard self.ready(requested: state.media, negotiated: profile,
                                 contents: contents, rttReady: rttReady) else { return }
                self.deadline?.cancel()
                self.deadline = nil
                self.outgoing?.phase = .connected
                self.system.connected(id: state.handle.id)
                self.changed?()
            case .failed:
                self.finish(state.handle, reason: .failed)
            case .ended:
                self.finish(state.handle, reason: .remoteEnded)
            }
        }
        return true
    }

    func receive(_ data: Data, registration: UUID, completion: @escaping () -> Void) {
        let complete = NativeCallOnce(completion)
        guard outgoing == nil,
              let handle = lifecycle.receive(data, registration: registration, now: clock.now),
              let invitation = lifecycle.current?.invitation else {
            reportRejected(complete)
            return
        }
        report(handle, invitation: invitation, complete: complete)
    }

    func receive(_ invitation: NativeCallInvitation, registration: UUID,
                 completion: @escaping () -> Void) {
        let complete = NativeCallOnce(completion)
        guard outgoing == nil,
              let handle = lifecycle.receive(invitation, registration: registration, now: clock.now),
              let accepted = lifecycle.current?.invitation else {
            reportRejected(complete)
            return
        }
        report(handle, invitation: accepted, complete: complete)
    }

    private func reportRejected(_ complete: NativeCallOnce) {
        let rejected = UUID()
        var reported = false
        system.report(id: rejected, hasVideo: false) { [system] success in
            guard !reported else { return }
            reported = true
            if success { system.end(id: rejected, reason: .failed) }
            complete.finish()
        }
    }

    private func report(_ handle: NativeCallHandle, invitation: NativeCallInvitation,
                        complete: NativeCallOnce) {
        schedule(handle)
        var reported = false
        system.report(id: handle.id, hasVideo: invitation.media.hasVideo) { [weak self, system] success in
            guard !reported else { return }
            reported = true
            defer { complete.finish() }
            guard let self = self else {
                if success { system.end(id: handle.id, reason: .failed) }
                return
            }
            guard self.lifecycle.current?.handle == handle else {
                if success { system.end(id: handle.id, reason: .failed) }
                return
            }
            guard self.lifecycle.reported(handle, succeeded: success, now: self.clock.now) else {
                self.cleanup(handle, reason: .failed)
                return
            }
            self.changed?()
        }
    }

    func answer(id: UUID, completion: @escaping (Bool) -> Void) {
        guard let handle = lifecycle.current?.handle, handle.id == id,
              lifecycle.current?.phase == .ringing, answerCompletion == nil else {
            completion(false)
            return
        }
        guard lifecycle.requestAnswer(handle, now: clock.now), let state = lifecycle.current else {
            cleanup(handle, reason: .unanswered)
            completion(false)
            return
        }
        answerCompletion = completion
        schedule(handle)
        changed?()
        media.start(handle: handle, media: state.invitation.media) { [weak self] event in
            guard let self = self, self.lifecycle.current?.handle == handle else { return }
            switch event {
            case .ready(let profile, let contents, let rttReady):
                guard self.lifecycle.current?.phase == .answering else { return }
                if self.lifecycle.mediaReady(handle, negotiated: profile, readyContents: contents,
                                            rttReady: rttReady, now: self.clock.now) {
                    self.deadline?.cancel()
                    self.deadline = nil
                    let callback = self.answerCompletion
                    self.answerCompletion = nil
                    callback?(true)
                    self.changed?()
                } else if self.lifecycle.current == nil {
                    self.cleanup(handle, reason: .failed)
                }
            case .failed: self.finish(handle, reason: .failed)
            case .ended: self.finish(handle, reason: .remoteEnded)
            }
        }
    }

    @discardableResult
    func end(id: UUID, reason: NativeCallEndReason = .remoteEnded) -> Bool {
        guard let handle = currentHandle, handle.id == id else { return false }
        finish(handle, reason: reason)
        return true
    }

    func reset() {
        _ = configure(account: nil, consented: false)
    }

    func audioActivated(_ active: Bool) {
        media.audioActivated(active && currentHandle != nil)
    }

    func setMuted(id: UUID, muted: Bool) -> Bool {
        let incomingReady = lifecycle.current?.handle.id == id &&
            (lifecycle.current?.phase == .connected || lifecycle.current?.phase == .answering)
        let outgoingReady = outgoing?.handle.id == id &&
            (outgoing?.phase == .connected || outgoing?.phase == .connecting)
        guard incomingReady || outgoingReady else { return false }
        return media.setMuted(muted)
    }

    private func schedule(_ handle: NativeCallHandle) {
        deadline?.cancel()
        guard let expires = lifecycle.current?.deadline else { return }
        deadline = clock.schedule(after: max(0, expires - clock.now)) { [weak self] in
            guard let self = self, self.lifecycle.current?.handle == handle else { return }
            let reason: NativeCallEndReason = self.lifecycle.current?.phase == .answering ? .failed : .unanswered
            if self.lifecycle.expire(handle, now: self.clock.now) { self.cleanup(handle, reason: reason) }
            else { self.schedule(handle) }
        }
    }

    private func scheduleOutgoing(_ handle: NativeCallHandle) {
        deadline?.cancel()
        guard let state = outgoing, state.handle == handle else { return }
        deadline = clock.schedule(after: max(0, state.deadline - clock.now)) { [weak self] in
            guard let self = self, let current = self.outgoing, current.handle == handle else { return }
            if self.clock.now >= current.deadline { self.finish(handle, reason: .failed) }
            else { self.scheduleOutgoing(handle) }
        }
    }

    private func ready(requested: NativeCallMedia, negotiated: NativeCallMedia,
                       contents: [String], rttReady: Bool) -> Bool {
        requested == negotiated && Set(contents).count == contents.count &&
            Set(contents) == requested.contents &&
            (!requested.contents.contains("rtt") || rttReady)
    }

    private func finish(_ handle: NativeCallHandle, reason: NativeCallEndReason) {
        if lifecycle.current?.handle == handle {
            guard lifecycle.end(handle) else { return }
        } else {
            guard outgoing?.handle == handle else { return }
            outgoing = nil
        }
        cleanup(handle, reason: reason)
    }

    private func cleanup(_ handle: NativeCallHandle, reason: NativeCallEndReason) {
        deadline?.cancel()
        deadline = nil
        let callback = answerCompletion
        answerCompletion = nil
        let outgoingCallback = outgoingCompletion
        outgoingCompletion = nil
        media.stop(handle: handle)
        media.audioActivated(false)
        system.end(id: handle.id, reason: reason)
        callback?(false)
        outgoingCallback?(false)
        changed?()
    }
}

@MainActor
private final class NativeCallOnce {
    private var completion: (() -> Void)?
    init(_ completion: @escaping () -> Void) { self.completion = completion }
    func finish() {
        let callback = completion
        completion = nil
        callback?()
    }
}
