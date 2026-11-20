# TeleTypTel hybride iOS-variant

Deze afzonderlijke variant combineert de webvormgeving van TestFlight 16.9 met de bestaande native motor. De SwiftUI-app en gewone website blijven ongewijzigd.

## Status

- De exacte 16.9-bronnen zijn vastgelegd in `ui-baseline.json`, inclusief workflowbewijs en bronvingerafdrukken.
- De nieuwe Swift-library koppelt wachtwoordaanmelding, tweestapsverificatie, annuleren, uitloggen en verbindingsstatus aan een aangeleverde `NativeLoginModel`.
- De brug maakt zelf geen tweede XMPP-sessie, WebRTC-motor of CallKit-provider aan.
- De inlogpresentatie gebruikt nu de originele 16.9-aanmeldmarkup, CSS, logo's en tandwielsymbolen, zonder de oude webclient uit te voeren. Een afzonderlijke UIKit/SwiftUI-host laadt deze inhoud via een lokale WebKit-schemehandler.
- De weergave ondersteunt native aanmeldstatus, tweestapsverificatie, certificaatfouten, annuleren en uitloggen. Het tandwiel opent uitsluitend een optionele native instellingenactie; servervelden verschijnen niet in de webweergave.
- Na aanmelden toont de webpresentatie de native contactenlijst en één-op-éénchat: concepten, verzenden, ontvangen, geschiedenis, reacties, doorsturen, bewerken en verwijderen volgens de bestaande native rechten. De aanvullende chatbediening is geen bewezen pixelkopie van 16.9.
- Audio, video, TC, RTT, microfoon, camera, camerawissel, beeldpassing en DTMF gebruiken `NativeCallController.shared`. Opnemen loopt via een CallKit-transactie, niet via een tweede provider.
- Groepschat gebruikt nu de bestaande native MUC-motor: openen/maken, deelnemen, onderwerp, uitnodigen, verlaten en moderatorrollen aanvragen. Groepsrechten en bevestigingen blijven van de server; de UI verzint geen groepsleesbevestigingen. Bewerken van groepsberichten en groepsoproepen zijn niet aangesloten.
- De plusknop opent de bestaande native bijlageselectie. Foto's/documenten worden pas na een afzonderlijke uploadactie opgeslagen; de link komt daarna uitsluitend op verzoek in het actuele concept. Native bekijken/opslaan werkt via een geselecteerd bericht-ID, niet via een door JavaScript aangeleverd bestandspad.
- Vertaalinstellingen, compacte privévertalingen van beide chatrichtingen en optionele live RTT-vertaling gebruiken de bestaande native vertaalsessie. Uitgeschakelde vertaling, ingetrokken toestemming, gelijke brontaal en doeltaal, accountwisseling en een beëindigd gesprek mogen geen oude vertaalbijschriften terugplaatsen.
- Een afzonderlijke CI-appassemblage combineert de presentatie met de bestaande native appbronnen. De oude SwiftUI-root verliest alleen in de tijdelijke kopie zijn `@main`; de werkende app wordt niet vervangen. `reference-only` en `testFlightReady: false` blijven staan.

## Eigendom en beveiliging

De native schil bezit serverconfiguratie, sessie, cookieopslag, sleutelhanger en oproepmotor. JavaScript mag geen serveradres of willekeurige HTTP-opdracht opgeven. De brug accepteert uitsluitend de hoofdframepagina `capacitor://localhost/chat.html`, zonder query of fragment. Remote pagina's en iframes krijgen geen sessietoegang.

Het protocol gebruikt versie 1, UUID-opdracht-ID's, maximaal 262144 bytes per JSON-opdracht en vaste argumenten. Chatvelden hebben een limiet van 8192 UTF-8-bytes. RTT behoudt het bestaande native budget van 32768 Unicode-scalars (maximaal 131072 UTF-8-bytes); de ruime envelop laat JSON-escaping toe. De laatste 128 ID's worden tegen herhaling gecontroleerd. Chat- en oproepopdrachten vereisen het actuele account-epoch. Oude opdrachten mogen geen nieuw account veranderen. Een wachtwoord gaat uitsluitend in de tijdelijke aanmeldopdracht naar native; de brug bewaart of logt het niet.

De aanvullende rosterprojectie bevat uitsluitend het bare JID, de weergavenaam en de aanwezigheidsstatus van maximaal 100 contacten uit de actieve native sessie. Het eigen account wordt niet als contact getoond. Groepslabels, abonnementen op aanwezigheid, oproepresources en profiel-URL's worden niet doorgegeven. Gegevens verdwijnen bij uitloggen, accountwisseling, verbindingsverlies en overgang naar de achtergrond. Er wordt geen oude lijst uit een vorige accountsessie teruggeplaatst. Rosterupdates verhogen ook zonder fasewisseling het volgnummer van de brug.

`HybridWebKitBridge` gebruikt Apples [WKScriptMessageHandlerWithReply](https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply). Een eigenaar houdt de brug vast, koppelt hem één keer aan de WebView en roept `detach()` aan wanneer die weergave verdwijnt. Dat sluit de native sessie niet af: achtergrondoproepen mogen niet afhangen van de levensduur van de UI.

De verplichte `nativeLogout`-callback moet bij uiteindelijke appassemblage dezelfde push-, oproep- en sleutelhangeropruiming uitvoeren als de bestaande native app. De sessiebrug sluit vervolgens zo nodig het loginmodel. Bevestigde intrekking op de server is hiermee nog niet getest.

## Webzijde

