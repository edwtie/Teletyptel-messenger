import SwiftUI
import UIKit
import ImageIO

struct NativeInlineMessage<Content: View, Metadata: View>: View {
    @ViewBuilder var content: Content
    @ViewBuilder var metadata: Metadata

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                content.fixedSize(horizontal: true, vertical: true)
                metadata.fixedSize()
            }.fixedSize(horizontal: true, vertical: true)
            VStack(alignment: .trailing, spacing: 4) {
                content.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                metadata.fixedSize()
            }
        }
    }
}
enum NativeWebStyle {
    static func color(_ light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 255) / 255,
                           green: CGFloat((value >> 8) & 255) / 255,
                           blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }
    static let panel = Color("WebPanel")
    static let background = Color("WebBackground")
    static let panelStrong = Color("WebPanelStrong")
    static let header = Color("WebHeader")
    static let text = Color("WebText")
    static let muted = Color("WebMuted")
    static let line = Color("WebLine")
    static let input = Color("WebInput")
    static let button = Color("WebButton")
    static let buttonBorder = Color("WebButtonBorder")
    static let buttonText = Color("WebButtonText")
    static let accent = Color("WebAccent")
    static let link = Color("WebLink")
    static let outgoing = Color("WebOutgoing")
    static let incoming = Color("WebIncoming")
    static let outgoingLine = Color("WebOutgoingLine")
    static let incomingLine = Color("WebIncomingLine")
    static let selection = Color("WebSelection")
    static let selectionText = Color("WebSelectionText")
    static let selectionBorder = Color("WebSelectionBorder")
    static let composer = Color("WebComposer")
    static let composerButton = Color("WebComposerButton")
    static let composerButtonText = Color("WebComposerButtonText")
    static let composerSend = Color("WebComposerSend")
    static let composerSendText = Color("WebComposerSendText")
    static let backgroundOverlay = Color("WebBackgroundOverlay")
    static let totalConversation = Color("WebTotalConversation")
    static let totalDisabled = Color("WebTotalDisabled")
    static let totalDisabledText = Color("WebTotalDisabledText")
    static let callButton = Color("WebCallButton")
    static let callButtonText = Color("WebCallButtonText")
    static let callBackground = Color("WebCallBackground")
    static let callLine = Color("WebCallLine")
    static let callMenu = Color("WebCallMenu")
    static let rttBackground = Color("WebRttBackground")
    static let rttLabel = Color("WebRttLabel")
    static let rttText = Color("WebRttText")
    static let rttPlaceholder = Color("WebRttPlaceholder")
    static let enabled = Color("WebEnabled")
    static let disabled = Color("WebDisabled")
    static let enabledLine = Color("WebEnabledLine")
    static let disabledLine = Color("WebDisabledLine")
    static let unavailableCall = Color("WebUnavailableCall")
    static let unavailableCallLine = Color("WebUnavailableCallLine")
    static let warning = Color("WebWarning")
    static let danger = Color("WebDanger")
    static let online = Color("WebOnline")
    static let offline = Color("WebOffline")
    static let groupPresence = Color("WebGroupPresence")
    static let receipt = Color("WebReceipt")
    static let receiptRead = Color("WebReceiptRead")
    static let dateBackground = Color("WebDateBackground")
    static let dateText = Color("WebDateText")
    static let dateLine = Color("WebDateLine")
    static let logout = Color("WebLogout")
    static let logoutText = Color("WebLogoutText")
    static let logoutLine = Color("WebLogoutLine")
    static func font(_ size: CGFloat = 16, weight: Font.Weight = .regular) -> Font {
        .custom(weight == .bold ? "Arial-BoldMT" : "ArialMT", size: size, relativeTo: .body)
    }
}

#if DEBUG
extension NativeWebStyle {
    static var paletteValidationStatus: String {
        guard let data = NSDataAsset(name: "WebPaletteReference")?.data,
              let reference = (try? JSONSerialization.jsonObject(with: data)) as? [String: [String: [Double]]] else {
            return "Missing web palette reference"
        }
        for (role, themes) in reference.sorted(by: { $0.key < $1.key }) {
            let name = "Web" + role.prefix(1).uppercased() + role.dropFirst()
            for (theme, expected) in themes {
                let traits = UITraitCollection(userInterfaceStyle: theme == "dark" ? .dark : .light)
                guard let color = UIColor(named: name, in: .main, compatibleWith: traits)?.resolvedColor(with: traits) else {
                    return "Missing colour " + name + " " + theme
                }
                var red: CGFloat = 0
                var green: CGFloat = 0
                var blue: CGFloat = 0
                var alpha: CGFloat = 0
                guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha), expected.count == 4 else {
                    return "Invalid colour " + name + " " + theme
                }
                let actual = [red, green, blue, alpha].map(Double.init)
                if zip(actual, expected).contains(where: { abs($0 - $1) > 0.002 }) {
                    return "Incorrect RGBA " + name + " " + theme + ": " + actual.description
                }
            }
        }
        return "Web palette verified"
    }
}
#endif

