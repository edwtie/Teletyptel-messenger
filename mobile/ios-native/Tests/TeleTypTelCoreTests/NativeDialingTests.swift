import XCTest
@testable import TeleTypTelCore

final class NativeDialingTests: XCTestCase {
    func testStandardPhoneLettersAndBottomRow() {
        XCTAssertEqual(NativeDialing.letters["1"], "")
        XCTAssertEqual(NativeDialing.letters["2"], "ABC")
        XCTAssertEqual(NativeDialing.letters["7"], "PQRS")
        XCTAssertEqual(NativeDialing.letters["9"], "WXYZ")
        XCTAssertEqual(NativeDialing.letters["0"], "+")
        XCTAssertEqual(NativeDialing.normalized("0800-FLOWERS"), "08003569377")
        XCTAssertEqual(NativeDialing.normalized("+31 (0) 6-123"), "+3106123")
        XCTAssertEqual(NativeDialing.normalized("*0#"), "*0#")
        for invalid in ["", "sip:600@server", "600\r\n", "06+12", "你好", String(repeating: "2", count: 41)] { XCTAssertNil(NativeDialing.normalized(invalid)) }
    }
    func testLocalEchoRouteCannotDialEmergencyOrArbitraryNumbersOrForeignGateway() throws {
        let local = try ServerConfiguration(address: "https://192.168.0.105", domain: "localhost")
        let route = try NativeSIPLabRoute(configuration: local, gateway: "gateway@localhost/media", number: "600")
        XCTAssertEqual(route.contact.callEndpoint, "gateway@localhost/media")
        XCTAssertEqual(route.extensionNumber, "600")
        for number in ["112", "911", "0600000000", "600;evil", "601"] {
            XCTAssertThrowsError(try NativeSIPLabRoute(configuration: local, gateway: route.gateway, number: number))
        }
        for gateway in ["gateway@localhost", "gateway@other.test/media", "gateway@localhost/media\n"] {
            XCTAssertThrowsError(try NativeSIPLabRoute(configuration: local, gateway: gateway, number: "600"))
        }
        for address in ["https://example.invalid", "https://172.32.0.1", "https://192.169.0.1", "https://10.0.0.999", "https://10.invalid.0.0.1"] {
            XCTAssertThrowsError(try NativeSIPLabRoute(configuration: ServerConfiguration(address: address, domain: "localhost"), gateway: route.gateway, number: "600"))
        }
    }
}
