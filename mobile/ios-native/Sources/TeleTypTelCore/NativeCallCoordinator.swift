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
    private(set) var lifecycle = NativeCallLifecycle()
    private let system: any NativeCallSystem
    private let media: any NativeCallMediaDriver
    private let clock: any NativeCallScheduling
    private var deadline: (any NativeCallDeadline)?
    private var answerCompletion: ((Bool) -> Void)?
    var changed: (() -> Void)?

    init(system: any NativeCallSystem, media: any NativeCallMediaDriver,
         clock: any NativeCallScheduling) {
        self.system = system
        self.media = media
        self.clock = clock
    }

    @discardableResult
    func configure(account: String?, consented: Bool) -> UUID {
        if let handle = lifecycle.current?.handle { finish(handle, reason: .failed) }
        media.audioActivated(false)
        lifecycle.configure(account: account, consented: consented)
        changed?()
        return lifecycle.generation
    }

    func receive(_ data: Data, registration: UUID, completion: @escaping () -> Void) {
        let complete = NativeCallOnce(completion)
        guard let handle = lifecycle.receive(data, registration: registration, now: clock.now),
              let invitation = lifecycle.current?.invitation else {
            let rejected = UUID()
            var reported = false
            system.report(id: rejected, hasVideo: false) { [system] success in
                guard !reported else { return }
                reported = true
                if success { system.end(id: rejected, reason: .failed) }
                complete.finish()
            }
            return
        }
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
        guard let handle = lifecycle.current?.handle, handle.id == id else { return false }
        finish(handle, reason: reason)
        return true
    }

    func reset() {
        _ = configure(account: nil, consented: false)
    }

    func audioActivated(_ active: Bool) {
        media.audioActivated(active && lifecycle.current != nil)
    }

    func setMuted(id: UUID, muted: Bool) -> Bool {
        guard lifecycle.current?.handle.id == id,
              lifecycle.current?.phase == .connected || lifecycle.current?.phase == .answering else { return false }
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

    private func finish(_ handle: NativeCallHandle, reason: NativeCallEndReason) {
        guard lifecycle.end(handle) else { return }
        cleanup(handle, reason: reason)
    }

    private func cleanup(_ handle: NativeCallHandle, reason: NativeCallEndReason) {
        deadline?.cancel()
        deadline = nil
        let callback = answerCompletion
        answerCompletion = nil
        media.stop(handle: handle)
        media.audioActivated(false)
        system.end(id: handle.id, reason: reason)
        callback?(false)
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
