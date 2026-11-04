# TeleTypTel — eerste toegankelijkheidsherstelronde

Datum: 4 november 2026. Uitgevoerd na de opdracht **“fixes op advies uitvoeren”**. Dit is een lokale code- en testwijziging, geen nieuwe release of conformiteitsverklaring.

## Uitgevoerd

| Nulmeting | Wijziging | Bewijs en begrenzing |
| --- | --- | --- |
| A01 | Donkerder groen voor de oproepantwoordknop, inclusief hover. | Berekende stijl in Chromium en WebKit: witte tekst haalt minimaal 4,5:1, licht en donker thema. Klantspecifieke thema's niet volledig onderzocht. |
| A02 | Gemeenschappelijke focusbewaking voor aangepaste ARIA-modals: achtergrond inert, Tab/Shift+Tab binnen het venster, terugkeerfocus en gestapelde vensters. | Drie kernvensters getest met elk 20 Tab- en 20 Shift+Tab-stappen per browser; ook native dialoog boven een aangepast venster en herstel van inert-toestand. Bestaande loginfocusregels blijven behouden; geen automatische invoerfocus toegevoegd voor telefoon/tablet. Andere vensters gebruiken dezelfde helper, maar zijn niet allemaal volledig doorlopen. |
| A03, gedeeltelijk | Gespreksknoppen blijven hetzelfde DOM-element; handlers verwijzen naar actuele gegevens. Tolkaanvraagkaarten blijven staan zolang de relevante inhoud niet wijzigt. | Drie verversingen, herordening en verwijderen van de gefocuste rij getest in Chromium/WebKit. Focus verhuist bij verwijdering naar de zoekbalk of de benoemde wachtrij. De afzonderlijke staff-supportinbox en support-tolkwachtrij zijn nog niet aangepast. |
| A04 | De eigen TC-textarea stuurt gecommitteerde tekst naar de tolkmediaverbinding. Gewone chat wordt tijdens TC niet doorgestuurd naar die tekststroom. | Oproep-ID, deelnamestatus, toestemming en einde/vervanging worden gecontroleerd. Tests behandelen IME, wissen, Unicode, late berichten en intrekken. Een driepersoonstest met echte lokale WebRTC-verbindingen bereikt de tolk vanaf beide gesprekspartners. |
| A05 | De standaard T.140-adapter splitst grote wijzigingen in UTF-8-blokken van maximaal 4096 bytes, zonder een codepunt of CRLF te splitsen. | Begrensde nieuwste tekstsnapshot; automatisch hervatten bij `bufferedamountlow`, zonder volgende toetsaanslag. Verzonden baseline verandert alleen na geslaagde `send`. Tests tot 32768 codepunten; grotere invoer wordt geweigerd. Geen replay na sluiten/vervangen. |
| A04/A05, tolktak | De bestaande private JSON-tolktak accepteert nu de 20000 UTF-16-eenheden van de TC-invoer en bewaart bij tegendruk alleen de nieuwste snapshot. | Pakket-/bufferlimieten blijven begrensd. Automatisch hervatten na bufferdrain; toestemming en sessie opnieuw gecontroleerd. Dit private protocol is **geen** RFC 8865/T.140-standaardkanaal. |
| A08, gedeeltelijk | Donkerblauwe toetsenbordfocus in de tolkwerkplek en een programmatisch gemarkeerde profielstatus. Ongewijzigde status wordt niet iedere poll opnieuw geschreven. | Focuscontrast tegen wit haalt 3:1 in beide browserengines. Volledige schermlezerondersteuning, statusupdates elders en live-tekstpresentatie blijven apart te toetsen. |

De nieuwe modalhelper staat in de frontend-assetlijst voor native bundeling. Gewijzigde webassets hebben nieuwe cacheversies. Dit bouwt of installeert op zichzelf geen iPhone-, iPad-, Android- of Windows-release.

## Uitgevoerde controles

### Gerichte regressies: 112 geslaagd, 0 mislukt

