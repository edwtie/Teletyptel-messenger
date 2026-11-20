import XCTest

final class HybridStartupUITests: XCTestCase {
    @MainActor
    func testBundledLoginStartsWithoutNetworkOrForcedKeyboard() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 20))
        XCTAssertTrue(web.buttons["Aanmelden"].firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(app.keyboards.count, 0)
        XCTAssertFalse(app.staticTexts["De lokale TeleTypTel-interface kon niet worden geladen."].exists)
        let settings = web.buttons["Serverinstellingen"].firstMatch
        XCTAssertTrue(settings.isEnabled)
        settings.tap()
        let address = app.textFields["hybridServerAddress"]
        XCTAssertTrue(address.waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["hybridServerDomain"].exists)
        let cancel = app.buttons["hybridServerCancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5))
        XCTAssertTrue(cancel.isHittable)
        cancel.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: address)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
        XCTAssertTrue(web.buttons["Aanmelden"].firstMatch.waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(web.buttons["Aanmelden"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(app.keyboards.count, 0)
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(web.buttons["Aanmelden"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(app.keyboards.count, 0)
        app.terminate()
    }
}
