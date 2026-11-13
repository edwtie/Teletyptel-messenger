import Foundation

@MainActor
protocol NativeActivePeerNegotiating: NativePeerNegotiating {
    var sid: String { get }
    func receive(_ request: NativeJingleRequest) async
    func cancel(notifyPeer: Bool)
}
