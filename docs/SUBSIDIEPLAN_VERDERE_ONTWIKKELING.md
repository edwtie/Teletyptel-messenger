# Subsidieplan Verdere Ontwikkeling TeleTypTel

Werkdocument voor subsidieaanvragen, fondsen, sponsoring en gesprekken met
publieke of maatschappelijke partners.

## Korte Samenvatting

TeleTypTel is een open communicatieplatform voor Total Conversation: chat,
real-time tekst, audio en video in een bekende messenger-ervaring. Het project
richt zich op dove, slechthorende, horende, spraakbeperkte en mobiele gebruikers
in dezelfde app, zodat toegankelijke communicatie geen aparte wereld hoeft te
zijn.

De proof of concept is behaald. De webclient werkt via HTTPS/WSS, ondersteunt
camera en microfoon op telefoon en desktop, toont Total Conversation met video,
audio-controls en real-time tekst, en is getest op iPhone Safari. De volgende
fase vraagt om structurele ontwikkeling, mobiele app-packaging, toegankelijkheids-
testen, serverstabiliteit en testapparatuur.

## Waarom Subsidie Nodig Is

TeleTypTel raakt een maatschappelijk probleem: toegankelijke communicatie is vaak
versnipperd, afhankelijk van gesloten platformen of alleen bruikbaar in speciale
hulpmiddelcontexten. De 2005 TeleTypTel-notities laten zien dat financiering,
continuiteit, certificaten, infrastructuur en gebruikerswerving toen al grote
blokkades waren. Die lessen gelden nog steeds.

Subsidie maakt het mogelijk om van werkende proof of concept naar een betrouwbare
testbare alpha/beta te gaan, zonder het project te vroeg afhankelijk te maken van
een commercieel verdienmodel of een gesloten platform.

## Doelgroep

- Dove en slechthorende gebruikers die real-time tekst nodig hebben.
- Horende familieleden, vrienden, collega’s en zorgverleners.
- Mensen met spraakbeperkingen die liever typen dan spreken.
- Organisaties, supportdesks, zorg- en toegankelijkheidsomgevingen.
- Toekomstige relay-, tolk-, captioning- en provideromgevingen.

## Huidige Stand

Behaald in de proof of concept:

- Browser-first TeleTypTel webclient.
- HTTPS op ontwikkeldomein.
- WebSocket/WSS relay via Apache.
- Total Conversation UI met video, RTT en audio-controls.
- Camera en microfoon getest op iPhone Safari.
- Portrait/landscape/keyboard layout voor telefoon uitgewerkt.
- PHP account/API-laag en lokale relay.
- Open protocolrichting met XMPP, WebRTC en XEP-roadmap.
- Basis voor Capacitor mobile packaging.

Nog niet afgerond:

- Android app-build en echte Android device-test.
- iOS build/signing/TestFlight, omdat daarvoor macOS/Xcode nodig is.
- Productiestabiele relay/server setup.
- Toegankelijkheidsaudit met echte gebruikers.
- Security/privacy review.
- Documentatie, supportflow en installatiestappen voor testers.

## Ontwikkeldoelen Voor Subsidiefase

### Fase 1: Mobiele Testbasis

Doel: betrouwbare Android- en iOS-testomgeving.

- Android Capacitor target toevoegen.
- Android permissions voor camera, microfoon en locatie testen.
- Android WebView gedrag testen met RTT, video, keyboard en landscape.
- iOS buildomgeving regelen via Mac laptop, Mac mini of cloud Mac.
- iOS Capacitor build synchroniseren en TestFlight-route voorbereiden.
- Mobiele testchecklist opstellen.

### Fase 2: Server En Relay Stabiliteit

Doel: backend stabiel genoeg voor langere gebruikerstests.

- PHP relay als Windows service of betrouwbare startup task.
- Productiepad voor HTTPS/WSS documenteren.
- Servermonitoring en logrotatie toevoegen.
- Ejabberd/XMPP-integratie verder valideren.
- STUN/TURN/Jingle-testpad afmaken voor echte netwerkcondities.

### Fase 3: Toegankelijkheid En Gebruikerstest

Doel: bewijzen dat de app bruikbaar is voor de doelgroep.

- Testgroep samenstellen met dove, slechthorende en horende gebruikers.
- Scenario’s testen: chat, RTT, video, audio, draaien telefoon, keyboard.
- Leesbaarheid, snelheid en stressmomenten meten.
- WCAG 2.2 AA en EN 301 549 relevante onderdelen toetsen.
- Bevindingen verwerken in UI en documentatie.

### Fase 4: Alpha/Beta Oplevering

Doel: demonstrabele pilotversie.

- Web/PWA alpha.
- Android test-APK.
- iOS TestFlight of iOS build via externe Mac-route.
- Installatiehandleiding voor testers.
- Privacy- en veiligheidsnotitie.
- Demo voor mogelijke partners/subsidieverstrekkers.

## Benodigde Apparaten En Middelen

Essentieel:

| Middel | Waarom nodig | Richtbedrag |
| --- | --- | ---: |
| Android testtelefoon | Native Android/WebView/camera/keyboard testen | EUR 75 - 150 |
| Apple laptop of Mac mini | Xcode, iOS build, signing, TestFlight | EUR 700 - 1.500 |
| Apple Developer Program | TestFlight/App Store signing | EUR 99 per jaar |
| Extra iPhone/iPad testapparaat | iOS regressietest buiten eigen telefoon | EUR 200 - 600 |
| Testheadset/microfoon | Audio/spraak/RTT scenario’s | EUR 50 - 200 |
| Server/VPS of hosting | Publieke HTTPS/WSS/XMPP testomgeving | EUR 20 - 100 per maand |
| Domein/certificaat/infra | Publieke bereikbaarheid en vertrouwen | EUR 50 - 250 |

