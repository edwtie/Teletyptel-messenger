import XCTest
@testable import TeleTypTelCore

final class NativeLocalMediaSDPTests: XCTestCase {
    func testOnlyLocalOptionalFeaturesAreRemoved() throws {
        let text = "v=0\r\na=group:BUNDLE 0 1\r\na=extmap-allow-mixed\r\na=mid:0\r\na=ice-pwd:secret\r\na=fingerprint:sha-256 unchanged\r\na=setup:actpass\r\na=mid:1\r\na=extmap:1 urn:example\r\na=rtcp-fb:96 transport-cc\r\na=rtcp-fb:96 nack\r\n"
        let result = try NativeLocalMediaSDP.restrict(text)
        XCTAssertFalse(result.contains("a=group:"))
        XCTAssertFalse(result.contains("a=extmap"))
        XCTAssertFalse(result.contains("transport-cc"))
        for retained in ["a=ice-pwd:secret", "a=fingerprint:sha-256 unchanged", "a=setup:actpass", "a=rtcp-fb:96 nack"] {
            XCTAssertTrue(result.contains(retained))
        }
        XCTAssertEqual(try NativeLocalMediaSDP.restrict(result), result)
    }

    func testUnknownGroupingAndBundleOnlyFailClosed() {
        for group in ["a=group:BUNDLE 1 0", "a=group:BUNDLE 0", "a=group:LS 0 1", "a=group:BUNDLE 0 1\na=group:BUNDLE 0 1"] {
            XCTAssertThrowsError(try NativeLocalMediaSDP.restrict("v=0\n\(group)\na=mid:0\na=mid:1\n"))
        }
        XCTAssertThrowsError(try NativeLocalMediaSDP.restrict("v=0\na=mid:0\na=bundle-only\n"))
    }

    func testExtendedReportsStayInLocalSDPButAreNotAdvertisedThroughJingle() throws {
        let text = "v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 0\na=mid:0\na=rtcp-xr:rcvr-rtt=all\na=rtcp-fb:0 nack\na=rtcp-mux\nm=video 9 UDP/TLS/RTP/SAVPF 96\na=mid:1\na=rtcp-fb:96 nack pli\na=rtcp-xr:rcvr-rtt=all\n"
        let result = try NativeLocalMediaSDP.restrict(text)
        XCTAssertTrue(result.contains("a=rtcp-xr:rcvr-rtt=all"))
        XCTAssertTrue(result.contains("a=rtcp-fb:0 nack"))
        XCTAssertTrue(result.contains("a=rtcp-mux"))
        XCTAssertTrue(result.contains("a=rtcp-fb:96 nack pli"))
        XCTAssertEqual(try NativeLocalMediaSDP.restrict(result), result)
        let projected = try NativeLocalMediaSDP.jingleProjection(result)
        XCTAssertFalse(projected.contains("rtcp-xr"))
        XCTAssertTrue(projected.contains("a=rtcp-fb:0 nack"))
        XCTAssertEqual(try NativeLocalMediaSDP.jingleProjection(projected), projected)
        XCTAssertThrowsError(try NativeLocalMediaSDP.jingleProjection(text.replacingOccurrences(of: "rcvr-rtt=all", with: "unknown=1")))
    }

    func testBoundsDuplicateMidsAndControlsAreRefused() {
        for text in ["", "a=mid:0\na=mid:0", "a=mid:0\u{0}", "a=mid:0\n" + String(repeating: "x", count: 65536)] {
            XCTAssertThrowsError(try NativeLocalMediaSDP.restrict(text))
        }
    }
}
