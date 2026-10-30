# iOS: interne wifi-test via TestFlight

Deze aparte bouwstraat maakt een ondertekende iPhone-app voor de lokale TeleTypTel-testserver. Het is geen openbare App Store-release en geen simulatorpakket. De uiteindelijke werking op een echte iPhone moet afzonderlijk worden getest.

## Afbakening

- Bundle ID: `com.tiedragon.teletyptel`; Apple-team: `H29RTRBD9D`.
- De app opent de ingebouwde Messenger op `capacitor://localhost/chat.html`. WAMP op `https://192.168.0.105` blijft de server voor aanmelden, gegevens en gesprekken; iPhone en computer moeten daarvoor op hetzelfde wifi-netwerk bereikbaar zijn.
- Een allowlist verpakt de Messenger-interface, talen, iconen, achtergronden en smileys. Geen PHP, serverconfiguratie, PostNL-demo, gebruikersgegevens of geheime sleutels in de app. De bronmanifesten bevatten hashes van de verpakte frontendbestanden.
- Capacitor `server.url` is verwijderd. Dit is een ingebouwde hybride interface, geen volledige SwiftUI-herschrijving en geen offline berichtendienst. De Android-testapp is hiermee nog niet omgezet.
- Geen claim over werkende achtergrondoproepen, pushberichten of noodoproepen. Audio, video, RTT, Google-aanmelding en netwerkherstel vereisen echte toesteltests.

## Google-aanmelding op iPhone

De interne app gebruikt Google Sign-In iOS 9.0.0, niet de web-OAuth-redirect naar een LAN-IP-adres. De openbare iOS-client-ID en aparte web/server-client-ID staan in `scripts/ios-testflight/google-signin.js`. Beide horen bij hetzelfde Google-project; de iOS-client hoort bij `com.tiedragon.teletyptel`. De client-secret blijft uitsluitend in de bestaande PHP-serverconfiguratie.

De Google-SDK opent de systeemauthenticatie en verwerkt de callback via het omgekeerde client-ID-URL-schema. De native bridge accepteert alleen het hoofddocument van de ingebouwde Messenger en controleert of de server-client-ID overeenkomt. De server wisselt een eenmalige `serverAuthCode` rechtstreeks met Google uit en haalt het profiel bij Google UserInfo op. Geen door JavaScript aangeleverd profiel of ongeverifieerd ID-token wordt vertrouwd. Google-tokens worden niet opgeslagen; de SDK wordt na afloop lokaal afgemeld.

`/api/auth/google/native.php` vereist HTTPS, dezelfde origin, JSON POST, een aparte request-header en een eenmalige sessiechallenge (10 minuten). De native transportlaag zet de origin uitsluitend voor de vaste server. De bestaande accountblokkering, sessierotatie en 2FA blijven gelden. JavaScript krijgt het account-ID; de HttpOnly-sessiecookie blijft in de native cookie-opslag. Geen langdurig login-token in de URL. Een externe, niet door Google beheerde e-mail wordt niet gebruikt voor automatische koppeling aan een bestaand account. Providers koppelen blijft een website-actie; aanmelden in deze ingebouwde versie kan via Google of e-mail, niet via de Facebook-webredirect.

Een oude TestFlight-build toont een updateverzoek. Installeer de nieuwe build, open Google-aanmelding, test annuleren en opnieuw aanmelden, en test een account met 2FA. De cloudtest kan alleen compilatie en opstarten controleren; echte Google-aanmelding en de lokale WAMP-verbinding moeten op de iPhone worden bevestigd.

De interface gebruikt `window.Capacitor.Plugins.TeleTypTelGoogle.signIn`, zoals de native iOS-bridge die bij het laden injecteert. Er is geen afhankelijkheid van de JavaScript-`registerPlugin`-functie.

## Ingebouwde interface en servertransport

`bundle-frontend.js` kopieert alleen expliciet gekozen frontendbestanden. `native-server.js` laat lokale talen en statische bestanden lokaal en stuurt uitsluitend API- en geselecteerde configuratieverzoeken naar `TeleTypTelServer`. De Swift-laag kiest zelf de HTTPS-server uit Info.plist, valideert routes en methoden, weigert redirects en laat cookies, Host en Origin niet door JavaScript bepalen. De certificaatcontrole van URLSession blijft ongewijzigd. Er worden geen CORS-uitzonderingen op WAMP toegevoegd. De Capacitor-berichtenhandler weigert pluginoproepen uit iframes en andere documenten.

