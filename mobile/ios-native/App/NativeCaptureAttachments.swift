import SwiftUI
import AVFoundation
import UniformTypeIdentifiers
import UIKit

@MainActor
final class NativeCaptureExclusion: ObservableObject {
    static let shared = NativeCaptureExclusion()
    @Published var callActive = false
    var cancelRecording: (() -> Void)?
}

@MainActor
final class NativeVoiceRecording: ObservableObject {
    @Published private(set) var recording = false
    @Published private(set) var status: String?
    @Published private(set) var selection: NativeUploadSelection?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var file: URL?
    private var deadline: Task<Void, Never>?
    private var generation = UUID()
    private var ownsSession = false

    func start() async {
        cancel()
        let attempt = generation
        let allowed = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard !Task.isCancelled, generation == attempt, !NativeCaptureExclusion.shared.callActive else { return }
        guard allowed else { status = "Microfoontoegang geweigerd. Je kunt dit aanpassen in iOS-instellingen."; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            ownsSession = true
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
            file = url
            let value = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000])
            guard value.prepareToRecord(), value.record(forDuration: 60) else { throw NativeAccountFailure.rejected }
            recorder = value
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
            recording = true
            NativeCaptureExclusion.shared.cancelRecording = { [weak self] in self?.cancel() }
            status = "Opnemen · maximaal 60 seconden. Nog niets verstuurd."
            deadline = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard !Task.isCancelled, self?.generation == attempt else { return }
                self?.stop()
            }
        } catch { cancel(); status = "Opnemen niet gestart. Controleer je microfoon en opslagruimte." }
    }

    func stop() {
        guard recording else { return }
        deadline?.cancel(); deadline = nil
        recorder?.stop(); recorder = nil; recording = false
        releaseSession()
        defer { removeFile() }
        do {
            guard let file = file, let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                  size > 0, size <= NativeUploadSelection.maximumBytes else { throw NativeAccountFailure.rejected }
            selection = try NativeUploadSelection(name: "spraakbericht.m4a", data: Data(contentsOf: file))
            status = "Opname gereed. Luister terug en kies bewust Uploaden."
        } catch { selection = nil; status = "Opname niet beschikbaar. Neem opnieuw op." }
    }

    func preview() {
        guard !NativeCaptureExclusion.shared.callActive, let selection = selection else { return }
        do {
            player?.stop()
            player = try AVAudioPlayer(data: selection.data)
            player?.play()
        } catch { status = "Terugluisteren niet beschikbaar." }
    }

    func cancel() {
        generation = UUID(); deadline?.cancel(); deadline = nil
        recorder?.stop(); recorder = nil; player?.stop(); player = nil
        recording = false; selection = nil; status = nil
        releaseSession(); removeFile()
    }

    private func releaseSession() {
        if ownsSession { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); ownsSession = false }
    }
    private func removeFile() { if let file = file { try? FileManager.default.removeItem(at: file) }; file = nil }
}

