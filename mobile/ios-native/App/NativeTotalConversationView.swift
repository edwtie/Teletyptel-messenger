import SwiftUI
import UIKit
import WebRTC

struct NativeTotalConversationView: View {
    @ObservedObject var controller: NativeCallController
    @ObservedObject var translation: NativeTranslationModel
    @FocusState private var rttFocused: Bool
    @State private var controlsOpen = false

    var body: some View {
        GeometryReader { geometry in
            if let presentation = controller.presentation {
                let landscape = geometry.size.width > geometry.size.height
                ZStack {
                    videoCanvas(presentation)
                    VStack(spacing: 0) {
                        header(presentation)
                        Spacer(minLength: 12)
                        if presentation.profile.contents.contains("rtt") {
                            rttPanes(presentation, landscape: landscape)
                                .padding(.horizontal, landscape ? 16 : 12)
                                .padding(.bottom, 10)
                        }
                    }
                    if let localVideo = presentation.localVideo, presentation.profile.hasVideo {
                        NativeVideoSurface(track: localVideo)
                            .frame(width: min(landscape ? 220 : 150, geometry.size.width * 0.34),
                                   height: min(landscape ? 138 : 190, geometry.size.height * 0.25))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(NativeWebStyle.callLine, lineWidth: 1))
                            .shadow(radius: 8)
                            .padding(.top, 78)
                            .padding(.trailing, 14)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                            .accessibilityLabel("Eigen camerabeeld")
                    }
                    if presentation.profile.hasVideo, presentation.canSwitchCamera {
                        Button(action: controller.switchCamera) {
                            Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 52, height: 52)
                                .background(Color.black.opacity(0.62), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 78)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .accessibilityLabel("Camera wisselen")
                    }
                }
                .background(NativeWebStyle.callBackground)
                .font(NativeWebStyle.font())
                .statusBarHidden(landscape)
            }
        }
        .interactiveDismissDisabled()
        .onChange(of: controller.presentation?.remoteText) { text in
            if let text = text { translateLive(text, direction: "peer") }
        }
        .onChange(of: controller.presentation?.ownText) { text in
            if let text = text { translateLive(text, direction: "self") }
        }
        .onChange(of: translation.ready) { _ in translateCurrentText() }
        .onChange(of: translation.preferences) { _ in translateCurrentText() }
        .onChange(of: translation.sharingConsent) { _ in translateCurrentText() }
    }

    private func translateCurrentText() {
        guard let presentation = controller.presentation else { return }
        translateLive(presentation.remoteText, direction: "peer")
        translateLive(presentation.ownText, direction: "self")
    }

    @ViewBuilder
    private func videoCanvas(_ presentation: NativeCallPresentation) -> some View {
        if let remoteVideo = presentation.remoteVideo, presentation.profile.hasVideo {
            NativeVideoSurface(track: remoteVideo)
                .ignoresSafeArea(edges: .bottom)
                .accessibilityLabel("Videobeeld van gesprekspartner")
        } else {
            ZStack {
                Color(red: 0.02, green: 0.06, blue: 0.12)
                VStack(spacing: 12) {
                    Image(systemName: presentation.profile.hasVideo ? "video.slash.fill" : "waveform")
                        .font(.system(size: 42, weight: .semibold))
                    Text(presentation.profile.hasVideo ? "Video wordt verbonden" : "Audiogesprek")
                        .font(.headline)
                }
                .foregroundStyle(.white.opacity(0.78))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func header(_ presentation: NativeCallPresentation) -> some View {
        HStack(spacing: 12) {
            NativeWebAvatar(name: controller.peerName ?? "TeleTypTel", size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(controller.peerName ?? "TeleTypTel-contact")
                    .font(NativeWebStyle.font(18, weight: .bold))
                    .lineLimit(1)
                Text(profileName(presentation.profile))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if presentation.profile.contents.contains("rtt") {
                Image(systemName: presentation.rttReady ? "text.bubble.fill" : "text.bubble")
                    .foregroundStyle(presentation.rttReady ? .green : .orange)
                    .accessibilityLabel(presentation.rttReady ? "Realtime tekst verbonden" : "Realtime tekst wordt verbonden")
            }
            Button { controlsOpen.toggle() } label: { Image(systemName: "slider.horizontal.3") }
                .buttonStyle(NativeWebIconStyle()).accessibilityLabel("Gespreksbediening")
                .popover(isPresented: $controlsOpen, arrowEdge: .top) {
                    controls(presentation).padding(12).background(NativeWebStyle.callBackground)
                        .presentationCompactAdaptation(.popover)
                }
            Button(action: controller.endCall) { Image(systemName: "phone.down.fill") }
                .buttonStyle(NativeWebIconStyle(destructive: true)).accessibilityLabel("Gesprek beëindigen")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(NativeWebStyle.panel).foregroundStyle(NativeWebStyle.text)
        .overlay(alignment: .bottom) { NativeWebStyle.line.frame(height: 1) }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func rttPanes(_ presentation: NativeCallPresentation, landscape: Bool) -> some View {
        if landscape {
            HStack(alignment: .bottom, spacing: 12) {
                remoteRttPane(presentation)
                ownRttPane(presentation)
            }
        } else {
            VStack(spacing: 10) {
                remoteRttPane(presentation)
                ownRttPane(presentation)
            }
        }
    }

    private func remoteRttPane(_ presentation: NativeCallPresentation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(controller.peerName ?? "Gesprekspartner")
                .font(.caption.bold())
                .foregroundStyle(Color(red: 0.55, green: 0.75, blue: 1))
            Text(presentation.remoteText.isEmpty ? "…" : presentation.remoteText)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
                .accessibilityLabel("Realtime tekst van gesprekspartner: " +
                                    (presentation.remoteText.isEmpty ? "nog geen tekst" : presentation.remoteText))
            if let result = translation.results[liveKey("peer")], translation.preferences.mode != "off", translation.sharingConsent {
                NativeTranslationCaption(result: result).foregroundStyle(.white)
            }
        }
        .rttPaneStyle()
    }

    private func ownRttPane(_ presentation: NativeCallPresentation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Ik")
                .font(.caption.bold())
                .foregroundStyle(Color(red: 0.55, green: 0.75, blue: 1))
            TextField("Typ realtime tekst", text: Binding(
                get: { controller.presentation?.ownText ?? "" },
                set: controller.setRttText
            ), axis: .vertical)
            .lineLimit(2...5)
            .textFieldStyle(.plain)
            .font(.title3)
            .foregroundStyle(.white)
            .tint(.blue)
            .focused($rttFocused)
            .disabled(!presentation.rttReady)
            .accessibilityLabel("Eigen realtime tekst")
            .accessibilityHint(presentation.rttReady ? "Tekst wordt direct tijdens het gesprek verzonden" :
                               "Wacht totdat realtime tekst is verbonden")
            if let result = translation.results[liveKey("self")], translation.preferences.mode != "off", translation.sharingConsent {
                NativeTranslationCaption(result: result).foregroundStyle(.white)
            }
        }
        .rttPaneStyle()
    }

    private func liveKey(_ direction: String) -> String { "tc:" + (controller.presentation?.callID.uuidString ?? "none") + ":" + direction }

    private func translateLive(_ text: String, direction: String) {
        translation.translate(text, key: liveKey(direction), automatic: true, liveDirection: direction)
    }

    private func controls(_ presentation: NativeCallPresentation) -> some View {
        HStack(spacing: 8) {
            if presentation.profile.hasVideo {
                callButton(symbol: presentation.cameraEnabled ? "video.fill" : "video.slash.fill",
                           color: presentation.cameraEnabled ? NativeWebStyle.enabled : NativeWebStyle.disabled,
                           label: presentation.cameraEnabled ? "Camera uitschakelen" : "Camera inschakelen",
                           action: controller.toggleCamera)
            }
            callButton(symbol: controller.isMuted ? "mic.slash.fill" : "mic.fill",
                       color: controller.isMuted ? NativeWebStyle.disabled : NativeWebStyle.enabled,
                       label: controller.isMuted ? "Microfoon inschakelen" : "Microfoon dempen",
                       action: controller.toggleMuted)
            if presentation.profile.contents.contains("rtt") {
                callButton(symbol: "keyboard.fill", color: presentation.rttReady ? NativeWebStyle.enabled : .orange,
                           label: "Realtime tekst typen") { rttFocused = true }
                    .disabled(!presentation.rttReady)
            }
        }
        .padding(10)
        .background(Color(red: 0.02, green: 0.06, blue: 0.12).opacity(0.94),
                    in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18)
            .stroke(Color(red: 0.12, green: 0.32, blue: 0.62), lineWidth: 1.5))
        .frame(maxWidth: .infinity)
    }

    private func callButton(symbol: String, color: Color, label: String,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(color, in: RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func profileName(_ profile: NativeCallMedia) -> String {
        switch profile {
        case .audio: return "Spraak"
        case .video: return "Spraak en video"
        case .audioRtt: return "Spraak en realtime tekst"
        case .total: return "Total Conversation"
        }
    }
}

private struct NativeVideoSurface: UIViewRepresentable {
    let track: RTCVideoTrack

    final class Coordinator {
        var track: RTCVideoTrack?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = .scaleAspectFill
        view.clipsToBounds = true
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
        guard context.coordinator.track !== track else { return }
        context.coordinator.track?.remove(view)
        track.add(view)
        context.coordinator.track = track
    }

    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(view)
        coordinator.track = nil
    }
}

private extension View {
    func rttPaneStyle() -> some View {
        self
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(NativeWebStyle.callBackground.opacity(0.94), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(NativeWebStyle.callLine, lineWidth: 2))
    }
}