Ontwikkel- en validatiekosten:

| Post | Waarom nodig | Richtbedrag |
| --- | --- | ---: |
| Ontwikkeltijd | Android, iOS, backend, UI, protocols | afhankelijk van periode |
| Toegankelijkheidstest | Externe toetsing of begeleide gebruikerstest | EUR 1.000 - 5.000 |
| Gebruikersvergoeding | Testers serieus compenseren | EUR 25 - 100 per tester |
| Privacy/security review | Vertrouwen en subsidiegeschiktheid | EUR 1.000 - 5.000 |
| Documentatie en demo | Aanvraag, pilot, onboarding | EUR 500 - 2.500 |
| AI-ontwikkelomgeving | Codex/ChatGPT sessies en abonnement voor snellere softwareontwikkeling, documentatie en debugging | EUR 20 - 200 per maand |

AI-ontwikkelkosten moeten expliciet worden meegenomen. De proof of concept is
mede versneld door betaalde AI-assistentie, waarbij per chatsessie en via
abonnement kosten worden gemaakt. Voor de volgende fase past een Business- of
Team-abonnement beter dan een puur individueel Pro-abonnement, omdat het project
richting samenwerking, documentatie, privacy en continuiteit groeit.

## Minimum Begroting Voor Kleine Subsidie

Een kleine haalbare aanvraag kan mikken op EUR 5.000 - 10.000:

- Android testtelefoon.
- Tweedehands Mac mini of MacBook.
- Apple Developer Program.
- Basis hosting/VPS voor 6 tot 12 maanden.
- AI-ontwikkelabonnement of chatsessiebudget voor Codex/ChatGPT.
- Kleine gebruikerstest met vergoeding.
- Tijd voor Android/iOS packaging en serverstabiliteit.

## Sterkere Begroting Voor Pilot

Een ruimere pilotaanvraag kan mikken op EUR 25.000 - 50.000:

- Apparaten en hosting.
- AI-ontwikkelomgeving op Business/Team-niveau.
- Betaalde ontwikkeltijd.
- Toegankelijkheidsaudit.
- Privacy/security review.
- Testgroep met begeleiding.
- Android APK en iOS TestFlight.
- Partnerdemo voor zorg, onderwijs, toegankelijkheid of supportdesk.

## Subsidie-Invalshoeken

Mogelijke invalshoeken voor aanvragen:

- Digitale toegankelijkheid.
- Innovatie voor dove en slechthorende gebruikers.
- Open communicatie-infrastructuur.
- Zorg, welzijn en zelfstandige communicatie.
- Inclusieve technologie en participatie.
- Onderwijs en werktoegankelijkheid.
- Lokale/regionale innovatie of maatschappelijke impact.
- Europese toegankelijkheidskaders zoals WCAG en EN 301 549.

Concrete subsidieprogramma’s, deadlines en voorwaarden moeten apart actueel
worden opgezocht voordat een aanvraag wordt ingediend.

## Aanvraagargumenten

Sterke punten:

- Er is al een werkende proof of concept, dus subsidie financiert geen vaag idee.
- Het project gebruikt open standaarden en vermijdt afhankelijkheid van één
  gesloten platform.
- Toegankelijkheid wordt ingebouwd als normale productkwaliteit.
- Web/PWA, Android en iOS kunnen op dezelfde codebasis doorgroeien.
- De historische TeleTypTel-lijn laat zien dat het probleem niet nieuw is, maar
  dat moderne web- en mobiele technologie nu een betere oplossing mogelijk maakt.

Zwakke punten die eerlijk benoemd moeten worden:

- Nog geen productiestabiele mobiele app.
- iOS-build vereist Apple hardware of cloud Mac.
- Gebruikersonderzoek moet nog worden gedaan.
- Noodcommunicatie mag niet worden geclaimd zonder formele afspraken.
- Server en relay moeten naar productieniveau.

## Mijlpalen

| Mijlpaal | Resultaat |
| --- | --- |
| M1 | Subsidieaanvraag met begroting en proof-of-concept demo |
| M2 | Android testdevice en Android Capacitor build |
| M3 | Mac/iOS buildroute ingericht |
| M4 | Server/relay stabiel voor pilot |
| M5 | Eerste gebruikerstest met verslag |
| M6 | Alpha/beta demo voor partners |

## Bijlagen Voor Aanvraag

Aan te leveren of te maken:

- Projectsamenvatting van 1 pagina.
- Begrotingstabel.
- Planning van 3, 6 en 12 maanden.
- Screenshots of korte demo-video van proof of concept.
- Toegankelijkheidsvisie.
- Technische architectuur.
- Risico- en privacyparagraaf.
- Testplan met gebruikersscenario’s.

## Eerste Acties

1. Bepaal subsidiebedrag: klein budget of pilotbudget.
2. Kies hardwarestrategie: tweedehands Mac mini, MacBook of cloud Mac.
3. Koop eenvoudige Android testtelefoon.
4. Maak korte demo-video van huidige proof of concept.
5. Schrijf 1-pagina publieke aanvraagtekst.
6. Zoek actuele subsidie/fondsprogramma’s en deadlines.
