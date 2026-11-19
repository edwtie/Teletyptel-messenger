# TeleTypTel hybride iOS-variant

Deze afzonderlijke variant combineert de webvormgeving van TestFlight 16.9 met de bestaande native motor. De SwiftUI-app en gewone website blijven ongewijzigd.

## Status

- De exacte 16.9-bronnen zijn vastgelegd in `ui-baseline.json`, inclusief workflowbewijs en bronvingerafdrukken.
- De nieuwe Swift-library koppelt wachtwoordaanmelding, tweestapsverificatie, annuleren, uitloggen en verbindingsstatus aan een aangeleverde `NativeLoginModel`.
- De brug maakt zelf geen tweede XMPP-sessie, WebRTC-motor of CallKit-provider aan.
- Dit is nog geen installeerbare hybride app. `reference-only` en `testFlightReady: false` blijven bewust staan.

## Eigendom en beveiliging

De native schil bezit serverconfiguratie, sessie, cookieopslag, sleutelhanger en oproepmotor. JavaScript mag geen serveradres of willekeurige HTTP-opdracht opgeven. De brug accepteert uitsluitend de hoofdframepagina `capacitor://localhost/chat.html`, zonder query of fragment. Remote pagina's en iframes krijgen geen sessietoegang.

Het protocol gebruikt versie 1, UUID-opdracht-ID's, maximaal 8192 bytes en vaste argumenten. De laatste 128 ID's worden tegen herhaling gecontroleerd. Verbindingsstatus bevat geen JID, wachtwoord, cookies of tokens. Een wachtwoord gaat uitsluitend in de tijdelijke aanmeldopdracht naar native; de brug bewaart het niet in webopslag en logt het niet. De native motor verwerkt de authenticatie.

`HybridWebKitBridge` gebruikt Apples [WKScriptMessageHandlerWithReply](https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply). Een eigenaar houdt de brug vast, koppelt hem één keer aan de WebView en roept `detach()` aan wanneer die weergave verdwijnt. Dat sluit de native sessie niet af: achtergrondoproepen mogen niet afhangen van de levensduur van de UI.

De verplichte `nativeLogout`-callback moet bij uiteindelijke appassemblage dezelfde push-, oproep- en sleutelhangeropruiming uitvoeren als de bestaande native app. De sessiebrug sluit vervolgens zo nodig het loginmodel. Bevestigde intrekking op de server is hiermee nog niet getest.

## Webzijde

`Web/native-session.js` biedt een kleine, versievaste client. Na installatie zijn browser-WebSocket, browser-WebRTC en browsermedia uitgeschakeld. HTTP-authenticatie vanuit de browser is geblokkeerd; alleen lokale statische taal- en beeldbestanden mogen via fetch worden gelezen. Dit is een verdedigingslaag, geen volledige WebView-sandbox.

Laad deze client vóór andere scripts, uitsluitend in de hybride app. Laad de ongewijzigde `chat-client.js` van 16.9 **nog niet** als actieve toepassing: daarin zitten ook de oude authenticatie-, XMPP- en mediamotoren. De volgende stap is de presentatielaag loskoppelen en dezelfde HTML/CSS bedienen met native gebeurtenissen. De gewone website houdt haar eigen webmotor.

`chatAvailable`, `callsAvailable` en `socialLoginAvailable` blijven `false` totdat hun volledige koppelingen zijn gerealiseerd. Er is geen automatische terugval naar de oude webmotor.

## Controles

Vanaf de repositoryroot:

```text
node --test tests/ios-hybrid-baseline.test.js tests/ios-hybrid-session.test.js
swift test --package-path mobile/ios-hybrid
```

Swift vereist hier macOS/Xcode. De geïsoleerde workflow `ios-hybrid-bridge.yml` test fictieve accounts en compileert de library ook voor de iOS-simulator. Geen ondertekening, APNs-activering, sleutels, TestFlight-upload of wijziging aan de eigen server. De cloudrunner is tijdelijk; er worden geen bouwmappen of screenshots naar deze laptop gekopieerd.

## Nog aansluiten

1. De 16.9-presentatie voor opstarten/inloggen verbinden met deze sessiebrug; instellingen blijven native afgeschermd.
2. Google/Facebook, contacten, geschiedenis, chat, groepen en vertaling via afgebakende native opdrachten en gebeurtenissen.
3. Eén bestaande CallKit/PushKit-coördinator, native video-oppervlakken, audio en RTT koppelen. De oude Capacitor-oproepcoördinator niet daarnaast registreren.
4. Navigatiebeleid, applevenscyclus en terugkeer uit aanmelden afwerken; fysieke iPhone/iPad-tests, inclusief vergrendeld scherm, uitvoeren.

Een geslaagde librarytest bewijst geen werkende achtergrondoproep of App Store-acceptatie.
