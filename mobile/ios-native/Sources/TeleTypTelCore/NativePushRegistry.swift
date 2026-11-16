import Foundation

enum NativePushRegistryFailure: Error, Equatable { case unavailable, invalidResponse, rejected, proofPending }

private protocol NativePushRegistryReply {
    var ok: Bool { get }
    var accountId: String { get }
    var csrfToken: String { get }
}

struct NativePushRegistration: CustomStringConvertible, CustomDebugStringConvertible {
    let deviceID: UUID
    let generation: String
    let expiresAt: TimeInterval
    let controlCredential: String?
    var recovery: NativeCallRecoveryAuthorization? = nil
    var description: String { "NativePushRegistration(redacted)" }
    var debugDescription: String { description }
}

@MainActor
protocol NativePushRegistryServing {
    func backgroundAnswerReady() async throws -> Bool
    func register(deviceID: UUID, token: Data, consented: Bool) async throws -> NativePushRegistration
    func revoke(deviceID: UUID) async throws
}

struct NativePushRegistryClient: NativePushRegistryServing {
    let session: NativeAccountWebSession
    let accountID: String
    var now: @Sendable () -> TimeInterval = { Date().timeIntervalSince1970 }

    func checkAvailability() async throws {
        _ = try await challenge()
    }

    func backgroundAnswerReady() async throws -> Bool {
        let reply = try await challengeReply()
        return reply.capabilities?.backgroundAnswerRecovery == true
    }

    func register(deviceID: UUID, token: Data, consented: Bool) async throws -> NativePushRegistration {
        guard consented, (16...256).contains(token.count), Self.validDevice(deviceID.uuidString) else { throw NativePushRegistryFailure.rejected }
        let csrf = try await challenge()
        let body = try JSONSerialization.data(withJSONObject: ["action": "register", "deviceId": deviceID.uuidString.lowercased(),
            "token": token.map { String(format: "%02x", $0) }.joined(), "consent": true])
        let data = try await request(body: body, csrf: csrf)
        let reply = try JSONDecoder().decode(Registered.self, from: data)
        try validate(reply)
        guard UUID(uuidString: reply.deviceId) == deviceID,
              Self.matches(reply.generation, "[0-9a-f]{32}"), validExpiry(reply.expiresAt),
              reply.controlToken.map({ Self.matches($0, "[0-9a-f]{2,958}\\.[0-9a-f]{64}") && $0.split(separator: ".")[0].count.isMultiple(of: 2) }) ?? true else {
            throw NativePushRegistryFailure.invalidResponse
        }
        try Task.checkCancellation()
        if let recovery = reply.recovery {
            try recovery.validate(configuration: session.configuration, registrationExpiry: reply.expiresAt, now: now())
        }
        return NativePushRegistration(deviceID: deviceID, generation: reply.generation,
            expiresAt: reply.expiresAt, controlCredential: reply.controlToken, recovery: reply.recovery)
    }

    func revoke(deviceID: UUID) async throws {
        guard Self.validDevice(deviceID.uuidString) else { throw NativePushRegistryFailure.rejected }
        let csrf = try await challenge()
        let body = try JSONSerialization.data(withJSONObject: ["action": "revoke-device", "deviceId": deviceID.uuidString.lowercased()])
        let reply = try JSONDecoder().decode(Revoked.self, from: await request(body: body, csrf: csrf))
        try validate(reply)
        guard reply.revoked else { throw NativePushRegistryFailure.invalidResponse }
        try Task.checkCancellation()
    }

    func accept(invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String) async throws -> NativeCallReservation {
        guard NativeJingleTransport.fullJID(fullJID),
              NativeChatCodec.bareJID(fullJID)?.hasSuffix("@" + session.configuration.domain) == true,
              validExpiry(registration.expiresAt), invitation.expiresAt > now(),
              Self.validDevice(registration.deviceID.uuidString), Self.validDevice(invitation.id.uuidString),
              Self.matches(registration.generation, "[0-9a-f]{32}") else { throw NativePushRegistryFailure.rejected }
        let csrf = try await challenge()
        let body = try JSONSerialization.data(withJSONObject: ["action": "accept", "callId": invitation.id.uuidString.lowercased(),
            "deviceId": registration.deviceID.uuidString.lowercased(), "generation": registration.generation, "fullJid": fullJID])
        let reply = try JSONDecoder().decode(Accepted.self, from: await request(body: body, csrf: csrf))
        try validate(reply)
        guard reply.call.callId == invitation.id, reply.call.sid == invitation.sid,
              reply.call.state == "accepted", reply.call.mediaProfile == invitation.media,
              reply.call.hasVideo == invitation.media.hasVideo, reply.call.expiresAt == invitation.expiresAt,
              invitation.expiresAt > now(), reply.call.recipientJid == fullJID,
              NativeJingleTransport.fullJID(reply.call.callerJid),
              NativeChatCodec.bareJID(reply.call.callerJid)?.hasSuffix("@" + session.configuration.domain) == true,
              NativeChatCodec.bareJID(reply.call.callerJid) != NativeChatCodec.bareJID(fullJID) else { throw NativePushRegistryFailure.invalidResponse }
        try Task.checkCancellation()
        return NativeCallReservation(callerJID: reply.call.callerJid, recipientJID: reply.call.recipientJid)
    }

