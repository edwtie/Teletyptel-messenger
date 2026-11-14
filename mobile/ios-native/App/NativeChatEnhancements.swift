import SwiftUI

struct NativeMessageFramesKey: PreferenceKey {
    static var defaultValue: [UUID: CGRect] = [:]
    static func reduce(value: inout [UUID: CGRect], nextValue: () -> [UUID: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}

struct NativeMessageTicks: View {
    let message: NativeChatMessage
    var body: some View {
        Group {
            if message.state == .sending { Image(systemName: "clock") }
            else if message.state == .submitted {
                HStack(spacing: -7) {
                    Image(systemName: "checkmark")
                    if message.delivery != .unconfirmed { Image(systemName: "checkmark") }
                }.foregroundStyle(message.delivery == .displayed ? NativeWebStyle.accent : NativeWebStyle.muted)
            } else { Image(systemName: "exclamationmark.circle") }
        }.accessibilityLabel(message.statusLabel).font(.caption2)
    }
}

struct NativeReactionChips: View {
    let reactions: [String: [String]]
    let owner: String?
    let enabled: Bool
    let selected: (String) -> Void
    private var values: [String] { Array(Set(reactions.values.flatMap { $0 })).sorted() }
    var body: some View {
        if !values.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(values, id: \.self) { emoji in
                        let count = reactions.values.filter { $0.contains(emoji) }.count
                        Button { selected(emoji) } label: { Text("\(emoji) \(count)").font(.caption).padding(.horizontal, 9).frame(minHeight: 44) }
                            .buttonStyle(.plain).background(owner.flatMap { reactions[$0] }?.contains(emoji) == true ? NativeWebStyle.button : NativeWebStyle.panel, in: Capsule())
                            .accessibilityLabel("\(emoji), \(count) reacties").disabled(!enabled)
                    }
                }
            }.frame(maxHeight: 44)
        }
    }
}
