import SwiftUI
import CoreLocation

@MainActor
final class NativeLocationRequest: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var coordinate: CLLocation?
    @Published private(set) var busy = false
    @Published private(set) var status: String?
    private var manager: CLLocationManager?
    private var deadline: Task<Void, Never>?

    func request() {
        cancel()
        busy = true
        let manager = CLLocationManager()
        self.manager = manager
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        deadline = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard !Task.isCancelled else { return }
            self?.finish(error: "Geen recente locatie gevonden. Probeer het later opnieuw.")
        }
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        default: finish(error: "Locatietoegang geweigerd. Je kunt dit aanpassen in iOS-instellingen.")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard self.manager === manager, busy else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        case .restricted, .denied: finish(error: "Locatietoegang geweigerd.")
        default: break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard self.manager === manager, busy, let location = locations.last,
              CLLocationCoordinate2DIsValid(location.coordinate), location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= 1000, abs(location.timestamp.timeIntervalSinceNow) <= 60 else { return }
        coordinate = location
        finish(error: nil)
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard self.manager === manager else { return }
        finish(error: "Locatie niet opgehaald. Controleer je toestemming en verbinding.")
    }
    func cancel() { finish(error: nil); coordinate = nil; status = nil }
    private func finish(error: String?) {
        deadline?.cancel(); deadline = nil; busy = false; status = error
        manager?.stopUpdatingLocation(); manager?.delegate = nil; manager = nil
    }
    var message: String? {
        guard let value = coordinate, abs(value.timestamp.timeIntervalSinceNow) <= 60 else { return nil }
        let latitude = String(format: "%.6f", locale: Locale(identifier: "en_US_POSIX"), value.coordinate.latitude)
        let longitude = String(format: "%.6f", locale: Locale(identifier: "en_US_POSIX"), value.coordinate.longitude)
        return "Eenmalige locatie (nauwkeurigheid ±\(Int(value.horizontalAccuracy.rounded())) m):\nhttps://www.openstreetmap.org/?mlat=\(latitude)&mlon=\(longitude)#map=16/\(latitude)/\(longitude)"
    }
}

struct NativeLocationOptions: View {
    let stage: (String) -> Void
    @StateObject private var location = NativeLocationRequest()
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            Text("Haal alleen na toestemming een eenmalige locatie op. De ontvanger krijgt pas een locatie nadat jij het bericht verstuurt. Geen live tracking of noodoproep-locatievoorziening.").font(.caption)
            Button { location.request() } label: { Label("Mijn locatie ophalen", systemImage: "location") }.disabled(location.busy)
            if location.busy { ProgressView("Locatie ophalen…") }
            if let message = location.message {
                Text(message).font(.caption).privacySensitive()
                Button { if let current = location.message { stage(current); location.cancel() } } label: { Label("Locatie in bericht plaatsen", systemImage: "plus.message") }
                Button(role: .destructive) { location.cancel() } label: { Label("Locatie weggooien", systemImage: "trash") }
            }
            if let status = location.status { Text(status).font(.caption) }
        }.onDisappear { location.cancel() }
            .onChange(of: scenePhase) { phase in if phase != .active { location.cancel() } }
    }
}