`Web/native-session.js` biedt een kleine, versievaste client. Na installatie zijn browser-WebSocket, browser-WebRTC en browsermedia uitgeschakeld. HTTP-authenticatie vanuit de browser is geblokkeerd; alleen lokale statische taal- en beeldbestanden mogen via fetch worden gelezen. Dit is een verdedigingslaag, geen volledige WebView-sandbox.

`scripts/ios-hybrid/build-content.js` stelt de aanmeldinhoud samen vanuit de vastgezette Git-bron, zonder code uit `chat-client.js` uit te voeren. Alleen het instellingenpictogram wordt als gecontroleerde vector uit die bron gelezen. De inhoud bevat de oorspronkelijke aanmeldsectie, stijlen en beelden, plus de nieuwe native sessieclient en presentatielaag. De oude authenticatie-, XMPP- en mediamotoren worden niet meegeleverd. De gewone website houdt haar eigen webmotor.

`HybridContent` accepteert alleen bekende lokale resourcetypen. De WebView gebruikt een niet-blijvende dataopslag. CSP blokkeert externe verbindingen, formulieren, frames en media; het native navigatiebeleid weigert externe pagina's en popups. Browsermedia krijgen ook via de WebKit-delegate geen toestemming. Een nieuwe UI mag geen nieuwe CallKit-provider of nieuwe loginmotor aanmaken.

Het opstartlogo en de blauwe voortgang gebruiken één bestaande webweergave. Bij openen wordt alleen de native brug opgehaald; de echte servercontrole gebeurt tijdens de native aanmeldactie. Er wordt geen invoerveld automatisch gefocust. Draaien behoudt ingevulde tekst. Wachtwoord en verificatiecode worden na de opdracht gewist en niet in webopslag bewaard. UUID's gebruiken ook bij custom schemes een cryptografische bron, zonder terugval naar `Math.random`.

`chatAvailable` volgt de actieve native sessie. `callsAvailable` vereist daarnaast een geïnjecteerde oproepadapter; ieder contact krijgt een native `canCall`-vlag. `socialLoginAvailable` blijft `false`. Er is geen terugval naar de oude webmotor. Berichten worden pas via een expliciete viewportbevestiging lokaal gelezen gemarkeerd; blauwe vinkjes vereisen de native ontvangst van een weergavebevestiging, niet alleen online aanwezigheid.

Google/Facebook, wachtwoordherstel, nieuwe gebruiker en account bewaren zijn in deze testpresentatie nog uitgeschakeld. Nieuwe contacten blijven uitgeschakeld onder de plusknop; groepen vereisen de native groepsfunctie. Profielfoto's, volledige smileyselectie, uitgebreid kamerconfiguratiebeheer en groepsoproepen volgen nog. Het aanmeldveld vraagt een werkelijk XMPP-account; e-mailaliasaanmelding is niet als voltooid gepresenteerd.

Tijdens TC verdwijnt gewone chat. Live tekst gebruikt uitsluitend de native RTT-opdracht. Als alle camera's aantoonbaar uitstaan vullen de RTT-vakken het gesprek; een onbekende camerastatus wordt niet als uitgeschakeld behandeld. Videotracks worden door native `RTCMTLVideoView` getoond, niet via browsermedia. De videopositie wordt begrensd aan de native viewport. Concepten blijven binnen hetzelfde account behouden als een gesprek de chat onderbreekt.

## Controles

Vanaf de repositoryroot:

```text
node --test tests/ios-hybrid-*.test.js
swift test --package-path mobile/ios-hybrid
```

Swift vereist hier macOS/Xcode. De geïsoleerde workflow `ios-hybrid-bridge.yml` genereert de inhoud uitsluitend in de tijdelijke cloudrunner. Chromium en WebKit controleren het inloggen, zoeken, contactselectie, statuswijzigingen en iPhone/iPad-formaatwisselingen. Een Swift-test laadt dezelfde inhoud in een echte WKWebView, meldt zich aan via de native brug met een fictieve motor, toont een native rostercontact en controleert dat loskoppelen van de presentatie de native sessie niet beëindigt. Native tests controleren ook achtergrondprivacy en late updates uit een vorige accountsessie. Zonder gegenereerde inhoud wordt uitsluitend die WebKit-koppelingstest expliciet overgeslagen.

De workflow compileert de library en de afzonderlijk geassembleerde app voor de iOS-simulator. Daarna controleren iPhone- en iPad-simulatoren koud opstarten en draaien zonder inloggen. Groepen, uploads en vertaalprivacy gebruiken daarnaast de bestaande native tests met fictieve gegevens. Geen ondertekening, APNs-activering, sleutels, TestFlight-upload of wijziging aan de eigen server. De cloudrunner is tijdelijk; er worden geen bouwmappen of screenshots naar deze laptop gekopieerd. Dit bewijst nog geen fysieke iPhone-oproep of volledige aanmeld- en oproepketen.

## Nog aansluiten

1. Providerlogin, profielfoto's, overige instellingen, contactwijzigingen, uitgebreide kamerconfiguratie en groepsoproepen verbinden.
2. Ondertekende toestelevaluatie van chat, native video, audio, RTT, toetsenbord en CallKit-opnemen/beëindigen uitvoeren.
3. Achtergrondherstel en APNs met een echt geregistreerd toestel afzonderlijk activeren en testen; de CI-assemblage activeert geen push.
4. Volledige webgelijkheid, schermlezerbediening en de resterende navigatieschermen beoordelen voordat de bestaande TestFlight-app wordt vervangen.

Een geslaagde librarytest bewijst geen werkende achtergrondoproep of App Store-acceptatie.
