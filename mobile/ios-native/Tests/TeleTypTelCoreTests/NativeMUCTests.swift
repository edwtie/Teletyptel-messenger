import XCTest
@testable import TeleTypTelCore

final class NativeMUCTests: XCTestCase {
    private let room = "room@conference.localhost"

    func testReactionsRequireAdvertisedRoomIDsStableOccupantAndJoinedSender() throws {
        var stream = try stream()
        let discovery = info(stream).replacingOccurrences(of: "</query>", with: "<feature var='urn:xmpp:occupant-id:0'/><feature var='urn:xmpp:sid:0'/></query>")
        _ = stream.receive(try ProbeXML.parse(discovery))
        _ = stream.receive(try ProbeXML.parse(presence(nickname: "Peer", codes: [])))
        let own = presence().replacingOccurrences(of: "</presence>", with: "<occupant-id xmlns='urn:xmpp:occupant-id:0' id='stable-own'/></presence>")
        _ = stream.receive(try ProbeXML.parse(own))
        XCTAssertTrue(stream.snapshot.supportsReactions)
        XCTAssertEqual(stream.snapshot.ownOccupantID, "stable-own")
        let xml = "<message xmlns='jabber:client' from='\(room)/Peer' type='groupchat'><reactions xmlns='urn:xmpp:reactions:0' id='room-id'><reaction>👍</reaction></reactions><occupant-id xmlns='urn:xmpp:occupant-id:0' id='stable-peer'/></message>"
        guard case .reactions(let target, let actor, let values) = stream.receive(try ProbeXML.parse(xml)).events.first else { return XCTFail("Missing group reaction") }
        XCTAssertEqual(target, "room-id"); XCTAssertEqual(actor, "stable-peer"); XCTAssertEqual(values, ["👍"])
        XCTAssertTrue(stream.receive(try ProbeXML.parse(xml.replacingOccurrences(of: "/Peer", with: "/Unknown"))).events.isEmpty)
        XCTAssertTrue(stream.receive(try ProbeXML.parse(xml.replacingOccurrences(of: "<occupant-id xmlns='urn:xmpp:occupant-id:0' id='stable-peer'/>", with: ""))).events.isEmpty)
        var unsupported = try joined()
        XCTAssertFalse(unsupported.snapshot.supportsReactions)
        XCTAssertTrue(unsupported.receive(try ProbeXML.parse(xml)).events.isEmpty)
    }