Uitgevoerd op Windows met Node 24.18.0 en de aanwezige Playwright-browsers:

```powershell
node --test --test-concurrency=1 tests/accessibility-fixes.test.js tests/account-login-focus.test.js tests/jingle-t140.test.js tests/tc-text-isolation.test.js tests/interpreter-tc.test.js tests/rtt-text-loss.test.js tests/call-inputs.test.js tests/native-keyboard.test.js tests/xmpp-startup-gate.test.js tests/xmpp-recovery.test.js tests/native-biometric.test.js tests/xmpp-availability.test.js
```

Dit omvat nieuwe focus-/contrast-/pollingtests, segmentatie en bufferherstel, tolktoestemming en sessie-isolatie, plus bestaande regressies voor RTT, DTMF, toetsenbord, startup, Face ID en XMPP-herstel. Het is niet de volledige repositorytestsuite.

### Driepersoonstest: geslaagd

```powershell
node tests/interpreter-inline.test.js
```

Deze test gebruikt een tijdelijke PHP-fixture, fictieve accounts en synthetische camera/microfoon. De bestaande tweepartij-WebRTC-verbinding blijft actief terwijl beide tolk-mediatakverbindingen worden toegevoegd en verwijderd. De echte productie-invoerhandler van TC stuurt tekst naar de tolk; de primaire TC-transportfunctie is in deze specifieke fixture gestubd en wordt afzonderlijk getest. Dit is dus geen bewijs van een complete ejabberd/SIP/relayketen of van driepartijenstandaardinteroperabiliteit.

### Jingle-media en RTT: geslaagd

```powershell
node tests/jingle-webrtc-media.test.js
```

Vier lokale profielen slagen: total, video, audio-rtt en rtt; ook 16 negatieve onderhandelingscontroles slagen. De echte onderhandelde datakanalen leveren nu ook 5000 ASCII-tekens en 20000 CJK-tekens af, gevolgd door correctie. Ongeldige Unicode en overschrijding van de totale tekstlimiet worden nog steeds geweigerd. Audio en video zijn synthetisch, zonder provider of noodnummer.

Ook JavaScript-syntax, PHP-syntax van de tolkpagina en `git diff --check` zijn gecontroleerd. De oorspronkelijke nulmetingsbestanden en het oorspronkelijke meetbewijs zijn niet overschreven.

## Resterend werk

- WP1/WP2 zijn **niet volledig geaccepteerd**: echte iPhone/iPad, VoiceOver, NVDA, WebView2, onafhankelijke tolkgebruikstest en alle schermen/toestanden ontbreken nog.
- A03/A08: overige staff/supportlijsten, intakefocus, statusmeldingen en schermlezerpresentatie van live tekst blijven open.
- A06/WP3: geen volledige XEP-0198-stanzaherhaling, ICE-herstel of nieuwe netwerkverliesstrategie gebouwd. Een socketbuffer die leegloopt is niet hetzelfde als herstel van een verbroken oproep.
- A07/A09/A10/WP4: breedbandaudio, inkomende audioactiviteitsindicator, A–D-DTMF, onafhankelijk SIP/T.140/RED-onderzoek en 112-ketenacceptatie blijven open.
- A11/WP5: de eerder vastgelopen `live-rtt-integration.test.js` is in deze ronde niet opgelost of als geslaagd aangemerkt. Vertaalprovideruitval en complete native gebruikersreizen vragen een afzonderlijke herstel-/hertestronde.
- WP0/WP6: juridische scope, onderbouwing van uitzonderingen, onafhankelijke audit en formele verklaring blijven verantwoordelijkheden buiten deze codefixes. Geen volledige wettelijke conformiteit geclaimd.

Er zijn geen infrastructuurinstellingen, certificaten, GitHub-instellingen of workflowbestanden gewijzigd in deze herstelronde. Geen commit, push, publicatie of TestFlight-upload uitgevoerd. Reeds bestaande lokale wijzigingen blijven behouden.
