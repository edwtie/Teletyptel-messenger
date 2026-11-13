import AVFoundation
import CoreMedia
import Foundation
import WebRTC

enum NativeMediaCaptureFailure: Error { case busy, permissionDenied, unavailable, startFailed }

@MainActor
final class NativeMediaCapture {
    let factory: RTCPeerConnectionFactory
    private var microphone: RTCAudioTrack?
    private var camera: RTCVideoTrack?
    private var capturer: RTCCameraVideoCapturer?

    init(factory: RTCPeerConnectionFactory) { self.factory = factory }

    var tracks: (RTCAudioTrack, RTCVideoTrack?)? {
        guard let microphone = microphone else { return nil }
        return (microphone, camera)
    }

    func prepare(_ profile: NativeCallMedia) async throws {
        guard microphone == nil, camera == nil, capturer == nil else { throw NativeMediaCaptureFailure.busy }
        guard await Self.permission(.audio) else { throw NativeMediaCaptureFailure.permissionDenied }
        if profile.hasVideo, !(await Self.permission(.video)) { throw NativeMediaCaptureFailure.permissionDenied }
        try Task.checkCancellation()

        let microphone = factory.audioTrack(withTrackId: "teletyptel-microphone-\(UUID().uuidString)")
        microphone.isEnabled = true
        self.microphone = microphone
        guard profile.hasVideo else { return }

        guard let selection = Self.cameraSelection() else {
            stop()
            throw NativeMediaCaptureFailure.unavailable
        }
        let source = factory.videoSource()
        let capturer = RTCCameraVideoCapturer(delegate: source)
        let camera = factory.videoTrack(with: source, trackId: "teletyptel-camera-\(UUID().uuidString)")
        self.camera = camera
        self.capturer = capturer
        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                capturer.startCapture(with: selection.device, format: selection.format, fps: selection.fps) { error in
                    if let error = error { continuation.resume(throwing: error) }
                    else { continuation.resume() }
                }
            }
            try Task.checkCancellation()
        } catch {
            stop()
            if error is CancellationError { throw error }
            throw NativeMediaCaptureFailure.startFailed
        }
    }

    func stop() {
        microphone?.isEnabled = false
        camera?.isEnabled = false
        capturer?.stopCapture()
        microphone = nil
        camera = nil
        capturer = nil
    }

    private static func permission(_ type: AVMediaType) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: type) {
        case .authorized: return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: type) { continuation.resume(returning: $0) }
            }
        case .denied, .restricted: return false
        @unknown default: return false
        }
    }

    private static func cameraSelection() -> (device: AVCaptureDevice, format: AVCaptureDevice.Format, fps: Int)? {
        let devices = RTCCameraVideoCapturer.captureDevices()
        guard let device = devices.first(where: { $0.position == .front }) ?? devices.first else { return nil }
        let candidates = RTCCameraVideoCapturer.supportedFormats(for: device).compactMap { format -> (AVCaptureDevice.Format, Int32, Int32, Int)? in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard dimensions.width > 0, dimensions.height > 0,
                  dimensions.width <= 1280, dimensions.height <= 720,
                  let range = format.videoSupportedFrameRateRanges.first,
                  range.maxFrameRate >= 15 else { return nil }
            return (format, dimensions.width, dimensions.height, min(30, Int(range.maxFrameRate.rounded(.down))))
        }
        guard let selected = candidates.max(by: {
            let first = Int64($0.1) * Int64($0.2), second = Int64($1.1) * Int64($1.2)
            return first == second ? $0.3 < $1.3 : first < second
        }) else { return nil }
        return (device, selected.0, selected.3)
    }
}