    func testRetractionRequiresAdvertisedStableAuthorAndRoomScopedIdentifier() throws {
        var stream = try stream()
        let discovery = info(stream).replacingOccurrences(of: "</query>", with: "<feature var='urn:xmpp:occupant-id:0'/><feature var='urn:xmpp:message-retract:1'/></query>")
        _ = stream.receive(try ProbeXML.parse(discovery))
        _ = stream.receive(try ProbeXML.parse(presence(nickname: "Peer", codes: [])))
        let selfPresence = stream.receive(try ProbeXML.parse(presence()))
        guard case .snapshot(let snapshot) = selfPresence.events.first else { return XCTFail("No snapshot") }
        XCTAssertTrue(snapshot.supportsRetraction)
        let original = "<message xmlns='jabber:client' from='\(room)/Peer' type='groupchat' id='client-id'><body>Tekst</body><stanza-id xmlns='urn:xmpp:sid:0' by='\(room)' id='room-id'/><occupant-id xmlns='urn:xmpp:occupant-id:0' id='stable-peer'/></message>"
        guard case .message(let text) = stream.receive(try ProbeXML.parse(original)).events.first else { return XCTFail("No text") }
        XCTAssertEqual(text.archiveID, "room-id"); XCTAssertEqual(text.occupantID, "stable-peer")
        let retract = "<message xmlns='jabber:client' from='\(room)/Peer' type='groupchat' id='request'><retract xmlns='urn:xmpp:message-retract:1' id='room-id'/><occupant-id xmlns='urn:xmpp:occupant-id:0' id='stable-peer'/></message>"
        guard case .retracted(let target, let author) = stream.receive(try ProbeXML.parse(retract)).events.first else { return XCTFail("No retraction") }
        XCTAssertEqual(target, "room-id"); XCTAssertEqual(author, "stable-peer")
        XCTAssertTrue(stream.receive(try ProbeXML.parse(retract.replacingOccurrences(of: "<occupant-id xmlns='urn:xmpp:occupant-id:0' id='stable-peer'/>", with: ""))).events.isEmpty)
        var legacy = try joined()
        XCTAssertTrue(legacy.receive(try ProbeXML.parse(retract)).events.isEmpty)
    }
    private func stream() throws -> NativeMUCStream { try NativeMUCStream(room: room, nickname: "Me", boundJID: "owner@localhost/phone") }
    private func info(_ stream: NativeMUCStream) -> String {
        "<iq xmlns='jabber:client' from='\(room)' id='\(stream.identifier)' type='result'><query xmlns='http://jabber.org/protocol/disco#info'><feature var='http://jabber.org/protocol/muc'/></query></iq>"
    }
    private func presence(nickname: String = "Me", role: String = "participant", codes: [String] = ["110"], type: String = "") -> String {
        "<presence xmlns='jabber:client' from='\(room)/\(nickname)' \(type)><x xmlns='http://jabber.org/protocol/muc#user'><item affiliation='member' role='\(role)'/>" + codes.map { "<status code='\($0)'/>" }.joined() + "</x></presence>"
    }
    private func joined() throws -> NativeMUCStream {
        var stream = try stream()
        _ = stream.receive(try ProbeXML.parse(info(stream)))
        _ = stream.receive(try ProbeXML.parse(presence(nickname: "Peer", codes: [])))
        _ = stream.receive(try ProbeXML.parse(presence()))
        return stream
    }
    func testJoinRequiresExistingRoomDiscoveryAndAuthoritativeSelfPresence() throws {
        var stream = try stream()
        XCTAssertTrue(stream.request.contains("disco#info"))
        let fake = info(stream).replacingOccurrences(of: "from='\(room)'", with: "from='other@conference.localhost'")
        XCTAssertTrue(stream.receive(try ProbeXML.parse(fake)).frames.isEmpty)
        XCTAssertEqual(stream.phase, .checking)
        let join = stream.receive(try ProbeXML.parse(info(stream)))
        XCTAssertTrue(join.frames[0].contains("maxstanzas='0'"))
        XCTAssertEqual(stream.phase, .joining)
        XCTAssertThrowsError(try stream.message(body: "Not yet", identifier: UUID().uuidString))
        _ = stream.receive(try ProbeXML.parse(presence(nickname: "Peer", codes: [])))
        XCTAssertEqual(stream.phase, .joining)
        let ready = stream.receive(try ProbeXML.parse(presence()))
        XCTAssertEqual(stream.phase, .joined)
        guard case .snapshot(let snapshot) = ready.events.first else { return XCTFail("Missing self-presence snapshot") }
        XCTAssertEqual(snapshot.participants, ["Me", "Peer"])
        XCTAssertTrue(snapshot.canSpeak)
        XCTAssertTrue(try stream.message(body: "A & B", identifier: UUID().uuidString).contains("A &amp; B"))
    }
    func testDiscoveryErrorAndNewRoomNeverConfigureOrJoinUnknownRooms() throws {
        var missing = try stream()
        let error = "<iq xmlns='jabber:client' from='\(room)' id='\(missing.identifier)' type='error'><error type='cancel'/></iq>"
        _ = missing.receive(try ProbeXML.parse(error))
        XCTAssertEqual(missing.phase, .ended)
        var created = try stream()
        _ = created.receive(try ProbeXML.parse(info(created)))
        let rejected = created.receive(try ProbeXML.parse(presence(codes: ["110", "201"])))
        XCTAssertEqual(created.phase, .ended)
        XCTAssertTrue(rejected.frames[0].contains("unavailable"))
        XCTAssertFalse(rejected.frames.joined().contains("muc#owner"))
        XCTAssertThrowsError(try NativeMUCStream(room: "room@conference.foreign", nickname: "Me", boundJID: "owner@localhost/phone"))
        XCTAssertThrowsError(try NativeMUCStream(room: room, nickname: "Bad/name", boundJID: "owner@localhost/phone"))
    }
    func testMessagesRequireJoinedRoomParticipantAndCorrectRecipient() throws {
        var stream = try joined()
        let message = "<message xmlns='jabber:client' from='\(room)/Peer' to='owner@localhost/phone' type='groupchat' id='same'><body>Hello</body></message>"
        let event = stream.receive(try ProbeXML.parse(message))
        guard case .message(let text) = event.events.first else { return XCTFail("Missing group message") }
        XCTAssertEqual(text.room, room); XCTAssertEqual(text.nickname, "Peer"); XCTAssertFalse(text.own)
        for xml in [message.replacingOccurrences(of: room, with: "other@conference.localhost"),
                    message.replacingOccurrences(of: "/Peer", with: "/Unknown"),
                    message.replacingOccurrences(of: "owner@localhost/phone", with: "other@localhost/device"),
                    message.replacingOccurrences(of: "type='groupchat'", with: "type='chat'"),
                    message.replacingOccurrences(of: "Hello", with: String(repeating: "x", count: 8193))] {
            XCTAssertTrue(stream.receive(try ProbeXML.parse(xml)).events.isEmpty)
        }
        XCTAssertNil(NativeChatCodec.decode(try ProbeXML.parse(message), owner: "owner@localhost", boundJID: "owner@localhost/phone"))
    }
    func testVisitorsCanReadButCannotSendAndRemovalEndsParticipation() throws {
        var stream = try joined()
        _ = stream.receive(try ProbeXML.parse(presence(role: "visitor")))
        XCTAssertFalse(stream.canSpeak)
        XCTAssertThrowsError(try stream.message(body: "Forbidden", identifier: UUID().uuidString))
        let removed = stream.receive(try ProbeXML.parse(presence(role: "none", codes: ["110", "307"], type: "type='unavailable'")))
        guard case .ended(let reason) = removed.events.first else { return XCTFail("Missing removal") }
        XCTAssertEqual(reason, .removed)
        XCTAssertEqual(stream.phase, .ended)
        XCTAssertTrue(stream.receive(try ProbeXML.parse(presence())).events.isEmpty)
    }
    func testServerRenamedNicknameAndExplicitConflictsAreBounded() throws {
        var stream = try stream()
        _ = stream.receive(try ProbeXML.parse(info(stream)))
        _ = stream.receive(try ProbeXML.parse(presence(nickname: "Assigned", codes: ["110", "210"])))
        XCTAssertEqual(stream.nickname, "Assigned")
        XCTAssertTrue(stream.canSpeak)
        var conflict = try self.stream()
        _ = conflict.receive(try ProbeXML.parse(info(conflict)))
        let error = "<presence xmlns='jabber:client' from='\(room)/Me' type='error'><error type='cancel'><conflict xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error></presence>"
        guard case .ended(let reason) = conflict.receive(try ProbeXML.parse(error)).events.first else { return XCTFail("Missing conflict") }
        XCTAssertEqual(reason, .nicknameConflict)
        var crowded = try joined()
        for index in 0..<127 { _ = crowded.receive(try ProbeXML.parse(presence(nickname: "Peer\(index)", codes: []))) }
        XCTAssertEqual(crowded.phase, .ended)
    }
}

