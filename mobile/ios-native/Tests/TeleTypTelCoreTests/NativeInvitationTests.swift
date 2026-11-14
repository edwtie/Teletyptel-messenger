import XCTest
@testable import TeleTypTelCore

final class NativeInvitationCodecTests: XCTestCase {
    private let xml = "<message xmlns='jabber:client' from='room@conference.localhost' to='owner@localhost/phone'><body>Compatibility text</body><x xmlns='http://jabber.org/protocol/muc#user'><invite from='peer@localhost/device'/></x></message>"
    private func decode(_ value: String) throws -> NativeGroupInvitationEvent? {
        NativeInvitationCodec.decode(try ProbeXML.parse(value), owner: "owner@localhost", boundJID: "owner@localhost/phone")
    }
    func testMediatedInvitationsAreScopedAndNeverBecomeDirectChat() throws {
        guard case .invited(let invitation) = try XCTUnwrap(decode(xml)) else { return XCTFail("Missing invitation") }
        XCTAssertEqual(invitation.room, "room@conference.localhost")
        XCTAssertEqual(invitation.inviter, "peer@localhost")
        XCTAssertEqual(invitation.replyTo, "peer@localhost/device")
        XCTAssertFalse(invitation.requiresPassword)
        XCTAssertNil(NativeChatCodec.decode(try ProbeXML.parse(xml), owner: "owner@localhost", boundJID: "owner@localhost/phone"))
        for invalid in [
            xml.replacingOccurrences(of: "room@conference.localhost", with: "room@conference.foreign"),
            xml.replacingOccurrences(of: "from='room@conference.localhost'", with: "from='room@conference.localhost/nick'"),
            xml.replacingOccurrences(of: "to='owner@localhost/phone'", with: "to='stranger@localhost'"),
            xml.replacingOccurrences(of: "peer@localhost/device", with: "owner@localhost/device"),
            xml.replacingOccurrences(of: "peer@localhost/device", with: "other@conference.localhost/nick"),
            xml.replacingOccurrences(of: "<invite from='peer@localhost/device'/>", with: "<invite from='peer@localhost'/><decline from='peer@localhost'/>"),
            xml.replacingOccurrences(of: "<invite from", with: "<invite xmlns='urn:foreign' from")
        ] { XCTAssertNil(try decode(invalid)) }
    }
    func testPasswordsAreNotRetainedAndDeclinesAreSeparateEvents() throws {
        let protected = xml.replacingOccurrences(of: "</x>", with: "<password>fictional-secret</password></x>")
        guard case .invited(let invitation) = try XCTUnwrap(decode(protected)) else { return XCTFail("Missing password marker") }
        XCTAssertTrue(invitation.requiresPassword)
        XCTAssertFalse(String(describing: invitation).contains("fictional-secret"))
        let decline = xml.replacingOccurrences(of: "<invite from=", with: "<decline from=")
        guard case .declined(let room, let peer) = try XCTUnwrap(decode(decline)) else { return XCTFail("Missing decline") }
        XCTAssertEqual(room, invitation.room); XCTAssertEqual(peer, invitation.inviter)
        XCTAssertNil(NativeChatCodec.decode(try ProbeXML.parse(decline), owner: "owner@localhost", boundJID: "owner@localhost/phone"))
    }
    func testEncodingEscapesAndRejectsForeignRoomsSelfTargetsAndExpiredReplies() throws {
        let encoded = try NativeInvitationCodec.invite(room: "room@conference.localhost", peer: "peer&one@localhost",
            owner: "owner@localhost", identifier: UUID().uuidString)
        XCTAssertTrue(encoded.contains("type='normal'")); XCTAssertTrue(encoded.contains("peer&amp;one@localhost"))
        XCTAssertFalse(encoded.contains("type='groupchat'"))
        XCTAssertThrowsError(try NativeInvitationCodec.invite(room: "room@conference.foreign", peer: "peer@localhost", owner: "owner@localhost", identifier: UUID().uuidString))
        XCTAssertThrowsError(try NativeInvitationCodec.invite(room: "room@conference.localhost", peer: "owner@localhost", owner: "owner@localhost", identifier: UUID().uuidString))
        guard case .invited(let invitation) = try XCTUnwrap(decode(xml)) else { return XCTFail("Missing invitation") }
        XCTAssertTrue(try NativeInvitationCodec.decline(invitation, owner: "owner@localhost").contains("<decline to='peer@localhost/device'"))
        let old = NativeGroupInvitation(id: UUID(), room: invitation.room, inviter: invitation.inviter, replyTo: invitation.replyTo,
            requiresPassword: false, receivedAt: Date(timeIntervalSinceNow: -601))
        XCTAssertThrowsError(try NativeInvitationCodec.decline(old, owner: "owner@localhost"))
    }
}

