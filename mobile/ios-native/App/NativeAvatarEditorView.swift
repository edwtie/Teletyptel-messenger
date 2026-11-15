import SwiftUI
import UIKit
import PhotosUI
import CoreTransferable
import UniformTypeIdentifiers
import ImageIO

private struct NativeSelectedAvatarPhoto: Transferable {
    let bytes: Data
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            let handle = try FileHandle(forReadingFrom: received.file)
            defer { try? handle.close() }
            guard let data = try handle.read(upToCount: 20 * 1024 * 1024 + 1), !data.isEmpty, data.count <= 20 * 1024 * 1024 else { throw NativeAccountFailure.rejected }
            return Self(bytes: data)
        }
    }
    func thumbnail() -> UIImage? {
        guard let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber, let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              width.doubleValue > 0, height.doubleValue > 0, width.doubleValue * height.doubleValue <= 64_000_000,
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 1024] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}

struct NativeAvatarEditorView: View {
    @ObservedObject var login: NativeLoginModel
    let onSaved: () -> Void
    @StateObject private var model = NativeAvatarEditor()
    @State private var photo: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var zoom = 1.0
    @State private var offset = CGSize.zero
    @State private var dragStart = CGSize.zero
    @State private var error: String?
    @State private var deleting = false
    @State private var loading = false
    @State private var loadTask: Task<Void, Never>?
    @State private var saveTask: Task<Void, Never>?
    @Environment(\.dismiss) private var dismiss
    private let edge: CGFloat = 256
    private var scale: CGFloat { guard let image = image else { return 1 }; return max(edge / image.size.width, edge / image.size.height) * zoom }
    var body: some View {
        NavigationStack {
            Form {
                Section("Profielfoto") {
                    if let profile = model.profile { NativeWebAvatar(name: profile.displayName, size: 80, profile: profile).frame(maxWidth: .infinity) }
                    PhotosPicker(selection: $photo, matching: .images) { Label("Foto kiezen", systemImage: "photo") }
                        .disabled(model.busy || loading || model.profile == nil)
                    Text("Je kiest zelf één foto. Pas na Opslaan wordt een vierkante JPEG van 256 × 256 pixels verstuurd, zonder de oorspronkelijke foto- of locatiemetadata. De profielfoto is zichtbaar voor andere gebruikers.").font(.caption)
                }
                if let image = image {
                    Section("Uitsnede") {
                        ZStack {
                            Image(uiImage: image).resizable().frame(width: image.size.width * scale, height: image.size.height * scale).offset(offset)
                        }
                        .frame(width: edge, height: edge).clipped().contentShape(Rectangle())
                        .gesture(DragGesture().onChanged { value in offset = clamped(CGSize(width: dragStart.width + value.translation.width, height: dragStart.height + value.translation.height)) }
                            .onEnded { _ in dragStart = offset })
                        .frame(maxWidth: .infinity).accessibilityLabel("Voorbeeld van je profielfoto")
                        Slider(value: $zoom, in: 1...3).accessibilityLabel("Inzoomen")
                            .onChange(of: zoom) { _ in offset = clamped(offset); dragStart = offset }
                        HStack {
                            cropButton("arrow.left", "Foto naar links", CGSize(width: -16, height: 0))
                            cropButton("arrow.right", "Foto naar rechts", CGSize(width: 16, height: 0))
                            cropButton("arrow.up", "Foto omhoog", CGSize(width: 0, height: -16))
                            cropButton("arrow.down", "Foto omlaag", CGSize(width: 0, height: 16))
                            Button { zoom = 1; offset = .zero; dragStart = .zero } label: { Image(systemName: "arrow.counterclockwise").frame(width: 44, height: 44) }.accessibilityLabel("Uitsnede herstellen")
                        }
                        Button { save(cropped()) } label: { Label("Profielfoto opslaan", systemImage: "checkmark") }.disabled(model.busy || loading)
                    }
                }
                if model.busy || loading { ProgressView("Foto verwerken…") }
                if let error = error { Text(error).foregroundStyle(.red) }
                if let notice = model.notice { Text(notice) }
                if model.profile?.avatarDataUrl.isEmpty == false {
                    Button(role: .destructive) { deleting = true } label: { Label("Profielfoto verwijderen", systemImage: "trash") }.disabled(model.busy || loading)
                }
            }.nativeWebForm().navigationTitle("Profielfoto")
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
                } }
        }
        .task { await model.configure(session: login.activeWebSession, account: login.activeAccountID, owner: login.currentOwner) }
        .onChange(of: photo) { selected in
            loadTask?.cancel(); loading = true; error = nil
            loadTask = Task {
                defer { if !Task.isCancelled { loading = false } }
                do {
                    guard let selected = selected, let value = try await selected.loadTransferable(type: NativeSelectedAvatarPhoto.self) else { return }
                    guard !Task.isCancelled else { return }
                    guard let decoded = value.thumbnail() else { error = "Deze foto kan niet veilig worden verwerkt."; return }
                    image = decoded; zoom = 1; offset = .zero; dragStart = .zero
                } catch { if !Task.isCancelled { self.error = "Foto niet geladen. Kies een andere foto van maximaal 20 MB." } }
            }
        }
        .confirmationDialog("Profielfoto verwijderen?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Verwijderen", role: .destructive) { save("") }
            Button("Annuleren", role: .cancel) {}
        }
        .onDisappear { loadTask?.cancel(); saveTask?.cancel(); model.detach(); image = nil }
        .onChange(of: login.phase) { _ in if !login.canSend { loadTask?.cancel(); saveTask?.cancel(); model.detach(); dismiss() } }
    }
    private func clamped(_ proposed: CGSize) -> CGSize {
        guard let image = image else { return .zero }
        let horizontal = max(0, (image.size.width * scale - edge) / 2), vertical = max(0, (image.size.height * scale - edge) / 2)
        return CGSize(width: min(horizontal, max(-horizontal, proposed.width)), height: min(vertical, max(-vertical, proposed.height)))
    }
    private func cropButton(_ symbol: String, _ title: String, _ step: CGSize) -> some View {
        Button { offset = clamped(CGSize(width: offset.width + step.width, height: offset.height + step.height)); dragStart = offset } label: {
            Image(systemName: symbol).frame(width: 44, height: 44)
        }.accessibilityLabel(title)
    }
    private func cropped() -> String? {
        guard let image = image else { return nil }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let result = UIGraphicsImageRenderer(size: CGSize(width: edge, height: edge), format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: edge, height: edge))
            image.draw(in: CGRect(x: (edge - image.size.width * scale) / 2 + offset.width, y: (edge - image.size.height * scale) / 2 + offset.height,
                                  width: image.size.width * scale, height: image.size.height * scale))
        }
        guard let data = result.jpegData(compressionQuality: 0.86), data.count <= 393216 else { return nil }
        return "data:image/jpeg;base64," + data.base64EncodedString()
    }
    private func save(_ value: String?) {
        guard let value = value else { error = "Uitsnede niet beschikbaar."; return }
        saveTask = Task { if await model.save(value) { onSaved(); dismiss() } }
    }
}
