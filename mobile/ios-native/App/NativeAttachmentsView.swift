import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import ImageIO
import UIKit
import QuickLook

struct NativeAttachmentButton: View {
    @ObservedObject var login: NativeLoginModel
    let stage: (String) -> Void
    @State private var show = false
    var body: some View {
        Button { show = true } label: { Image(systemName: "plus").frame(width: 40, height: 44) }
            .buttonStyle(NativeWebIconStyle(round: true, composer: true))
            .accessibilityLabel("Bijlage, opname of locatie toevoegen").accessibilityIdentifier("attachment-picker")
            .disabled(!login.canSend || login.activeWebSession == nil)
            .sheet(isPresented: $show) { NativeAttachmentPicker(login: login, stage: stage) }
    }
}

struct NativeAttachmentPicker: View {
    @ObservedObject var login: NativeLoginModel
    let stage: (String) -> Void
    @StateObject private var model = NativeFileTransferModel()
    @State private var selection: NativeUploadSelection?
    @State private var photo: PhotosPickerItem?
    @State private var importFile = false
    @State private var error: String?
    @State private var link: String?
    @State private var task: Task<Void, Never>?
    @Environment(\.dismiss) private var dismiss
    init(login: NativeLoginModel, stage: @escaping (String) -> Void) {
        self._login = ObservedObject(wrappedValue: login)
        self.stage = stage
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Kies een bestand") {
                    #if DEBUG
                    if ProcessInfo.processInfo.environment["TELETYPTEL_NATIVE_UI_FIXTURE"] != nil {
                        Button("Fictieve testbijlage") { selection = try? NativeUploadSelection(name: "test.txt", data: Data("Fictieve testbijlage".utf8)); link = nil }.accessibilityIdentifier("fixture-attachment-selection")
                    }
                    #endif
                    PhotosPicker(selection: $photo, matching: .images) { Label("Foto kiezen", systemImage: "photo") }.disabled(model.progress != nil)
                    Button { importFile = true } label: { Label("Document kiezen", systemImage: "doc") }.disabled(model.progress != nil)
                    Text("Maximaal 20 MB: foto's, PDF, DOC, DOCX, tekst, M4A en MP4. Foto's worden verkleind en zonder oorspronkelijke locatiemetadata als JPEG verstuurd.").font(.caption)
                }
                if let selected = selection {
                    Section("Controleer voor uploaden") {
                        Text(selected.name)
                        Text(ByteCountFormatter.string(fromByteCount: Int64(selected.data.count), countStyle: .file)).font(.caption)
                        Text("De server bewaart dit bestand. Iedereen die de gedeelde link heeft kan het openen; gebruik dit niet voor vertrouwelijke dossiers.").font(.footnote)
                        Button { upload(selected) } label: { Label("Uploaden", systemImage: "arrow.up.doc") }.disabled(model.progress != nil || link != nil).accessibilityIdentifier("attachment-upload")
                    }
                }
                if let progress = model.progress { ProgressView(value: progress).accessibilityLabel("Bestand uploaden") }
                if let status = model.status { Text(status).font(.caption) }
                if let error = error { Text(error).foregroundStyle(NativeWebStyle.danger) }
                if let link = link {
                    Button {
                        guard login.canSend else { return }
                        stage(link); dismiss()
                    } label: { Label("Link in bericht plaatsen", systemImage: "plus.message") }.accessibilityIdentifier("attachment-stage")
                }
                Section("Opnamen") {
                    NativeCaptureOptions { value in selection = value; link = nil; error = nil }
                }.disabled(model.progress != nil)
                Section("Locatie") { NativeLocationOptions { text in stage(text); dismiss() } }
            }
            .nativeWebForm()
            .navigationTitle("Bijlage")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten") } }
        }
        .fileImporter(isPresented: $importFile, allowedContentTypes: [.pdf, .plainText, UTType(filenameExtension: "doc") ?? .data, UTType(filenameExtension: "docx") ?? .data, .jpeg, .png, .mpeg4Movie, .mpeg4Audio], allowsMultipleSelection: false) { result in
            do {
                guard let url = try result.get().first else { return }
                let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= NativeUploadSelection.maximumBytes else { throw NativeAccountFailure.rejected }
                task?.cancel()
                let bytes = try Data(contentsOf: url)
                if ["jpg", "jpeg", "png", "heic"].contains(url.pathExtension.lowercased()) {
                    selection = try NativeUploadSelection(name: "foto.jpg", data: NativePhotoPreparation.jpeg(bytes))
                } else { selection = try NativeUploadSelection(name: url.lastPathComponent, data: bytes) }
                link = nil; error = nil
            } catch { self.error = "Bestand niet geselecteerd. Controleer type en grootte." }
        }
        .onChange(of: photo) { item in
            task?.cancel()
            task = Task {
                do {
                    guard let bytes = try await item?.loadTransferable(type: Data.self), !Task.isCancelled else { throw NativeAccountFailure.rejected }
                    selection = try NativeUploadSelection(name: "foto.jpg", data: NativePhotoPreparation.jpeg(bytes)); link = nil; error = nil
                } catch { if !Task.isCancelled { self.error = "Foto niet geladen. Kies een kleinere foto." } }
            }
        }
        .onChange(of: login.canSend) { available in if !available { task?.cancel(); model.cancel(); selection = nil; link = nil; dismiss() } }
        .onDisappear { task?.cancel(); model.cancel(); selection = nil; link = nil }
    }
    private func upload(_ selected: NativeUploadSelection) {
        guard let session = login.activeWebSession, let account = login.activeAccountID else { return }
        task?.cancel()
        task = Task {
            let value = await model.upload(selected, session: session, accountID: account)
            guard !Task.isCancelled, login.canSend, login.activeAccountID == account else { return }
            link = value
        }
    }
}