private actor InvitationFixture: NativeGroupInviting {
    private var observer: (@Sendable (NativeGroupInvitationEvent) -> Void)?
    private var groupCallbacks: [String: @Sendable (NativeGroupEvent) -> Void] = [:]
    private var held: [CheckedContinuation<Void, Error>] = []
    private(set) var joins = 0
    private(set) var invitationsSent = 0
    private(set) var declinesSent = 0
    let holdActions: Bool
    init(holdActions: Bool = false) { self.holdActions = holdActions }
    var observing: Bool { observer != nil }
    func observeGroupInvitations(_ observer: @escaping @Sendable (NativeGroupInvitationEvent) -> Void) async { self.observer = observer }
    func emit(_ event: NativeGroupInvitationEvent) { observer?(event) }
    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        joins += 1; groupCallbacks[room] = onEvent
    }
    func confirm(room: String) { groupCallbacks[room]?(.snapshot(NativeGroupSnapshot(room: room, nickname: "Me", participants: ["Me"], canSpeak: true))) }
    func inviteToGroup(room: String, peer: String, identifier: String) async throws {
        invitationsSent += 1
        if holdActions { try await withCheckedThrowingContinuation { held.append($0) } }
    }
    func declineGroupInvitation(_ invitation: NativeGroupInvitation) async throws {
        declinesSent += 1
        if holdActions { try await withCheckedThrowingContinuation { held.append($0) } }
    }
    func release(fail: Bool = false) {
        let pending = held; held.removeAll()
        for continuation in pending {
            if fail { continuation.resume(throwing: NativeGroupFailure.disconnected) } else { continuation.resume() }
        }
    }
    func leaveGroup(room: String) async { }
    func sendGroup(room: String, body: String, identifier: String) async throws { }
    func sendMessage(to jid: String, body: String, identifier: String) async throws { XCTFail("Invitation leaked to direct chat") }
}

