import Foundation

@MainActor
final class NativeCallMediaGate: NativeCallMediaDriver {
    private let media: any NativeCallMediaDriver
    private var handle: NativeCallHandle?
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private var started = false
    var prepare: ((NativeCallHandle, NativeCallMedia) async throws -> Void)?
    var released: ((NativeCallHandle) -> Void)?

    init(media: any NativeCallMediaDriver) { self.media = media }

    func start(handle: NativeCallHandle, media profile: NativeCallMedia, event: @escaping (NativeCallMediaEvent) -> Void) {
        guard self.handle == nil else { event(.failed); return }
        self.handle = handle
        let attempt = UUID(); generation = attempt
        task = Task { [weak self] in
            guard let self = self else { return }
            do {
                guard let prepare = self.prepare else { throw NativeJingleFailure.disconnected }
                try await prepare(handle, profile)
                try Task.checkCancellation()
                guard self.handle == handle, self.generation == attempt else { return }
                self.started = true
                self.media.start(handle: handle, media: profile) { [weak self] value in
                    guard let self = self, self.handle == handle, self.generation == attempt else { return }
                    event(value)
                }
            } catch {
                guard self.handle == handle, self.generation == attempt else { return }
                event(.failed)
            }
        }
    }

    func stop(handle: NativeCallHandle) {
        guard self.handle == handle else { return }
        generation = UUID(); self.handle = nil
        task?.cancel(); task = nil
        let wasStarted = started; started = false
        if wasStarted { media.stop(handle: handle) }
        released?(handle)
    }
    func audioActivated(_ active: Bool) { media.audioActivated(active) }
    func setMuted(_ muted: Bool) -> Bool { started && media.setMuted(muted) }
    func sendDtmf(_ tone: String) -> Bool { started && media.sendDtmf(tone) }
    func setHeld(_ held: Bool) async -> Bool {
        guard started, let handle = handle else { return false }
        let result = await media.setHeld(held)
        return self.handle == handle && started && result
    }
}
