import XCTest

final class NativeStartupUITests: XCTestCase {
    private var application: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        application = XCUIApplication()
        application.launchArguments = ["-teletyptel.native.interfaceLanguage", "nl", "-teletyptel.native.serverAddress", "", "-teletyptel.native.xmppDomain", ""]
        application.launchEnvironment["TELETYPTEL_NATIVE_VISUAL_METRICS"] = "1"
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
        XCTAssertTrue(application.buttons["login-settings"].waitForExistence(timeout: 10))
        XCTAssertTrue(application.textFields["login-jid"].exists)
        XCTAssertTrue(application.secureTextFields["login-password"].exists)
        XCTAssertFalse(application.textFields["server-address"].exists)
        XCTAssertFalse(application.textFields["xmpp-domain"].exists)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        XCTAssertFalse(application.buttons["check-connection"].exists)
        XCTAssertFalse(application.buttons["login-account"].isEnabled)
        XCTAssertTrue(application.staticTexts["startup-status"].exists)
        XCTAssertFalse(application.staticTexts["Native iPhone- en iPad-app"].exists)
        snapshot("login-web-style")
    }

    func testStartupProgressStopsOnCancelAndCertificateFailure() {
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
        application.launchEnvironment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] = "checking"
        application.launch()
        let progress = application.descendants(matching: .any)["startup-progress"].firstMatch
        XCTAssertTrue(progress.waitForExistence(timeout: 10))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        snapshot("startup-progress-portrait")
        rotate(.landscapeLeft)
        XCTAssertTrue(progress.exists)
        XCTAssertGreaterThan(progress.frame.width, 100)
        XCTAssertTrue(application.frame.contains(progress.frame))
        snapshot("startup-progress-landscape")
        application.buttons["startup-cancel-check"].tap()
        let stopped = NSPredicate { _, _ in
            !self.application.descendants(matching: .any)["startup-progress"].firstMatch.exists
        }
        expectation(for: stopped, evaluatedWith: nil); waitForExpectations(timeout: 10)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        application.terminate()
        rotate(.portrait)
        application.launchEnvironment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] = "certificate"
        application.launch()
        let failed = NSPredicate { _, _ in
            let status = self.application.staticTexts["startup-status"]
            return status.exists && status.label.contains("certificaat")
        }
        expectation(for: failed, evaluatedWith: nil); waitForExpectations(timeout: 10)
        XCTAssertFalse(progress.exists)
        XCTAssertFalse(application.buttons["login-settings"].exists)
        XCTAssertTrue(application.descendants(matching: .any)["startup-advanced"].firstMatch.exists)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        snapshot("startup-progress-certificate-stopped")
    }

    func testOfflineStartupHidesTechnicalSettingsAndRetryDoesNotSignIn() {
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
        application.launchEnvironment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] = "offline"
        application.launch()
        let title = application.staticTexts["startup-failure-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        expectation(for: NSPredicate(format: "label == %@", "Server niet bereikbaar"), evaluatedWith: title)
        waitForExpectations(timeout: 10)
        XCTAssertFalse(application.buttons["login-settings"].exists)
        XCTAssertFalse(application.textFields["server-address"].exists)
        XCTAssertFalse(application.textFields["xmpp-domain"].exists)
        XCTAssertFalse(application.buttons["check-connection"].exists)
        XCTAssertFalse(application.staticTexts["startup-technical-details"].exists)
        XCTAssertFalse(application.textFields["login-jid"].exists)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        let retry = application.buttons["startup-retry"]
        XCTAssertTrue(retry.isHittable)
        XCTAssertGreaterThanOrEqual(retry.frame.height, 44)
        snapshot("startup-offline-simple")
        rotate(.landscapeLeft)
        XCTAssertTrue(retry.isHittable)
        XCTAssertTrue(application.frame.contains(retry.frame))
        snapshot("startup-offline-landscape")
        rotate(.portrait)
        let advanced = application.descendants(matching: .any)["startup-advanced"].firstMatch
        XCTAssertTrue(advanced.isHittable)
        advanced.tap()
        XCTAssertTrue(application.staticTexts["startup-technical-details"].waitForExistence(timeout: 5))
        application.buttons["login-settings"].tap()
        XCTAssertTrue(application.textFields["server-address"].waitForExistence(timeout: 5))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        snapshot("startup-offline-advanced-settings")
        application.buttons["login-settings-cancel"].tap()
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.label, "Server niet bereikbaar")
        retry.tap()
        XCTAssertTrue(application.textFields["login-jid"].waitForExistence(timeout: 10))
        XCTAssertFalse(application.buttons["messenger-main-menu"].exists)
        XCTAssertFalse(application.buttons["login-account"].isEnabled)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        XCTAssertFalse(title.exists)
        snapshot("startup-offline-recovered")
    }

    func testEnglishStartupDoesNotTranslateUserDataOrRequestPermissions() {
        application.launchArguments = ["-teletyptel.native.interfaceLanguage", "en", "-teletyptel.native.serverAddress", "", "-teletyptel.native.xmppDomain", ""]
        application.launch()
        XCTAssertTrue(application.buttons["login-settings"].waitForExistence(timeout: 10))
        XCTAssertTrue(application.staticTexts["Sign in"].exists)
        XCTAssertTrue(application.staticTexts["Use your XMPP account to sign in to TeleTypTel."].exists)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        XCTAssertTrue(application.alerts.allElementsBoundByIndex.isEmpty)
        XCTAssertFalse(application.buttons["check-connection"].exists)
        snapshot("english-login")
    }

    func testCloudHistoryCatalogAndOlderPagesDoNotAuthorizeAnUnknownContact() {
        application.launchEnvironment["TELETYPTEL_NATIVE_CLOUD_UI_FIXTURE"] = "1"
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        let archivedContact = application.descendants(matching: .any)["cloud-contact-archive-only@localhost"].firstMatch
        XCTAssertTrue(archivedContact.waitForExistence(timeout: 8))
        reveal(archivedContact); tapContact(archivedContact)
        let online = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Online bericht van de webapp")).firstMatch
        XCTAssertTrue(online.waitForExistence(timeout: 8))
        let ownOnline = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Eigen online bericht van de webapp")).firstMatch
        XCTAssertTrue(ownOnline.waitForExistence(timeout: 8))
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        XCTAssertFalse(draft.isEnabled)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        let earlier = application.buttons["cloud-history-earlier"]
        reveal(earlier); earlier.tap()
        let older = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Ouder online bericht van de webapp")).firstMatch
        XCTAssertTrue(older.waitForExistence(timeout: 8))
        snapshot("cloud-history-portrait")
        rotate(.landscapeLeft)
        XCTAssertTrue(older.exists)
        XCTAssertFalse(draft.isEnabled)
        snapshot("cloud-history-landscape")
    }

    func testRotationPreservesConfigurationAndInvalidAddressShowsInlineError() {
        application.launch()
        application.buttons["login-settings"].tap()
        expandAdvancedServerSettings()
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
        let error = application.staticTexts["settings-startup-status"]
        let displayed = NSPredicate(format: "label CONTAINS %@", "zonder pad")
        expectation(for: displayed, evaluatedWith: error)
        waitForExpectations(timeout: 5)
        XCTAssertEqual(application.alerts.count, 0)
    }

    func testLoginSettingsAreSeparateAndPreserveDraftsOnCancel() {
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
        application.launch()
        let account = application.textFields["login-jid"]
        XCTAssertTrue(account.waitForExistence(timeout: 10))
        account.tap(); account.typeText("fixture@localhost")
        let password = application.secureTextFields["login-password"]
        password.tap(); password.typeText("fixture-password")
        application.buttons["login-settings"].tap()
        XCTAssertFalse(application.textFields["server-address"].exists)
        XCTAssertFalse(application.buttons["login-settings-save"].exists)
        expandAdvancedServerSettings()
        let server = application.textFields["server-address"]
        XCTAssertTrue(server.waitForExistence(timeout: 5))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        server.tap(); server.typeText("/discarded")
        application.buttons["login-settings-cancel"].tap()
        XCTAssertTrue(account.waitForExistence(timeout: 5))
        XCTAssertEqual(account.value as? String, "fixture@localhost")
        XCTAssertTrue(application.buttons["login-account"].isEnabled)
        XCTAssertFalse(server.exists)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        application.buttons["login-settings"].tap()
        expandAdvancedServerSettings()
        XCTAssertEqual(server.value as? String, "https://example.invalid")
        application.buttons["login-settings-cancel"].tap()
        rotate(.landscapeLeft)
        XCTAssertTrue(application.buttons["login-settings"].isHittable)
        XCTAssertTrue(application.buttons["login-account"].isHittable)
        snapshot("login-landscape")
    }

    func testLoginSettingsSaveAndRotateWithoutOpeningKeyboard() {
        application.launch()
        let settings = application.buttons["login-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 10))
        settings.tap()
        XCTAssertFalse(application.textFields["server-address"].exists)
        XCTAssertFalse(application.buttons["login-settings-save"].exists)
        snapshot("login-settings-simple")
        expandAdvancedServerSettings()
        let server = application.textFields["server-address"]
        XCTAssertTrue(server.waitForExistence(timeout: 5))
        XCTAssertFalse(application.buttons["login-settings-save"].isEnabled)
        server.tap(); server.typeText("https://example.invalid")
        let domain = application.textFields["xmpp-domain"]
        domain.tap(); domain.typeText("localhost")
        application.buttons["login-settings-save"].tap()
        XCTAssertTrue(application.textFields["login-jid"].waitForExistence(timeout: 5))
        XCTAssertFalse(server.exists)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        XCTAssertTrue(settings.isHittable)
        XCTAssertTrue(application.buttons["login-account"].isHittable)
        rotate(.landscapeLeft)
        settings.tap()
        expandAdvancedServerSettings()
        XCTAssertEqual(server.value as? String, "https://example.invalid")
        XCTAssertEqual(domain.value as? String, "localhost")
        application.buttons["login-settings-cancel"].tap()
        rotate(.portrait)
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        snapshot("login-settings-separate")
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
                outgoing.frame.minY >= self.application.descendants(matching: .any)["chat-header"].firstMatch.frame.maxY - 1
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

    func testChatHeaderAndMessageMenuDoNotOverlapAcrossRotation() {
        application.launchArguments += ["-teletyptel.native.theme", "light"]
        application.launchEnvironment["TELETYPTEL_NATIVE_LONG_CONTACT_NAME"] = "1"
        signInFixture("connected")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 10)); reveal(contact); tapContact(contact)
        let header = application.descendants(matching: .any)["chat-header"].firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 5))
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        draft.tap(); draft.typeText("Ja")
        application.buttons["chat-send"].tap()
        let outgoing = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Ja")).firstMatch
        XCTAssertTrue(outgoing.waitForExistence(timeout: 5))
        let identifier = String(outgoing.identifier.dropFirst("chat-message-".count))
        let messageMenu = application.buttons["message-menu-" + identifier]
        let metadata = application.descendants(matching: .any)["message-metadata-" + identifier].firstMatch
        let menuPoses: [(name: String, orientation: UIDeviceOrientation)] = [
            ("portrait-light", .portrait), ("landscape-light", .landscapeLeft), ("portrait-light-return", .portrait)
        ]
        for pose in menuPoses {
            let orientation = pose.orientation
            rotate(orientation)
            assertConversationHeader("chat", actions: ["chat-start-total", "chat-interpreter", "chat-menu"])
            XCTAssertTrue(messageMenu.isHittable)
            let menuFrame = messageMenu.frame
            XCTAssertGreaterThanOrEqual(menuFrame.width + 0.000001, 44)
            XCTAssertGreaterThanOrEqual(menuFrame.height + 0.000001, 44)
            XCTAssertFalse(outgoing.frame.intersects(menuFrame))
            XCTAssertFalse(menuFrame.intersects(metadata.frame))
            XCTAssertLessThanOrEqual(outgoing.frame.height, 64)
            XCTAssertTrue(application.frame.contains(menuFrame))
            messageMenu.tap()
            let messagePanel = application.descendants(matching: .any)["message-menu-" + identifier + "-panel"].firstMatch
            XCTAssertTrue(messagePanel.waitForExistence(timeout: 5))
            XCTAssertTrue(application.frame.contains(messagePanel.frame))
            let copy = application.buttons["Kopiëren"]
            XCTAssertTrue(copy.waitForExistence(timeout: 5))
            XCTAssertTrue(copy.isHittable)
            XCTAssertGreaterThanOrEqual(copy.frame.height, 44)
            expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: application.keyboards.firstMatch)
            waitForExpectations(timeout: 5)
            snapshot("visual-message-menu-" + pose.name)
            let closeMessageMenu = application.buttons["message-menu-" + identifier + "-close"]
            XCTAssertTrue(closeMessageMenu.isHittable)
            closeMessageMenu.tap()
            expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: messagePanel)
            waitForExpectations(timeout: 5)
            application.buttons["chat-menu"].tap()
            XCTAssertTrue(application.buttons["Spraak en video"].waitForExistence(timeout: 5))
            expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: application.keyboards.firstMatch)
            waitForExpectations(timeout: 5)
            let panel = application.descendants(matching: .any)["conversation-menu-panel"].firstMatch
            XCTAssertTrue(panel.exists)
            XCTAssertTrue(application.frame.contains(panel.frame))
            XCTAssertFalse(application.descendants(matching: .any)["main-menu-grid"].firstMatch.exists)
            let audio = application.buttons["Spraak"]
            let video = application.buttons["Spraak en video"]
            XCTAssertGreaterThanOrEqual(audio.frame.height, 44)
            XCTAssertGreaterThanOrEqual(video.frame.height, 44)
            XCTAssertFalse(audio.frame.intersects(video.frame))
            snapshot(orientation == .landscapeLeft ? "chat-menu-landscape" : "chat-menu-portrait")
            let translation = application.buttons["Vertaling"]
            if !translation.isHittable { panel.swipeUp() }
            XCTAssertTrue(translation.isHittable)
            translation.tap()
            let close = application.buttons["Sluiten"]
            XCTAssertTrue(close.waitForExistence(timeout: 5)); close.tap()
            XCTAssertTrue(header.waitForExistence(timeout: 5))
            XCTAssertFalse(application.buttons["Gesprek beëindigen"].exists)
        }
        snapshot("chat-header-separated")
    }

    func testWebSmileyPickerUsesSharedImagesAndOnlyChangesDraft() {
        signInFixture("connected")
        XCTAssertTrue(application.buttons["messenger-main-menu"].waitForExistence(timeout: 20))
        waitForStatus("XMPP verbonden als fixture@localhost")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 30)); reveal(contact); tapContact(contact)
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        let count = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "message-body-")).count
        application.buttons["chat-smileys"].tap()
        let picker = application.descendants(matching: .any)["smiley-picker"].firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        XCTAssertEqual(picker.value as? String, "41 smileys beschikbaar")
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        snapshot("web-smileys-portrait")
        application.buttons["smiley-option-biggrin"].tap()
        application.buttons["chat-smileys"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertTrue((draft.value as? String)?.contains(":D") == true)
        application.buttons["chat-smileys"].tap()
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        application.buttons["smiley-option-bonk"].tap()
        XCTAssertEqual(application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "message-body-")).count, count)
        rotate(.landscapeLeft)
        XCTAssertTrue(application.buttons["smiley-option-biggrin"].isHittable)
        snapshot("web-smileys-landscape")
        rotate(.portrait)
        application.buttons["chat-smileys"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertTrue((draft.value as? String)?.contains(":D") == true)
        XCTAssertTrue((draft.value as? String)?.contains("8)7") == true)
        snapshot("web-smileys-draft-only")
        application.buttons["chat-send"].tap()
        snapshot("web-smileys-inline")
    }

    func testWebPaletteLoginChatAndMenusInBothThemes() {
        let arguments = application.launchArguments
        for theme in ["light", "dark"] {
            application.launchArguments = arguments + ["-teletyptel.native.theme", theme]
            application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
            application.launch()
            XCTAssertTrue(application.buttons["login-settings"].waitForExistence(timeout: 10))
            let palette = application.staticTexts["fixture-banner"]
            XCTAssertTrue(palette.waitForExistence(timeout: 5))
            XCTAssertEqual(palette.value as? String, "Web palette verified")
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            snapshot("web-palette-login-" + theme)
            application.terminate()
            signInFixture("connected")
            let main = application.buttons["messenger-main-menu"]
            XCTAssertTrue(main.waitForExistence(timeout: 10))
            snapshot("web-palette-contacts-" + theme)
            main.tap()
            XCTAssertTrue(application.buttons["open-appearance"].waitForExistence(timeout: 5))
            snapshot("web-palette-main-menu-" + theme)
            application.buttons["open-appearance"].tap()
            let close = application.buttons["Sluiten"]
            XCTAssertTrue(close.waitForExistence(timeout: 5))
            snapshot("web-palette-settings-" + theme)
            close.tap()
            let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
            XCTAssertTrue(contact.waitForExistence(timeout: 5)); reveal(contact); tapContact(contact)
            let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
            XCTAssertTrue(draft.waitForExistence(timeout: 5))
            draft.tap(); draft.typeText("Fictief eigen voorbeeldbericht")
            application.buttons["chat-send"].tap()
            application.buttons["chat-menu"].tap()
            XCTAssertTrue(application.buttons["Spraak en video"].waitForExistence(timeout: 5))
            snapshot("web-palette-conversation-menu-" + theme)
            application.buttons["Vertaling"].tap()
            XCTAssertTrue(close.waitForExistence(timeout: 5)); close.tap()
            XCTAssertTrue(draft.waitForExistence(timeout: 5))
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            snapshot("web-palette-chat-portrait-" + theme)
            rotate(.landscapeLeft)
            snapshot("web-palette-chat-landscape-" + theme)
            application.terminate()
            rotate(.portrait)
        }
    }

    func testWebPaletteTotalConversationInBothThemes() {
        let arguments = application.launchArguments
        for theme in ["light", "dark"] {
            application.launchArguments = arguments + ["-teletyptel.native.theme", theme]
            application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
            application.launchEnvironment["TELETYPTEL_NATIVE_CALL_VISUAL_FIXTURE"] = "total"
            application.launch()
            let controls = application.buttons["Gespreksbediening"]
            XCTAssertTrue(controls.waitForExistence(timeout: 10))
            XCTAssertTrue(application.buttons["Gesprek beëindigen"].isHittable)
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            snapshot("web-palette-tc-portrait-" + theme)
            rotate(.landscapeLeft)
            snapshot("web-palette-tc-landscape-" + theme)
            rotate(.portrait)
            controls.tap()
            XCTAssertTrue(application.buttons["Camera inschakelen"].waitForExistence(timeout: 5))
            snapshot("web-palette-tc-controls-" + theme)
            application.terminate()
        }
    }

    func testWebNavigationLayoutInBothThemesAndOrientations() {
        let arguments = application.launchArguments
        for theme in ["light", "dark"] {
            application.launchArguments = arguments + ["-teletyptel.native.theme", theme]
            signInFixture("connected")
            waitForStatus("XMPP verbonden als fixture@localhost")
            for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft] {
                rotate(orientation)
                let pose = orientation == .portrait ? "portrait" : "landscape"
                let main = application.buttons["messenger-main-menu"]
                XCTAssertTrue(main.waitForExistence(timeout: 10))
                XCTAssertFalse(application.keyboards.firstMatch.exists)
                snapshot("visual-navigation-contacts-" + pose + "-" + theme)
                main.tap()
                let grid = application.descendants(matching: .any)["main-menu-grid"].firstMatch
                XCTAssertTrue(grid.waitForExistence(timeout: 5))
                XCTAssertTrue(application.frame.contains(grid.frame))
                let probe = application.descendants(matching: .any)["visual-native-viewport"].firstMatch
                let value = probe.value as? String ?? ""
                let bytes = value.data(using: .utf8) ?? Data()
                let viewport = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
                let scale = viewport?["scale"] as? Double ?? 0
                let pixelWidth = viewport?["width"] as? Double ?? 0
                XCTAssertGreaterThan(scale, 0)
                let width = pixelWidth / scale
                let expectedMenuWidth = min(320, width - 24)
                XCTAssertEqual(grid.frame.width, expectedMenuWidth, accuracy: 1)
                let tile = application.buttons["open-number-dialer"]
                XCTAssertEqual(tile.frame.width, (expectedMenuWidth - 42) / 3, accuracy: 1)
                XCTAssertGreaterThanOrEqual(tile.frame.height, 48)
                XCTAssertTrue(application.buttons["open-translation"].isHittable)
                snapshot("visual-navigation-main-menu-" + pose + "-" + theme)
                application.buttons["open-appearance"].tap()
                let close = application.buttons["Sluiten"].firstMatch
                XCTAssertTrue(close.waitForExistence(timeout: 10)); close.tap()
                let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
                XCTAssertTrue(contact.waitForExistence(timeout: 5)); reveal(contact); tapContact(contact)
                let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
                XCTAssertTrue(draft.waitForExistence(timeout: 5))
                XCTAssertFalse(application.keyboards.firstMatch.exists)
                if UIDevice.current.userInterfaceIdiom == .pad {
                    let sidebar = application.descendants(matching: .any)["messenger-contact-sidebar"].firstMatch
                    XCTAssertTrue(sidebar.exists)
                    XCTAssertEqual(sidebar.frame.width, min(340, max(280, width * 0.28)), accuracy: 1)
                    XCTAssertLessThanOrEqual(sidebar.frame.maxX, draft.frame.minX)
                }
                snapshot("visual-navigation-chat-" + pose + "-" + theme)
                application.buttons["chat-back"].tap()
            }
            application.terminate()
            rotate(.portrait)
        }
    }

    func testVisualInventoryCapturesEveryMainMenuSheetInBothOrientations() {
        let arguments = application.launchArguments
        let destinations = [("dialer", "open-number-dialer"), ("history", "open-history"),
                            ("archive", "open-archive"), ("appearance", "open-appearance"),
                            ("profile-edit", "open-profile"), ("account", "open-account-settings"),
                            ("groups", "open-groups"), ("translation", "open-translation")]
        for theme in ["light", "dark"] {
            application.launchArguments = arguments + ["-teletyptel.native.theme", theme]
            signInFixture("connected")
            let main = application.buttons["messenger-main-menu"]
            XCTAssertTrue(main.waitForExistence(timeout: 20))
            waitForStatus("XMPP verbonden als fixture@localhost")
            for (screen, identifier) in destinations {
                main.tap()
                let action = application.buttons[identifier]
                XCTAssertTrue(action.waitForExistence(timeout: 5)); action.tap()
                let close = application.buttons["Sluiten"].firstMatch
                XCTAssertTrue(close.waitForExistence(timeout: 10))
                XCTAssertFalse(application.keyboards.firstMatch.exists)
                snapshot("visual-" + screen + "-portrait-" + theme)
                rotate(.landscapeLeft)
                XCTAssertTrue(close.isHittable)
                snapshot("visual-" + screen + "-landscape-" + theme)
                rotate(.portrait)
                close.tap()
                XCTAssertTrue(main.waitForExistence(timeout: 5))
            }
            application.terminate()
        }
    }

    func testVisualStartupStatesInBothThemesAndOrientations() {
        let arguments = application.launchArguments
        for theme in ["light", "dark"] {
            application.launchArguments = arguments + ["-teletyptel.native.theme", theme]
            for (fixture, screen, identifier) in [("checking", "startup-checking", "startup-progress"),
                                                  ("offline", "startup-offline", "startup-retry"),
                                                  ("certificate", "startup-certificate", "startup-failure-title")] {
                application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
                application.launchEnvironment["TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"] = fixture
                application.launch()
                let state = application.descendants(matching: .any)[identifier].firstMatch
                XCTAssertTrue(state.waitForExistence(timeout: 10))
                XCTAssertFalse(application.textFields["login-jid"].exists)
                XCTAssertFalse(application.keyboards.firstMatch.exists)
                snapshot("visual-" + screen + "-portrait-" + theme)
                rotate(.landscapeLeft)
                XCTAssertTrue(state.exists)
                XCTAssertTrue(application.frame.contains(state.frame))
                snapshot("visual-" + screen + "-landscape-" + theme)
                application.terminate()
                rotate(.portrait)
            }
            application.launchEnvironment.removeValue(forKey: "TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE")
            application.launch()
            let settings = application.buttons["login-settings"]
            XCTAssertTrue(settings.waitForExistence(timeout: 10))
            snapshot("visual-login-portrait-" + theme)
            rotate(.landscapeLeft)
            XCTAssertTrue(settings.isHittable)
            snapshot("visual-login-landscape-" + theme)
            rotate(.portrait)
            settings.tap()
            expandAdvancedServerSettings()
            let server = application.textFields["server-address"]
            XCTAssertTrue(server.waitForExistence(timeout: 5))
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            snapshot("visual-login-settings-portrait-" + theme)
            rotate(.landscapeLeft)
            XCTAssertTrue(server.exists)
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            snapshot("visual-login-settings-landscape-" + theme)
            application.terminate()
            rotate(.portrait)
            signInFixture("two-factor")
            let code = application.secureTextFields["two-factor-code"]
            XCTAssertTrue(code.waitForExistence(timeout: 10))
            XCTAssertFalse(application.buttons["messenger-main-menu"].exists)
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            snapshot("visual-two-factor-login-portrait-" + theme)
            rotate(.landscapeLeft)
            XCTAssertTrue(code.exists)
            XCTAssertFalse(application.buttons["messenger-main-menu"].exists)
            snapshot("visual-two-factor-login-landscape-" + theme)
            application.terminate()
            rotate(.portrait)
        }
    }

    func testMainMenuRemainsSeparateFromConversationMenu() {
        signInFixture("connected")
        let main = application.buttons["messenger-main-menu"]
        XCTAssertTrue(main.waitForExistence(timeout: 10))
        XCTAssertGreaterThanOrEqual(main.frame.width, 44)
        XCTAssertGreaterThanOrEqual(main.frame.height, 44)
        XCTAssertFalse(application.buttons["toolbar-number-dialer"].exists)
        XCTAssertFalse(application.buttons["toolbar-account-settings"].exists)
        XCTAssertFalse(application.buttons["disconnect-session"].exists)
        main.tap()
        XCTAssertTrue(application.buttons["open-number-dialer"].waitForExistence(timeout: 5))
        XCTAssertTrue(application.buttons["open-groups"].exists)
        XCTAssertTrue(application.buttons["menu-logout"].exists)
        let grid = application.descendants(matching: .any)["main-menu-grid"].firstMatch
        XCTAssertTrue(grid.exists)
        XCTAssertTrue(application.frame.contains(grid.frame))
        let rows = [["open-number-dialer", "menu-news", "menu-support"],
                    ["open-history", "open-archive", "open-appearance"],
                    ["open-profile", "open-account-settings", "menu-do-not-disturb"],
                    ["menu-logout", "open-groups", "open-translation"]]
        var previousRowBottom: CGFloat = 0
        for row in rows {
            let buttons = row.map { application.buttons[$0] }
            let frames = buttons.map(\.frame)
            for index in buttons.indices {
                XCTAssertTrue(buttons[index].exists)
                XCTAssertGreaterThanOrEqual(frames[index].width, 44)
                XCTAssertGreaterThanOrEqual(frames[index].height, 44)
                XCTAssertTrue(grid.frame.contains(frames[index]))
                XCTAssertEqual(frames[index].minY, frames[0].minY, accuracy: 1)
                if index > 0 { XCTAssertLessThanOrEqual(frames[index - 1].maxX, frames[index].minX) }
            }
            XCTAssertGreaterThanOrEqual(frames[0].minY, previousRowBottom)
            previousRowBottom = frames[0].maxY
        }
        XCTAssertFalse(application.buttons["menu-news"].isEnabled)
        XCTAssertFalse(application.buttons["menu-support"].isEnabled)
        XCTAssertFalse(grid.staticTexts["Nummer bellen"].exists)
        XCTAssertFalse(application.buttons["chat-menu"].exists)
        snapshot("main-menu-symbols")
        application.buttons["open-account-settings"].tap()
        let close = application.buttons["Sluiten"]
        XCTAssertTrue(close.waitForExistence(timeout: 10)); close.tap()
        XCTAssertTrue(main.waitForExistence(timeout: 5))
        XCTAssertFalse(application.buttons["chat-menu"].exists)
    }

    func testMessageMenuEditForwardAndBothDeletionOptions() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 5)); reveal(contact); tapContact(contact)
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        let incoming = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Fictief ontvangen bericht")).firstMatch
        XCTAssertTrue(incoming.waitForExistence(timeout: 5)); incoming.press(forDuration: 0.8)
        XCTAssertTrue(application.buttons["Kopiëren"].waitForExistence(timeout: 5)); application.buttons["Kopiëren"].tap()
        draft.tap(); draft.typeText("Menu testorigineel")
        application.buttons["chat-send"].tap()
        let outgoing = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Menu testorigineel")).firstMatch
        XCTAssertTrue(outgoing.waitForExistence(timeout: 5))
        let messageID = String(outgoing.identifier.dropFirst("chat-message-".count))
        let menu = application.buttons["message-menu-" + messageID]
        XCTAssertTrue(menu.waitForExistence(timeout: 5)); menu.tap()
        XCTAssertTrue(application.buttons["Kopiëren"].waitForExistence(timeout: 5))
        snapshot("message-actions-menu")
        application.buttons["Bewerken"].tap()
        let edit = application.descendants(matching: .any)["message-edit-text"].firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        application.buttons["message-edit-clear"].tap()
        edit.tap(); edit.typeText("Menu testorigineel bewerkt")
        XCTAssertEqual(edit.value as? String, "Menu testorigineel bewerkt")
        let save = application.buttons["message-edit-save"]; reveal(save); save.tap()
        let edited = application.descendants(matching: .any)["chat-message-" + messageID].firstMatch
        let corrected = NSPredicate(format: "label CONTAINS %@", "Menu testorigineel bewerkt")
        expectation(for: corrected, evaluatedWith: edited); waitForExpectations(timeout: 10)
        menu.tap(); application.buttons["Doorsturen"].tap()
        let recipient = application.buttons["forward-contact-demo-contact@localhost"]
        XCTAssertTrue(recipient.waitForExistence(timeout: 5)); reveal(recipient); recipient.tap()
        let confirm = application.buttons["forward-confirm"]; reveal(confirm)
        snapshot("message-forward-confirmation"); confirm.tap()
        let forwarded = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Doorgestuurd:")).firstMatch
        XCTAssertTrue(forwarded.waitForExistence(timeout: 5))
        let forwardID = String(forwarded.identifier.dropFirst("chat-message-".count))
        application.buttons["message-menu-" + forwardID].tap(); application.buttons["Verwijderen"].tap()
        XCTAssertTrue(application.buttons["Verwijderen voor mij"].waitForExistence(timeout: 5))
        application.buttons["Verwijderen voor mij"].tap()
        let hidden = NSPredicate { _, _ in
            !self.application.descendants(matching: .any).matching(identifier: "chat-message-" + forwardID).firstMatch.exists
        }
        expectation(for: hidden, evaluatedWith: nil); waitForExpectations(timeout: 10)
        reveal(menu); menu.tap(); application.buttons["Verwijderen"].tap()
        let retract = application.buttons["Voor iedereen intrekken"]
        XCTAssertTrue(retract.waitForExistence(timeout: 5)); retract.tap()
        let tombstone = NSPredicate { _, _ in
            let updated = self.application.descendants(matching: .any).matching(identifier: "chat-message-" + messageID).firstMatch
            return updated.exists && updated.label.contains("Bericht ingetrokken")
        }
        expectation(for: tombstone, evaluatedWith: nil); waitForExpectations(timeout: 10)
        snapshot("message-actions-retracted-portrait")
        rotate(.landscapeLeft)
        snapshot("message-actions-retracted-landscape")
    }

    func testMessageReactionTogglesAcrossRotation() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        let contact = application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch
        XCTAssertTrue(contact.waitForExistence(timeout: 5)); reveal(contact); tapContact(contact)
        let draft = application.descendants(matching: .any)["chat-draft"].firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 5)); draft.tap(); draft.typeText("Fictieve reactietest")
        application.buttons["chat-send"].tap()
        let message = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-message-", "Fictieve reactietest")).firstMatch
        XCTAssertTrue(message.waitForExistence(timeout: 5))
        let identifier = String(message.identifier.dropFirst("chat-message-".count))
        application.buttons["message-menu-" + identifier].tap()
        XCTAssertTrue(application.buttons["Reageren"].waitForExistence(timeout: 5)); application.buttons["Reageren"].tap()
        XCTAssertTrue(application.buttons["👍"].waitForExistence(timeout: 5)); application.buttons["👍"].tap()
        let reaction = application.buttons["👍, 1 reacties"].firstMatch
        XCTAssertTrue(reaction.waitForExistence(timeout: 5)); snapshot("message-reaction")
        reaction.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: reaction); waitForExpectations(timeout: 5)
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(application.buttons["message-menu-" + identifier].waitForExistence(timeout: 5))
    }

    func testNativeDialerShowsPhoneLettersAndKeepsPublicCallingDisabled() {
        signInFixture("connected")
        waitForStatus("XMPP verbonden als fixture@localhost")
        application.buttons["Hoofdmenu"].tap()
        application.buttons["open-number-dialer"].tap()
        let display = application.staticTexts["dialer-number"]
        XCTAssertTrue(display.waitForExistence(timeout: 5))
        for _ in 0..<3 { application.buttons["Laatste teken wissen"].tap() }
        let two = application.buttons["dial-key-2"]
        XCTAssertTrue(two.waitForExistence(timeout: 5)); reveal(two)
        XCTAssertTrue(two.label.contains("ABC")); two.tap()
        XCTAssertEqual(display.label, "2")
        two.press(forDuration: 0.6)
        expectation(for: NSPredicate(format: "label == %@", "2A"), evaluatedWith: display); waitForExpectations(timeout: 5)
        let star = application.buttons["dial-key-*"]; reveal(star); star.tap()
        application.buttons["dial-key-0"].tap(); application.buttons["dial-key-#"].tap()
        XCTAssertEqual(display.label, "2A*0#")
        XCTAssertFalse(application.buttons["sip-lab-call"].isEnabled)
        snapshot("native-number-pad")
        rotate(.landscapeLeft)
        let close = application.buttons["Sluiten"].firstMatch
        XCTAssertTrue(close.isHittable)
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
        let viewport = application.scrollViews["group-messages-fixture@conference.localhost"].firstMatch
        XCTAssertTrue(viewport.waitForExistence(timeout: 5))
        let outgoingMenu = application.buttons["group-message-menu-" + String(outgoing.identifier.dropFirst("group-message-".count))]
        let latestVisible = NSPredicate { _, _ in
            let messageFrame = outgoing.frame
            let viewportFrame = viewport.frame
            let draftFrame = draft.frame
            return outgoingMenu.isHittable && viewportFrame.contains(messageFrame) && messageFrame.maxY <= draftFrame.minY
        }
        expectation(for: latestVisible, evaluatedWith: outgoing)
        waitForExpectations(timeout: 10)
        snapshot("group-landscape")
        outgoingMenu.tap()
        let copy = application.buttons["Kopiëren"]
        XCTAssertTrue(copy.waitForExistence(timeout: 5))
        snapshot("group-message-actions-landscape")
        copy.tap()
        assertConversationHeader("group", actions: ["group-invite", "group-menu"])
        application.buttons["group-menu"].tap()
        let leave = application.buttons["group-leave"]
        XCTAssertTrue(leave.isHittable)
        XCTAssertTrue(application.frame.contains(leave.frame))
        leave.tap()
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
        let push = application.staticTexts["push-registration-status"]
        reveal(push)
        XCTAssertTrue(push.label.contains("nog niet geactiveerd"))
        XCTAssertFalse(application.buttons["Oproepmeldingen inschakelen"].exists)
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
        reveal(discovery); XCTAssertTrue(discovery.waitForExistence(timeout: 5)); discovery.tap()
        let discovered = application.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Fictieve testgroep")).firstMatch
        XCTAssertTrue(discovered.waitForExistence(timeout: 5)); reveal(discovered); discovered.tap()
        let nickname = application.textFields["group-nickname"]; reveal(nickname); nickname.tap(); nickname.typeText("Testnaam")
        let join = application.buttons["group-join"]; reveal(join); join.tap()
        let room = application.descendants(matching: .any)["group-room-fixture@conference.localhost"].firstMatch
        XCTAssertTrue(room.waitForExistence(timeout: 5)); reveal(room); room.tap()
        let messages = application.scrollViews["group-messages-fixture@conference.localhost"].firstMatch
        XCTAssertTrue(messages.waitForExistence(timeout: 5))
        XCTAssertTrue(messages.staticTexts["Fictief groepsbericht"].waitForExistence(timeout: 5))
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
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: messages.staticTexts["Fictief groepsbericht"])
        waitForExpectations(timeout: 5)
    }

    func testConnectionLossRecoversWithoutAnotherPasswordPrompt() {
        signInFixture("disconnect")
        waitForStatus("Verbinding herstellen…")
        XCTAssertTrue(application.descendants(matching: .any)["messenger-brand-header"].firstMatch.exists)
        XCTAssertFalse(application.buttons["login-account"].exists)
        XCTAssertFalse(application.secureTextFields["account-password"].exists)
        snapshot("connection-recovering")
        waitForStatus("XMPP verbonden als fixture@localhost")
        XCTAssertTrue(application.descendants(matching: .any)["contact-demo-contact@localhost"].firstMatch.exists)
        XCTAssertFalse(application.buttons["login-account"].exists)
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
        let interpreter = application.buttons["call-interpreter"]
        XCTAssertTrue(interpreter.isHittable); interpreter.tap()
        let status = application.staticTexts["interpreter-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertTrue(status.label.contains("Start of beantwoord"))
        XCTAssertFalse(application.buttons["interpreter-request"].isEnabled)
        snapshot("interpreter-consent-unavailable")
        application.buttons["interpreter-close"].tap()
        for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft, .portrait] {
            rotate(orientation)
            XCTAssertTrue(controls.isHittable)
            XCTAssertTrue(end.isHittable)
            XCTAssertTrue(application.descendants(matching: .any)["tc-expanded-rtt"].firstMatch.exists)
            for identifier in ["tc-peer-pane", "tc-own-pane"] {
                let pane = application.descendants(matching: .any)[identifier].firstMatch
                XCTAssertTrue(pane.exists)
                XCTAssertTrue(application.frame.contains(pane.frame), identifier)
            }
            let remote = application.descendants(matching: .any)["tc-peer-pane"].firstMatch.frame
            let own = application.descendants(matching: .any)["tc-own-pane"].firstMatch.frame
            if orientation == .landscapeLeft {
                XCTAssertGreaterThan(remote.width + own.width, application.frame.width * 0.7)
                XCTAssertGreaterThan(min(remote.height, own.height), application.frame.height * 0.45)
            } else {
                XCTAssertGreaterThan(remote.height + own.height, application.frame.height * 0.5)
            }
            XCTAssertTrue(application.scrollViews["tc-peer-scroll"].exists)
            XCTAssertTrue(application.scrollViews["tc-own-scroll"].exists)
            snapshot(orientation == .landscapeLeft ? "tc-web-landscape" : "tc-web-portrait")
        }
        controls.tap()
        XCTAssertTrue(application.buttons["Camera inschakelen"].waitForExistence(timeout: 5))
        XCTAssertTrue(application.buttons["Microfoon dempen"].isHittable)
        let keypad = application.buttons["call-dtmf-keypad"]
        XCTAssertTrue(keypad.exists)
        XCTAssertFalse(keypad.isEnabled)
        snapshot("tc-web-controls")
    }

    func testPeerCameraOnOrUnknownDoesNotEnterTextOnlyLayout() {
        for camera in ["on", "unknown"] {
            application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
            application.launchEnvironment["TELETYPTEL_NATIVE_CALL_VISUAL_FIXTURE"] = "total"
            application.launchEnvironment["TELETYPTEL_NATIVE_CALL_REMOTE_CAMERA_FIXTURE"] = camera
            application.launch()
            XCTAssertTrue(application.buttons["Gespreksbediening"].waitForExistence(timeout: 10))
            for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft] {
                rotate(orientation)
                XCTAssertTrue(application.descendants(matching: .any)["tc-video-layout"].firstMatch.exists)
                XCTAssertFalse(application.descendants(matching: .any)["tc-expanded-rtt"].firstMatch.exists)
            }
            snapshot("tc-camera-" + camera)
            application.terminate()
            rotate(.portrait)
        }
    }

    func testUnsupportedCallKeypadKeepsPhoneKeysReachableAcrossRotationWithoutKeyboard() {
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = "connected"
        application.launchEnvironment["TELETYPTEL_NATIVE_CALL_VISUAL_FIXTURE"] = "total"
        application.launchEnvironment["TELETYPTEL_NATIVE_CALL_KEYPAD_FIXTURE"] = "disabled"
        application.launch()
        let first = application.buttons["call-dtmf-1"]
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        let scroll = application.scrollViews["call-dtmf-scroll"]
        func revealPhoneKey(_ key: XCUIElement) {
            for _ in 0..<8 {
                let viewport = scroll.frame.intersection(application.frame).insetBy(dx: 0, dy: 3)
                if key.exists, !key.frame.isEmpty, viewport.contains(key.frame) { return }
                if key.exists, !key.frame.isEmpty, key.frame.midY < viewport.midY { scroll.swipeDown() }
                else { scroll.swipeUp() }
            }
            XCTFail("Disabled telephone key remains outside the visible scroll viewport")
        }
        for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft, .portrait] {
            rotate(orientation)
            revealPhoneKey(first)
            XCTAssertFalse(first.isEnabled)
            let last = application.buttons["call-dtmf-#"]
            revealPhoneKey(last)
            for tone in ["*", "0", "#"] {
                let key = application.buttons["call-dtmf-" + tone]
                XCTAssertTrue(scroll.frame.intersection(application.frame).contains(key.frame))
                XCTAssertFalse(key.isEnabled)
            }
            XCTAssertFalse(application.keyboards.firstMatch.exists)
            XCTAssertTrue(application.buttons["call-dtmf-close"].isHittable)
            snapshot(orientation == .landscapeLeft ? "dtmf-keypad-landscape" : "dtmf-keypad-portrait")
        }
        application.buttons["call-dtmf-close"].tap()
        XCTAssertTrue(application.buttons["Gespreksbediening"].isHittable)
    }

    private func assertConversationHeader(_ identifier: String, actions: [String]) {
        let header = application.descendants(matching: .any)[identifier + "-header"].firstMatch
        let identity = application.descendants(matching: .any)[identifier + "-connection"].firstMatch
        let back = application.buttons[identifier + "-back"]
        let buttons = [back] + actions.map { application.buttons[$0] }
        let headerFrame = header.frame
        let identityFrame = identity.frame
        let buttonFrames = buttons.map(\.frame)
        XCTAssertTrue(header.exists)
        XCTAssertTrue(application.frame.contains(headerFrame))
        XCTAssertTrue(headerFrame.contains(identityFrame))
        for index in buttons.indices {
            XCTAssertTrue(buttons[index].isHittable)
            let buttonFrame = buttonFrames[index]
            XCTAssertGreaterThanOrEqual(buttonFrame.width, 44)
            XCTAssertGreaterThanOrEqual(buttonFrame.height, 44)
            XCTAssertTrue(headerFrame.contains(buttonFrame))
            XCTAssertFalse(buttonFrame.intersects(identityFrame))
        }
        for first in buttons.indices {
            for second in buttons.indices where second > first {
                XCTAssertFalse(buttonFrames[first].intersects(buttonFrames[second]))
            }
        }
    }

    private func expandAdvancedServerSettings() {
        let advanced = application.descendants(matching: .any)["login-advanced-settings"].firstMatch
        XCTAssertTrue(advanced.waitForExistence(timeout: 5))
        advanced.tap()
        XCTAssertTrue(application.textFields["server-address"].waitForExistence(timeout: 5))
    }

    private func snapshot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let frame = application.frame
        let identifiers: [String]
        if name.hasPrefix("visual-navigation-") {
            identifiers = ["messenger-brand-header", "messenger-contact-sidebar", "main-menu-grid", "chat-header", "chat-draft"]
        } else if name.hasPrefix("web-palette-main-menu-") {
            identifiers = ["main-menu-grid"]
        } else if name.hasPrefix("web-palette-conversation-menu-") {
            identifiers = ["chat-header", "conversation-menu-panel"]
        } else if name.hasPrefix("web-palette-chat-") {
            identifiers = ["chat-header", "chat-draft"]
        } else if name.hasPrefix("web-palette-login-") {
            identifiers = ["login-actions"]
        } else if name.hasPrefix("web-smileys-") {
            identifiers = ["smiley-picker"]
        } else {
            identifiers = []
        }
        let elements = identifiers.compactMap { identifier -> [String: Any]? in
            let element = application.descendants(matching: .any)[identifier].firstMatch
            guard element.exists else { return nil }
            let bounds = element.frame
            return ["id": identifier, "x": bounds.minX, "y": bounds.minY, "width": bounds.width, "height": bounds.height]
        }
        var geometry: [String: Any] = ["schema": 1, "name": name, "units": "points", "appFrame": ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height], "imageSize": ["width": screenshot.image.size.width, "height": screenshot.image.size.height, "scale": screenshot.image.scale], "elements": elements, "fixture": "isolated-native-connected-v1", "pixelEquality": "not-evaluated"]
        let probe = application.descendants(matching: .any)["visual-native-viewport"].firstMatch
        if probe.exists, let value = probe.value as? String, let bytes = value.data(using: .utf8),
           let viewport = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
            geometry["viewport"] = viewport
        }
        if let bytes = try? JSONSerialization.data(withJSONObject: geometry, options: [.sortedKeys]) {
            let metrics = XCTAttachment(data: bytes, uniformTypeIdentifier: "public.json")
            metrics.name = name + "-geometry"
            metrics.lifetime = .keepAlways
            add(metrics)
        }
    }

    private func rotate(_ orientation: UIDeviceOrientation) {
        XCUIDevice.shared.orientation = orientation
        guard application.state != .notRunning else { return }
        let landscape = orientation == .landscapeLeft || orientation == .landscapeRight
        let probe = application.descendants(matching: .any)["visual-native-viewport"].firstMatch
        XCTAssertTrue(probe.waitForExistence(timeout: 5))
        let windowSettled = NSPredicate { _, _ in
            guard let value = probe.value as? String, let data = value.data(using: .utf8),
                  let measurement = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rawOrientation = measurement["interfaceOrientation"] as? Int,
                  let interfaceOrientation = UIInterfaceOrientation(rawValue: rawOrientation), interfaceOrientation != .unknown,
                  let width = measurement["windowWidth"] as? Double,
                  let height = measurement["windowHeight"] as? Double else { return false }
            return interfaceOrientation.isLandscape == landscape && (width > height) == landscape
        }
        expectation(for: windowSettled, evaluatedWith: probe)
        waitForExpectations(timeout: 10)
        let screenSettled = NSPredicate { _, _ in
            let image = XCUIScreen.main.screenshot().image.size
            return (image.width > image.height) == landscape
        }
        expectation(for: screenSettled, evaluatedWith: application)
        waitForExpectations(timeout: 10)
        let frame = application.frame
        XCTAssertEqual(frame.width > frame.height, landscape)
    }

    private func signInFixture(_ scenario: String) {
        application.launchEnvironment["TELETYPTEL_NATIVE_UI_FIXTURE"] = scenario
        application.launch()
        XCTAssertTrue(application.staticTexts["fixture-banner"].waitForExistence(timeout: 10))
        XCTAssertFalse(application.keyboards.firstMatch.exists)
        let jid = application.textFields["login-jid"]
        XCTAssertTrue(jid.waitForExistence(timeout: 5))
        reveal(jid)
        jid.tap()
        jid.typeText("fixture@localhost")
        let password = application.secureTextFields["login-password"]
        reveal(password)
        password.tap()
        let actions = application.descendants(matching: .any)["login-actions"].firstMatch
        XCTAssertLessThanOrEqual(password.frame.maxY, actions.frame.minY)
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
        if (element.identifier.hasPrefix("contact-") || element.identifier.hasPrefix("cloud-contact-")), !fullyVisible {
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
        let displayed = NSPredicate { _, _ in
            let status = self.application.staticTexts["startup-status"]
            return status.exists && status.label.contains(text)
        }
        expectation(for: displayed, evaluatedWith: nil)
        waitForExpectations(timeout: 30)
    }
}
