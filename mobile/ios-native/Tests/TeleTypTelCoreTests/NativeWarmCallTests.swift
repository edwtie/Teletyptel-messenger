import XCTest
@testable import TeleTypTelCore

private actor WarmCallConnection: NativeCallXMPPConnecting, NativeBootstrapXMPPConnecting, NativeCallRecoverySending {
    private var transport = NativeJingleTransport(owner: "bob@localhost/awakened")
    private var onJingle: (@Sendable (NativeJingleRequest) -> Void)?
    private var onIntent: (@Sendable (NativeCallIntent) -> Void)?
    private var operations: [String] = []
    private var connected = false
    private var stopped = false
    private var activeBound = "bob@localhost/awakened"
    var rejectLease = false
    let profile: NativeCallMedia
    let offerProfile: NativeCallMedia
    let boundJID: String
    let proposes: Bool
    let endsEarly: Bool
    init(profile: NativeCallMedia = .total, offerProfile: NativeCallMedia = .total,
         boundJID: String = "bob@localhost/awakened", proposes: Bool = true, endsEarly: Bool = false) {
        self.profile = profile; self.offerProfile = offerProfile
        self.boundJID = boundJID; self.proposes = proposes
        self.endsEarly = endsEarly
    }
    func history() -> [String] { operations }
    func isConnected() -> Bool { connected }
    func isStopped() -> Bool { stopped }
    func runCall(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
                 onSender: @escaping @Sendable (any NativeCallRecoverySending) -> Void,
                 onIntent: @escaping @Sendable (NativeCallIntent) -> Void,
                 onJingle: @escaping @Sendable (NativeJingleRequest) -> Void) async throws {
        activeBound = boundJID
        self.onJingle = onJingle; self.onIntent = onIntent; connected = true
        onConnected(boundJID); onSender(self)
        if proposes { onIntent(NativeCallIntent(action: .propose, sid: "call-1", peer: "alice@localhost/caller", media: profile)) }
        defer { stopped = true; self.onJingle = nil; self.onIntent = nil }
        while true { try await Task.sleep(nanoseconds: 100_000_000) }
    }
    func runCall(bootstrap: NativeCallBootstrapGrant, onConnected: @escaping @Sendable (String) -> Void,
                 onSender: @escaping @Sendable (any NativeCallRecoverySending) -> Void,
                 onIntent: @escaping @Sendable (NativeCallIntent) -> Void,
                 onJingle: @escaping @Sendable (NativeJingleRequest) -> Void) async throws {
        activeBound = boundJID == "bob@localhost/awakened" ? bootstrap.owner + "/" + bootstrap.resource : boundJID
        transport = NativeJingleTransport(owner: activeBound)
        self.onJingle = onJingle; self.onIntent = onIntent; connected = true
        onConnected(activeBound); onSender(self)
        if proposes { onIntent(NativeCallIntent(action: .propose, sid: bootstrap.sid, peer: "alice@localhost/caller", media: profile)) }
        defer { stopped = true; self.onJingle = nil; self.onIntent = nil }
        while true { try await Task.sleep(nanoseconds: 100_000_000) }
    }
    func bindCall(peer: String, sid: String) async throws -> UUID {
        operations.append("bind")
        return try transport.bind(peer: peer, sid: sid)
    }
    func exchangeJingle(binding: UUID, xml: String) async throws { operations.append("exchange") }
    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws {}
    func unbindCall(_ binding: UUID) async { _ = transport.unbind(binding) }
    func observeCallIntents(_ observer: @escaping @Sendable (NativeCallIntent) -> Void) async {}
    func setCallPreferences(enabled: Bool, dnd: Bool, muted: Set<String>) async throws {}
    func proveCallResource(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws {
        operations.append("proof")
    }
    func authorizeCallAnswer(_ permit: String) async throws { operations.append("authorize") }
    func keepCallAlive() async throws { operations.append("keepalive") }
    func authorizeActiveCallLease(_ lease: NativeCallActiveLease) async throws {
        operations.append("lease")
        if rejectLease { throw NativePushRegistryFailure.rejected }
    }
    func setRejectLease(_ value: Bool) { rejectLease = value }
    func sendCallIntent(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia?) async throws {
        guard action == .proceed, peer == "alice@localhost/caller", sid == "call-1" else { throw NativeJingleFailure.invalidRequest }
        operations.append("proceed")
        let offer = try NativeJingleMedia.fromSDP(sdp(), sid: sid, action: "session-initiate", profile: offerProfile)
        try emit(offer.xml, identifier: "fresh-offer")
        if endsEarly { try emitTermination() }
    }
    func emitTermination() throws {
        try emit("<jingle xmlns='urn:xmpp:jingle:1' action='session-terminate' sid='call-1'><reason><success/></reason></jingle>", identifier: "finished")
    }
    func finishIntent() {
        onIntent?(NativeCallIntent(action: .finish, sid: "call-1", peer: "alice@localhost/caller", media: nil))
    }
    func retractIntent(peer: String, sid: String = "call-1") {
        onIntent?(NativeCallIntent(action: .retract, sid: sid, peer: peer, media: nil))
    }
    private func emit(_ element: String, identifier: String) throws {
        let stanza = "<iq xmlns='jabber:client' type='set' from='alice@localhost/caller' to='\(activeBound)' id='\(identifier)'>\(element)</iq>"
        let request = try XCTUnwrap(transport.receive(stanza, now: 100).request)
        onJingle?(request)
    }
    private func sdp() -> String {
        var lines = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0"]
        for kind in ["audio", "video", "rtt"] where offerProfile.contents.contains(kind) {
            lines += [kind == "rtt" ? "m=application 9 UDP/DTLS/SCTP webrtc-datachannel" : "m=\(kind) 9 UDP/TLS/RTP/SAVPF \(kind == "audio" ? "0" : "96")",
                "c=IN IP4 0.0.0.0", "a=mid:\(kind)"]
            if kind == "rtt" { lines += ["a=sctp-port:5000", "a=max-message-size:262144"] }
            else {
                lines += ["a=sendrecv", "a=rtcp-mux", kind == "audio" ? "a=rtpmap:0 PCMU/8000" : "a=rtpmap:96 VP8/90000"]
                if kind == "video" { lines += ["a=rtcp-fb:96 nack", "a=rtcp-fb:96 nack pli"] }
            }
            lines += ["a=ice-ufrag:abcd", "a=ice-pwd:abcdefghijklmnopqrstuv",
                "a=fingerprint:sha-256 " + Array(repeating: "AB", count: 32).joined(separator: ":"), "a=setup:actpass",
                "a=candidate:1 1 udp 2122260223 127.0.0.1 50000 typ host generation 0", "a=end-of-candidates"]
        }
        return (lines + [""]).joined(separator: "\r\n")
    }
}

@MainActor
private final class WarmCallRegistry: NativeActiveCallRegistryServing {
    var accepts = 0
    var ends = 0
    var caller = "alice@localhost/caller"
    var permitted = true
    var afterAccept: (() -> Void)?
    var answerAuthorization: String?
    var leases = 0
    var now: () -> TimeInterval = { 100 }
    func lease(invitation: NativeCallInvitation, registration: NativePushRegistration, bootstrap: NativeCallBootstrapGrant) async throws -> NativeCallActiveLease {
        guard permitted else { throw NativePushRegistryFailure.rejected }
        leases += 1
        let sasl = try XCTUnwrap(String(data: XCTUnwrap(Data(base64Encoded: bootstrap.saslPayload)), encoding: .utf8))
        let secret = try XCTUnwrap(sasl.split(separator: "\0").last)
        let encoded = String(secret.split(separator: ".")[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let data = try XCTUnwrap(Data(base64Encoded: encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4)))
        var claims = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        claims["scope"] = "call-xmpp-active-v1"; claims["issuedAt"] = Int(now()); claims["expiresAt"] = Int(now()) + 25
        let payload = try JSONSerialization.data(withJSONObject: claims).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let body = try JSONSerialization.data(withJSONObject: ["credential": "tcl1." + payload + "." + String(repeating: "a", count: 64), "claims": claims])
        return try bootstrap.activeLease(body, registrationExpiry: registration.expiresAt, now: now())
    }
    func accept(invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String) async throws -> NativeCallReservation {
        accepts += 1
        guard permitted else { throw NativePushRegistryFailure.rejected }
        afterAccept?()
        return NativeCallReservation(callerJID: caller, recipientJID: fullJID, answerAuthorization: answerAuthorization)
    }
    func end(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws { ends += 1 }
}

@MainActor
final class NativeWarmCallTests: XCTestCase {
    private func bootstrap(invitation: NativeCallInvitation, registration: NativePushRegistration, peer: String = "alice@localhost/caller") throws -> NativeCallBootstrapGrant {
        let nonce = String(repeating: "c", count: 32)
        let claims: [String: Any] = ["version": 1, "scope": "call-xmpp-bootstrap-v1", "domain": "localhost", "issuer": "fixture",
            "environment": "production", "owner": "bob@localhost", "peer": peer, "callId": invitation.id.uuidString.lowercased(),
            "sid": invitation.sid, "deviceId": registration.deviceID.uuidString.lowercased(), "generation": registration.generation,
            "profile": invitation.media.rawValue, "nonce": nonce, "resource": "tc-call-" + nonce, "issuedAt": 100, "expiresAt": 120]
        let payload = try JSONSerialization.data(withJSONObject: claims).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let body = try JSONSerialization.data(withJSONObject: ["credential": "tcr1." + payload + "." + String(repeating: "a", count: 64), "claims": claims])
        return try NativeCallBootstrapGrant.decode(body, configuration: account().configuration, owner: "bob@localhost",
            invitation: invitation, registration: registration, issuer: "fixture", environment: "production", now: 100)
    }

    func testColdBootstrapUsesProofReservationProceedAndFreshOfferForAllProfiles() async throws {
        for profile in NativeCallMedia.allCases {
            let registry = WarmCallRegistry(), connection = WarmCallConnection(profile: profile, offerProfile: profile)
            registry.answerAuthorization = "fictional-permit"
            let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 145, media: profile, now: 100))
            let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: nil)
            let recovery = NativeWarmCallSession(invitation: invitation, registration: registration, registry: registry, now: { 100 })
            let offer = try await recovery.prepare(bootstrap: bootstrap(invitation: invitation, registration: registration), connector: connection, validateContext: {})
            XCTAssertEqual(offer.request.peer, "alice@localhost/caller")
            XCTAssertEqual(offer.request.action, "session-initiate")
            XCTAssertEqual(registry.accepts, 1)
            let operations = await connection.history()
            XCTAssertEqual(operations, ["bind", "proof", "authorize", "proceed", "keepalive", "lease"])
            recovery.cancel(); recovery.endServerCall()
        }
    }

    func testColdBootstrapRejectsWrongResourceBeforeReservationAndStopsConnection() async throws {
        let registry = WarmCallRegistry(), connection = WarmCallConnection(boundJID: "bob@localhost/wrong-resource")
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 145, media: .total, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: nil)
        let recovery = NativeWarmCallSession(invitation: invitation, registration: registration, registry: registry, now: { 100 })
        do {
            _ = try await recovery.prepare(bootstrap: bootstrap(invitation: invitation, registration: registration), connector: connection, validateContext: {})
            XCTFail("Unexpected resource was accepted")
        } catch { XCTAssertEqual(registry.accepts, 0) }
        try await Task.sleep(nanoseconds: 20_000_000)
        let stopped = await connection.isStopped()
        XCTAssertTrue(stopped)
    }

    func testColdBootstrapCannotProceedWithoutServerAnswerAuthorization() async throws {
        let registry = WarmCallRegistry(), connection = WarmCallConnection()
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 145, media: .total, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: nil)
        let recovery = NativeWarmCallSession(invitation: invitation, registration: registration, registry: registry, now: { 100 })
        do {
            _ = try await recovery.prepare(bootstrap: bootstrap(invitation: invitation, registration: registration), connector: connection, validateContext: {})
            XCTFail("Missing server answer authorization was accepted")
        } catch { XCTAssertEqual(error as? NativeJingleFailure, .rejected) }
        let operations = await connection.history()
        XCTAssertEqual(operations, ["bind", "proof"])
        recovery.cancel()
    }

    func testColdActiveRenewalOutlivesInvitationButStopsOnRevokedContext() async throws {
        var time: TimeInterval = 100
        var allowed = true
        let registry = WarmCallRegistry(), connection = WarmCallConnection()
        registry.now = { time }; registry.answerAuthorization = "fictional-permit"
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 145, media: .total, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 500, controlCredential: nil)
        let recovery = NativeWarmCallSession(invitation: invitation, registration: registration, registry: registry,
            now: { time }, waitForRenewal: { try await Task.sleep(nanoseconds: 2_000_000); time += 10 })
        var ended = 0
        recovery.remoteEnded = { ended += 1 }
        _ = try await recovery.prepare(bootstrap: bootstrap(invitation: invitation, registration: registration), connector: connection, validateContext: {
            guard allowed else { throw NativeJingleFailure.rejected }
        })
        await settle { registry.leases >= 7 }
        XCTAssertGreaterThan(time, invitation.expiresAt)
        XCTAssertEqual(ended, 0)
        allowed = false
        await settle { let stopped = await connection.isStopped(); return ended == 1 && stopped && registry.ends == 1 }
        XCTAssertEqual(ended, 1)
        let count = registry.leases
        try await Task.sleep(nanoseconds: 10_000_000)
        XCTAssertEqual(registry.leases, count)
        recovery.cancel()
    }

    func testColdLeaseNeedsServerAcknowledgementBeforeReturningMediaOffer() async throws {
        let registry = WarmCallRegistry(), connection = WarmCallConnection()
        registry.answerAuthorization = "fictional-permit"
        await connection.setRejectLease(true)
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 145, media: .total, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: nil)
        let recovery = NativeWarmCallSession(invitation: invitation, registration: registration, registry: registry, now: { 100 })
        do {
            _ = try await recovery.prepare(bootstrap: bootstrap(invitation: invitation, registration: registration), connector: connection, validateContext: {})
            XCTFail("Unacknowledged active scope must not start media")
        } catch {}
        await settle { let stopped = await connection.isStopped(); return stopped && registry.ends == 1 }
        XCTAssertEqual(registry.leases, 1)
    }
    private func account() throws -> NativeAuthenticatedAccount {
        NativeAuthenticatedAccount(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"),
            jid: "bob@localhost", password: "fictional-test-only")
    }
    private func session(_ registry: WarmCallRegistry, profile: NativeCallMedia = .total,
                         now: @escaping () -> TimeInterval = { 100 }) throws -> NativeWarmCallSession {
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 145, media: profile, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: nil)
        return NativeWarmCallSession(invitation: invitation, registration: registration, registry: registry, now: now)
    }

    func testWarmRecoveryBindsFreshOfferForEveryProfileAndRoutesOnlyAfterInstallation() async throws {
        for profile in NativeCallMedia.allCases {
            let registry = WarmCallRegistry(), connection = WarmCallConnection(profile: profile, offerProfile: profile, endsEarly: profile == .total)
            let warm = try session(registry, profile: profile)
            let offer = try await warm.prepare(account: account(), connector: connection, validateContext: {})
            XCTAssertEqual(offer.request.peer, "alice@localhost/caller")
            XCTAssertEqual(offer.request.action, "session-initiate")
            XCTAssertEqual(registry.accepts, 1)
            let history = await connection.history()
            XCTAssertEqual(history, ["bind", "proof", "proceed"])
            if profile != .total { try await connection.emitTermination() }
            try await Task.sleep(nanoseconds: 20_000_000)
            var routed: [String] = []
            warm.receiveJingle = { request, _ in routed.append(request.action) }
            warm.activateRouting()
            XCTAssertEqual(routed, ["session-terminate"])
            warm.cancel(); warm.endServerCall(); warm.endServerCall()
            await settle { let stopped = await connection.isStopped(); return registry.ends == 1 && stopped }
        }
    }

    func testWrongCallerAndRejectedReservationCannotProceed() async throws {
        for wrongCaller in [false, true] {
            let registry = WarmCallRegistry(), connection = WarmCallConnection()
            if wrongCaller { registry.caller = "charlie@localhost/other" } else { registry.permitted = false }
            let warm = try session(registry)
            do { _ = try await warm.prepare(account: account(), connector: connection, validateContext: {}); XCTFail("Must fail") } catch {}
            let history = await connection.history()
            XCTAssertEqual(history, ["bind", "proof"])
            await settle { let stopped = await connection.isStopped(); return registry.ends == 1 && stopped }
        }
    }

    func testAccountSwitchAfterReservationCannotStartMedia() async throws {
        let registry = WarmCallRegistry(), connection = WarmCallConnection()
        var allowed = true
        registry.afterAccept = { allowed = false }
        let warm = try session(registry)
        do {
            _ = try await warm.prepare(account: account(), connector: connection, validateContext: {
                guard allowed else { throw NativeJingleFailure.rejected }
            })
            XCTFail("Must fail")
        } catch {}
        let history = await connection.history()
        XCTAssertFalse(history.contains("proceed"))
        await settle { registry.ends == 1 }
    }

    func testWrongBoundOwnerBlockedCallerAndWrongOfferProfileAreRejected() async throws {
        for failure in ["owner", "blocked", "profile"] {
            let registry = WarmCallRegistry()
            let connection = WarmCallConnection(offerProfile: failure == "profile" ? .audio : .total,
                boundJID: failure == "owner" ? "other@localhost/wrong" : "bob@localhost/awakened")
            let warm = try session(registry)
            do {
                _ = try await warm.prepare(account: account(), connector: connection, validatePeer: { _ in
                    if failure == "blocked" { throw NativeJingleFailure.rejected }
                }, validateContext: {})
                XCTFail("Must fail")
            } catch {}
            XCTAssertEqual(registry.accepts, failure == "profile" ? 1 : 0)
            await settle { registry.ends == 1 }
        }
    }

    func testExpiryAndCancellationWhileWaitingCannotReviveConnection() async throws {
        for expired in [false, true] {
            let registry = WarmCallRegistry(), connection = WarmCallConnection(proposes: false)
            var now: TimeInterval = 100
            let warm = try session(registry, now: { now })
            let task = Task { try await warm.prepare(account: account(), connector: connection, validateContext: {}) }
            await settle { await connection.isConnected() }
            if expired { now = 145 } else { warm.cancel(); task.cancel() }
            do { _ = try await task.value; XCTFail("Must fail") } catch {}
            XCTAssertEqual(registry.accepts, 0)
            await settle { let stopped = await connection.isStopped(); return registry.ends == 1 && stopped }
        }
    }

    func testAuthenticatedRemoteFinishReachesInstalledCall() async throws {
        let registry = WarmCallRegistry(), connection = WarmCallConnection()
        let warm = try session(registry)
        _ = try await warm.prepare(account: account(), connector: connection, validateContext: {})
        var ended = false
        warm.remoteEnded = { ended = true }
        await connection.finishIntent()
        await settle { ended }
        warm.cancel(); warm.endServerCall()
        await settle { registry.ends == 1 }
    }

    func testBareCallerRetractionMatchesTheSameCallButForeignPeerAndSessionDoNot() async throws {
        let registry = WarmCallRegistry(), connection = WarmCallConnection()
        let warm = try session(registry)
        _ = try await warm.prepare(account: account(), connector: connection, validateContext: {})
        var ended = false
        warm.remoteEnded = { ended = true }
        await connection.retractIntent(peer: "charlie@localhost")
        await connection.retractIntent(peer: "alice@localhost", sid: "another-call")
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertFalse(ended)
        await connection.retractIntent(peer: "alice@localhost")
        await settle { ended }
        warm.cancel(); warm.endServerCall()
        await settle { registry.ends == 1 }
    }

    private func settle(_ ready: () async -> Bool) async {
        for _ in 0..<300 {
            if await ready() { return }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTFail("Call recovery did not settle")
    }
}
