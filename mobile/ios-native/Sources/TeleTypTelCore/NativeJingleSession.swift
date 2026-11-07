import Foundation

@MainActor
protocol NativeMediaNegotiating: AnyObject {
    func createOffer() async throws -> NativeJingleMedia
    func acceptOffer(_ xml: String) async throws -> NativeJingleMedia
    func applyAnswer(_ xml: String) async throws
    func close()
}

@MainActor
final class NativeJingleSession {
    enum Role { case initiator, responder }
    enum Phase: Equatable { case idle, preparing, ringing, waiting, accepting, negotiated, ended }
    private(set) var phase = Phase.idle
    private let role: Role
    private let binding: UUID
    private let peer: String
    private let sid: String
    private let profile: NativeCallMedia
    private let signalling: any NativeJingleSending
    private let media: any NativeMediaNegotiating
    private let changed: (Phase) -> Void
    private var incoming: NativeJingleMedia?
    private var offered: NativeJingleMedia?
    private var generation = UUID()
    private var released = false

    init(role: Role, binding: UUID, peer: String, sid: String, profile: NativeCallMedia,
         signalling: any NativeJingleSending, media: any NativeMediaNegotiating, changed: @escaping (Phase) -> Void = { _ in }) throws {
        guard NativeJingleTransport.fullJID(peer), NativeJingleTransport.validSID(sid) else { throw NativeJingleFailure.invalidRequest }
        self.role = role
        self.binding = binding
        self.peer = peer
        self.sid = sid
        self.profile = profile
        self.signalling = signalling
        self.media = media
        self.changed = changed
    }

    func start() async throws {
        guard role == .initiator, phase == .idle else { throw NativeJingleFailure.invalidRequest }
        let attempt = generation
        transition(.preparing)
        do {
            let offer = try await media.createOffer()
            try current(attempt)
            guard offer.sid == sid, offer.profile == profile, offer.action == "session-initiate" else { throw NativeJingleFailure.invalidRequest }
            offered = offer
            transition(.waiting)
            try await signalling.exchangeJingle(binding: binding, xml: offer.xml)
            try current(attempt)
        } catch { await stop(); throw error }
    }

    func receive(_ request: NativeJingleRequest) async {
        guard phase != .ended, request.binding == binding, request.peer == peer, request.sid == sid else {
            try? await signalling.replyJingle(request, rejection: .unexpectedRequest)
            return
        }
        let attempt = generation
        switch request.action {
        case "session-initiate":
            guard role == .responder, phase == .idle else {
                try? await signalling.replyJingle(request, rejection: .unexpectedRequest)
                return
            }
            guard let offer = try? NativeJingleMedia.decode(request.jingleElement(), sid: sid, action: request.action, profile: profile) else {
                try? await signalling.replyJingle(request, rejection: .notAcceptable)
                return
            }
            incoming = offer
            transition(.preparing)
            do {
                try await signalling.replyJingle(request, rejection: nil)
                try current(attempt)
                transition(.ringing)
            } catch { await stop() }
        case "session-accept":
            guard role == .initiator, phase == .waiting, let offer = offered else {
                try? await signalling.replyJingle(request, rejection: .unexpectedRequest)
                return
            }
            let answer: NativeJingleMedia
            do {
                answer = try NativeJingleMedia.decode(request.jingleElement(), sid: sid, action: request.action, profile: profile)
                try answer.validateAnswer(to: offer)
            } catch {
                try? await signalling.replyJingle(request, rejection: .notAcceptable)
                return
            }
            transition(.accepting)
            do {
                try await media.applyAnswer(answer.xml)
                try current(attempt)
                try await signalling.replyJingle(request, rejection: nil)
                try current(attempt)
                offered = nil
                transition(.negotiated)
            } catch {
                try? await signalling.replyJingle(request, rejection: .notAcceptable)
                await stop()
            }
        case "session-terminate":
            guard let element = try? request.jingleElement(), Self.validTermination(element, sid: sid) else {
                try? await signalling.replyJingle(request, rejection: .badRequest)
                return
            }
            endMedia()
            try? await signalling.replyJingle(request, rejection: nil)
            await release()
        default:
            try? await signalling.replyJingle(request, rejection: .featureNotImplemented)
        }
    }

    func accept() async throws {
        guard role == .responder, phase == .ringing, let offer = incoming else { throw NativeJingleFailure.invalidRequest }
        let attempt = generation
        transition(.accepting)
        do {
            let answer = try await media.acceptOffer(offer.xml)
            try current(attempt)
            try answer.validateAnswer(to: offer)
            try await signalling.exchangeJingle(binding: binding, xml: answer.xml)
            try current(attempt)
            incoming = nil
            transition(.negotiated)
        } catch { await stop(); throw error }
    }

    func stop(notifyPeer: Bool = false) async {
        guard phase != .ended else { return }
        endMedia()
        if notifyPeer {
            let xml = "<jingle xmlns='urn:xmpp:jingle:1' sid='\(sid)' action='session-terminate'><reason><success/></reason></jingle>"
            try? await signalling.exchangeJingle(binding: binding, xml: xml)
        }
        await release()
    }

    private func endMedia() {
        generation = UUID()
        incoming = nil
        offered = nil
        phase = .ended
        media.close()
        changed(.ended)
    }

    private func release() async {
        guard !released else { return }
        released = true
        await signalling.unbindCall(binding)
    }

    private func current(_ attempt: UUID) throws {
        try Task.checkCancellation()
        guard generation == attempt, phase != .ended else { throw NativeJingleFailure.staleBinding }
    }

    private func transition(_ phase: Phase) { self.phase = phase; changed(phase) }

    private static func validTermination(_ root: ProbeElement, sid: String) -> Bool {
        guard root.name == "jingle", root.namespace == NativeJingleMedia.jingle,
              root.attributes["sid"] == sid, root.attributes["action"] == "session-terminate",
              Set(root.attributes.keys).isSubset(of: ["sid", "action", "initiator", "responder"]),
              root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, root.children.count <= 1 else { return false }
        guard let reason = root.children.first else { return true }
        guard reason.name == "reason", reason.namespace == root.namespace, reason.attributes.isEmpty,
              reason.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, reason.children.count == 1,
              let condition = reason.children.first else { return false }
        return ["success", "cancel", "decline", "busy", "timeout", "connectivity-error", "failed-transport", "general-error", "gone", "unsupported-applications", "unsupported-transports"].contains(condition.name) &&
            condition.namespace == root.namespace && condition.attributes.isEmpty && condition.children.isEmpty &&
            condition.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