struct NativeStartupProgress: View {
    let isActive: Bool
    var identifier = "startup-progress"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if isActive {
                GeometryReader { geometry in
                TimelineView(.animation(minimumInterval: 0.05, paused: reduceMotion)) { context in
                    let width = max(1, geometry.size.width * 0.28)
                    let phase = reduceMotion ? 0.5 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.6) / 1.6
                    ZStack(alignment: .leading) {
                        NativeWebStyle.button
                        Capsule().fill(NativeWebStyle.accent).frame(width: width)
                            .offset(x: CGFloat(phase) * (geometry.size.width + width) - width)
                    }
                }
                }
                .frame(height: 4).clipped().allowsHitTesting(false)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Voortgang opstarten").accessibilityValue(Text("Bezig"))
                .accessibilityIdentifier(identifier)
            } else {
                NativeWebStyle.line.frame(height: 1).frame(height: 4)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
    }
}

struct NativeConversationHeader<Actions: View>: View {
    let title: String
    let subtitle: String
    var avatarName: String? = nil
    var profile: NativePublicAvatar? = nil
    let identifier: String
    var identityLabel: String? = nil
    let back: () -> Void
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        HStack(spacing: 8) {
            Button(action: back) { Image(systemName: "arrow.left") }
                .buttonStyle(NativeWebIconStyle())
                .accessibilityLabel("Terug naar contacten")
                .accessibilityIdentifier(identifier + "-back")
            HStack(spacing: 8) {
                NativeWebAvatar(name: avatarName ?? title, size: 30, profile: profile)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(NativeWebStyle.font(16, weight: .bold)).lineLimit(1).truncationMode(.tail)
                    Text(LocalizedStringKey(subtitle)).font(NativeWebStyle.font(12))
                        .foregroundStyle(NativeWebStyle.muted).lineLimit(1).truncationMode(.tail)
                }.frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            }
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading).clipped()
            .accessibilityElement(children: .combine)
            .accessibilityLabel(identityLabel ?? title + " · " + subtitle)
            .accessibilityIdentifier(identifier + "-connection")
            HStack(spacing: 8, content: actions).fixedSize(horizontal: true, vertical: false)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 60)
        .background(NativeWebStyle.header).foregroundStyle(NativeWebStyle.text)
        .overlay(alignment: .bottom) { NativeWebStyle.line.frame(height: 1).allowsHitTesting(false) }
        .accessibilityElement(children: .contain).accessibilityIdentifier(identifier + "-header")
    }
}

struct NativeWebTextButtonStyle: ButtonStyle {
    var prominent = false
    var positive = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(NativeWebStyle.font())
            .padding(.horizontal, 12).padding(.vertical, 6)
            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            .foregroundStyle(prominent ? Color.white : NativeWebStyle.buttonText)
            .background(prominent ? (positive ? NativeWebStyle.enabled : NativeWebStyle.accent) : NativeWebStyle.button,
                        in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(positive ? NativeWebStyle.enabledLine : NativeWebStyle.buttonBorder, lineWidth: 1))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
    }
}

struct NativeWebIconStyle: ButtonStyle {
    var prominent = false
    var destructive = false
    var round = false
    var composer = false
    var callControl = false
    var logout = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 22, weight: .regular))
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .foregroundStyle(logout ? NativeWebStyle.logoutText : destructive ? Color.white :
                composer ? (prominent ? NativeWebStyle.composerSendText : NativeWebStyle.composerButtonText) :
                prominent ? Color.white : callControl ? NativeWebStyle.callButtonText : NativeWebStyle.buttonText)
            .background(logout ? NativeWebStyle.logout : destructive ? NativeWebStyle.disabled :
                composer ? (prominent ? NativeWebStyle.composerSend : NativeWebStyle.composerButton) :
                prominent ? NativeWebStyle.accent : callControl ? NativeWebStyle.callButton : NativeWebStyle.button,
                        in: RoundedRectangle(cornerRadius: round ? 999 : 6))
            .overlay(RoundedRectangle(cornerRadius: round ? 999 : 6)
                .strokeBorder(round ? Color.clear : logout ? NativeWebStyle.logoutLine : destructive ? NativeWebStyle.disabledLine : NativeWebStyle.buttonBorder, lineWidth: 1))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

struct NativeWebMenuTileStyle: ButtonStyle {
    var destructive = false
    var selected = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 22))
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
            .foregroundStyle(destructive ? NativeWebStyle.logoutText : selected ? Color.white : NativeWebStyle.buttonText)
            .background(destructive ? NativeWebStyle.logout : selected ? NativeWebStyle.accent : NativeWebStyle.button, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(destructive ? NativeWebStyle.logoutLine : NativeWebStyle.buttonBorder, lineWidth: 1))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

struct NativeWebMenuRowStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(NativeWebStyle.font())
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.horizontal, 10).contentShape(Rectangle())
            .foregroundStyle(NativeWebStyle.buttonText)
            .background(NativeWebStyle.button, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(NativeWebStyle.buttonBorder, lineWidth: 1))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

