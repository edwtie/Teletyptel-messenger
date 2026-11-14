import XCTest

final class NativeStartupUITests: XCTestCase {
    private var application: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        application = XCUIApplication()
    }

    override func tearDownWithError() throws {
        if let run = testRun, run.failureCount > 0 {
            print("NATIVE_UI_FAILURE_HIERARCHY\n" + application.debugDescription)
            snapshot("failure-state")
        }
        application.terminate()
        XCUIDevice.shared.orientation = .portrait
    }

    func testStartupDoesNotOpenKeyboardOrShowAuthenticatedState() {
        application.launch()
        XCTAssertTrue(application.textFields["server-address"].waitForExistence(timeout: 10))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        XCTAssertFalse(application.buttons["check-connection"].isEnabled)
        XCTAssertTrue(application.staticTexts["startup-status"].exists)
        XCTAssertFalse(application.staticTexts["Native iPhone- en iPad-app"].exists)
        snapshot("login-web-style")
    }

    func testRotationPreservesConfigurationAndInvalidAddressShowsInlineError() {
        application.launch()
        let server = application.textFields["server-address"]
        XCTAssertTrue(server.waitForExistence(timeout: 10))
        server.tap()
        server.typeText("http://example.invalid")
        let domain = application.textFields["xmpp-domain"]
        domain.tap()
        domain.typeText("localhost")
        rotate(.landscapeLeft)
        XCTAssertEqual(server.value as? String, "http://example.invalid")
        XCTAssertEqual(domain.value as? String, "localhost")
        rotate(.portrait)
        let check = application.buttons["check-connection"]
        reveal(check)
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
        XCTAssertFalse(application.buttons["biometric-login"].exists)
        XCTAssertFalse(application.buttons["forget-saved-login"].exists)
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 5))
        reveal(contact)
        XCTAssertTrue(contact.label.contains("Online"))
        let brand = application.descendants(matching: .any)["messenger-brand-header"].firstMatch
        XCTAssertTrue(brand.exists)
        XCTAssertGreaterThanOrEqual(brand.frame.height, 58)
        XCTAssertTrue(application.buttons["Hoofdmenu"].isHittable)
        XCTAssertTrue(application.buttons["Contacten en groepen toevoegen"].exists)
        snapshot("contacts-portrait")
        rotate(.landscapeLeft)
        waitForStatus("XMPP verbonden als fixture@localhost")
        reveal(contact)
        XCTAssertTrue(contact.label.contains("Online"))
        snapshot("contacts-landscape")
        rotate(.portrait)
        application.buttons["Hoofdmenu"].tap()
        application.buttons["menu-logout"].tap()
        waitForStatus("De XMPP-verbinding is verbroken")
        XCTAssertFalse(contact.exists)
        let password = application.secureTextFields["login-password"]
        XCTAssertTrue(["", "Wachtwoord"].contains(password.value as? String ?? "missing"))
        XCTAssertFalse(application.buttons["login-account"].isEnabled)
        XCTAssertEqual(application.alerts.count, 0)
    }

    func testTwoFactorRequiresValidCodeBeforeConnecting() {
        signInFixture("two-factor")
        waitForStatus("Tweestapsverificatie vereist")
        XCTAssertFalse(application.staticTexts["startup-status"].label.contains("XMPP verbonden"))
        let code = application.secureTextFields["two-factor-code"]
        reveal(code)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        code.tap()
        code.typeText("000000")
        let verify = application.buttons["two-factor-verify"]
        reveal(verify)
        verify.tap()
        let error = application.staticTexts["two-factor-error"]
        XCTAssertTrue(error.waitForExistence(timeout: 5))
        XCTAssertFalse(application.staticTexts["startup-status"].label.contains("XMPP verbonden"))
        reveal(code)
        code.tap()
        code.typeText("123456")
        reveal(verify)
        verify.tap()
        waitForStatus("XMPP verbonden als fixture@localhost")
        XCTAssertFalse(code.exists)
    }

    func testChatDraftAndHistorySurviveRotationAndBackgroundReturn() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 5))
        reveal(contact)
        tapContact(contact)
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        let greeting = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Fictief ontvangen bericht")).firstMatch
        XCTAssertTrue(greeting.waitForExistence(timeout: 5))
        let archived = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Fictief eerder bericht")).firstMatch
        XCTAssertTrue(archived.waitForExistence(timeout: 5))
        snapshot("chat-portrait")
        draft.tap()
        draft.typeText("Fictieve uitgaande tekst")
        application.buttons["chat-send"].tap()
        let outgoing = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@ AND label CONTAINS %@", "chat-message-", "Fictieve uitgaande tekst", "ontvangst niet bevestigd")).firstMatch
        XCTAssertTrue(outgoing.waitForExistence(timeout: 5))
        draft.tap()
        draft.typeText("Bewaar mijn concept")
        rotate(.landscapeLeft)
        XCTAssertEqual(draft.value as? String, "Bewaar mijn concept")
        let latestVisible = NSPredicate { _, _ in
            outgoing.exists && outgoing.isHittable && outgoing.frame.maxY <= draft.frame.minY &&
                outgoing.frame.minY >= self.application.navigationBars.firstMatch.frame.maxY - 1
        }
        expectation(for: latestVisible, evaluatedWith: outgoing)
        waitForExpectations(timeout: 10)
        snapshot("chat-landscape-keyboard")
        rotate(.portrait)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(application.wait(for: .runningBackground, timeout: 5) || application.wait(for: .runningBackgroundSuspended, timeout: 5))
        application.activate()
        let restored = NSPredicate(format: "label BEGINSWITH %@", "Verbonden")
        expectation(for: restored, evaluatedWith: application.staticTexts["chat-connection"])
        waitForExpectations(timeout: 10)
        XCTAssertEqual(draft.value as? String, "Bewaar mijn concept")
        XCTAssertTrue(outgoing.exists)
        application.buttons["chat-back"].tap()
        reveal(contact)
        tapContact(contact)
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertEqual(draft.value as? String, "Bewaar mijn concept")
    }

    func testExistingGroupJoinSendRotationAndLeave() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        application.buttons["Hoofdmenu"].tap()
        application.buttons["open-groups"].tap()
        let address = application.textFields["group-address"]
        XCTAssertTrue(address.waitForExistence(timeout: 5))
        address.tap(); address.typeText("fixture@conference.localhost")
        let nickname = application.textFields["group-nickname"]
        reveal(nickname); nickname.tap(); nickname.typeText("Testnaam")
        let join = application.buttons["group-join"]
        reveal(join); join.tap()
        let room = application.descendants(matching: .any)["group-room-fixture@conference.localhost"].firstMatch
        XCTAssertTrue(room.waitForExistence(timeout: 5))
        reveal(room); room.tap()
        XCTAssertTrue(application.staticTexts["group-status"].waitForExistence(timeout: 5))
        let draft = application.descendants(matching: .any)["group-draft"].firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        draft.tap(); draft.typeText("Fictieve groepsreactie")
        application.buttons["group-send"].tap()
        let outgoing = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "group-message-", "Fictieve groepsreactie")).firstMatch
        XCTAssertTrue(outgoing.waitForExistence(timeout: 5))
        snapshot("group-portrait")
        rotate(.landscapeLeft)
        let latestVisible = NSPredicate { _, _ in
            outgoing.exists && outgoing.isHittable && outgoing.frame.maxY <= draft.frame.minY &&
                outgoing.frame.minY >= self.application.navigationBars["fixture"].frame.maxY - 1
        }
        expectation(for: latestVisible, evaluatedWith: outgoing)
        waitForExpectations(timeout: 10)
        snapshot("group-landscape")
        application.buttons["group-leave"].tap()
        XCTAssertTrue(application.buttons["Opnieuw deelnemen"].waitForExistence(timeout: 5))
        XCTAssertFalse(application.buttons["group-send"].isEnabled)
    }

    func testInvitationDeclineExplicitAcceptAndKnownContactInvite() {
        signInFixture("invitations")
        let notice = application.buttons["invitation-notice"]
        XCTAssertTrue(notice.waitForExistence(timeout: 10))
        reveal(notice); notice.tap()
        let decline = application.buttons["decline-invitation-ignore@conference.localhost-demo-contact@localhost"]
        reveal(decline)
        XCTAssertTrue(decline.waitForExistence(timeout: 5))
        reveal(decline); decline.tap()
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: decline); waitForExpectations(timeout: 5)
        let nickname = application.textFields["group-nickname"]
        reveal(nickname, upward: false); nickname.tap(); nickname.typeText("Testnaam")
        let accept = application.buttons["accept-invitation-fixture@conference.localhost-demo-contact@localhost"]
        reveal(accept); XCTAssertTrue(accept.isEnabled); accept.tap()
        let room = application.descendants(matching: .any)["group-room-fixture@conference.localhost"].firstMatch
        XCTAssertTrue(room.waitForExistence(timeout: 5)); reveal(room); room.tap()
        XCTAssertTrue(application.staticTexts["group-status"].waitForExistence(timeout: 5))
        application.buttons["group-invite"].tap()
        let contact = application.buttons["invite-contact-demo-contact@localhost"]
        XCTAssertTrue(contact.waitForExistence(timeout: 5)); reveal(contact); contact.tap()
        let submitted = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "invite-attempt-", "ontvangst en toegang niet bevestigd")).firstMatch
        XCTAssertTrue(submitted.waitForExistence(timeout: 5))
        XCTAssertFalse(application.staticTexts["Deelname bevestigd door de groep."].exists)
        snapshot("invitation-contact-submitted")
        application.buttons["close-invite-contacts"].tap()
    }

    func testAccountSettingsSaveWithoutChangingIdentity() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        application.buttons["Hoofdmenu"].tap(); application.buttons["open-account-settings"].tap()
        let name = application.textFields["profile-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10)); reveal(name); name.tap(); name.typeText(" gewijzigd")
        let save = application.buttons["profile-save"]; reveal(save); save.tap()
        let status = application.staticTexts["profile-status"]
        reveal(status)
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Accountinstellingen opgeslagen"), evaluatedWith: status)
        waitForExpectations(timeout: 10)
        let identity = application.descendants(matching: .any)["profile-jid"].firstMatch
        reveal(identity, upward: false); XCTAssertTrue(identity.exists)
        XCTAssertTrue(identity.label.contains("fixture@localhost"))
        snapshot("account-settings-saved")
    }

    func testAttachmentUploadOnlyStagesLinkUntilExplicitSend() {
        signInFixture("connected")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 10)); reveal(contact); tapContact(contact)
        application.buttons["attachment-picker"].tap()
        let selection = application.buttons["fixture-attachment-selection"]
        XCTAssertTrue(selection.waitForExistence(timeout: 5)); selection.tap()
        let upload = application.buttons["attachment-upload"]; reveal(upload); upload.tap()
        let stage = application.buttons["attachment-stage"]
        XCTAssertTrue(stage.waitForExistence(timeout: 10)); reveal(stage)
        snapshot("attachment-uploaded-not-sent"); stage.tap()
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        XCTAssertTrue((draft.value as? String)?.contains("Bestand: test.txt") == true)
        let submitted = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Bestand: test.txt")).firstMatch
        XCTAssertFalse(submitted.exists)
        application.buttons["chat-send"].tap()
        XCTAssertTrue(submitted.waitForExistence(timeout: 10))
    }

    func testGroupDiscoveryManagementAndSessionSearch() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        application.buttons["Hoofdmenu"].tap(); application.buttons["open-groups"].tap()
        let discovery = application.buttons["Beschikbare groepen ophalen"]
        XCTAssertTrue(discovery.waitForExistence(timeout: 5)); reveal(discovery); discovery.tap()
        let discovered = application.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Fictieve testgroep")).firstMatch
        XCTAssertTrue(discovered.waitForExistence(timeout: 5)); reveal(discovered); discovered.tap()
        let nickname = application.textFields["group-nickname"]; reveal(nickname); nickname.tap(); nickname.typeText("Testnaam")
        let join = application.buttons["group-join"]; reveal(join); join.tap()
        let room = application.descendants(matching: .any)["group-room-fixture@conference.localhost"].firstMatch
        XCTAssertTrue(room.waitForExistence(timeout: 5)); reveal(room); room.tap()
        application.buttons["Deelnemers en groepsmenu"].tap(); application.buttons["Deelnemers en groepsbeheer"].tap()
        let settings = application.buttons["Instellingen ophalen"]
        reveal(settings); XCTAssertTrue(settings.waitForExistence(timeout: 5)); settings.tap()
        let name = application.textFields["Groepsnaam"]
        reveal(name); XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText(" gewijzigd")
        let save = application.buttons["Groepsinstellingen opslaan"]; reveal(save); save.tap()
        application.buttons["Wijziging uitvoeren"].tap()
        let status = application.staticTexts["group-management-status"]
        reveal(status)
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Wijziging bevestigd"), evaluatedWith: status); waitForExpectations(timeout: 5)
        snapshot("group-settings-confirmed")
        application.buttons["close-group-management"].tap()
        application.buttons["Deelnemers en groepsmenu"].tap(); application.buttons["Berichten zoeken"].tap()
        let search = application.textFields["group-search"]; XCTAssertTrue(search.waitForExistence(timeout: 5)); reveal(search); search.tap()
        XCTAssertTrue(application.keyboards.firstMatch.waitForExistence(timeout: 5)); search.typeText("onvindbaar")
        XCTAssertFalse(application.staticTexts["Fictief groepsbericht"].exists)
    }

    func testConnectionLossIsVisibleWithoutAutomaticRelogin() {
        signInFixture("disconnect")
        waitForStatus("De XMPP-server reageert niet meer")
        XCTAssertFalse(application.buttons["disconnect-session"].exists)
        XCTAssertFalse(application.buttons["login-account"].isEnabled)
    }

    func testWebStyleCallControlsAndRttPanesRemainReachableAcrossRotation() {
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
        application.launchEnvironment["TELETYPTEL_NATIVE_CALL_VISUAL_FIXTURE"] = "total"
        application.launch()
        let controls = application.buttons["Gespreksbediening"]
        let end = application.buttons["Gesprek beëindigen"]
        XCTAssertTrue(controls.waitForExistence(timeout: 10))
        XCTAssertTrue(end.isHittable)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft, .portrait] {
            rotate(orientation)
            XCTAssertTrue(controls.isHittable)
            XCTAssertTrue(end.isHittable)
            for identifier in ["tc-peer-pane", "tc-own-pane"] {
                let pane = application.descendants(matching: .any)[identifier].firstMatch
                XCTAssertTrue(pane.exists)
                XCTAssertTrue(application.frame.contains(pane.frame), identifier)
            }
            snapshot(orientation == .landscapeLeft ? "tc-web-landscape" : "tc-web-portrait")
        }
        controls.tap()
        XCTAssertTrue(application.buttons["Camera inschakelen"].waitForExistence(timeout: 5))
        XCTAssertTrue(application.buttons["Microfoon dempen"].isHittable)
        snapshot("tc-web-controls")
    }

    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func rotate(_ orientation: UIDeviceOrientation) {
        XCUIDevice.shared.orientation = orientation
        let landscape = orientation == .landscapeLeft || orientation == .landscapeRight
        let settled = NSPredicate { [self] _, _ in
            let frame = application.frame
            let image = XCUIScreen.main.screenshot().image.size
            return (frame.width > frame.height) == landscape && (image.width > image.height) == landscape
        }
        expectation(for: settled, evaluatedWith: application)
        waitForExpectations(timeout: 10)
    }

    private func signInFixture(_ scenario: String) {
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
        let remember = application.switches["remember-biometric-login"]
        reveal(remember)
        XCTAssertEqual(remember.value as? String, "0")
        let login = application.buttons["login-account"]
        reveal(login)
        XCTAssertTrue(login.isEnabled)
        login.tap()
    }

    private func reveal(_ element: XCUIElement, upward: Bool = true) {
        for _ in 0..<16 {
            if isUsable(element) { return }
            let viewport = usableViewport()
            let scrollUp = element.exists && !element.frame.isEmpty
                ? element.frame.midY > viewport.midY : upward
            let distance = min(120, max(40, viewport.height * 0.35))
            let origin = application.coordinate(withNormalizedOffset: .zero)
            let horizontal = viewport.minX + viewport.width * 0.15
            let start = origin.withOffset(CGVector(dx: horizontal, dy: viewport.midY))
            let end = origin.withOffset(CGVector(dx: horizontal,
                                                 dy: viewport.midY + (scrollUp ? -distance : distance)))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTAssertTrue(isUsable(element), "Element remains outside the usable viewport: \(element.identifier), \(element.frame)")
    }

    private func isUsable(_ element: XCUIElement) -> Bool {
        guard element.exists, !element.frame.isEmpty else { return false }
        if element.identifier == "startup-status" {
            let brand = application.descendants(matching: .any)["messenger-brand-header"].firstMatch
            if brand.exists, brand.frame.contains(element.frame), application.frame.contains(element.frame) { return true }
        }
        let viewport = usableViewport()
        let fullyVisible = viewport.contains(element.frame)
        if element.identifier.hasPrefix("contact-"), !fullyVisible {
            return viewport.contains(CGPoint(x: element.frame.midX, y: element.frame.midY)) &&
                element.frame.minY >= viewport.minY && element.frame.maxY <= viewport.maxY
        }
        guard fullyVisible else { return false }
        return element.elementType == .staticText || element.isHittable
    }

    private func tapContact(_ element: XCUIElement) {
        let visible = element.frame.intersection(usableViewport())
        XCTAssertGreaterThan(visible.width, 44)
        XCTAssertGreaterThan(visible.height, 44)
        application.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: visible.midX, dy: visible.midY)).tap()
    }

    private func usableViewport() -> CGRect {
        let window = application.frame
        let navigation = application.navigationBars.allElementsBoundByIndex.last { $0.isHittable }
        let top = navigation.map { max(window.minY + 12, $0.frame.maxY + 8) } ?? window.minY + 12
        let keyboard = application.keyboards.firstMatch
        let bottom = keyboard.exists ? min(window.maxY - 24, keyboard.frame.minY - 8) : window.maxY - 24
        return CGRect(x: window.minX + 12, y: top, width: max(0, window.width - 24), height: max(0, bottom - top))
    }

    private func waitForStatus(_ text: String) {
        reveal(application.staticTexts["startup-status"], upward: false)
        let displayed = NSPredicate(format: "label CONTAINS %@", text)
        expectation(for: displayed, evaluatedWith: application.staticTexts["startup-status"])
        waitForExpectations(timeout: 10)
    }
}
