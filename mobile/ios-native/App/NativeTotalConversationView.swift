import SwiftUI
import UIKit
import WebRTC

@MainActor
struct NativeTotalConversationView: View {
    @ObservedObject var controller: NativeCallController
    @ObservedObject var translation: NativeTranslationModel
    @ObservedObject private var interpreter: NativeInterpreterSession
    @FocusState private var rttFocused: Bool
    @State private var controlsOpen = false
    @State private var keypadOpen = false
    @State private var keypadNotice: String?
    @State private var interpreterOpen = false

    init(controller: NativeCallController, translation: NativeTranslationModel) {
        self.controller = controller
        self.translation = translation
        self.interpreter = controller.interpreter
    }

    var body: some View {
        GeometryReader { geometry in
            if let presentation = controller.presentation {
                let landscape = geometry.size.width > geometry.size.height
                let expandedRtt = presentation.profile.expandsRtt(cameraEnabled: presentation.cameraEnabled,
                    remoteCameraEnabled: presentation.remoteCameraEnabled,
                    interpreterVideo: interpreter.connected || controller.interpreterMedia?.remoteVideo != nil)
                ZStack {
                    if !expandedRtt { videoCanvas(presentation) }
                    VStack(spacing: 0) {
                        header(presentation)
                        if !expandedRtt { Spacer(minLength: 12) }
                        if let media = controller.interpreterMedia {
                            HStack { Spacer(); NativeInterpreterTile(session: interpreter, media: media, width: min(190, geometry.size.width * 0.35)) }
                                .padding(.horizontal, 12)
                        }
                        if presentation.profile.contents.contains("rtt") {
                            rttPanes(presentation, landscape: landscape, expanded: expandedRtt)
                                .padding(.horizontal, landscape ? 16 : 12)
                                .padding(.top, expandedRtt ? 12 : 0)
                                .padding(.bottom, 10)
                        }
                    }
                    if let localVideo = presentation.localVideo, presentation.profile.hasVideo, presentation.cameraEnabled {
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
                    if presentation.profile.hasVideo, presentation.canSwitchCamera, presentation.cameraEnabled {
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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(NativeWebStyle.callBackground)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier(expandedRtt ? "tc-expanded-rtt" : "tc-video-layout")
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
        .sheet(isPresented: $keypadOpen) { callKeypad }
        .sheet(isPresented: $interpreterOpen) { NativeInterpreterCallView(session: interpreter) }
        .onChange(of: controller.presentation?.callID) { _ in keypadOpen = false; keypadNotice = nil }
        #if DEBUG
        .onAppear {
            let environment = ProcessInfo.processInfo.environment
            if environment["TELETYPTEL_NATIVE_UI_FIXTURE"] == "connected",
               environment["TELETYPTEL_NATIVE_CALL_VISUAL_FIXTURE"] == "total",
               environment["TELETYPTEL_NATIVE_CALL_KEYPAD_FIXTURE"] == "disabled" {
                keypadOpen = true
            }
        }
        #endif
    }

    private func translateCurrentText() {
        guard let presentation = controller.presentation else { return }
        translateLive(presentation.remoteText, direction: "peer")
        translateLive(presentation.ownText, direction: "self")
    }

    @ViewBuilder
    private func videoCanvas(_ presentation: NativeCallPresentation) -> some View {
        if let remoteVideo = presentation.remoteVideo, presentation.profile.hasVideo, presentation.remoteCameraEnabled != false {
            NativeVideoSurface(track: remoteVideo)
                .ignoresSafeArea(edges: .bottom)
                .accessibilityLabel("Videobeeld van gesprekspartner")
        } else {
            ZStack {
                NativeWebStyle.callBackground
                VStack(spacing: 12) {
                    Image(systemName: presentation.profile.hasVideo ? "video.slash.fill" : "waveform")
                        .font(.system(size: 42, weight: .semibold))
                    Group {
                        if !presentation.profile.hasVideo { Text("Audiogesprek") }
                        else if presentation.remoteCameraEnabled == false { Text("Camera van gesprekspartner uit") }
                        else { Text("Video wordt verbonden") }
                    }.font(.headline)
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
                Text(controller.holdPending ? "Pauzestatus wordt bevestigd…" : presentation.isHeld ? "Gesprek gepauzeerd · RTT blijft bewaard" : profileName(presentation.profile))
                    .font(.caption)
                    .foregroundStyle(NativeWebStyle.muted)
                    .accessibilityIdentifier("call-hold-status")
            }
            Spacer()
            Button { controller.prepareInterpreter(); interpreterOpen = true } label: { Image(systemName: "person.2.wave.2") }
                .buttonStyle(NativeWebIconStyle(callControl: true)).accessibilityLabel("Gebarentolk oproepen")
                .accessibilityIdentifier("call-interpreter")
            if presentation.profile.contents.contains("rtt") {
                Image(systemName: presentation.rttReady ? "text.bubble.fill" : "text.bubble")
                    .foregroundStyle(presentation.rttReady ? NativeWebStyle.online : NativeWebStyle.warning)
                    .accessibilityLabel(presentation.rttReady ? "Realtime tekst verbonden" : "Realtime tekst wordt verbonden")
            }
            Button { controlsOpen.toggle() } label: { Image(systemName: "slider.horizontal.3") }
                .buttonStyle(NativeWebIconStyle()).accessibilityLabel("Gespreksbediening")
                .popover(isPresented: $controlsOpen, arrowEdge: .top) {
                    controls(presentation).padding(12).background(NativeWebStyle.callMenu)
                        .modifier(NativeWebCompactPopover())
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
    private func rttPanes(_ presentation: NativeCallPresentation, landscape: Bool, expanded: Bool) -> some View {
        if landscape {
            HStack(alignment: .top, spacing: 12) {
                remoteRttPane(presentation, expanded: expanded)
                ownRttPane(presentation, expanded: expanded)
            }
            .frame(maxHeight: expanded ? .infinity : nil)
        } else {
            VStack(spacing: 10) {
                remoteRttPane(presentation, expanded: expanded)
                ownRttPane(presentation, expanded: expanded)
            }
            .frame(maxHeight: expanded ? .infinity : nil)
        }
    }

    private func remoteRttPane(_ presentation: NativeCallPresentation, expanded: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(controller.peerName ?? "Gesprekspartner")
                .font(.caption.bold())
                .foregroundStyle(NativeWebStyle.rttLabel)
            if expanded {
                ScrollViewReader { scroll in
                    rttContent(expanded: true, identifier: "tc-peer-scroll") { remoteRttText(presentation) }
                        .onAppear { scroll.scrollTo("tc-peer-tail", anchor: .bottom) }
                        .onChange(of: presentation.remoteText) { _ in scroll.scrollTo("tc-peer-tail", anchor: .bottom) }
                }
            } else { remoteRttText(presentation) }
        }
        .rttPaneStyle(expanded: expanded)
        .accessibilityIdentifier("tc-peer-pane")
    }

    private func remoteRttText(_ presentation: NativeCallPresentation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(presentation.remoteText.isEmpty ? "…" : presentation.remoteText)
                .font(.title3)
                .foregroundStyle(NativeWebStyle.rttText)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
                .accessibilityLabel("Realtime tekst van gesprekspartner: " +
                                    (presentation.remoteText.isEmpty ? "nog geen tekst" : presentation.remoteText))
            if let result = translation.results[liveKey("peer")], translation.preferences.mode != "off", translation.sharingConsent {
                NativeTranslationCaption(result: result).foregroundStyle(.white)
            }
            Color.clear.frame(height: 1).id("tc-peer-tail").accessibilityHidden(true)
        }
    }

    private func ownRttPane(_ presentation: NativeCallPresentation, expanded: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Ik")
                .font(.caption.bold())
                .foregroundStyle(NativeWebStyle.rttLabel)
            rttContent(expanded: expanded, identifier: "tc-own-scroll") {
                VStack(alignment: .leading, spacing: 6) {
                    TextField("Typ realtime tekst", text: Binding(
                        get: { controller.presentation?.ownText ?? "" },
                        set: controller.setRttText
                    ), prompt: Text("Typ realtime tekst").foregroundColor(NativeWebStyle.rttPlaceholder), axis: .vertical)
                    .lineLimit(expanded ? nil : 5)
                    .frame(minHeight: 44, alignment: .topLeading)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .foregroundStyle(NativeWebStyle.rttText)
                    .tint(NativeWebStyle.link)
                    .focused($rttFocused)
                    .disabled(!presentation.rttReady)
                    .accessibilityLabel("Eigen realtime tekst")
                    .accessibilityHint(presentation.rttReady ? "Tekst wordt direct tijdens het gesprek verzonden" :
                                       "Wacht totdat realtime tekst is verbonden")
                    if let result = translation.results[liveKey("self")], translation.preferences.mode != "off", translation.sharingConsent {
                        NativeTranslationCaption(result: result).foregroundStyle(.white)
                    }
                }
            }
        }
        .rttPaneStyle(expanded: expanded)
        .accessibilityIdentifier("tc-own-pane")
    }

    @ViewBuilder
    private func rttContent<Content: View>(expanded: Bool, identifier: String, @ViewBuilder content: () -> Content) -> some View {
        if expanded {
            ScrollView { content().frame(maxWidth: .infinity, alignment: .topLeading) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .accessibilityIdentifier(identifier)
        } else { content() }
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
            callButton(symbol: controller.holdPending ? "hourglass" : (controller.isHeld ? "play.fill" : "pause.fill"),
                       color: presentation.isHeld ? NativeWebStyle.disabled : NativeWebStyle.enabled,
                       label: controller.isHeld ? "Gesprek hervatten" : "Gesprek pauzeren", action: controller.toggleHeld)
                .disabled(controller.holdPending || !presentation.canHold)
                .accessibilityIdentifier("call-hold")
            callButton(symbol: "circle.grid.3x3.fill", color: presentation.canSendDtmf ? NativeWebStyle.enabled : NativeWebStyle.disabled,
                       label: "Telefoontoetsen tijdens gesprek") { controlsOpen = false; keypadNotice = nil; keypadOpen = true }
                .disabled(!presentation.canSendDtmf)
                .accessibilityIdentifier("call-dtmf-keypad")
            if presentation.profile.contents.contains("rtt") {
                callButton(symbol: "keyboard.fill", color: presentation.rttReady ? NativeWebStyle.enabled : NativeWebStyle.warning,
                           label: "Realtime tekst typen") { rttFocused = true }
                    .disabled(!presentation.rttReady)
            }
        }
        .padding(10)
        .background(NativeWebStyle.callMenu,
                    in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18)
            .stroke(NativeWebStyle.callLine, lineWidth: 1.5))
        .frame(maxWidth: .infinity)
    }

    private var callKeypad: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text("Toetsen voor het verbonden gesprek. Deze toetsen versturen geen chat of RTT-tekst.").font(.caption)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                        ForEach(["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"], id: \.self) { tone in
                            Button {
                                keypadNotice = controller.sendDtmf(tone) ? "Toets verzonden." : "Geen toets verzonden. Controleer het gesprek en de DTMF-ondersteuning."
                            } label: {
                                VStack(spacing: 3) {
                                    Text(tone).font(.title)
                                    Text(NativeDialing.letters[tone] ?? "").font(.caption).accessibilityHidden(true)
                                }.frame(maxWidth: .infinity, minHeight: 58)
                            }
                            .disabled(controller.presentation?.canSendDtmf != true)
                            .buttonStyle(NativeWebTextButtonStyle()).accessibilityLabel("Telefoontoets " + tone)
                            .accessibilityIdentifier("call-dtmf-" + tone)
                        }
                    }
                    if let notice = keypadNotice { Text(notice).font(.caption).accessibilityIdentifier("call-dtmf-status") }
                }.padding(20).frame(maxWidth: 420).frame(maxWidth: .infinity)
            }
            .accessibilityIdentifier("call-dtmf-scroll")
            .navigationTitle("Telefoontoetsen")
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button { keypadOpen = false; keypadNotice = nil } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
                    .accessibilityIdentifier("call-dtmf-close")
            } }
        }
    }

    private func callButton(symbol: String, color: Color, label: String,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
        }
        .buttonStyle(NativeWebCallSymbolStyle(color: color))
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

struct NativeVideoSurface: UIViewRepresentable {
    let track: RTCVideoTrack
    var fit = false

    final class Coordinator {
        var track: RTCVideoTrack?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = fit ? .scaleAspectFit : .scaleAspectFill
        view.clipsToBounds = true
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
        view.videoContentMode = fit ? .scaleAspectFit : .scaleAspectFill
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
    func rttPaneStyle(expanded: Bool) -> some View {
        self
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: expanded ? .infinity : nil, alignment: .topLeading)
            .background(NativeWebStyle.rttBackground, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(NativeWebStyle.callLine, lineWidth: 2))
            .accessibilityElement(children: .contain)
    }
}
