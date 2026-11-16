import Foundation

struct NativeCallBootstrapGrant: CustomStringConvertible, CustomDebugStringConvertible {
    private struct Claims: Decodable, Equatable {
        let version: Int
        var scope: String
        let environment: String
        let domain: String
        let issuer: String
        let owner: String
        let peer: String
        let callId: UUID
        let sid: String
        let deviceId: UUID
        let generation: String
        let profile: NativeCallMedia
        let nonce: String
        let resource: String
        var issuedAt: Int
        var expiresAt: Int
    }
    private let secret: String
    private let authority: Claims
    let configuration: ServerConfiguration
    let owner: String
    let peer: String
    let resource: String
    let expiresAt: TimeInterval
    let callID: UUID
    let sid: String
    let media: NativeCallMedia
    var description: String { "NativeCallBootstrapGrant(redacted)" }
    var debugDescription: String { description }
    var saslPayload: String { Data(("\0" + String(owner.prefix { $0 != "@" }) + "\0" + secret).utf8).base64EncodedString() }

    static func decode(_ data: Data, configuration: ServerConfiguration, owner: String,
                       invitation: NativeCallInvitation, registration: NativePushRegistration,
                       issuer: String, environment: String, now: TimeInterval) throws -> Self {
        guard data.count <= 4096, now.isFinite, ["production", "sandbox"].contains(environment),
              NativeChatCodec.bareJID(owner) == owner, NativeAuthenticatedAccount.validJID(owner, domain: configuration.domain),
              let body = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(body.keys) == ["credential", "claims"],
              let credential = body["credential"] as? String, credential.utf8.count <= 1024,
              let metadata = body["claims"] as? [String: Any] else { throw NativePushRegistryFailure.invalidResponse }
        let pieces = credential.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count == 3, pieces[0] == "tcr1", matches(String(pieces[1]), "[A-Za-z0-9_-]+"),
              matches(String(pieces[2]), "[0-9a-f]{64}") else { throw NativePushRegistryFailure.invalidResponse }
        let encoded = String(pieces[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        guard let payload = Data(base64Encoded: encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4)),
              payload.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == pieces[1],
              let decoded = try JSONSerialization.jsonObject(with: payload) as? [String: Any] else { throw NativePushRegistryFailure.invalidResponse }
        let fields: Set<String> = ["version", "scope", "environment", "domain", "issuer", "owner", "peer", "callId", "sid", "deviceId", "generation", "profile", "nonce", "resource", "issuedAt", "expiresAt"]
        guard Set(metadata.keys) == fields, Set(decoded.keys) == fields else { throw NativePushRegistryFailure.invalidResponse }
        let claims = try JSONDecoder().decode(Claims.self, from: payload)
        let copy = try JSONDecoder().decode(Claims.self, from: JSONSerialization.data(withJSONObject: metadata))
        guard claims == copy, claims.version == 1, claims.scope == "call-xmpp-bootstrap-v1",
              claims.environment == environment, claims.domain == configuration.domain, claims.issuer == issuer,
              claims.owner == owner, NativeJingleTransport.fullJID(claims.peer),
              NativeChatCodec.bareJID(claims.peer) != owner,
              NativeChatCodec.bareJID(claims.peer)?.hasSuffix("@" + configuration.domain) == true,
              claims.callId == invitation.id, claims.sid == invitation.sid, claims.profile == invitation.media,
              claims.deviceId == registration.deviceID, claims.generation == registration.generation,
              matches(claims.generation, "[0-9a-f]{32}"), matches(claims.nonce, "[0-9a-f]{32}"),
              claims.resource == "tc-call-" + claims.nonce,
              TimeInterval(claims.issuedAt) <= now, now - TimeInterval(claims.issuedAt) <= 20,
              TimeInterval(claims.expiresAt) > now, TimeInterval(claims.expiresAt) - TimeInterval(claims.issuedAt) <= 20,
              TimeInterval(claims.expiresAt) <= invitation.expiresAt,
              TimeInterval(claims.expiresAt) <= registration.expiresAt else { throw NativePushRegistryFailure.invalidResponse }
        return Self(secret: credential, authority: claims, configuration: configuration, owner: owner, peer: claims.peer,
                    resource: claims.resource, expiresAt: TimeInterval(claims.expiresAt), callID: claims.callId, sid: claims.sid, media: claims.profile)
    }

    func activeLease(_ data: Data, registrationExpiry: TimeInterval, now: TimeInterval) throws -> NativeCallActiveLease {
        guard data.count <= 4096, now.isFinite, registrationExpiry.isFinite,
              let body = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(body.keys) == ["credential", "claims"],
              let credential = body["credential"] as? String, credential.utf8.count <= 1024,
              let metadata = body["claims"] as? [String: Any] else { throw NativePushRegistryFailure.invalidResponse }
        let pieces = credential.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count == 3, pieces[0] == "tcl1", Self.matches(String(pieces[1]), "[A-Za-z0-9_-]+"),
              Self.matches(String(pieces[2]), "[0-9a-f]{64}") else { throw NativePushRegistryFailure.invalidResponse }
        let encoded = String(pieces[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        guard let payload = Data(base64Encoded: encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4)),
              payload.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == pieces[1],
              let decoded = try JSONSerialization.jsonObject(with: payload) as? [String: Any],
              Set(decoded.keys) == Set(metadata.keys), Set(decoded.keys).count == 17 else { throw NativePushRegistryFailure.invalidResponse }
        let claims = try JSONDecoder().decode(Claims.self, from: payload)
        var pinned = claims
        pinned.scope = authority.scope; pinned.issuedAt = authority.issuedAt; pinned.expiresAt = authority.expiresAt
        guard claims == (try JSONDecoder().decode(Claims.self, from: JSONSerialization.data(withJSONObject: metadata))),
              pinned == authority, claims.scope == "call-xmpp-active-v1",
              TimeInterval(claims.issuedAt) <= now, now - TimeInterval(claims.issuedAt) <= 25,
              TimeInterval(claims.expiresAt) > now, TimeInterval(claims.expiresAt) - TimeInterval(claims.issuedAt) <= 25,
              TimeInterval(claims.expiresAt) <= registrationExpiry else { throw NativePushRegistryFailure.invalidResponse }
        return NativeCallActiveLease(credential: credential, expiresAt: TimeInterval(claims.expiresAt),
            owner: owner, peer: peer, resource: resource, callID: callID, sid: sid, domain: configuration.domain)
    }

    func matches(_ lease: NativeCallActiveLease) -> Bool {
        lease.owner == owner && lease.peer == peer && lease.resource == resource && lease.callID == callID
            && lease.sid == sid && lease.domain == configuration.domain
    }
    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: "\\A(?:" + pattern + ")\\z", options: .regularExpression) != nil
    }
}

struct NativeCallActiveLease: CustomStringConvertible, CustomDebugStringConvertible {
    let credential: String
    let expiresAt: TimeInterval
    let owner: String
    let peer: String
    let resource: String
    let callID: UUID
    let sid: String
    let domain: String
    var description: String { "NativeCallActiveLease(redacted)" }
    var debugDescription: String { description }
    fileprivate init(credential: String, expiresAt: TimeInterval, owner: String, peer: String, resource: String, callID: UUID, sid: String, domain: String) {
        self.credential = credential; self.expiresAt = expiresAt; self.owner = owner; self.peer = peer
        self.resource = resource; self.callID = callID; self.sid = sid; self.domain = domain
    }
}
