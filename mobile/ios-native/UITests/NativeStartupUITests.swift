import XCTest

final class NativeStartupUITests: XCTestCase {
    private var application: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        application = XCUIApplication()
        application.launch()
    }

    override func tearDownWithError() throws {
        if let run = testRun, !run.hasSucceeded {
            print("NATIVE_UI_FAILURE_HIERARCHY\n" + application.debugDescription)
        }
        application.terminate()
        XCUIDevice.shared.orientation = .portrait
    }

    func testStartupDoesNotOpenKeyboardOrShowAuthenticatedState() {
        XCTAssertTrue(application.textFields["server-address"].waitForExistence(timeout: 10))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        XCTAssertFalse(application.buttons["check-connection"].isEnabled)
        XCTAssertTrue(application.staticTexts["startup-status"].exists)
    }

    func testRotationPreservesConfigurationAndInvalidAddressShowsInlineError() {
        let server = application.textFields["server-address"]
        XCTAssertTrue(server.waitForExistence(timeout: 10))
        server.tap()
        server.typeText("http://example.invalid")
        let domain = application.textFields["xmpp-domain"]
        domain.tap()
        domain.typeText("localhost")
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertEqual(server.value as? String, "http://example.invalid")
        XCTAssertEqual(domain.value as? String, "localhost")
        XCUIDevice.shared.orientation = .portrait
        application.swipeUp()
        let check = application.buttons["check-connection"]
        if !check.isHittable { application.swipeUp() }
        XCTAssertTrue(check.isHittable)
        check.tap()
        let error = application.staticTexts["startup-status"]
        let displayed = NSPredicate(format: "label CONTAINS %@", "zonder pad")
        expectation(for: displayed, evaluatedWith: error)
        waitForExpectations(timeout: 5)
        XCTAssertEqual(application.alerts.count, 0)
    }

    func testNativeLoginAndDisconnectPreserveStateAcrossRotation() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 5))
        reveal(contact)
        XCUIDevice.shared.orientation = .landscapeLeft
        waitForStatus("XMPP verbonden als fixture@localhost")
        reveal(contact)
        XCUIDevice.shared.orientation = .portrait
        let disconnect = application.buttons["disconnect-session"]
        reveal(disconnect, upward: false)
        disconnect.tap()
        waitForStatus("De XMPP-verbinding is verbroken")
        XCTAssertFalse(contact.exists)
        let password = application.secureTextFields["login-password"]
        XCTAssertTrue(["", "Wachtwoord"].contains(password.value as? String ?? "missing"))
        XCTAssertFalse(application.buttons["login-account"].isEnabled)
        XCTAssertEqual(application.alerts.count, 0)
    }

    func testTwoFactorRequirementDoesNotShowOnlineState() {
        signInFixture("two-factor")
        waitForStatus("Tweestapsverificatie vereist")
        XCTAssertFalse(application.staticTexts["startup-status"].label.contains("XMPP verbonden"))
        XCTAssertFalse(application.buttons["disconnect-session"].exists)
    }

    func testConnectionLossIsVisibleWithoutAutomaticRelogin() {
        signInFixture("disconnect")
        waitForStatus("De XMPP-server reageert niet meer")
        XCTAssertFalse(application.buttons["disconnect-session"].exists)
        XCTAssertFalse(application.buttons["login-account"].isEnabled)
    }

    private func signInFixture(_ scenario: String) {
        application.terminate()
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = scenario
        application.launch()
        XCTAssertTrue(application.staticTexts["fixture-banner"].waitForExistence(timeout: 10))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        let check = application.buttons["check-connection"]
        reveal(check)
        check.tap()
        let jid = application.textFields["login-jid"]
        XCTAssertTrue(jid.waitForExistence(timeout: 5))
        reveal(jid)
        jid.tap()
        jid.typeText("fixture@localhost")
        let password = application.secureTextFields["login-password"]
        reveal(password)
        password.tap()
        password.typeText("fixture-password")
        let login = application.buttons["login-account"]
        reveal(login)
        XCTAssertTrue(login.isEnabled)
        login.tap()
    }

    private func reveal(_ element: XCUIElement, upward: Bool = true) {
        for _ in 0..<8 {
            if element.isHittable { return }
            if upward { application.swipeUp() } else { application.swipeDown() }
        }
        XCTAssertTrue(element.isHittable)
    }

    private func waitForStatus(_ text: String) {
        reveal(application.staticTexts["startup-status"], upward: false)
        let displayed = NSPredicate(format: "label CONTAINS %@", text)
        expectation(for: displayed, evaluatedWith: application.staticTexts["startup-status"])
        waitForExpectations(timeout: 10)
    }
}
