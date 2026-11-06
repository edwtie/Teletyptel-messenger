import Foundation
import XCTest
@testable import TeleTypTelCore

final class EjabberdIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let trustedPort: Int
        let untrustedPort: Int
        let username: String
        let password: String

        func configuration(port: Int? = nil, host: String = "localhost") throws -> ServerConfiguration {
            try ServerConfiguration(address: "https://\(host):\(port ?? trustedPort)", domain: "localhost")
        }

        func account(password: String? = nil) throws -> NativeAuthenticatedAccount {
            NativeAuthenticatedAccount(configuration: try configuration(), jid: username + "@localhost",
                                       password: password ?? self.password)
        }
    }

    private func fixture() throws -> Fixture {
        guard let file = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in isolated ejabberd test; no real server was contacted")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
            throw ConnectionFailure.configuration
        }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        guard (1024...65535).contains(fixture.trustedPort),
              (1024...65535).contains(fixture.untrustedPort),
              fixture.trustedPort != fixture.untrustedPort,
              fixture.username.hasPrefix("native-test-"), !fixture.password.isEmpty else {
            throw ConnectionFailure.configuration
        }
        return fixture
    }

    func testRealAvailabilityOverTrustedWebSocket() async throws {
        let configuration = try fixture().configuration()
        let report = try await XMPPAvailabilityClient().check(configuration)
        XCTAssertTrue(report.mechanisms.contains("PLAIN"))
    }

    func testRealSASLBindHeartbeatAndCancellation() async throws {
        let account = try fixture().account()
        let bound = expectation(description: "Real ejabberd resource bound")
        let state = ConnectionObservation()
        let connection = Task {
            do {
                try await NativeXMPPConnection().run(account: account) { jid in
                    XCTAssertTrue(jid.hasPrefix(account.jid + "/TeleTypTel-native-"))
                    bound.fulfill()
                }
                await state.record(.unexpectedCompletion)
            } catch is CancellationError {
                await state.record(.cancelled)
            } catch {
                await state.record(.failed)
            }
        }
        defer { connection.cancel() }
        await fulfillment(of: [bound], timeout: 15)
        try await Task.sleep(nanoseconds: 40_000_000_000)
        let beforeCancellation = await state.result
        XCTAssertNil(beforeCancellation, "Session must survive the 25s heartbeat and 10s reply deadline")
        connection.cancel()
        await connection.value
        let afterCancellation = await state.result
        XCTAssertEqual(afterCancellation, .cancelled)
    }

    func testWrongPasswordNeverReportsConnected() async throws {
        let account = try fixture().account(password: "deliberately-wrong-" + UUID().uuidString)
        do {
            try await NativeXMPPConnection().run(account: account) { _ in
                XCTFail("Rejected credentials must never produce an online state")
            }
            XCTFail("Invalid credentials unexpectedly accepted")
        } catch {
            XCTAssertEqual(error as? XMPPSessionFailure, .authenticationRejected)
        }
    }

    func testUntrustedCertificateRejectedByProbe() async throws {
        let fixture = try fixture()
        do {
            _ = try await XMPPAvailabilityClient().check(fixture.configuration(port: fixture.untrustedPort))
            XCTFail("Untrusted TLS certificate accepted")
        } catch {
            XCTAssertEqual(ConnectionFailure.classify(error), .certificate)
        }
    }

    func testHostnameMismatchRejectedByProbe() async throws {
        let configuration = try fixture().configuration(host: "127.0.0.1")
        do {
            _ = try await XMPPAvailabilityClient().check(configuration)
            XCTFail("Certificate for localhost must not authorize 127.0.0.1")
        } catch {
            XCTAssertEqual(ConnectionFailure.classify(error), .certificate)
        }
    }

    func testUntrustedCertificateRejectedByAuthenticatedTransport() async throws {
        let fixture = try fixture()
        let account = NativeAuthenticatedAccount(configuration: try fixture.configuration(port: fixture.untrustedPort),
                                               jid: fixture.username + "@localhost", password: fixture.password)
        do {
            try await NativeXMPPConnection().run(account: account) { _ in
                XCTFail("Untrusted endpoint must never produce an online state")
            }
            XCTFail("Untrusted TLS certificate accepted")
        } catch {
            XCTAssertEqual(ConnectionFailure.classify(error), .certificate)
        }
    }

    func testCancellationBeforeConnecting() async throws {
        let account = try fixture().account()
        let barrier = StartBarrier()
        let connection = Task {
            await barrier.wait()
            do {
                try await NativeXMPPConnection().run(account: account) { _ in
                    XCTFail("Cancelled connection must not authenticate")
                }
                XCTFail("Cancelled connection returned normally")
            } catch {
                XCTAssertTrue(error is CancellationError)
            }
        }
        connection.cancel()
        await barrier.release()
        await connection.value
    }
}

private actor ConnectionObservation {
    enum Result: Equatable { case cancelled, failed, unexpectedCompletion }
    private(set) var result: Result?
    func record(_ result: Result) { self.result = result }
}

private actor StartBarrier {
    private var released = false
    private var continuation: CheckedContinuation<Void, Never>?

    func wait() async {
        if released { return }
        await withCheckedContinuation { continuation = $0 }
    }

    func release() {
        released = true
        continuation?.resume()
        continuation = nil
    }
}