private actor GroupFixture: NativeGroupMessageChanging, NativeGroupReacting {
    var callbacks: [String: @Sendable (NativeGroupEvent) -> Void] = [:]
    var sends = 0
    var retractions = 0
    var reactions: [NativeChatInteraction] = []
    func reactGroup(room: String, target: String, values: [String], identifier: String) async throws {
        reactions.append(.reactions(target: target, values: values))
        callbacks[room]?(.reactions(target: target, occupantID: "stable-own", values: values))
    }
    func retractGroupMessage(room: String, target: String, identifier: String) async throws { retractions += 1 }
    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        callbacks[room] = onEvent
        onEvent(.snapshot(NativeGroupSnapshot(room: room, nickname: nickname, participants: [nickname, "Peer"], canSpeak: true)))
    }
    func sendGroup(room: String, body: String, identifier: String) async throws {
        sends += 1
        callbacks[room]?(.message(NativeGroupText(id: UUID(), room: room, nickname: "Me", identifier: identifier,
            archiveID: nil, body: body, date: Date(), own: true, state: .submitted)))
    }
    func emit(_ event: NativeGroupEvent, room: String) { callbacks[room]?(event) }
    func leaveGroup(room: String) async { }
    func sendMessage(to jid: String, body: String, identifier: String) async throws { XCTFail("Group text leaked into direct chat") }
}

