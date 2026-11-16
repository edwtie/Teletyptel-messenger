import Foundation

struct NativeCallRecoveryAuthorization: Codable, CustomStringConvertible, CustomDebugStringConvertible {
    let version: Int
    let credential: String
    let owner: String
    let domain: String
    let issuer: String
    let environment: String
    let expiresAt: TimeInterval
    var description: String { "NativeCallRecoveryAuthorization(redacted)" }
    var debugDescription: String { description }

    func validate(configuration: ServerConfiguration, registrationExpiry: TimeInterval, now: TimeInterval) throws {
        guard version == 1, now.isFinite, expiresAt.isFinite, expiresAt.rounded() == expiresAt,
              expiresAt > now, expiresAt <= now + 86430, expiresAt <= registrationExpiry,
              domain == configuration.domain, NativeAuthenticatedAccount.validJID(owner, domain: domain),
              NativeChatCodec.bareJID(owner) == owner,
              credential.range(of: "\\Atcd1\\.[A-Za-z0-9_-]{40,1800}\\z", options: .regularExpression) != nil,
              issuer.range(of: "\\A[A-Za-z0-9_-]{1,64}\\z", options: .regularExpression) != nil,
              ["production", "sandbox"].contains(environment) else { throw NativePushRegistryFailure.invalidResponse }
    }
}

struct NativeColdCallContext: CustomStringConvertible, CustomDebugStringConvertible {
    let scope: NativePushScope
    let configuration: ServerConfiguration
    let registration: NativePushRegistration
    let authorization: NativeCallRecoveryAuthorization
    var description: String { "NativeColdCallContext(redacted)" }
    var debugDescription: String { description }

    static func restore(_ record: NativePushRecord, now: TimeInterval) throws -> Self {
        guard record.consented, !record.pendingRevocation, let authorization = record.recovery,
              let expiry = record.expiresAt, expiry.isFinite, expiry > now,
              let generation = record.generation,
              generation.range(of: "\\A[0-9a-f]{32}\\z", options: .regularExpression) != nil,
              !record.scope.accountID.isEmpty, record.scope.accountID.utf8.count <= 96,
              !record.scope.accountID.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else {
            throw NativePushRegistryFailure.rejected
        }
        let configuration = try ServerConfiguration(address: record.scope.origin, domain: authorization.domain)
        guard configuration.origin.absoluteString == record.scope.origin else { throw NativePushRegistryFailure.rejected }
        try authorization.validate(configuration: configuration, registrationExpiry: expiry, now: now)
        return Self(scope: record.scope, configuration: configuration,
            registration: NativePushRegistration(deviceID: record.deviceID, generation: generation, expiresAt: expiry, controlCredential: nil),
            authorization: authorization)
    }
}

@MainActor
protocol NativeActiveCallRegistryServing: NativeWarmCallRegistryServing {
    func lease(invitation: NativeCallInvitation, registration: NativePushRegistration, bootstrap: NativeCallBootstrapGrant) async throws -> NativeCallActiveLease
}

protocol NativeColdCallServing: NativeActiveCallRegistryServing {
    func bootstrap(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws -> NativeCallBootstrapGrant
}

@MainActor
struct NativeCallRecoveryClient: NativeColdCallServing {
    let context: NativeColdCallContext
    var now: () -> TimeInterval = { Date().timeIntervalSince1970 }