JSON, multipart-uploadchunks, foutstatussen en afbreken van vertaalverzoeken blijven ondersteund. Foto/video/audio van `api/file.php` gebruikt een afzonderlijke native mediascheme-handler met dezelfde sessie. Downloads openen het iOS-deelvenster; tijdelijke bestanden zijn beveiligd en worden na het sluiten verwijderd. Na een procescrash kan een tijdelijk bestand blijven staan totdat iOS de tijdelijke map opruimt. Gedeelde bijlagelinks blijven HTTPS; XMPP gebruikt de ingestelde WAMP-host en beveiligde WebSocket-proxy, nooit `capacitor://localhost`.

De lokale opstartweergave toont voortgang. Bij een onbereikbare server verschijnt de ingebouwde aanmelding met een verbindingsmelding; berichten versturen vereist nog steeds de server. Web-serviceworkers worden niet in de app geregistreerd: interface-updates vereisen voortaan een nieuwe appbuild. De bestaande browser/Android-webclient blijft werken zoals voorheen. Externe beheer- en aanmeldpagina's openen als website en delen niet automatisch de native sessie.

Bij de overgang van de oude externe webpagina naar de lokale app-origin moet de gebruiker opnieuw aanmelden en lokale voorkeuren/toestemmingen opnieuw instellen. Handmatige vertaaltoestemming wordt in de app per account lokaal bewaard met dezelfde maximale looptijd van 180 dagen; sessiecookies en Google-codes worden daar niet opgeslagen.

Tests: `node --test tests/ios-bundled-runtime.test.js tests/ios-bundled-ui.test.js tests/native-google.test.js tests/account-login-focus.test.js`. De WebKit-UI-test laadt de echte allowlistbundel met een fictieve, onbereikbare native server en controleert de mobiele aanmelding, Google-knop, taalbestanden en ontbrekende invoerfocus. De JavaScript-tests simuleren de native bridge; zij bewijzen geen Swift-compilatie, URLSession-cookiegedrag of fysieke camera-/microfoonwerking. Daarvoor blijven de macOS-build en toesteltests nodig.

Lokale regressietests:

- `node --test tests/native-google.test.js`
- `node --test tests/native-google-bridge-ui.test.js` (Playwright/Chromium en de geïnstalleerde iOS-harnessafhankelijkheden; echte JavaScriptbridge, fictieve native Google-respons).
- `php php/tests/native-google-signin-test.php`
- `php php/tests/oauth-session-test.php`
- Na voorbereiden van het geïsoleerde project: `node --test scripts/ios-testflight/prepare.test.js`.

