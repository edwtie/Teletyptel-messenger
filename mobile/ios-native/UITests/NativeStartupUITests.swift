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
}