struct NativeCaptureOptions: View {
    let selected: (NativeUploadSelection) -> Void
    @ObservedObject private var exclusion = NativeCaptureExclusion.shared
    @StateObject private var voice = NativeVoiceRecording()
    @State private var cameraMode: String?
    @State private var error: String?
    @State private var generation = UUID()
    @State private var task: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            if voice.recording {
                Button { voice.stop() } label: { Label("Opname stoppen", systemImage: "stop.circle.fill") }.tint(.red)
            } else {
                Button { task = Task { await voice.start() } } label: { Label("Spraakbericht opnemen", systemImage: "mic.fill") }.disabled(exclusion.callActive)
            }
            if voice.selection != nil {
                Button { voice.preview() } label: { Label("Terugluisteren", systemImage: "play.fill") }.disabled(exclusion.callActive)
                Button { if let value = voice.selection { selected(value); voice.cancel() } } label: { Label("Opname gebruiken", systemImage: "checkmark") }
                Button(role: .destructive) { voice.cancel() } label: { Label("Opname weggooien", systemImage: "trash") }
            }
            if let status = voice.status { Text(status).font(.caption) }
            Button { openCamera(video: false) } label: { Label("Foto maken", systemImage: "camera") }
                .disabled(exclusion.callActive || voice.recording || !UIImagePickerController.isSourceTypeAvailable(.camera))
            Button { openCamera(video: true) } label: { Label("Videobericht opnemen", systemImage: "video.badge.plus") }
                .disabled(exclusion.callActive || voice.recording || !UIImagePickerController.isSourceTypeAvailable(.camera))
            if exclusion.callActive { Text("Opnemen is niet beschikbaar tijdens een oproep.").font(.caption) }
            if let error = error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .fullScreenCover(isPresented: Binding(get: { cameraMode != nil }, set: { if !$0 { cameraMode = nil } })) {
            if let mode = cameraMode {
                NativeCameraAttachment(video: mode == "video") { image, video in
                    cameraMode = nil
                    let attempt = generation
                    task = Task {
                        do {
                            let value: NativeUploadSelection
                            if let image = image, let bytes = image.jpegData(compressionQuality: 0.85) {
                                value = try NativeUploadSelection(name: "foto.jpg", data: NativePhotoPreparation.jpeg(bytes))
                            } else if let video = video { value = try await Self.prepareVideo(video) }
                            else { return }
                            guard !Task.isCancelled, generation == attempt, !exclusion.callActive else { return }
                            selected(value)
                        } catch { if !Task.isCancelled { self.error = "Opname niet verwerkt. Kies een kortere opname (maximaal 20 MB)." } }
                    }
                }
            }
        }
        .onChange(of: exclusion.callActive) { active in if active { cancel() } }
        .onChange(of: scenePhase) { phase in if phase == .background { cancel() } }
        .onDisappear { if cameraMode == nil { cancel() } else { voice.cancel() } }
    }
    private func cancel() { generation = UUID(); task?.cancel(); task = nil; voice.cancel(); cameraMode = nil }
    private func openCamera(video: Bool) {
        guard !exclusion.callActive else { return }
        let attempt = generation
        task = Task {
            let camera = await AVCaptureDevice.requestAccess(for: .video)
            let audio = video ? await AVCaptureDevice.requestAccess(for: .audio) : true
            guard !Task.isCancelled, generation == attempt, !exclusion.callActive else { return }
            guard camera, audio else { error = "Camera- of microfoontoegang geweigerd. Pas dit zo nodig aan in iOS-instellingen."; return }
            cameraMode = video ? "video" : "photo"
        }
    }
    static func prepareVideo(_ url: URL) async throws -> NativeUploadSelection {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        guard duration.seconds.isFinite, duration.seconds > 0, duration.seconds <= 60,
              let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality) else { throw NativeAccountFailure.rejected }
        let target = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
        defer { try? FileManager.default.removeItem(at: target) }
        exporter.outputURL = target; exporter.outputFileType = .mp4; exporter.metadata = []
        exporter.fileLengthLimit = Int64(NativeUploadSelection.maximumBytes)
        await withTaskCancellationHandler(operation: {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in exporter.exportAsynchronously { continuation.resume() } }
        }, onCancel: { exporter.cancelExport() })
        try Task.checkCancellation()
        guard exporter.status == .completed, let size = try target.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              size > 0, size <= NativeUploadSelection.maximumBytes else { throw NativeAccountFailure.rejected }
        return try NativeUploadSelection(name: "videobericht.mp4", data: Data(contentsOf: target))
    }
}

private struct NativeCameraAttachment: UIViewControllerRepresentable {
    let video: Bool
    let completed: (UIImage?, URL?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completed) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.mediaTypes = [video ? UTType.movie.identifier : UTType.image.identifier]
        controller.cameraCaptureMode = video ? .video : .photo
        controller.videoMaximumDuration = 60
        controller.videoQuality = .typeMedium
        controller.delegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let completed: (UIImage?, URL?) -> Void
        init(_ completed: @escaping (UIImage?, URL?) -> Void) { self.completed = completed }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completed(nil, nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            completed(info[.originalImage] as? UIImage, info[.mediaURL] as? URL)
        }
    }
}
