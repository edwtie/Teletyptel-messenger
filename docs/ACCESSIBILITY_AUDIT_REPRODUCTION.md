# Reproductie nulmeting toegankelijkheid — 4 november 2026

Alle commando's vanuit de repositoryroot. Gebruik alleen een vertrouwde checkout. Geen productiecredentials vereist. De audit past geen productiecode of instellingen aan. Browsers maken tijdelijke profielen aan; bewijsbestanden komen onder `artifacts/accessibility-2026-11-04/`.

## Nieuwe DOM/CSS-meting

`tests/accessibility-audit.js` is een observatiescript, geen conformiteitscertificaat en geen CI-gate. Exitcode 0 betekent dat de meting is uitgevoerd; gevonden toegankelijkheidsproblemen worden in JSON geregistreerd, niet verborgen door een geslaagde exitcode.

Vereisten: bestaande Node/Playwright-installatie met Chromium en WebKit. Gebruikt tijdens deze audit: lokaal geïnstalleerde versies; zie `environment.json` in de bewijsmap. Geen npm-afhankelijkheden of lockfiles aangepast.

Audit-only dependency: axe-core **4.10.3**, opgehaald als los bestand, niet ingebouwd in de app. Herkomst: [axe-core project](https://github.com/dequelabs/axe-core), distributiebestand [unpkg 4.10.3](https://unpkg.com/axe-core@4.10.3/axe.min.js). Dit is een vastgepinde meetversie, geen claim dat dit de nieuwste release is.

```powershell
New-Item -ItemType Directory -Force artifacts/accessibility-2026-11-04 | Out-Null
Invoke-WebRequest 'https://unpkg.com/axe-core@4.10.3/axe.min.js' -OutFile artifacts/accessibility-2026-11-04/axe.min.js
Get-FileHash artifacts/accessibility-2026-11-04/axe.min.js -Algorithm SHA256
node tests/accessibility-audit.js
```

Verwachte SHA256: `880970c081707360e64f34cea25ff91892f5bc95675b0776925b9709dd8a68bb`. Het script weigert een afwijkende hash. Bewaar de originele licentie bij eventuele distributie van het dependencybestand; het bestand staat alleen in de lokale auditbewijzen.

De harness laadt `chat.html` zonder scripts, onderschept alle URL-verzoeken en levert uitsluitend lokale stijl-/beeldbestanden. Fictieve tekst wordt ingevoegd. Daardoor zijn geen echte accounts, camera, microfoon, Google of ejabberd nodig. Toestanden zijn fixtures; klikhandlers, taalwisseling, volledige modalhandlers en native keyboards draaien niet. De standaard Engelstalige markup blijft staan. De meting is dus geen volledige productiereproductie of taal-/authenticatie-audit.

Uitvoer: `accessibility-observations.json`, met axe-overtredingen, onbesliste regels, berekende styles, viewportmaten en Tab-volgorde. De losse contrastwaarde voor ongebruikte selectietokens is bewust onderscheiden van de werkelijk gerenderde geselecteerde rij. Normale functie van een fictieve knop bewijst geen bereikbare providerfunctie.

## Uitgevoerde bestaande regressies

```powershell
node --test --test-concurrency=1 tests/jingle-t140.test.js tests/rtt-text-loss.test.js tests/tc-text-isolation.test.js tests/call-inputs.test.js tests/native-keyboard.test.js tests/xmpp-startup-gate.test.js tests/xmpp-recovery.test.js tests/native-biometric.test.js tests/account-login-focus.test.js tests/xmpp-availability.test.js
node --test --test-concurrency=1 tests/rtt-channel-interop.test.js tests/jingle-session.test.js tests/xmpp-translation-ui.test.js tests/translation-ui.test.js tests/live-rtt-integration.test.js services/media-gateway/test/rtp-text.test.js
node tests/jingle-webrtc-media.test.js
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php/tests/translation-smoke.php
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php/tests/interpreter-smoke.php
```

De laatste gatewaytest vereist de lokale, bij de audit nog ongetrackte bronbestanden. Hij test pure RTP/RED-logica en start geen gateway. De mediatest gebruikt twee lokale Chromium-contexten met synthetische audio/video, zonder STUN/TURN-server en met in-memory signaling. Dat is meer dan een mock van de datachannel, maar geen onafhankelijke interoptest. PHP gebruikt SQLite in memory en de vertaalsmoke een mocktransport.

## Resultaten en beperkingen

- `regression-tests.txt`: 99 tests geslaagd.
- `protocol-translation-tests.txt`: 10 runner-eenheden geslaagd, 1 mislukt. Sommige bestanden voeren intern meerdere checks uit; tel ze niet als tien normcriteria.
- De RTT-kanaaltest slaat WebKit-mediatransport intern over wegens ontbrekende `RTCPeerConnection`; de runner-summary registreert deze interne skip niet afzonderlijk.
- Mislukt: `live-rtt-integration.test.js:147`, timeout bij contactselectie. Geen productiefix of fixturewijziging toegepast. De latere iPhonefase wordt hierdoor niet bereikt.
- `synthetic-media-test.txt`: total, video, audio-rtt en rtt geslaagd; 16 ongeldige onderhandelingen geweigerd.
- `php-smoke.txt`: vertaling 170 checks en tolkenservice 49 checks geslaagd.
- `accessibility-run.txt` / `accessibility-observations.json`: 14 uitgevoerde scenario's; contrastfout op Answer in beide engines; onbesliste axe-regels moeten handmatig onderzocht worden.
- De eerste harnesspoging had een onjuist fixture-element-ID en is gecorrigeerd. Een herhaalrun bleef bij browser-/paginacleanup hangen en is afgebroken. De uiteindelijke audit-only harness hergebruikt per engine één pagina, bewaart waarnemingen tussentijds en is opnieuw met exitcode 0 voltooid. Geen productiecode aangepast voor deze harnessproblemen.
- Geen fysieke iPhone/iPad/Android, VoiceOver/NVDA/Narrator/TalkBack, live tolk-/SIP-provider of 112 getest. Geen volledige document-, admin-, aanmeld- of betaalroute-audit.

## Niet gewijzigd en niet uitgevoerd

`status-before.txt` legt de bestaande werkboom vast; `production-before.json` bevat hashes van geselecteerde productie-/configuratiebronnen, zonder inhoud of secrets. `production-integrity.json` vergelijkt deze achteraf. Dit is een controle van vooraf geïnventariseerde paden, geen forensisch bewijs van iedere byte op de computer.

Geen build, npm-installatie, servicestart/-stop, Dockerwijziging, accountaanmaak, productie-inlog, push, commit of workflowwijziging. De rapporten en het nieuwe audit-script zijn de enige bedoelde repositorytoevoegingen van deze opdracht. Schaarse schijfruimte was een reden om geen grote SDK-/buildinstallaties uit te voeren.
