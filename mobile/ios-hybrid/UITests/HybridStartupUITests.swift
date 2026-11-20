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
        XCTAssertTrue(app.textFields["hybridServerAddress"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["hybridServerDomain"].exists)
        app.buttons["Annuleren"].tap()
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
