import SwiftUI

struct NativeAppearancePresentation: ViewModifier {
    @AppStorage("teletyptel.native.theme") private var theme = NativeInterfaceTheme.automatic.rawValue
    func body(content: Content) -> some View {
        content.preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
    }
}

struct NativeConversationBackground: View {
    @AppStorage("teletyptel.native.background") private var selection = NativeChatBackground.automatic.rawValue
    var body: some View {
        GeometryReader { geometry in
            let background = NativeChatBackground(rawValue: selection) ?? .automatic
            if let asset = background.asset(wide: geometry.size.width > geometry.size.height) {
                Image(asset).resizable().scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipped()
                    .overlay(NativeWebStyle.backgroundOverlay)
            } else { NativeWebStyle.background }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct NativeAppearanceView: View {
    @AppStorage("teletyptel.native.interfaceLanguage") private var language = "system"
    @AppStorage("teletyptel.native.theme") private var theme = NativeInterfaceTheme.automatic.rawValue
    @AppStorage("teletyptel.native.background") private var background = NativeChatBackground.automatic.rawValue
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Weergave") {
                    Picker("App-taal", selection: $language) {
                        Text("Systeemtaal").tag("system")
                        Text("Nederlands").tag("nl")
                        Text("Engels").tag("en")
                    }.accessibilityIdentifier("interface-language")
                    Text("De app-taal staat los van berichtvertaling; een taal kiezen geeft geen toestemming om berichten extern te vertalen.").font(.caption)
                    Picker("Thema", selection: $theme) {
                        ForEach(NativeInterfaceTheme.allCases, id: \.rawValue) { Text(LocalizedStringKey($0.title)).tag($0.rawValue) }
                    }
                    Picker("Chatachtergrond", selection: $background) {
                        ForEach(NativeChatBackground.allCases, id: \.rawValue) { Text(LocalizedStringKey($0.title)).tag($0.rawValue) }
                    }
                    Text("Deze voorkeuren worden alleen op dit apparaat bewaard. Ze veranderen geen account-, privacy- of vertaalinstellingen.").font(.caption)
                }
                Section("Voorbeeld") {
                    ZStack {
                        NativeConversationBackground()
                        VStack(alignment: .trailing, spacing: 12) {
                            Text("Hallo!").padding(12).background(NativeWebStyle.incoming, in: RoundedRectangle(cornerRadius: 8)).frame(maxWidth: .infinity, alignment: .leading)
                            Text("Welkom bij TeleTypTel").padding(12).background(NativeWebStyle.outgoing, in: RoundedRectangle(cornerRadius: 8))
                        }.padding(20).foregroundStyle(NativeWebStyle.text)
                    }.frame(height: 220).clipped().accessibilityLabel("Voorbeeld van je chatachtergrond")
                }
            }.nativeWebForm().navigationTitle("Weergave")
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten")
                } }
        }.modifier(NativeAppearancePresentation())
    }
}