    func bootstrap(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws -> NativeCallBootstrapGrant {
        let data = try await request("bootstrap", invitation: invitation, registration: registration)
        return try NativeCallBootstrapGrant.decode(data, configuration: context.configuration, owner: context.authorization.owner,
            invitation: invitation, registration: registration, issuer: context.authorization.issuer,
            environment: context.authorization.environment, now: now())
    }

    func accept(invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String) async throws -> NativeCallReservation {
        guard NativeJingleTransport.fullJID(fullJID), NativeChatCodec.bareJID(fullJID) == context.authorization.owner else {
            throw NativePushRegistryFailure.rejected
        }
        let data = try await request("accept", invitation: invitation, registration: registration, fullJID: fullJID)
        let value = try JSONDecoder().decode(Reservation.self, from: data)
        guard value.recipientJid == fullJID, NativeJingleTransport.fullJID(value.callerJid), value.answerAuthorization.utf8.count <= 1024,
              value.answerAuthorization.range(of: "\\Atca1\\.[A-Za-z0-9_-]+\\.[0-9a-f]{64}\\z", options: .regularExpression) != nil,
              NativeChatCodec.bareJID(value.callerJid) != context.authorization.owner,
              NativeChatCodec.bareJID(value.callerJid)?.hasSuffix("@" + context.configuration.domain) == true else {
            throw NativePushRegistryFailure.invalidResponse
        }
        return NativeCallReservation(callerJID: value.callerJid, recipientJID: value.recipientJid, answerAuthorization: value.answerAuthorization)
    }

    func end(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws {
        let reply = try JSONDecoder().decode(Ended.self, from: await request("end", invitation: invitation, registration: registration))
        guard reply.ended else { throw NativePushRegistryFailure.invalidResponse }
    }

    func lease(invitation: NativeCallInvitation, registration: NativePushRegistration, bootstrap: NativeCallBootstrapGrant) async throws -> NativeCallActiveLease {
        guard bootstrap.owner == context.authorization.owner, bootstrap.callID == invitation.id,
              bootstrap.sid == invitation.sid, bootstrap.media == invitation.media else { throw NativePushRegistryFailure.rejected }
        let data = try await request("lease", invitation: invitation, registration: registration,
            fullJID: bootstrap.owner + "/" + bootstrap.resource)
        return try bootstrap.activeLease(data, registrationExpiry: min(registration.expiresAt, context.authorization.expiresAt), now: now())
    }

    private struct Reservation: Decodable { let callerJid: String; let recipientJid: String; let answerAuthorization: String }
    private struct Ended: Decodable { let ended: Bool }
    private struct Rejected: Decodable { let code: String }

    private func request(_ action: String, invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String? = nil) async throws -> Data {
        try Task.checkCancellation()
        try context.authorization.validate(configuration: context.configuration, registrationExpiry: registration.expiresAt, now: now())
        guard registration.deviceID == context.registration.deviceID, registration.generation == context.registration.generation,
              invitation.expiresAt > now() || ["end", "lease"].contains(action) else { throw NativePushRegistryFailure.rejected }
        var body: [String: String] = ["action": action, "callId": invitation.id.uuidString.lowercased(), "sid": invitation.sid,
            "mediaProfile": invitation.media.rawValue, "deviceId": registration.deviceID.uuidString.lowercased(), "generation": registration.generation]
        if let fullJID = fullJID { body["fullJid"] = fullJID }
        let url = context.configuration.origin.appendingPathComponent("api/call-recovery.php")
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + context.authorization.credential, forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let settings = URLSessionConfiguration.ephemeral
        settings.httpCookieStorage = nil; settings.httpShouldSetCookies = false
        settings.urlCredentialStorage = nil; settings.urlCache = nil
        settings.timeoutIntervalForResource = 8
        let session = URLSession(configuration: settings, delegate: NativeRecoveryHTTPDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse, response.url == url, response.mimeType == "application/json",
              response.expectedContentLength <= 4096 else { throw NativePushRegistryFailure.invalidResponse }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 4096 else { throw NativePushRegistryFailure.invalidResponse }
            data.append(byte)
        }
        if response.statusCode == 425, (try? JSONDecoder().decode(Rejected.self, from: data).code) == "resource_proof_pending" {
            throw NativePushRegistryFailure.proofPending
        }
        guard response.statusCode == 200 else { throw NativePushRegistryFailure.rejected }
        try Task.checkCancellation()
        return data
    }
}

private final class NativeRecoveryHTTPDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
