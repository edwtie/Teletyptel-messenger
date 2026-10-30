# iOS: interne wifi-test via TestFlight

Deze aparte bouwstraat maakt een ondertekende iPhone-app voor de lokale TeleTypTel-testserver. Het is geen openbare App Store-release en geen simulatorpakket. De uiteindelijke werking op een echte iPhone moet afzonderlijk worden getest.

## Afbakening

- Bundle ID: `com.tiedragon.teletyptel`; Apple-team: `H29RTRBD9D`.
- De app opent `https://192.168.0.105/chat.html`. WAMP en iPhone moeten op hetzelfde wifi-netwerk bereikbaar zijn.
- Alleen de bestaande native iOS-broncode en een minimale offlinepagina worden verpakt. Geen PHP, PostNL-demo, gebruikersgegevens of geheime sleutels in de app.
- Deze interne test gebruikt bewust een externe webclient via Capacitor `server.url`; dit is nog geen productie/offline-distributie.
- Geen claim over werkende achtergrondoproepen, pushberichten, native Google-aanmelding of noodoproepen. Audio, video, RTT en netwerkherstel vereisen echte toesteltests.

## Certificaten en netwerk

De app vraagt toegang tot het lokale netwerk. HTTPS blijft verplicht. De native TLS-afhandeling gebruikt uitsluitend de systeemvalidatie voor de geconfigureerde host; ongeldige certificaten worden niet geaccepteerd. De bekende lokale test-CA moet op de iPhone bewust geïnstalleerd en vertrouwd zijn. Controleer de server eerst in Safari zonder certificaatwaarschuwing. Publiceer de WAMP-server niet op internet voor deze test.

De lokale webclient moet voor native iOS dezelfde beveiligde XMPP-proxy gebruiken als Android: `wss://192.168.0.105/xmpp-websocket`.

## Bouwstraat

Workflow: `.github/workflows/ios-testflight.yml`, uitsluitend op `codex/teletyptel-beta-polish`.

1. Een macOS-runner met Xcode 26 installeert de vastgelegde afhankelijkheden van `scripts/ios-testflight`.
2. `prepare.js` haalt de native bestanden uit de exacte Git-commit en maakt een geïsoleerde projectmap onder `artifacts/ios-testflight`.
3. Tests en een ongetekende build voor fysieke iOS-apparaten draaien zonder ondertekeningssleutels.
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

## Lokale voorbereiding

Vanuit `scripts/ios-testflight`: `npm ci --ignore-scripts`, stel `IOS_SERVER_URL` en `IOS_BUILD_NUMBER` in, voer `npm run prepare:app` en `npm test` uit. Een bestaande stagingmap wordt niet overschreven. Compileren en ondertekenen vereisen macOS/Xcode; voer niet de algemene root-`ios:sync` uit voor deze interne build.
