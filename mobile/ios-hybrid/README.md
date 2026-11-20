# TeleTypTel hybride iOS-variant

Deze afzonderlijke variant combineert de webvormgeving van TestFlight 16.9 met de bestaande native motor. De SwiftUI-app en gewone website blijven ongewijzigd.

## Status

- De exacte 16.9-bronnen zijn vastgelegd in `ui-baseline.json`, inclusief workflowbewijs en bronvingerafdrukken.
- De nieuwe Swift-library koppelt wachtwoordaanmelding, tweestapsverificatie, annuleren, uitloggen en verbindingsstatus aan een aangeleverde `NativeLoginModel`.
- De brug maakt zelf geen tweede XMPP-sessie, WebRTC-motor of CallKit-provider aan.
- De inlogpresentatie gebruikt nu de originele 16.9-aanmeldmarkup, CSS, logo's en tandwielsymbolen, zonder de oude webclient uit te voeren. Een afzonderlijke UIKit/SwiftUI-host laadt deze inhoud via een lokale WebKit-schemehandler.
- De weergave ondersteunt native aanmeldstatus, tweestapsverificatie, certificaatfouten, annuleren en uitloggen. Het tandwiel opent uitsluitend een optionele native instellingenactie; servervelden verschijnen niet in de webweergave.
- Na aanmelden toont de webpresentatie nu de native XMPP-contactenlijst, met zoeken, aanwezigheidsstatus en contactselectie. De zijbalk, rijen en plusknop gebruiken de 16.9-structuur. Contactselectie opent voorlopig alleen een leesbaar contactoverzicht, zonder berichten als gelezen te markeren.
- Dit is nog geen installeerbare hybride app. `reference-only` en `testFlightReady: false` blijven bewust staan.

## Eigendom en beveiliging

De native schil bezit serverconfiguratie, sessie, cookieopslag, sleutelhanger en oproepmotor. JavaScript mag geen serveradres of willekeurige HTTP-opdracht opgeven. De brug accepteert uitsluitend de hoofdframepagina `capacitor://localhost/chat.html`, zonder query of fragment. Remote pagina's en iframes krijgen geen sessietoegang.

Het protocol gebruikt versie 1, UUID-opdracht-ID's, maximaal 8192 bytes per opdracht en vaste argumenten. De laatste 128 ID's worden tegen herhaling gecontroleerd. Verbindingsstatus bevat geen eigen JID, wachtwoord, cookies of tokens. Een wachtwoord gaat uitsluitend in de tijdelijke aanmeldopdracht naar native; de brug bewaart het niet in webopslag en logt het niet. De native motor verwerkt de authenticatie.

De aanvullende rosterprojectie bevat uitsluitend het bare JID, de weergavenaam en de aanwezigheidsstatus van maximaal 100 contacten uit de actieve native sessie. Het eigen account wordt niet als contact getoond. Groepslabels, abonnementen op aanwezigheid, oproepresources en profiel-URL's worden niet doorgegeven. Gegevens verdwijnen bij uitloggen, accountwisseling, verbindingsverlies en overgang naar de achtergrond. Er wordt geen oude lijst uit een vorige accountsessie teruggeplaatst. Rosterupdates verhogen ook zonder fasewisseling het volgnummer van de brug.

`HybridWebKitBridge` gebruikt Apples [WKScriptMessageHandlerWithReply](https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply). Een eigenaar houdt de brug vast, koppelt hem één keer aan de WebView en roept `detach()` aan wanneer die weergave verdwijnt. Dat sluit de native sessie niet af: achtergrondoproepen mogen niet afhangen van de levensduur van de UI.

De verplichte `nativeLogout`-callback moet bij uiteindelijke appassemblage dezelfde push-, oproep- en sleutelhangeropruiming uitvoeren als de bestaande native app. De sessiebrug sluit vervolgens zo nodig het loginmodel. Bevestigde intrekking op de server is hiermee nog niet getest.

## Webzijde

`Web/native-session.js` biedt een kleine, versievaste client. Na installatie zijn browser-WebSocket, browser-WebRTC en browsermedia uitgeschakeld. HTTP-authenticatie vanuit de browser is geblokkeerd; alleen lokale statische taal- en beeldbestanden mogen via fetch worden gelezen. Dit is een verdedigingslaag, geen volledige WebView-sandbox.