Referenties: [Google iOS-configuratie](https://developers.google.com/identity/sign-in/ios/start-integrating), [Google servercode-uitwisseling](https://developers.google.com/identity/sign-in/ios/offline-access).

## Mobiele chat en toetsenbord

De gewone mobiele chat (zonder actief gesprek) volgt de hoogte en verticale verschuiving van de visual viewport. De pagina zelf scrolt niet mee; de berichtenlijst blijft apart scrollbaar. Bij openen of sluiten van het toetsenbord blijft het nieuwste bericht in beeld als de gebruiker al onderaan stond. Teruglezen wordt niet onderbroken. Pinch-zoom blijft toegestaan en verkleint niet nogmaals de app-layout. Ruimte voor de reactieknop wordt buiten de berichtballon gereserveerd, niet van de al passende tekstbreedte afgetrokken.

`node --test tests/mobile-chat-viewport.test.js` controleert Chromium en WebKit op 320, 390 en 430 pixels breed, korte eigen/ontvangen berichten, lange tekst, gesimuleerde toetsenbordhoogtes en viewportverschuivingen, teruglezen en zoom. Screenshots staan lokaal onder `artifacts/mobile-chat`. Dit simuleert viewportwijzigingen; het echte iPhone-toetsenbord moet nog op het toestel worden gecontroleerd. De aanpassing wordt door WAMP geserveerd en vereist geen nieuwe native build.

De berichtenlijst onthoudt of zij onderaan stond vóór een hoogtewijziging. Een ResizeObserver en een controle in het volgende renderframe vangen ook late toetsenbord- en composerwijzigingen op. Automatisch volgen bij RTT gebeurt direct, zonder bij iedere letter opnieuw een scrollanimatie te starten. Focus op het tekstvak en de pijl hervatten volgen; handmatig terugscrollen onderbreekt het volgen tijdens hoogtewijzigingen. De regressietest controleert ook een resize vóór het viewport-event, snelle RTT-updates en een reeds ingeplande scrollcontrole na terugscrollen.

## Draaien tijdens videobellen

Een gedetecteerde telefoon behoudt de telefoonlayout in beide richtingen. Horizontaal beeld alleen activeert niet langer de compacte toetsenbordmodus: daarvoor moet een invoerveld actief zijn en de visual viewport werkelijk lager zijn dan de layout viewport. Resize-events delen één uitgestelde layoutcontrole, gebonden aan hetzelfde gesprek; draaien bouwt de gespreksinterface niet opnieuw op en start videoweergave niet herhaald. De horizontale TC-layout heeft voorrang op de algemene lokale-videostijlen, zodat RTT onder het beeld blijft en het eigen voorbeeld klein blijft naast de andere deelnemer.

`node --test tests/mobile-call-rotation.test.js tests/mobile-chat-viewport.test.js` controleert eventreeksen, beëindigde/vervangen gesprekken, toetsenbord versus rotatie/zoom en herhaald portret/landschap in Chromium en WebKit. Deze fixtures gebruiken geen camera of echte gesprekspartner. Controleer op de iPhone ook werkelijk tweerichtingsvideo, RTT, audio en draaien met het toetsenbord open. Screenshots staan lokaal onder `artifacts/mobile-chat`.

Tijdens RTT-typen in een gesprek volgt ook de portretweergave de visual viewport, inclusief de verschuiving die iOS toepast om het tekstvak zichtbaar te maken. Video, scrollbare RTT-vakken, gespreksknoppen en composer passen binnen die hoogte; de normale paginakop en volumeschuif maken tijdelijk ruimte. In landschap staan video en RTT naast elkaar bij geopend toetsenbord. Het ophangen blijft beschikbaar. De regressietest simuleert dit op 320 en 390 pixels breed, met viewporthoogtes van 300/350 pixels, verticale verschuivingen en een horizontale toetsenbordviewport van 180 pixels. Bij sluiten van het toetsenbord herstelt de gewone gesprekslayout. Test dit ook op het echte toestel, omdat de browserfixture geen native iOS-toetsenbord opent.

Tijdens een mobiel gesprek reserveert de app-shell de door iOS opgegeven `safe-area-inset-*`: de naam en knoppen blijven onder de statusbalk/Dynamic Island en in landschap buiten de camerauitsparing. De verborgen gewone bovenbalk is daardoor niet meer verantwoordelijk voor die ruimte; wanneer deze wel zichtbaar is, telt zij de inset niet dubbel. Bij het toetsenbord blijft de bovenruimte behouden en vervalt alleen de onderste home-indicatorruimte. De rotatietest injecteert voorbeeldinsets (59 pixels bovenaan of aan de zijkanten), controleert de echte elementposities en test terugdraaien en toetsenbordpanning. Dit is een layouttest, geen meting van de native safe-area-insets op het fysieke toestel.

De mobiele gesprekskop toont avatar, contactnaam en gespreksiconen op één rij binnen de veilige ruimte. Lange namen worden afgekapt; iconen houden een aanraakvlak van 44 × 44 pixels. De statusmelding blijft beschikbaar als live-regio voor schermlezers zonder een extra zichtbare regel te maken. De regressietest controleert de uitlijning en lange namen op 320, 390 en 430 pixels breed.

De mobiele TC-weergave blijft ook zonder toetsenbord aan de visual viewport verankerd. Gesprekskop, media/RTT en composer gebruiken vaste gridrijen; lange RTT-tekst scrolt binnen het eigen vak in plaats van de hele gesprekskop mee te trekken. Een viewport-panoffset wordt begrensd tot de beschikbare ruimte tussen layout- en visual viewport, zodat een achterblijvende iOS-offset na toetsenbordsluiting geen dubbele bovenruimte oplevert. De rotatietest controleert deze offset, het vast blijven staan van de kop tijdens scrollpogingen en het zichtbaar blijven van de composer bij lange RTT-tekst. Fysieke iPhone-validatie blijft nodig; de browserfixture simuleert de native viewport-events.

## Focus bij mobiel aanmelden

Op telefoons en tablets krijgen invoervelden niet automatisch focus bij openen van aanmelden, wachtwoordherstel of de tweestapscontrole, ook niet na een aanmeldfout. De dialoogtitel is programmatisch focusbaar voor toegankelijkheid, zonder een toetsenbord te openen of automatisch te scrollen. De gebruiker kan de velden gewoon aantikken. Desktopfocus blijft behouden en een late focuscallback doet niets als de dialoog inmiddels is gesloten. `node --test tests/account-login-focus.test.js tests/native-google.test.js` controleert deze overgangen in Chromium/WebKit en de bestaande native Google-aanmeldroute. Het echt openen van het iPhone-toetsenbord wordt niet door deze browserfixture nagebootst; test de aanmelding ook op het toestel.

## Certificaten en netwerk

De app vraagt toegang tot het lokale netwerk. HTTPS blijft verplicht. De native TLS-afhandeling gebruikt uitsluitend de systeemvalidatie voor de geconfigureerde host; ongeldige certificaten worden niet geaccepteerd. De bekende lokale test-CA moet op de iPhone bewust geïnstalleerd en vertrouwd zijn. Controleer de server eerst in Safari zonder certificaatwaarschuwing. Publiceer de WAMP-server niet op internet voor deze test.

De lokale webclient moet voor native iOS dezelfde beveiligde XMPP-proxy gebruiken als Android: `wss://192.168.0.105/xmpp-websocket`.

## Bouwstraat

Workflow: `.github/workflows/ios-testflight.yml`, uitsluitend op `codex/teletyptel-beta-polish`.

1. Een macOS-runner met Xcode 26 installeert de vastgelegde afhankelijkheden van `scripts/ios-testflight`.
2. `prepare.js` haalt de native basisbestanden uit de exacte Git-commit, voegt de native bridges en frontendallowlist toe en maakt een geïsoleerde projectmap onder `artifacts/ios-testflight`.
3. Tests, een ongetekende build voor fysieke iOS-apparaten en een Release-Simulator-opstarttest draaien zonder ondertekeningssleutels. De opstarttest reproduceert eerst het afsluiten zonder lokaal startbestand en controleert daarna twee stabiele starts met de echte lokale interface. Alleen de simulator krijgt een onbereikbare loopback-server in Info.plist én connection.js; geen verbinding met WAMP vanuit de cloud.
4. De GitHub-omgeving `ios-testflight` vraagt goedkeuring van de ingestelde reviewer voordat de ondertekende upload begint.
5. De vervolgtaak maakt een tijdelijke keychain, valideert het provisioningprofiel, archiveert de app en exporteert met `testFlightInternalTestingOnly: true`.
6. Upload naar Apple met de API-sleutel. Alleen niet-geheime statusrapporten worden als GitHub-artifact bewaard; geen IPA, keychain, provisioningprofiel of ruwe bouwlogs.

Benodigde **environment secrets**, nooit repositorybestanden:

- `IOS_DISTRIBUTION_P12_BASE64`
- `IOS_DISTRIBUTION_P12_PASSWORD`
- `IOS_PROVISION_PROFILE_BASE64`
- `IOS_ASC_KEY_P8`
- `IOS_ASC_KEY_ID`
- `IOS_ASC_ISSUER_ID`

De uploadtaak ruimt zelf aangemaakte sleutels en profielen op. De macOS-runner is tijdelijk. De lokale DPAPI-back-up is gebonden aan de Windows-gebruiker en computer; regel daarnaast een passende, veilige herstelprocedure.

## Na upload

Een geslaagde upload betekent nog niet dat de app beschikbaar is: wacht op verwerking door Apple. Controleer App Store Connect → Teletyptel → TestFlight, beantwoord eventuele exportcompliancevragen op basis van de werkelijk gebruikte cryptografie en wijs de build toe aan interne testers. Deze bouwstraat doet geen automatische complianceverklaring en vraagt geen openbare App Review aan.

Installeer vervolgens via Apples TestFlight-app op de iPhone. Test minimaal inloggen, XMPP, tweerichtingschat/RTT, vertaling, camera/microfoon, bijlagen, opnieuw verbinden en certificaatfouten. Gebruik voor eerste tests fictieve berichten.

## Opstartbestand

Capacitor 8.4.3 controleert `appStartFileURL` vóór het laden. Daarom bevat de appbundel `/chat.html`, nu de echte Messenger-interface met alle benodigde lokale assets. Ontbreekt dit bestand, dan sluit Capacitor met `exit(1)` af; alleen compileren vangt dat niet op. De bundelcontrole en Release-opstarttest blokkeren een nieuwe upload bij deze regressie.

## Lokale voorbereiding

Vanuit `scripts/ios-testflight`: `npm ci --ignore-scripts`, stel `IOS_SERVER_URL` en `IOS_BUILD_NUMBER` in, voer `npm run prepare:app` en `npm test` uit. Een bestaande stagingmap wordt niet overschreven. Compileren en ondertekenen vereisen macOS/Xcode; voer niet de algemene root-`ios:sync` uit voor deze interne build.

Voor een nieuwe lokale controle zonder eerdere stagingbestanden te overschrijven kan `IOS_STAGING_NAME=ios-bundled-check-<unieke-naam>` worden ingesteld. De map blijft binnen `artifacts/`; de naam mag alleen kleine letters, cijfers en streepjes bevatten en moet met `ios-` beginnen. Publiceren naar GitHub of TestFlight blijft een afzonderlijke, expliciete stap.
