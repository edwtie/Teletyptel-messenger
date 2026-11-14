import SwiftUI
import UIKit
import ImageIO

enum NativeWebStyle {
    static func color(_ light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 255) / 255,
                           green: CGFloat((value >> 8) & 255) / 255,
                           blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }
    static let panel = color(0xffffff, dark: 0x1f2937)
    static let background = color(0xeef2f7, dark: 0x111827)
    static let text = color(0x111827, dark: 0xf9fafb)
    static let muted = color(0x53657c, dark: 0xb6c2d1)
    static let line = color(0xc9d4e2, dark: 0x4b5563)
    static let button = color(0xedf4ff, dark: 0x263244)
    static let buttonBorder = color(0x6aa2ff, dark: 0x6aa2ff)
    static let buttonText = color(0x174a8b, dark: 0xdbeafe)
    static let accent = color(0x2563eb, dark: 0x2563eb)
    static let outgoing = color(0xddf8ea, dark: 0x144f3a)
    static let incoming = color(0xf5f7fb, dark: 0x273242)
    static let outgoingLine = color(0x1d8d68, dark: 0x1d8d68)
    static let incomingLine = color(0x3f536d, dark: 0x64748b)
    static let callBackground = Color(red: 0.035, green: 0.067, blue: 0.12)
    static let callLine = Color(red: 0.12, green: 0.32, blue: 0.62)
    static let enabled = Color(red: 0.086, green: 0.639, blue: 0.29)
    static let disabled = Color(red: 0.863, green: 0.149, blue: 0.149)
    static func font(_ size: CGFloat = 16, weight: Font.Weight = .regular) -> Font {
        .custom(weight == .bold ? "Arial-BoldMT" : "ArialMT", size: size, relativeTo: .body)
    }
}

struct NativeWebIconStyle: ButtonStyle {
    var prominent = false
    var destructive = false
    var round = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 22, weight: .regular))
            .frame(minWidth: 44, minHeight: 44)
            .foregroundStyle(destructive ? Color.white : prominent ? Color.white : NativeWebStyle.buttonText)
            .background(destructive ? NativeWebStyle.disabled : prominent ? NativeWebStyle.accent : NativeWebStyle.button,
                        in: RoundedRectangle(cornerRadius: round ? 999 : 6))
            .overlay(RoundedRectangle(cornerRadius: round ? 999 : 6)
                .stroke(round ? Color.clear : destructive ? NativeWebStyle.disabled : NativeWebStyle.buttonBorder, lineWidth: 1))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

struct NativeCachedAvatar: View {
    let name: String
    let jid: String
    @ObservedObject var cache: NativeAvatarCache
    var body: some View { NativeWebAvatar(name: name, profile: cache.profiles[jid]) }
}

struct NativeWebAvatar: View {
    let name: String
    var size: CGFloat = 34
    var profile: NativePublicAvatar? = nil
    @State private var image: UIImage?
    private var avatarColor: Color {
        guard let value = profile?.avatarColor.dropFirst(), let number = UInt32(value, radix: 16) else { return NativeWebStyle.accent }
        return NativeWebStyle.color(number, dark: number)
    }
    var body: some View {
        ZStack {
            if let image = image { Image(uiImage: image).resizable().scaledToFill() }
            else { Text(NativePublicAvatar.initials(profile.flatMap { $0.displayName.isEmpty ? nil : $0.displayName } ?? name))
            .font(NativeWebStyle.font(size > 34 ? 16 : 13, weight: .bold))
            .foregroundStyle(.white) }
        }.frame(width: size, height: size).background(avatarColor, in: Circle()).clipShape(Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.35), lineWidth: 1))
            .accessibilityHidden(true)
            .onAppear { prepareImage() }
            .onChange(of: profile?.imageData) { _ in prepareImage() }
    }
    private func prepareImage() {
        image = nil
        guard let data = profile?.imageData,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              width.doubleValue > 0, height.doubleValue > 0, width.doubleValue * height.doubleValue <= 16000000,
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 192] as CFDictionary) else { return }
        image = UIImage(cgImage: thumbnail)
    }
}

struct NativeWebBubble: Shape {
    let own: Bool
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + 8, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - 8, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + 8), control: CGPoint(x: rect.maxX, y: rect.minY))
        if own {
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + 10))
            path.addLine(to: CGPoint(x: rect.maxX + 8, y: rect.minY + 18))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + 26))
        }
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - 8))
        path.addQuadCurve(to: CGPoint(x: rect.maxX - 8, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + 8, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - 8), control: CGPoint(x: rect.minX, y: rect.maxY))
        if !own {
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 26))
            path.addLine(to: CGPoint(x: rect.minX - 8, y: rect.minY + 18))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 10))
        }
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 8))
        path.addQuadCurve(to: CGPoint(x: rect.minX + 8, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

struct NativeWebForm: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(NativeWebStyle.font())
            .foregroundStyle(NativeWebStyle.text)
            .scrollContentBackground(.hidden)
            .background(NativeWebStyle.panel)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(NativeWebStyle.button, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .tint(NativeWebStyle.accent)
    }
}

struct NativeWebCompactPopover: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) { content.presentationCompactAdaptation(.popover) }
        else { content }
    }
}

extension View {
    func nativeWebForm() -> some View { modifier(NativeWebForm()) }
    func nativeWebComposer() -> some View {
        self
            .font(NativeWebStyle.font())
            .foregroundStyle(NativeWebStyle.text)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(NativeWebStyle.panel, in: RoundedRectangle(cornerRadius: 999))
            .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
    }
}
