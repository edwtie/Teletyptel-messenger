import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeInvitationIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let trustedPort: Int
        let username: String
        let archivePeer: String
        let groupOutsider: String
        let invitationRoom: String
        let password: String
    }
    private func fixture() throws -> Fixture {
        guard let path = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in isolated invitation test; no real server contacted")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else { throw ConnectionFailure.configuration }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        guard (1024...65535).contains(fixture.trustedPort), fixture.username.hasPrefix("native-test-"),
              fixture.archivePeer == fixture.username + "-archive", fixture.groupOutsider == fixture.username + "-outsider",
              fixture.invitationRoom == fixture.username + "-room-invites" else { throw ConnectionFailure.configuration }
        return fixture
    }
    private func connect(_ account: NativeAuthenticatedAccount, endpoint: InvitationEndpoint) -> Task<Void, Error> {
        Task {
            try await NativeXMPPConnection().run(account: account, onConnected: { _ in }, onRoster: { _ in },
                onChat: { _ in Task { await endpoint.recordDirect() } },
                onSender: { sender in Task { await endpoint.setSender(sender) } })
        }
    }
    private func ready(_ endpoint: InvitationEndpoint) async throws -> any NativeGroupInviting {
        for _ in 0..<1500 {
            if let sender = await endpoint.sender { return sender }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw ConnectionFailure.timeout
    }
    private func invited(_ endpoint: InvitationEndpoint) async throws -> NativeGroupInvitation {
        for _ in 0..<500 {
            if let invitation = await endpoint.invitation { return invitation }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw ConnectionFailure.timeout
    }
    func testMediatedInviteDeclineAndExplicitJoinThroughActualRoom() async throws {
        let fixture = try fixture()
        let configuration = try ServerConfiguration(address: "https://localhost:\(fixture.trustedPort)", domain: "localhost")
        func account(_ user: String) -> NativeAuthenticatedAccount {
            NativeAuthenticatedAccount(configuration: configuration, jid: user + "@localhost", password: fixture.password)
        }
        let owner = InvitationEndpoint(); let declined = InvitationEndpoint(); let accepted = InvitationEndpoint()
        let ownerConnection = connect(account(fixture.username), endpoint: owner)
        let declinedConnection = connect(account(fixture.archivePeer), endpoint: declined)
        let acceptedConnection = connect(account(fixture.groupOutsider), endpoint: accepted)
        defer { ownerConnection.cancel(); declinedConnection.cancel(); acceptedConnection.cancel() }
        let ownerSender = try await ready(owner); let declineSender = try await ready(declined); let acceptSender = try await ready(accepted)
        await ownerSender.observeGroupInvitations { event in Task { await owner.append(event) } }
        await declineSender.observeGroupInvitations { event in Task { await declined.append(event) } }
        await acceptSender.observeGroupInvitations { event in Task { await accepted.append(event) } }
        let room = fixture.invitationRoom + "@conference.localhost"
        try await ownerSender.joinGroup(room: room, nickname: "Owner") { event in Task { await owner.appendGroup(event) } }
        try await ownerSender.inviteToGroup(room: room, peer: fixture.archivePeer + "@localhost", identifier: UUID().uuidString)
        let invitation = try await invited(declined)
        XCTAssertEqual(invitation.room, room); XCTAssertEqual(invitation.inviter, fixture.username + "@localhost")
        XCTAssertFalse(invitation.requiresPassword)
        do {
            try await declineSender.sendGroup(room: room, body: "Must not autojoin", identifier: UUID().uuidString)
            XCTFail("Receiving an invitation must not silently join the room")
        } catch { XCTAssertEqual(error as? NativeGroupFailure, .disconnected) }
        try await declineSender.declineGroupInvitation(invitation)
        var receivedDecline = false
        for _ in 0..<500 {
            if await owner.decliner == fixture.archivePeer + "@localhost" { receivedDecline = true; break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertTrue(receivedDecline)
        try await ownerSender.inviteToGroup(room: room, peer: fixture.groupOutsider + "@localhost", identifier: UUID().uuidString)
        _ = try await invited(accepted)
        try await acceptSender.joinGroup(room: room, nickname: "Accepted") { event in Task { await accepted.appendGroup(event) } }
        try await ownerSender.sendGroup(room: room, body: "Fictieve tekst na bewust deelnemen", identifier: UUID().uuidString)
        for _ in 0..<500 {
            if await accepted.groupCount == 1 { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        let acceptedCount = await accepted.groupCount; let declinedCount = await declined.groupCount
        let directCount = await accepted.directCount
        XCTAssertEqual(acceptedCount, 1); XCTAssertEqual(declinedCount, 0); XCTAssertEqual(directCount, 0)
        let managing = try XCTUnwrap(ownerSender as? any NativeGroupManaging)
        let nonOwner = try XCTUnwrap(acceptSender as? any NativeGroupManaging)
        guard case .configuration(var configuration) = try await managing.manageGroup(.configuration(room)) else { return XCTFail("Owner configuration missing") }
        configuration.name = "Fictieve besloten testgroep"; configuration.membersOnly = true; configuration.publicRoom = false
        _ = try await managing.manageGroup(.configure(room, configuration))
        do { _ = try await nonOwner.manageGroup(.configure(room, configuration)); XCTFail("Non-owner configured the room") } catch {}
        guard case .members(let members) = try await managing.manageGroup(.members(room, "member")) else { return XCTFail("No member list") }
        XCTAssertTrue(members.contains(fixture.groupOutsider + "@localhost"))
        _ = try await managing.manageGroup(.role(room, "Accepted", "visitor"))
        for _ in 0..<500 { if await accepted.canSpeak == false { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let muted = await accepted.canSpeak; XCTAssertEqual(muted, false)
        do { try await acceptSender.sendGroup(room: room, body: "Must not speak", identifier: UUID().uuidString); XCTFail("Visitor spoke") } catch { XCTAssertEqual(error as? NativeGroupFailure, .denied) }
        _ = try await managing.manageGroup(.role(room, "Accepted", "participant"))
        _ = try await managing.manageGroup(.affiliation(room, fixture.archivePeer + "@localhost", "outcast"))
        guard case .members(let banned) = try await managing.manageGroup(.members(room, "outcast")) else { return XCTFail("No ban list") }
        XCTAssertTrue(banned.contains(fixture.archivePeer + "@localhost"))
        try await managing.setGroupSubject(room: room, subject: "Fictief onderwerp")
        for _ in 0..<500 { if await owner.subject == "Fictief onderwerp" { break }; try await Task.sleep(nanoseconds: 10_000_000) }
        let subject = await owner.subject; XCTAssertEqual(subject, "Fictief onderwerp")
        let created = fixture.invitationRoom + "-new@conference.localhost"
        try await managing.createGroup(room: created, nickname: "Creator") { _ in }
        guard case .configuration(let createdConfiguration) = try await managing.manageGroup(.configuration(created)) else { return XCTFail("No created configuration") }
        XCTAssertTrue(createdConfiguration.membersOnly); XCTAssertFalse(createdConfiguration.publicRoom)
        await managing.leaveGroup(room: created)
        await acceptSender.leaveGroup(room: room); await ownerSender.leaveGroup(room: room)
        ownerConnection.cancel(); declinedConnection.cancel(); acceptedConnection.cancel()
        _ = try? await ownerConnection.value; _ = try? await declinedConnection.value; _ = try? await acceptedConnection.value
    }
}

private actor InvitationEndpoint {
    private(set) var sender: (any NativeGroupInviting)?
    private(set) var invitation: NativeGroupInvitation?
    private(set) var decliner: String?
    private(set) var groupCount = 0
    private(set) var directCount = 0
    private(set) var canSpeak: Bool?
    private(set) var subject: String?
    func setSender(_ sender: any NativeChatSending) { self.sender = sender as? any NativeGroupInviting }
    func recordDirect() { directCount += 1 }
    func appendGroup(_ event: NativeGroupEvent) {
        if case .message = event { groupCount += 1 }
        if case .snapshot(let snapshot) = event { canSpeak = snapshot.canSpeak }
        if case .subject(let text) = event { subject = text }
    }
    func append(_ event: NativeGroupInvitationEvent) {
        switch event {
        case .invited(let invitation): self.invitation = invitation
        case .declined(_, let peer): decliner = peer
        }
    }
}
