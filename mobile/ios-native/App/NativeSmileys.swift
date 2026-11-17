import SwiftUI
import UIKit
import ImageIO

struct NativeSmiley: Decodable, Identifiable {
    struct Alias {
        let code: String
        let smiley: NativeSmiley
    }
    let name: String
    let codes: [String]
    let assetName: String
    let animated: Bool
    var id: String { name }
    static let catalogue: [NativeSmiley] = {
        guard let data = NSDataAsset(name: "WebSmileyCatalogue")?.data,
              let entries = try? JSONDecoder().decode([NativeSmiley].self, from: data) else { return [] }
        return entries
    }()
    static let aliases: [Alias] = {
        var result: [Alias] = []
        for smiley in catalogue {
            for code in smiley.codes { result.append(Alias(code: code, smiley: smiley)) }
        }
        return result.sorted { first, second in
            if first.code.count != second.code.count { return first.code.count > second.code.count }
            return first.code < second.code
        }
    }()
    static func appending(_ code: String, to draft: String) -> String {
        draft + (draft.last.map { $0.isWhitespace ? "" : " " } ?? "") + code + " "
    }
}

@MainActor
enum NativeSmileyImages {
    struct Frames {
        let images: [UIImage]
        let delays: [Double]
        let loops: Int
    }
    private static var cache: [String: Frames] = [:]
    static func frames(_ smiley: NativeSmiley) -> Frames? {
        if let existing = cache[smiley.name] { return existing }
        let result: Frames
        if !smiley.animated {
            guard let image = UIImage(named: smiley.assetName) else { return nil }
            result = Frames(images: [image], delays: [0.1], loops: 1)
        } else {
            guard let data = NSDataAsset(name: smiley.assetName)?.data, data.count <= 1048576,
                  let source = CGImageSourceCreateWithData(data as CFData, nil),
                  CGImageSourceGetCount(source) > 0, CGImageSourceGetCount(source) <= 128 else { return nil }
            var images: [UIImage] = []
            var delays: [Double] = []
            for index in 0..<CGImageSourceGetCount(source) {
                guard let image = CGImageSourceCreateImageAtIndex(source, index, nil), image.width <= 512, image.height <= 512 else { return nil }
                images.append(UIImage(cgImage: image))
                let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
                let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
                let delay = (gif?[kCGImagePropertyGIFUnclampedDelayTime] as? NSNumber)?.doubleValue ??
                    (gif?[kCGImagePropertyGIFDelayTime] as? NSNumber)?.doubleValue ?? 0.1
                delays.append(delay < 0.02 ? 0.1 : delay)
            }
            let properties = CGImageSourceCopyProperties(source, nil) as? [CFString: Any]
            let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
            result = Frames(images: images, delays: delays, loops: (gif?[kCGImagePropertyGIFLoopCount] as? NSNumber)?.intValue ?? 1)
        }
        cache[smiley.name] = result
        return result
    }
    static var validationStatus: String {
        let entries = NativeSmiley.catalogue
        guard !entries.isEmpty else { return "Smileycatalogus ontbreekt" }
        let missing = entries.filter { frames($0) == nil }.map(\.name)
        return missing.isEmpty ? "\(entries.count) smileys beschikbaar" : "Ontbrekend: " + missing.joined(separator: ", ")
    }
}

private struct NativeAnimatedSmiley: UIViewRepresentable {
    let frames: NativeSmileyImages.Frames
    let reduceMotion: Bool
    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.isUserInteractionEnabled = false
        view.contentMode = .scaleAspectFit
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }
    func updateUIView(_ view: UIImageView, context: Context) {
        view.image = frames.images.first
        guard !reduceMotion, frames.images.count > 1 else { view.layer.removeAnimation(forKey: "smiley"); return }
        guard view.layer.animation(forKey: "smiley") == nil else { return }
        let duration = frames.delays.reduce(0, +)
        var elapsed = 0.0
        var times: [NSNumber] = []
        for delay in frames.delays { times.append(NSNumber(value: elapsed / duration)); elapsed += delay }
        times.append(1)
        let animation = CAKeyframeAnimation(keyPath: "contents")
        animation.values = (frames.images + [frames.images.last!]).compactMap(\.cgImage)
        animation.keyTimes = times
        animation.duration = duration
        animation.calculationMode = .discrete
        animation.repeatCount = frames.loops == 0 ? .infinity : Float(frames.loops)
        view.layer.add(animation, forKey: "smiley")
    }
    static func dismantleUIView(_ view: UIImageView, coordinator: ()) { view.layer.removeAnimation(forKey: "smiley") }
}

struct NativeSmileyPicker: View {
    let insert: (String) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    var body: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
                ForEach(NativeSmiley.catalogue) { smiley in
                    Button { if let code = smiley.codes.first { insert(code) } } label: {
                        Group {
                            if let frames = NativeSmileyImages.frames(smiley) {
                                NativeAnimatedSmiley(frames: frames, reduceMotion: reduceMotion)
                                    .frame(width: 32, height: 26).allowsHitTesting(false).accessibilityHidden(true)
                            } else { Text(smiley.codes.first ?? smiley.name) }
                        }.frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(NativeWebStyle.button, in: RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel(smiley.name + ": " + smiley.codes.joined(separator: " / "))
                    .accessibilityIdentifier("smiley-option-" + smiley.name)
                }
            }.padding(8)
        }
        .frame(idealWidth: 320, maxWidth: 320)
        .frame(height: verticalSizeClass == .compact ? 132 : 280)
        .background(NativeWebStyle.panel, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(NativeWebStyle.line, lineWidth: 1))
        .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
        .accessibilityElement(children: .contain).accessibilityLabel("Smiley kiezen")
        .accessibilityIdentifier("smiley-picker")
#if DEBUG
        .accessibilityValue(NativeSmileyImages.validationStatus)
#endif
    }
}

struct NativeSmileyText: View {
    let value: String
    @AppStorage("teletyptel.native.showSmileys") private var showSmileys = true
    var body: some View { rendered.accessibilityLabel(value) }
    private var rendered: Text {
        guard showSmileys else { return Text(verbatim: value) }
        let matches = NativeSmiley.aliases
        var result = Text("")
        var index = value.startIndex
        var plainStart = index
        while index < value.endIndex {
            guard let match = matches.first(where: { value[index...].hasPrefix($0.code) }),
                  let image = NativeSmileyImages.frames(match.smiley)?.images.first else {
                index = value.index(after: index); continue
            }
            result = result + Text(verbatim: String(value[plainStart..<index]))
            let size = CGSize(width: 22, height: 22)
            let scale = min(size.width / max(1, image.size.width), size.height / max(1, image.size.height))
            let fitted = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let rectangle = CGRect(x: (size.width - fitted.width) / 2, y: (size.height - fitted.height) / 2, width: fitted.width, height: fitted.height)
            let inline = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: rectangle) }
            result = result + Text(Image(uiImage: inline).renderingMode(.original)).baselineOffset(-4)
            index = value.index(index, offsetBy: match.code.count)
            plainStart = index
        }
        return result + Text(verbatim: String(value[plainStart...]))
    }
}