`scripts/ios-hybrid/build-content.js` stelt de aanmeldinhoud samen vanuit de vastgezette Git-bron, zonder code uit `chat-client.js` uit te voeren. Alleen het instellingenpictogram wordt als gecontroleerde vector uit die bron gelezen. De inhoud bevat de oorspronkelijke aanmeldsectie, stijlen en beelden, plus de nieuwe native sessieclient en presentatielaag. De oude authenticatie-, XMPP- en mediamotoren worden niet meegeleverd. De gewone website houdt haar eigen webmotor.

`HybridContent` accepteert alleen bekende lokale resourcetypen. De WebView gebruikt een niet-blijvende dataopslag. CSP blokkeert externe verbindingen, formulieren, frames en media; het native navigatiebeleid weigert externe pagina's en popups. Browsermedia krijgen ook via de WebKit-delegate geen toestemming. Een nieuwe UI mag geen nieuwe CallKit-provider of nieuwe loginmotor aanmaken.

Het opstartlogo en de blauwe voortgang gebruiken één bestaande webweergave. Bij openen wordt alleen de native brug opgehaald; de echte servercontrole gebeurt tijdens de native aanmeldactie. Er wordt geen invoerveld automatisch gefocust. Draaien behoudt ingevulde tekst. Wachtwoord en verificatiecode worden na de opdracht gewist en niet in webopslag bewaard. UUID's gebruiken ook bij custom schemes een cryptografische bron, zonder terugval naar `Math.random`.

`chatAvailable`, `callsAvailable` en `socialLoginAvailable` blijven `false` totdat hun volledige koppelingen zijn gerealiseerd. Er is geen automatische terugval naar de oude webmotor.

Daarom zijn Google/Facebook, wachtwoordherstel, nieuwe gebruiker en account bewaren in deze afzonderlijke testpresentatie zichtbaar maar uitgeschakeld. Nieuwe contacten en groepen blijven uitgeschakeld onder de plusknop. De contactenlijst komt werkelijk uit het native loginmodel; het contactoverzicht bevat nog geen berichtinvoer. Avatarinitialen zijn beschikbaar; koppeling met de native profielfotocache en persoonlijke avatarkleuren volgt nog. Het aanmeldveld vraagt hier een werkelijk XMPP-account; e-mailaliasaanmelding is niet als voltooid gepresenteerd.

## Controles

Vanaf de repositoryroot:

```text
node --test tests/ios-hybrid-baseline.test.js tests/ios-hybrid-session.test.js tests/ios-hybrid-contacts.test.js tests/ios-hybrid-presentation.test.js
swift test --package-path mobile/ios-hybrid
```

Swift vereist hier macOS/Xcode. De geïsoleerde workflow `ios-hybrid-bridge.yml` genereert de inhoud uitsluitend in de tijdelijke cloudrunner. Chromium en WebKit controleren het inloggen, zoeken, contactselectie, statuswijzigingen en iPhone/iPad-formaatwisselingen. Een Swift-test laadt dezelfde inhoud in een echte WKWebView, meldt zich aan via de native brug met een fictieve motor, toont een native rostercontact en controleert dat loskoppelen van de presentatie de native sessie niet beëindigt. Native tests controleren ook achtergrondprivacy en late updates uit een vorige accountsessie. Zonder gegenereerde inhoud wordt uitsluitend die WebKit-koppelingstest expliciet overgeslagen.

De workflow compileert de library ook voor de iOS-simulator. Geen ondertekening, APNs-activering, sleutels, TestFlight-upload of wijziging aan de eigen server. De cloudrunner is tijdelijk; er worden geen bouwmappen of screenshots naar deze laptop gekopieerd. Dit is geen fysieke iPhone-test en geen volledige appstarttest.

## Nog aansluiten

1. De losse `HybridLoginView` assembleren in een afzonderlijk appdoel met de bestaande native eigenaar van sessie, instellingen en levenscyclus. De werkende SwiftUI-app wordt nog niet vervangen.
2. Google/Facebook, profielfoto's, contactwijzigingen, geschiedenis, chat, groepen en vertaling via afgebakende native opdrachten en gebeurtenissen. De huidige contactselectie is nog geen chatselectie.
3. Eén bestaande CallKit/PushKit-coördinator, native video-oppervlakken, audio en RTT koppelen. De oude Capacitor-oproepcoördinator niet daarnaast registreren.
4. Navigatiebeleid, applevenscyclus en terugkeer uit aanmelden afwerken; fysieke iPhone/iPad-tests, inclusief vergrendeld scherm, uitvoeren.

Een geslaagde librarytest bewijst geen werkende achtergrondoproep of App Store-acceptatie.
