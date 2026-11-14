import SwiftUI
import UIKit

@MainActor
final class NativeBackgroundController: ObservableObject {
    private var identifier: UIBackgroundTaskIdentifier = .invalid
    private var task: Task<Void, Never>?
    private var generation = UUID()

    func enter(_ model: NativeLoginModel, keepingCall: Bool = false) {
        stop()
        model.beginBackground()
        model.flushHistory()
        if keepingCall && model.isConnected { return }
        guard model.isConnected, model.chat.pendingCount > 0 else {
            model.suspend()
            return
        }
        let attempt = generation
        identifier = UIApplication.shared.beginBackgroundTask(withName: "Finish explicit chat sends") { [weak self, weak model] in
            Task { @MainActor in
                guard let self = self, self.generation == attempt else { return }
                model?.suspend()
                self.stop()
            }
        }
        guard identifier != .invalid else { model.suspend(); return }
        task = Task { [weak self, weak model] in
            for _ in 0..<50 {
                guard !Task.isCancelled, let model = model, model.chat.pendingCount > 0 else { break }
                do { try await Task.sleep(nanoseconds: 100_000_000) } catch { return }
            }
            guard !Task.isCancelled, let self = self, self.generation == attempt else { return }
            model?.suspend()
            self.stop()
        }
    }

    func returnToForeground(_ model: NativeLoginModel) {
        stop()
        model.resume()
    }

    func stop() {
        generation = UUID()
        task?.cancel()
        task = nil
        if identifier != .invalid {
            let current = identifier
            identifier = .invalid
            UIApplication.shared.endBackgroundTask(current)
        }
    }
}
