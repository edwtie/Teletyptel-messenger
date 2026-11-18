import SwiftUI

private struct NativeMessageMenuAnchorFrame: PreferenceKey {
    static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

@MainActor
private final class NativeMessageMenuPresentation: ObservableObject {
    @Published var isPresented = false
    private var pendingAction: Task<Void, Never>?

    func toggle() {
        pendingAction?.cancel()
        pendingAction = nil
        isPresented.toggle()
    }

    func perform(_ action: @escaping @MainActor () -> Void) {
        isPresented = false
        pendingAction?.cancel()
        pendingAction = Task { @MainActor in
            do { try await Task.sleep(nanoseconds: 250_000_000) } catch { return }
            guard !Task.isCancelled else { return }
            pendingAction = nil
            action()
        }
    }

    func cancel() {
        pendingAction?.cancel()
        pendingAction = nil
        isPresented = false
    }
}

private struct NativeMessageMenuPresentationKey: EnvironmentKey {
    static let defaultValue: NativeMessageMenuPresentation? = nil
}

private extension EnvironmentValues {
    var nativeMessageMenuPresentation: NativeMessageMenuPresentation? {
        get { self[NativeMessageMenuPresentationKey.self] }
        set { self[NativeMessageMenuPresentationKey.self] = newValue }
    }
}

struct NativeMessageActionButton<Content: View>: View {
    var role: ButtonRole? = nil
    let action: @MainActor () -> Void
    @ViewBuilder var label: () -> Content
    @Environment(\.nativeMessageMenuPresentation) private var presentation

    @ViewBuilder
    var body: some View {
        if presentation != nil { actionButton.buttonStyle(NativeWebMenuRowStyle(destructive: role == .destructive)) }
        else { actionButton }
    }

    private var actionButton: some View {
        Button(role: role) {
            if let presentation = presentation { presentation.perform(action) }
            else { action() }
        } label: { label() }
    }
}

struct NativeMessageMenu<Content: View>: View {
    let identifier: String
    var onPresentationChange: (Bool) -> Void = { _ in }
    @ViewBuilder var content: () -> Content
    @StateObject private var presentation = NativeMessageMenuPresentation()
    @State private var anchorFrame: CGRect = .zero
    @Environment(\.nativeConversationViewportFrame) private var viewportFrame
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.scenePhase) private var scenePhase

    private var arrowEdge: Edge {
        NativeMessageMenuPlacement.prefersAbove(anchorMinimumY: Double(anchorFrame.minY), anchorMaximumY: Double(anchorFrame.maxY),
            viewportMinimumY: Double(viewportFrame.minY), viewportMaximumY: Double(viewportFrame.maxY)) ? .bottom : .top
    }

    var body: some View {
        Button { presentation.toggle() } label: {
            Image(systemName: "ellipsis").frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).foregroundStyle(NativeWebStyle.muted)
        .frame(width: 44, height: 44).contentShape(Rectangle())
        .background {
            GeometryReader { geometry in
                Color.clear.preference(key: NativeMessageMenuAnchorFrame.self, value: geometry.frame(in: .global))
            }.allowsHitTesting(false).accessibilityHidden(true)
        }
        .onPreferenceChange(NativeMessageMenuAnchorFrame.self) { anchorFrame = $0 }
        .accessibilityLabel("Berichtmenu").accessibilityIdentifier(identifier)
        .accessibilityValue(Text(LocalizedStringKey(presentation.isPresented ? "Geopend" : "Gesloten")))
        .popover(isPresented: $presentation.isPresented, arrowEdge: arrowEdge) {
            VStack(spacing: 0) {
                HStack {
                    Text("Berichtmenu").font(NativeWebStyle.font(14, weight: .bold))
                    Spacer()
                    Button { presentation.cancel() } label: {
                        Image(systemName: "xmark").frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain).accessibilityLabel("Berichtmenu sluiten")
                    .accessibilityIdentifier(identifier + "-close")
                }.padding(.horizontal, 10)
                ScrollView {
                    VStack(spacing: 4) { content() }
                        .buttonStyle(NativeWebMenuRowStyle())
                        .padding(.horizontal, 8).padding(.bottom, 8)
                }
            }
            .frame(width: 240, height: verticalSizeClass == .compact ? 224 : 360)
            .background(NativeWebStyle.panel).foregroundStyle(NativeWebStyle.text)
            .environment(\.nativeMessageMenuPresentation, presentation)
            .accessibilityElement(children: .contain).accessibilityIdentifier(identifier + "-panel")
            .modifier(NativeWebCompactPopover())
        }
        .onChange(of: presentation.isPresented, perform: onPresentationChange)
        .onChange(of: scenePhase) { if $0 != .active { presentation.cancel() } }
        .onDisappear { presentation.cancel(); onPresentationChange(false) }
    }
}