final class NativeGroupModelTests: XCTestCase {
    @MainActor
    func testReactionTargetsRoomIDAndUpdatesOnlyServerConfirmedStableActor() async {
        let fixture = GroupFixture(); let model = NativeGroupModel(); let room = "room@conference.localhost"
        model.attach(fixture, owner: "owner@localhost"); model.join(room: room, nickname: "Me")
        await wait { model.rooms.first?.snapshot != nil }
        let message = NativeGroupText(id: UUID(), room: room, nickname: "Peer", identifier: "client-id", archiveID: "room-id", body: "Tekst", date: Date(), own: false, state: .incoming, occupantID: "stable-peer")
        await fixture.emit(.message(message), room: room)
        await wait { model.rooms[0].messages.count == 1 }
        XCTAssertFalse(model.canReact(room: room, identifier: message.id))
        await fixture.emit(.snapshot(NativeGroupSnapshot(room: room, nickname: "Me", participants: ["Me", "Peer"], canSpeak: true, supportsReactions: true, ownOccupantID: "stable-own")), room: room)
        await wait { model.canReact(room: room, identifier: message.id) }
        model.react(room: room, identifier: message.id, emoji: "👍")
        await wait { model.rooms[0].messages[0].reactions["stable-own"] == ["👍"] && !model.rooms[0].messages[0].actionPending }
        let sent = await fixture.reactions
        XCTAssertEqual(sent, [.reactions(target: "room-id", values: ["👍"])])
        model.react(room: room, identifier: message.id, emoji: "👍")
        await wait { model.rooms[0].messages[0].reactions.isEmpty && !model.rooms[0].messages[0].actionPending }
        await fixture.emit(.reactions(target: "client-id", occupantID: "stable-peer", values: ["😂"]), room: room)
        await fixture.emit(.subject("Barrier"), room: room)
        await wait { model.rooms[0].subject == "Barrier" }
        XCTAssertTrue(model.rooms[0].messages[0].reactions.isEmpty)
        model.disconnect(clear: true)
    }
    @MainActor
    func testOwnGroupRetractionRequiresServerEchoAndWaitsForAuthorMatchedReflection() async {
        let fixture = GroupFixture(); let model = NativeGroupModel()
        let room = "room@conference.localhost"
        model.attach(fixture, owner: "owner@localhost"); model.join(room: room, nickname: "Me")
        await wait { model.rooms.first?.snapshot != nil }
        model.setDraft("Eigen tekst", room: room); model.send(room: room)
        await wait { model.rooms[0].messages.first?.state == .submitted }
        let message = model.rooms[0].messages[0]
        XCTAssertFalse(model.canRetract(room: room, identifier: message.id))
        await fixture.emit(.snapshot(NativeGroupSnapshot(room: room, nickname: "Me", participants: ["Me", "Peer"], canSpeak: true, supportsRetraction: true)), room: room)
        await fixture.emit(.message(NativeGroupText(id: UUID(), room: room, nickname: "Me", identifier: message.identifier,
            archiveID: "server-own", body: message.body, date: Date(), own: true, state: .submitted, occupantID: "stable-own")), room: room)
        await wait { model.canRetract(room: room, identifier: message.id) }
        XCTAssertEqual(model.rooms[0].messages.count, 1)
        model.retract(room: room, identifier: message.id)
        await wait { !model.rooms[0].messages[0].actionPending }
        let sent = await fixture.retractions
        XCTAssertEqual(sent, 1)
        XCTAssertFalse(model.rooms[0].messages[0].retracted)
        await fixture.emit(.retracted(target: "server-own", occupantID: "stable-own"), room: room)
        await wait { model.rooms[0].messages[0].retracted }
        XCTAssertEqual(model.rooms[0].messages[0].body, "")
        model.disconnect(clear: true)
    }
    @MainActor
    func testRoomRetractionCannotUseNicknameOrAnotherOccupantsIdentity() async {
        let fixture = GroupFixture(); let model = NativeGroupModel()
        let room = "room@conference.localhost"
        model.attach(fixture, owner: "owner@localhost"); model.join(room: room, nickname: "Me")
        await wait { model.rooms.first?.snapshot != nil }
        let text = NativeGroupText(id: UUID(), room: room, nickname: "Peer", identifier: "client-id", archiveID: "server-id",
            body: "Bewaren", date: Date(), own: false, state: .incoming, occupantID: "stable-peer")
        await fixture.emit(.message(text), room: room)
        await wait { model.rooms[0].messages.count == 1 }
        await fixture.emit(.retracted(target: "server-id", occupantID: "attacker"), room: room)
        await fixture.emit(.retracted(target: "client-id", occupantID: "stable-peer"), room: room)
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(model.rooms[0].messages[0].body, "Bewaren")
        XCTAssertFalse(model.canRetract(room: room, identifier: text.id))
        await fixture.emit(.retracted(target: "server-id", occupantID: "stable-peer"), room: room)
        await wait { model.rooms[0].messages[0].retracted }
        XCTAssertEqual(model.rooms[0].messages[0].body, "")
        model.disconnect(clear: true)
    }
    @MainActor
    private func wait(_ condition: () -> Bool) async {
        for _ in 0..<1000 { if condition() { return }; try? await Task.sleep(nanoseconds: 1_000_000) }
        XCTFail("Group model did not reach expected state")
    }
    @MainActor
    func testEchoAndCrossRoomIDsStaySeparateAndLogoutRejectsLateEvents() async {
        let fixture = GroupFixture()
        let model = NativeGroupModel()
        let room = "one@conference.localhost"
        let other = "two@conference.localhost"
        model.attach(fixture, owner: "owner@localhost")
        model.join(room: room, nickname: "Me"); model.join(room: other, nickname: "Me")
        await wait { model.rooms.count == 2 && model.rooms.allSatisfy { $0.snapshot != nil } }
        model.setDraft("Own text", room: room); model.send(room: room)
        await wait { model.rooms[0].messages.first?.state == .submitted }
        XCTAssertEqual(model.rooms[0].messages.count, 1)
        for selected in [room, other] {
            let text = NativeGroupText(id: UUID(), room: selected, nickname: "Peer", identifier: "same", archiveID: nil,
                body: "Fictional", date: Date(), own: false, state: .incoming)
            await fixture.emit(.message(text), room: selected); await fixture.emit(.message(text), room: selected)
        }
        await wait { model.rooms[0].messages.count == 2 && model.rooms[1].messages.count == 1 }
        model.setDraft("Keep draft", room: room)
        model.disconnect(clear: false)
        XCTAssertEqual(model.rooms[0].draft, "Keep draft")
        XCTAssertNil(model.rooms[0].snapshot)
        model.disconnect(clear: true)
        await fixture.emit(.snapshot(NativeGroupSnapshot(room: room, nickname: "Me", participants: ["Me"], canSpeak: true)), room: room)
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(model.rooms.isEmpty)
        model.attach(fixture, owner: "new@localhost")
        XCTAssertTrue(model.rooms.isEmpty)
    }
    @MainActor
    func testVisitorRejectionLimitsAndExplicitLeavePreserveText() async {
        let fixture = GroupFixture()
        let model = NativeGroupModel()
        let room = "room@conference.localhost"
        model.attach(fixture, owner: "owner@localhost")
        model.join(room: room, nickname: "Me")
        await wait { model.rooms.first?.snapshot != nil }
        await fixture.emit(.snapshot(NativeGroupSnapshot(room: room, nickname: "Me", participants: ["Me"], canSpeak: false)), room: room)
        await wait { model.rooms[0].snapshot?.canSpeak == false }
        model.setDraft("Unsent visitor text", room: room); model.send(room: room)
        XCTAssertEqual(model.rooms[0].draft, "Unsent visitor text"); XCTAssertTrue(model.rooms[0].messages.isEmpty)
        await fixture.emit(.snapshot(NativeGroupSnapshot(room: room, nickname: "Me", participants: ["Me"], canSpeak: true)), room: room)
        await wait { model.rooms[0].snapshot?.canSpeak == true }
        model.send(room: room)
        await wait { model.rooms[0].messages.first?.state == .submitted }
        let identifier = model.rooms[0].messages[0].identifier!
        await fixture.emit(.rejected(identifier), room: room)
        await wait { model.rooms[0].messages[0].state == .rejected }
        model.leave(room: room)
        XCTAssertNil(model.rooms[0].snapshot)
        XCTAssertEqual(model.rooms[0].messages.count, 1)
        model.disconnect(clear: true)
    }
}
