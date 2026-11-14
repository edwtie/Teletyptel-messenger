import XCTest
@testable import TeleTypTelCore

final class NativeDtmfTests: XCTestCase {
    func testTwelvePhoneKeysAndCanonicalExtendedEventsAreBounded() {
        for tone in "0123456789*#ABCD" {
            XCTAssertEqual(NativeDtmf.appending(String(tone), to: "12"), "12" + String(tone))
        }
        XCTAssertEqual(NativeDtmf.duration, 0.1)
        XCTAssertEqual(NativeDtmf.gap, 0.07)
        XCTAssertEqual(NativeDtmf.appending("#", to: String(repeating: "1", count: 15)), String(repeating: "1", count: 15) + "#")
        XCTAssertNil(NativeDtmf.appending("1", to: String(repeating: "1", count: 16)))
    }

    func testTextNumbersPausesAndControlsCannotBecomeDtmfSequences() {
        for invalid in ["", "12", "+", ",", ";", "a", "hello", "١", "１", "\n", "\0"] {
            XCTAssertNil(NativeDtmf.appending(invalid, to: ""))
        }
        for queued in [",", ";", "a", "hello", "١", "１", "\n", "\0"] { XCTAssertNil(NativeDtmf.appending("1", to: queued)) }
    }
}