final class NativeInvitationModelTests: XCTestCase {
    private let room = "room@conference.localhost"
    private let peer = NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both")
    private func invitation(room: String = "room@conference.localhost", peer: String = "peer@localhost", password: Bool = false, age: TimeInterval = 0) -> NativeGroupInvitation {
        NativeGroupInvitation(id: UUID(), room: room, inviter: peer, replyTo: peer + "/device", requiresPassword: password, receivedAt: Date(timeIntervalSinceNow: -age))
    }
    @MainActor
    private func wait(_ condition: () async -> Bool) async {
        for _ in 0..<1000 { if await condition() { return }; try? await Task.sleep(nanoseconds: 1_000_000) }
        XCTFail("Invitation state did not settle")
    }
    @MainActor
    func testEarlyKnownInvitesDeduplicateUnknownAndCrossAccountEventsAreDropped() async {
        let fixture = InvitationFixture(); let model = NativeGroupInvitationModel()
        model.attach(fixture, owner: "owner@localhost")
        await wait { await fixture.observing }
        let valid = invitation()
        await fixture.emit(.invited(valid)); await fixture.emit(.invited(invitation(peer: "unknown@localhost")))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(model.invitations.isEmpty)
        model.updateContacts([peer], owner: "owner@localhost")
        await wait { model.invitations.count == 1 }
        await fixture.emit(.invited(invitation()))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(model.invitations.count, 1)
        XCTAssertEqual(model.invitations[0].id, valid.id)
        model.decline(valid.id)
        await wait { model.invitations.isEmpty }
        let declined = await fixture.declinesSent; XCTAssertEqual(declined, 1)
        model.disconnect(clear: true)
        model.attach(fixture, owner: "new@localhost")
        await fixture.emit(.invited(valid))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(model.invitations.isEmpty)
        XCTAssertTrue(model.contacts.isEmpty)
        model.disconnect(clear: true)
    }
    @MainActor
    func testAcceptNeedsExplicitActionNicknameAndSelfPresence() async {
        let fixture = InvitationFixture(); let groups = NativeGroupModel()
        groups.updateContacts([peer], owner: "owner@localhost"); groups.attach(fixture, owner: "owner@localhost")
        await wait { await fixture.observing }
        let valid = invitation()
        await fixture.emit(.invited(valid))
        await wait { groups.invitationModel.invitations.count == 1 }
        let before = await fixture.joins; XCTAssertEqual(before, 0)
        groups.acceptInvitation(valid.id, nickname: "")
        let invalid = await fixture.joins; XCTAssertEqual(invalid, 0)
        groups.acceptInvitation(valid.id, nickname: "Me")
        await wait { await fixture.joins == 1 }
        XCTAssertEqual(groups.invitationModel.invitations.count, 1)
        await fixture.confirm(room: room)
        await wait { groups.invitationModel.invitations.isEmpty }
        XCTAssertNotNil(groups.rooms[0].snapshot)
        XCTAssertEqual(groups.invitationModel.notice, "Deelname bevestigd door de groep.")
        groups.invite(room: room, peer: peer.jid)
        await wait { groups.invitationModel.attempts.first?.state == .submitted }
        XCTAssertNil(groups.invitationModel.notice)
        groups.disconnect(clear: true)
    }
    @MainActor
    func testPasswordExpiryContactRemovalAndInboxBoundsAreExplicit() async {
        let fixture = InvitationFixture(); let model = NativeGroupInvitationModel()
        model.updateContacts([peer], owner: "owner@localhost"); model.attach(fixture, owner: "owner@localhost")
        await wait { await fixture.observing }
        let protected = invitation(password: true)
        await fixture.emit(.invited(protected)); await fixture.emit(.invited(invitation(room: "old@conference.localhost", age: 601)))
        await wait { model.invitations.count == 1 }
        XCTAssertNil(model.candidate(protected.id, nickname: "Me"))
        for index in 0..<25 { await fixture.emit(.invited(invitation(room: "room\(index)@conference.localhost"))) }
        await wait { model.invitations.count == 16 }
        model.updateContacts([], owner: "owner@localhost")
        XCTAssertTrue(model.invitations.isEmpty)
        model.disconnect(clear: true)
    }
    @MainActor
    func testDeclineFailureAndLateCompletionDoNotEraseAnotherAccountsInbox() async {
        let fixture = InvitationFixture(holdActions: true); let model = NativeGroupInvitationModel()
        model.updateContacts([peer], owner: "owner@localhost"); model.attach(fixture, owner: "owner@localhost")
        await wait { await fixture.observing }
        let valid = invitation(); await fixture.emit(.invited(valid))
        await wait { model.invitations.count == 1 }
        model.decline(valid.id)
        await wait { await fixture.declinesSent == 1 }
        await fixture.release(fail: true)
        await wait { model.pending.isEmpty }
        XCTAssertEqual(model.invitations.count, 1)
        model.decline(valid.id)
        await wait { await fixture.declinesSent == 2 }
        model.disconnect(clear: true)
        await fixture.release()
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(model.invitations.isEmpty); XCTAssertNil(model.notice)
    }
    @MainActor
    func testOnlyJoinedGroupsAndKnownTargetsCanInviteAndRejectionWinsLateSend() async {
        let fixture = InvitationFixture(holdActions: true); let groups = NativeGroupModel()
        groups.updateContacts([peer], owner: "owner@localhost"); groups.attach(fixture, owner: "owner@localhost")
        groups.invite(room: room, peer: peer.jid)
        XCTAssertTrue(groups.invitationModel.attempts.isEmpty)
        groups.join(room: room, nickname: "Me")
        await wait { await fixture.joins == 1 }
        await fixture.confirm(room: room)
        await wait { groups.rooms[0].snapshot != nil }
        groups.invite(room: room, peer: "unknown@localhost")
        XCTAssertTrue(groups.invitationModel.attempts.isEmpty)
        groups.invite(room: room, peer: peer.jid)
        await wait { await fixture.invitationsSent == 1 }
        let attempt = groups.invitationModel.attempts[0]
        groups.invitationModel.rejected(attempt.id.uuidString, room: "wrong@conference.localhost")
        XCTAssertEqual(groups.invitationModel.attempts[0].state, .sending)
        groups.invitationModel.rejected(attempt.id.uuidString, room: room)
        await fixture.release()
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(groups.invitationModel.attempts[0].state, .rejected)
        groups.disconnect(clear: true)
    }

    @MainActor
    func testRepeatedInvitesStayBoundedAndAmbiguousDeclinesDoNotInventCorrelation() async {
        let fixture = InvitationFixture(); let model = NativeGroupInvitationModel()
        model.updateContacts([peer], owner: "owner@localhost"); model.attach(fixture, owner: "owner@localhost")
        await wait { await fixture.observing }
        model.send(room: room, peer: peer.jid)
        await wait { model.attempts.last?.state == .submitted }
        await fixture.emit(.declined(room: room, peer: peer.jid))
        await wait { model.attempts[0].state == .declined }
        for count in 2...16 {
            model.send(room: room, peer: peer.jid)
            await wait { model.attempts.count == count && model.attempts.last?.state == .submitted }
        }
        model.send(room: room, peer: peer.jid)
        XCTAssertEqual(model.attempts.count, 16)
        await fixture.emit(.declined(room: room, peer: peer.jid))
        await wait { model.notice?.contains("precieze verzendverzoek") == true }
        XCTAssertEqual(model.attempts.last?.state, .submitted)
        model.disconnect(clear: true)
    }
}