    func end(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws {
        let csrf = try await challenge()
        let body = try JSONSerialization.data(withJSONObject: ["action": "reconcile", "deviceId": registration.deviceID.uuidString.lowercased(),
            "calls": [["callId": invitation.id.uuidString.lowercased(), "sid": invitation.sid, "end": true]]])
        let reply = try JSONDecoder().decode(Reconciled.self, from: await request(body: body, csrf: csrf))
        try validate(reply)
        guard reply.calls.count == 1, let call = reply.calls.first, call.callId == invitation.id, call.sid == invitation.sid,
              ["ended", "expired", "unavailable", "answered-elsewhere"].contains(call.state) else { throw NativePushRegistryFailure.invalidResponse }
        try Task.checkCancellation()
    }

    private func challenge() async throws -> String {
        try await challengeReply().csrfToken
    }

    private func challengeReply() async throws -> Challenge {
        let reply = try JSONDecoder().decode(Challenge.self, from: await request())
        try validate(reply)
        guard reply.devices.count <= 8, Set(reply.devices.compactMap { UUID(uuidString: $0.device_id) }).count == reply.devices.count,
              reply.devices.allSatisfy({ Self.validDevice($0.device_id) && Self.matches($0.generation, "[0-9a-f]{32}") && validExpiry($0.expires.value) }) else {
            throw NativePushRegistryFailure.invalidResponse
        }
        try Task.checkCancellation()
        return reply
    }

    private func request(body: Data? = nil, csrf: String? = nil) async throws -> Data {
        try Task.checkCancellation()
        guard !accountID.isEmpty, accountID.utf8.count <= 96,
              !accountID.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains),
              await session.hasSessionCookie else { throw NativePushRegistryFailure.unavailable }
        do {
            let data = try await session.request(.callPush, body: body, csrf: csrf)
            guard data.count <= 16384 else { throw NativePushRegistryFailure.invalidResponse }
            return data
        } catch let error as NativeWebServiceFailure {
            if error.status == 425, error.code == "resource_proof_pending" { throw NativePushRegistryFailure.proofPending }
            if error.status == 404 { throw NativePushRegistryFailure.unavailable }
            throw NativePushRegistryFailure.rejected
        }
    }

    private func validate(_ reply: some NativePushRegistryReply) throws {
        guard reply.ok, reply.accountId == accountID, Self.matches(reply.csrfToken, "[0-9a-f]{64}") else {
            throw NativePushRegistryFailure.invalidResponse
        }
    }

    private func validExpiry(_ expiry: TimeInterval) -> Bool {
        let current = now()
        return current.isFinite && expiry.isFinite && expiry.rounded() == expiry && expiry > current && expiry <= current + 86430
    }

    private static func validDevice(_ value: String) -> Bool {
        matches(value.lowercased(), "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: "\\A(?:" + pattern + ")\\z", options: .regularExpression) != nil
    }

    private struct Challenge: Decodable, NativePushRegistryReply {
        let ok: Bool
        let accountId: String
        let csrfToken: String
        let devices: [Device]
        let capabilities: Capabilities?
    }
    private struct Capabilities: Decodable { let backgroundAnswerRecovery: Bool }
    private struct Device: Decodable {
        let device_id: String
        let generation: String
        let expires: Timestamp
    }
    private struct Timestamp: Decodable {
        let value: TimeInterval
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let integer = try? container.decode(Int64.self) { value = TimeInterval(integer) }
            else {
                let string = try container.decode(String.self)
                guard Self.valid(string), let integer = Int64(string) else { throw NativePushRegistryFailure.invalidResponse }
                value = TimeInterval(integer)
            }
        }
        private static func valid(_ value: String) -> Bool {
            value.range(of: "\\A[0-9]{1,12}\\z", options: .regularExpression) != nil
        }
    }
    private struct Registered: Decodable, NativePushRegistryReply {
        let ok: Bool
        let accountId: String
        let csrfToken: String
        let deviceId: String
        let generation: String
        let expiresAt: TimeInterval
        let controlToken: String?
        let recovery: NativeCallRecoveryAuthorization?
    }
    private struct Revoked: Decodable, NativePushRegistryReply {
        let ok: Bool
        let accountId: String
        let csrfToken: String
        let revoked: Bool
    }
    private struct Accepted: Decodable, NativePushRegistryReply {
        let ok: Bool
        let accountId: String
        let csrfToken: String
        let call: Reservation
    }
    private struct Reservation: Decodable {
        let callId: UUID
        let sid: String
        let state: String
        let mediaProfile: NativeCallMedia
        let hasVideo: Bool
        let expiresAt: TimeInterval
        let callerJid: String
        let recipientJid: String
    }
    private struct Reconciled: Decodable, NativePushRegistryReply {
        let ok: Bool
        let accountId: String
        let csrfToken: String
        let calls: [EndedCall]
    }
    private struct EndedCall: Decodable {
        let callId: UUID
        let sid: String
        let state: String
    }
}
