import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeGroupManagementTests: XCTestCase {
    private let room = "room@conference.localhost"
    private let account = "owner@localhost"
    func testManagementCommandsAreEscapedScopedAndNeverTransferOwner() throws {
        let xml = try NativeGroupManagementCodec.request(.role(room, "A&B", "visitor"), account: account, identifier: "test")
        XCTAssertTrue(xml.contains("nick='A&amp;B'")); XCTAssertTrue(xml.contains("role='visitor'"))
        XCTAssertThrowsError(try NativeGroupManagementCodec.request(.role(room, "Nick", "owner"), account: account, identifier: "test"))
        XCTAssertThrowsError(try NativeGroupManagementCodec.request(.affiliation(room, "owner@localhost", "outcast"), account: account, identifier: "test"))
        XCTAssertThrowsError(try NativeGroupManagementCodec.request(.configuration("room@conference.other"), account: account, identifier: "test"))
        XCTAssertThrowsError(try NativeGroupManagementCodec.request(.affiliation(room, "user@localhost", "owner"), account: account, identifier: "test"))
    }
    func testDiscoFiltersAliasesForeignRoomsAndDuplicates() throws {
        let root = try ProbeXML.parse("<iq xmlns='jabber:client' type='result' from='conference.localhost'><query xmlns='http://jabber.org/protocol/disco#items'><item jid='\(room)' name='Groep'/><item jid='\(room)'/><item jid='x@conference.other'/><item jid='\(room)/alias'/></query></iq>")
        guard case .rooms(let rooms) = try NativeGroupManagementCodec.decode(root, command: .discover, account: account) else { return XCTFail("No rooms") }
        XCTAssertEqual(rooms.count, 1); XCTAssertEqual(rooms[0].name, "Groep")
    }
    func testConfigurationPreservesUnknownFieldsButRejectsSecretsAndWrongForms() throws {
        let payload = "<iq xmlns='jabber:client' type='result' from='\(room)'><query xmlns='http://jabber.org/protocol/muc#owner'><x xmlns='jabber:x:data' type='form'><field var='FORM_TYPE'><value>http://jabber.org/protocol/muc#roomconfig</value></field><field type='fixed'><value>Uitleg</value></field><field var='muc#roomconfig_roomname'><value>Naam</value></field><field var='custom-field'><value>Behouden</value></field></x></query></iq>"
        guard case .configuration(var configuration) = try NativeGroupManagementCodec.decode(ProbeXML.parse(payload), command: .configuration(room), account: account) else { return XCTFail("No configuration") }
        configuration.name = "Nieuwe naam"
        let request = try NativeGroupManagementCodec.request(.configure(room, configuration), account: account, identifier: "test")
        XCTAssertTrue(request.contains("Nieuwe naam")); XCTAssertTrue(request.contains("Behouden"))
        let secret = payload.replacingOccurrences(of: "</x>", with: "<field var='secret' type='text-private'><value>Not retained</value></field></x>")
        XCTAssertThrowsError(try NativeGroupManagementCodec.decode(ProbeXML.parse(secret), command: .configuration(room), account: account))
        XCTAssertThrowsError(try NativeGroupManagementCodec.decode(ProbeXML.parse(payload.replacingOccurrences(of: "muc#roomconfig</value>", with: "other</value>")), command: .configuration(room), account: account))
    }
    func testExplicitCreationRequiresNotFoundAndCreatedSelfPresence() throws {
        var stream = try NativeMUCStream(room: room, nickname: "Me", boundJID: account + "/test", creating: true)
        let output = stream.receive(try ProbeXML.parse("<iq xmlns='jabber:client' type='error' from='\(room)' id='\(stream.identifier)'><error><item-not-found xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error></iq>"))
        XCTAssertEqual(output.frames.count, 1)
        _ = stream.receive(try ProbeXML.parse("<presence xmlns='jabber:client' from='\(room)/Me'><x xmlns='http://jabber.org/protocol/muc#user'><item role='moderator' affiliation='owner'/><status code='110'/><status code='201'/></x></presence>"))
        XCTAssertEqual(stream.phase, .joined); XCTAssertFalse(stream.canSpeak)
        stream.confirmCreation(); XCTAssertTrue(stream.canSpeak); XCTAssertEqual(stream.snapshot.ownAffiliation, "owner")
    }
}
