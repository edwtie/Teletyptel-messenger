import XCTest
@testable import TeleTypTelCore

final class XMPPProbeTests: XCTestCase {
    private let opening = "<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' id='test' version='1.0'/>"
    private let features = "<features xmlns='http://etherx.jabber.org/streams'><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>SCRAM-SHA-256</mechanism></mechanisms></features>"

    func testOpenThenFeaturesProvesReachabilityNotLogin() throws {
        var stream = XMPPProbeStream()
        XCTAssertNil(try stream.receive(opening))
        XCTAssertEqual(try stream.receive(features), ProbeReport(mechanisms: ["SCRAM-SHA-256"]))
        XCTAssertThrowsError(try stream.receive(features))
    }

    func testFeaturesBeforeOpenAndDuplicateOpenRejected() throws {
        var stream = XMPPProbeStream()
        XCTAssertThrowsError(try stream.receive(features))
        XCTAssertThrowsError(try stream.receive(opening))
        stream = XMPPProbeStream()
        _ = try stream.receive(opening)
        XCTAssertThrowsError(try stream.receive(opening))
    }

    func testInvalidFramingRejected() {
        for message in ["", "<html/>", opening + features,
                        opening.replacingOccurrences(of: "version='1.0'", with: "version='0.9'"),
                        opening.replacingOccurrences(of: "id='test'", with: "id=''"),
                        opening.replacingOccurrences(of: "xmpp-framing", with: "foreign"),
                        "<!DOCTYPE open [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]>" + opening,
                        "<?xml version='1.0'?>" + opening] {
            var stream = XMPPProbeStream()
            XCTAssertThrowsError(try stream.receive(message), message)
        }
    }

    func testMalformedMechanismsRejected() throws {
        for message in [features.replacingOccurrences(of: "SCRAM-SHA-256", with: ""),
                        features.replacingOccurrences(of: "SCRAM-SHA-256", with: "bad mechanism"),
                        features.replacingOccurrences(of: "xmpp-sasl", with: "foreign"),
                        features.replacingOccurrences(of: "</mechanisms>", with: "<mechanism>SCRAM-SHA-256</mechanism></mechanisms>"),
                        features.replacingOccurrences(of: "SCRAM-SHA-256", with: "<![CDATA[SCRAM-SHA-256]]>"),
                        "<features xmlns='http://etherx.jabber.org/streams'/>"] {
            var stream = XMPPProbeStream()
            _ = try stream.receive(opening)
            XCTAssertThrowsError(try stream.receive(message), message)
        }
    }

    func testNamespacePrefixesAndAdditionalFeaturesAllowed() throws {
        var stream = XMPPProbeStream()
        _ = try stream.receive(opening)
        let message = "<s:features xmlns:s='http://etherx.jabber.org/streams'><other xmlns='urn:test'/><a:mechanisms xmlns:a='urn:ietf:params:xml:ns:xmpp-sasl'><a:mechanism>PLAIN</a:mechanism></a:mechanisms></s:features>"
        XCTAssertEqual(try stream.receive(message)?.mechanisms, ["PLAIN"])
    }

    func testBoundedBytesDepthAndNodes() throws {
        for message in [String(repeating: " ", count: 65537),
                        "<features xmlns='http://etherx.jabber.org/streams'>" + String(repeating: "<x>", count: 9)
                            + String(repeating: "</x>", count: 9) + "</features>",
                        features.replacingOccurrences(of: "</features>", with: String(repeating: "<x/>", count: 129) + "</features>")] {
            var stream = XMPPProbeStream()
            _ = try stream.receive(opening)
            XCTAssertThrowsError(try stream.receive(message))
        }
        var stream = XMPPProbeStream()
        _ = try stream.receive(opening)
        let individuallyWithinLimit = features + String(repeating: " ", count: 65536 - features.utf8.count)
        XCTAssertThrowsError(try stream.receive(individuallyWithinLimit))
    }

    func testCancellationBeforeNetworkDoesNotHang() async {
        let configuration = try! ServerConfiguration(address: "https://example.invalid", domain: "localhost")
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await XMPPAvailabilityClient().check(configuration)
        }
        do { _ = try await task.value; XCTFail("Expected cancellation") }
        catch is CancellationError {}
        catch { XCTFail("Expected CancellationError, received \(error)") }
    }
}
