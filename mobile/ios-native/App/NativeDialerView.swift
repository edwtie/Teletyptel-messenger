import SwiftUI

struct NativeDialerView: View {
    @ObservedObject var login: NativeLoginModel
    @ObservedObject var calls: NativeCallController
    @Environment(\.dismiss) private var dismiss
    @State private var number = "600"
    @State private var gateway = ""
    @State private var notice: String?
    private let keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]
    private var route: NativeSIPLabRoute? {
        guard let configuration = login.connectedConfiguration else { return nil }
        return try? NativeSIPLabRoute(configuration: configuration, gateway: gateway, number: number)
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Text("Lokale Asterisk-test").font(.headline)
                    Text("Alleen testextensie 600 (echo), via de door jou gekozen lokale XMPP/SIP-gateway. Geen openbare telefoonnummers, 112 of tolkdienst. De gatewaybeheerder moet jouw XMPP-resource vooraf toestaan.")
                        .font(.caption).fixedSize(horizontal: false, vertical: true)
                    TextField("Gateway-JID inclusief /resource", text: $gateway)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.asciiCapable)
                        .textFieldStyle(.roundedBorder).accessibilityIdentifier("sip-lab-gateway")
                    HStack {
                        Text(number.isEmpty ? "Telefoonnummer" : number).font(.title2).lineLimit(1).minimumScaleFactor(0.6)
                            .accessibilityIdentifier("dialer-number")
                        Spacer()
                        Button { if !number.isEmpty { number.removeLast() } } label: { Image(systemName: "delete.left").frame(width: 48, height: 48) }
                            .accessibilityLabel("Laatste teken wissen").disabled(number.isEmpty)
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 10) {
                        ForEach(keys, id: \.self) { key in
                            NativeDialKey(key: key) { value in if number.count < 40 { number += value } }
                        }
                    }
                    Text("Kort drukken: cijfer. Ingedrukt houden: letter kiezen, loslaten: invoegen. Letters worden bij bellen naar cijfers omgezet; dit is geen DTMF-tekst.").font(.caption)
                    if let converted = NativeDialing.normalized(number), converted != number { Text("Te bellen: " + converted).font(.caption) }
                    if let notice = notice { Text(notice).font(.caption).accessibilityIdentifier("sip-lab-notice") }
                    Button {
                        guard let route = route, login.canSend, !calls.hasLiveCall else { notice = "Controleer de lokale HTTPS-server, gateway-resource en testnummer 600."; return }
                        calls.startCall(route.contact, profile: .total)
                        dismiss()
                    } label: { Image(systemName: "phone.fill").font(.title2).frame(maxWidth: .infinity, minHeight: 52) }
                        .buttonStyle(.borderedProminent).tint(.green).accessibilityLabel("Lokale Asterisk-echo met TC bellen")
                        .accessibilityIdentifier("sip-lab-call").disabled(route == nil || !login.canSend || calls.hasLiveCall)
                }.padding(20).frame(maxWidth: 420).frame(maxWidth: .infinity)
            }
            .nativeWebForm().navigationTitle("Nummerbellen")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Sluiten") } }
        }
    }
}

private struct NativeDialKey: View {
    let key: String
    let selected: (String) -> Void
    @State private var preview: String?
    @State private var pressing = false
    @GestureState private var touching = false
    @State private var task: Task<Void, Never>?
    private var letters: String { NativeDialing.letters[key] ?? "" }
    var body: some View {
        VStack(spacing: 2) {
            Text(preview ?? key).font(.title2)
            Text(letters.isEmpty ? " " : letters).font(.caption2)
        }
        .frame(maxWidth: .infinity, minHeight: 62)
        .background(pressing ? NativeWebStyle.accent.opacity(0.2) : NativeWebStyle.button, in: RoundedRectangle(cornerRadius: 16))
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0).updating($touching) { _, state, _ in state = true }.onChanged { _ in
            guard !pressing else { return }
            pressing = true
            task = Task {
                do { try await Task.sleep(nanoseconds: 450_000_000) } catch { return }
                let choices = letters.map(String.init)
                guard !choices.isEmpty else { return }
                var index = 0
                while !Task.isCancelled {
                    preview = choices[index % choices.count]; index += 1
                    do { try await Task.sleep(nanoseconds: 650_000_000) } catch { return }
                }
            }
        }.onEnded { value in
            task?.cancel(); task = nil
            if abs(value.translation.width) < 35 && abs(value.translation.height) < 35 { selected(preview ?? key) }
            preview = nil; pressing = false
        })
        .accessibilityElement(children: .ignore).accessibilityLabel(key + (letters.isEmpty ? "" : ", " + letters))
        .accessibilityAddTraits(.isButton).accessibilityAction { selected(key) }
        .accessibilityActions { ForEach(letters.map(String.init), id: \.self) { letter in Button(letter) { selected(letter) } } }
        .onChange(of: touching) { active in if !active { task?.cancel(); task = nil; pressing = false; preview = nil } }
        .onDisappear { task?.cancel(); task = nil; pressing = false; preview = nil }
    }
}