struct NativeTotalConversationButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.frame(minWidth: 44, minHeight: 44)
            .foregroundStyle(enabled ? Color.white : NativeWebStyle.totalDisabledText)
            .background(enabled ? NativeWebStyle.totalConversation : NativeWebStyle.totalDisabled, in: RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.12), radius: 4, y: 2)
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

struct NativeWebCallSymbolStyle: ButtonStyle {
    let color: Color
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 24, weight: .semibold))
            .foregroundStyle(.white).frame(width: 48, height: 48)
            .background(enabled ? color : NativeWebStyle.unavailableCall, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(enabled ? (color == NativeWebStyle.enabled ? NativeWebStyle.enabledLine : color == NativeWebStyle.disabled ? NativeWebStyle.disabledLine : NativeWebStyle.buttonBorder) : NativeWebStyle.unavailableCallLine, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

struct NativeCachedAvatar: View {
    let name: String
    let jid: String
    @ObservedObject var cache: NativeAvatarCache
    var size: CGFloat = 34
    var body: some View { NativeWebAvatar(name: name, size: size, profile: cache.profiles[jid]) }
}

struct NativeWebAvatar: View {
    let name: String
    var size: CGFloat = 34
    var profile: NativePublicAvatar? = nil
    private var image: UIImage? { NativeAvatarImages.decode(profile?.imageData) }
    private var avatarColor: Color {
        guard let value = profile?.avatarColor.dropFirst(), let number = UInt32(value, radix: 16) else { return NativeWebStyle.accent }
        return NativeWebStyle.color(number, dark: number)
    }
    var body: some View {
        ZStack {
            if let image = image { Image(uiImage: image).renderingMode(.original).resizable().scaledToFill() }
            else { Text(NativePublicAvatar.initials(profile.flatMap { $0.displayName.isEmpty ? nil : $0.displayName } ?? name))
            .font(NativeWebStyle.font(size > 34 ? 16 : 13, weight: .bold))
            .foregroundStyle(.white) }
        }.frame(width: size, height: size).background(avatarColor, in: Circle()).clipShape(Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.35), lineWidth: 1))
            .accessibilityHidden(true)
    }
}

@MainActor
enum NativeAvatarImages {
    private static let cache: NSCache<NSData, UIImage> = {
        let cache = NSCache<NSData, UIImage>()
        cache.countLimit = 128; cache.totalCostLimit = 16 * 1024 * 1024
        return cache
    }()
    static func clear() { cache.removeAllObjects() }
    static func decode(_ data: Data?) -> UIImage? {
        guard let data = data else { return nil }
        if let cached = cache.object(forKey: data as NSData) { return cached }
        guard
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              width.doubleValue > 0, height.doubleValue > 0, width.doubleValue * height.doubleValue <= 16000000,
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 192] as CFDictionary) else { return nil }
        let image = UIImage(cgImage: thumbnail)
        cache.setObject(image, forKey: data as NSData, cost: thumbnail.bytesPerRow * thumbnail.height + data.count)
        return image
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
            .buttonStyle(NativeWebTextButtonStyle())
            .foregroundStyle(NativeWebStyle.text)
            .scrollContentBackground(.hidden)
            .background(NativeWebStyle.panel)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(NativeWebStyle.panelStrong, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .tint(NativeWebStyle.accent)
    }
}

enum NativeWebDateBreaks {
    static func starts(in messages: [(UUID, Date)], calendar: Calendar = .current) -> Set<UUID> {
        var previous: Date?
        var result = Set<UUID>()
        for (identifier, date) in messages {
            if previous.map({ !calendar.isDate($0, inSameDayAs: date) }) ?? true { result.insert(identifier) }
            previous = date
        }
        return result
    }
}

struct NativeWebDateSeparator: View {
    let date: Date
    var body: some View {
        Group {
            if Calendar.current.isDateInToday(date) { Text("Vandaag") }
            else if Calendar.current.isDateInYesterday(date) { Text("Gisteren") }
            else { Text(date, format: .dateTime.day().month().year()) }
        }
        .font(NativeWebStyle.font(12, weight: .bold)).foregroundStyle(NativeWebStyle.dateText)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(NativeWebStyle.dateBackground, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(NativeWebStyle.dateLine, lineWidth: 1))
        .frame(maxWidth: .infinity).padding(.vertical, 8).accessibilityAddTraits(.isHeader)
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
            .background(NativeWebStyle.composer, in: RoundedRectangle(cornerRadius: 999))
            .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
    }

    func nativeWebField() -> some View {
        self.textFieldStyle(.plain).font(NativeWebStyle.font())
            .padding(.horizontal, 10).padding(.vertical, 10)
            .foregroundStyle(NativeWebStyle.text)
            .background(NativeWebStyle.input, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(NativeWebStyle.line, lineWidth: 1).allowsHitTesting(false))
    }
}