enum NativePhotoPreparation {
    static func jpeg(_ bytes: Data) throws -> Data {
        guard bytes.count <= NativeUploadSelection.maximumBytes,
              let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber, let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              width.doubleValue > 0, height.doubleValue > 0, width.doubleValue * height.doubleValue <= 64000000,
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 2048] as CFDictionary),
              let result = UIImage(cgImage: image).jpegData(compressionQuality: 0.85) else { throw NativeAccountFailure.rejected }
        return result
    }
}

struct NativeDownloadDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data] }
    var bytes: Data
    init(bytes: Data) { self.bytes = bytes }
    init(configuration: ReadConfiguration) throws { bytes = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: bytes) }
}

struct NativeFileMessageButton: View {
    let bodyText: String
    let session: NativeAccountWebSession?
    @State private var document: NativeDownloadDocument?
    @State private var exporting = false
    @State private var busy = false
    @State private var error: String?
    @State private var task: Task<Void, Never>?
    @State private var previewURL: URL?
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var exclusion = NativeCaptureExclusion.shared
    var body: some View {
        VStack(alignment: .leading) {
            if let session = session, let reference = NativeFileReference.inMessage(bodyText, configuration: session.configuration) {
                Button {
                    busy = true; error = nil
                    task = Task {
                        defer { busy = false }
                        do {
                            let bytes = try await session.downloadFile(reference)
                            guard !Task.isCancelled, !exclusion.callActive else { return }
                            let extensionName = try NativeReceivedFilePreview.fileExtension(bytes)
                            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + extensionName)
                            guard FileManager.default.createFile(atPath: url.path, contents: bytes, attributes: [.protectionKey: FileProtectionType.complete]) else { throw NativeAccountFailure.rejected }
                            clearPreview(); previewURL = url
                        } catch { if !Task.isCancelled { self.error = "Voorbeeld niet beschikbaar. Gebruik Bestand opslaan om dit bestand zelf te openen." } }
                    }
                } label: { Label("Bijlage bekijken of afspelen", systemImage: "play.rectangle") }.disabled(busy || exclusion.callActive)
                Button {
                    busy = true; error = nil
                    task = Task {
                        defer { busy = false }
                        do {
                            let bytes = try await session.downloadFile(reference)
                            guard !Task.isCancelled else { return }
                            document = NativeDownloadDocument(bytes: bytes); exporting = true
                        } catch { if !Task.isCancelled { self.error = "Download niet beschikbaar of groter dan 20 MB." } }
                    }
                } label: { Label(busy ? "Downloaden…" : "Bestand opslaan", systemImage: "arrow.down.doc") }.disabled(busy)
                if let error = error { Text(error).font(.caption) }
            }
        }
        .fileExporter(isPresented: $exporting, document: document, contentType: .data, defaultFilename: filename) { _ in document = nil }
        .sheet(isPresented: Binding(get: { previewURL != nil }, set: { if !$0 { clearPreview() } }), onDismiss: clearPreview) {
            if let url = previewURL { NativeReceivedFilePreview(url: url).ignoresSafeArea() }
        }
        .onChange(of: exclusion.callActive) { active in if active { task?.cancel(); clearPreview() } }
        .onChange(of: scenePhase) { phase in if phase == .background { task?.cancel(); clearPreview() } }
        .onDisappear { task?.cancel(); document = nil; clearPreview() }
    }
    private func clearPreview() {
        if let url = previewURL { try? FileManager.default.removeItem(at: url) }
        previewURL = nil
    }
    private var filename: String {
        let first = bodyText.components(separatedBy: "\n").first ?? "bestand"
        let proposed = first.replacingOccurrences(of: "Bestand: ", with: "").replacingOccurrences(of: "Shared file: ", with: "")
        return String((proposed as NSString).lastPathComponent.prefix(160)).replacingOccurrences(of: ":", with: "-")
    }
}

private struct NativeReceivedFilePreview: UIViewControllerRepresentable {
    let url: URL
    static func fileExtension(_ bytes: Data) throws -> String {
        guard !bytes.isEmpty, bytes.count <= NativeUploadSelection.maximumBytes else { throw NativeAccountFailure.rejected }
        if bytes.starts(with: Data("%PDF-".utf8)) { return "pdf" }
        if bytes.starts(with: [0xff, 0xd8, 0xff]) { return "jpg" }
        if bytes.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) { return "png" }
        if bytes.count >= 16, bytes[4..<8] == Data("ftyp".utf8) {
            let brand = String(data: bytes[8..<12], encoding: .ascii)
            guard let brand = brand, ["M4A ", "M4B ", "M4V ", "isom", "iso2", "mp41", "mp42", "avc1"].contains(brand) else { throw NativeAccountFailure.rejected }
            return ["M4A ", "M4B "].contains(brand) ? "m4a" : "mp4"
        }
        throw NativeAccountFailure.rejected
    }
    func makeCoordinator() -> Coordinator { Coordinator(url) }
    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(_ url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    }
}
