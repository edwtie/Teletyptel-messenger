# TeleTypTel — technische toegankelijkheids- en conformiteitsnulmeting

Datum: 4 november 2026. Opdrachtgever: Tiedragon. Status: intern onderzoeksrapport, geen certificaat of juridisch eindoordeel.

**Vervolg na deze nulmeting:** met toestemming zijn eerste codefixes uitgevoerd. De oorspronkelijke bevindingen hieronder blijven als nulmeting staan; zie [herstelronde, tests en resterende beperkingen](ACCESSIBILITY_FIXES_2026-11-04.md) voor de latere stand. Het oorspronkelijke read-only onderzoek en deze herstelronde zijn afzonderlijke activiteiten.

## 1. Besluit in het kort

**Volledige wettelijke of technische conformiteit is niet aangetoond.** Er zijn werkende bouwstenen voor realtime tekst, audio, video, visuele oproepen en tolkaanvragen. Er zijn ook concrete tekortkomingen en belangrijke ontbrekende bewijzen. Een geslaagde TestFlight-build, een screenshot of een groene unit-test is geen conformiteitsverklaring.

Belangrijkste bevindingen:

1. De tekst op de knop voor het aannemen van een oproep heeft in de gemeten weergave onvoldoende contrast.
2. Focus kan een inkomend-oproepvenster verlaten; andere aangepaste modals en periodiek vernieuwde lijsten hebben vergelijkbare risico's.
3. De aparte TC-tekstinvoer is niet aangesloten op dezelfde tekstdoorgifte naar de tolk als de gewone chatinvoer.
4. Een grote plakactie kan de RTT-bloklimiet overschrijden. Automatische hervatting na tegendruk ontbreekt in de onderzochte adapter.
5. Het beperkte Jingle-mediaprofiel, herstel na verbindingsverlies en de lokale SIP-gateway rechtvaardigen geen algemene interoperabiliteits- of 112-claim.
6. De uitgebreide live-RTT-integratietest kon niet worden voltooid. Werkelijke toegankelijkheid met hulpmiddelen en de actuele iPhone/iPad-build is nog niet onderzocht.

De gebruiker bevestigde op 4 november dat Tiedragon zowel consumenten als bedrijven wil bedienen en minder dan tien medewerkers heeft, met jaaromzet of balanstotaal maximaal €2 miljoen. Dat maakt een micro-ondernemingsuitzondering voor diensten aannemelijk, maar de bedrijfsstructuur en concrete aanbiedersrol zijn niet onafhankelijk gecontroleerd. Technische bevindingen blijven relevant, ook als een wettelijke uitzondering geldt. Een grote klant erft niet automatisch de uitzondering van zijn softwareleverancier.

Er zijn uitsluitend onderzoek, geïsoleerde tests en rapportage uitgevoerd. Geen productiecode, diensten, certificaatvertrouwen, infrastructuur of repository-instellingen aangepast; niets gepubliceerd.

## 2. Onderzoeksbasis en bewijskracht

- Repository: `Tiedragon.XmppMessenger`, branch `codex/teletyptel-beta-polish`.
- HEAD: `4b19c096966a23618de56d5916c257566669a3d0`.
- Beoordeeld: deze commit **plus de reeds aanwezige lokale werkboom**. De werkboom bevat veel eerdere wijzigingen. Dit rapport is niet zonder meer een oordeel over een Store- of TestFlight-binary.
- `services/media-gateway/`, `docker/asterisk/` en Windows-onderdelen zijn lokaal aanwezig; belangrijke delen zijn niet in HEAD opgenomen. Releaseherkomst moet per distributiepakket worden vastgelegd.
- Geen wachtwoorden, sleutels, `facebook.local.json`, productieaccounts of medische documenten gelezen. Geen echte gesprekken, tolkdienst, vertaalprovider of noodnummer benaderd voor tests.
- Read-only brononderzoek over de architectuur; verdiepend onderzoek van risicopaden. **Niet iedere bronregel of iedere schermtoestand is volledig geaudit.** Een representatieve volledige gebruikersreis-audit blijft nodig.
- Automatische browsermetingen gebruiken echte HTML/CSS met synthetische toestanden, zonder applicatiescripts. Ze bewijzen geen volledige runtimebediening. Chromium/WebKit op Windows zijn geen echte iPhone, iPad of VoiceOver.

Bewijsniveaus: **G** = uitgevoerd in geïsoleerde test/meting; **B** = broncodebevinding; **O** = open/niet getest. Een normafwijking is niet automatisch een overtreding van voor Tiedragon toepasselijk recht.

### Onderzochte onderdelen

| Onderdeel | Onderzoeksdiepte / bewijs | Resterende beperking |
| --- | --- | --- |
| Messenger: `php/public/chat.html`, `chat-client.js`, `chat-client.css` | Diepgaande bronsteekproef; DOM/CSS-, focus-, herstel- en RTT-tests | Geen volledige ingelogde productieroute of schermlezeronderzoek |
| XMPP/Jingle: `jingle-session.js`, `jingle-call-router.js`, `jingle-webrtc-audio.js`, `jingle-t140.js` | Brononderzoek, synthetische signaling en echte lokale Chromium-mediatransporten | Geen onafhankelijke client/provider of WAN-duurtest |
| C# core: `src/Tiedragon.XmppMessenger.Core/` | RTT/T.140/RED- en toegankelijkheidsarchitectuur onderzocht | Geen nieuwe .NET-build of volledige core-tests in deze audit; interfaces zijn geen bewijs van aangesloten diensten |
| PHP backend: `TranslationService.php`, `InterpreterService.php`, XMPP/relay-paden | Brononderzoek; SQLite-in-memory smoke-tests | Geen productieconfiguratie-, penetratie- of AVG-audit |
| Tolkwerkplek: `php/public/tolk/`, inline `chat-interpreter.js` | Focus, polling, meldingen en tekstdoorgifte onderzocht | Geen drie fysieke deelnemers of externe tolkdienst |
| Klantenservice: `support-chat.js`, `support-call.js`, vertaal-/bijlagecomponenten | Architectuur en risicogerichte bronsteekproef | Geen volledige staff/bezoeker/schermlezer-gebruikersreis |
| Publieke website, aanmelden, staff/admin, aanmelding/facturatie | Bestandsinventaris en gedeeltelijke bronsteekproef | Geen volledige pagina-/formuliervalidatie; gegenereerde facturen en geüploade documenten niet geaudit |
| iOS/iPadOS, Android en Windows shells | Brononderzoek van gedeelde UI, startup, biometrie en statuspaden | Geen nieuwe native builds, daadwerkelijke apparaten of Store-pakketaudit |
| Lokale Asterisk/media-gateway | Brononderzoek en pure RTP/RED-unit-tests | Geen Docker-start, trunk, externe SIP-oproep of productieacceptatie |
| Private label en merkdemo's | Alleen als scope-/releasegrens meegenomen | Geen uitspraak over elk klantthema; PostNL-demo geen bewijs van klantacceptatie |

## 3. Wettelijke toepasselijkheid

### 3.1 Wettelijk kader versus productrol

De EAA omvat onder meer consumentgerichte elektronische communicatiediensten. Relevante bepalingen zijn artikel 2, artikel 4, artikel 13 en bijlage I, onderdelen III en IV(a). De extra communicatie-eisen betreffen RTT naast spraak en Total Conversation wanneer video wordt aangeboden. De dienstinformatie hoort bij de beoordeling; alleen de chatinterface testen is onvoldoende. De micro-ondernemingsuitzondering voor diensten staat in artikel 4(5), met de definitie in artikel 3(23). Artikel 14 kent begrensde uitzonderingen, geen automatische ontheffing wegens ontwikkelkosten. [Richtlijn (EU) 2019/882](https://eur-lex.europa.eu/eli/dir/2019/882/oj).

In Nederland is de richtlijn onder meer verwerkt in hoofdstuk 7a van de Telecommunicatiewet. De implementatiewet bevat eisen voor de dienstaanbieder, informatie en maatregelen bij tekortkomingen. [Implementatiewet, Staatsblad 2024, 87](https://zoek.officielebekendmakingen.nl/stb-2024-87.html). Het sectorspecifieke besluit werkt onder meer uitzonderingen en het conformiteitsvermoeden uit. [Implementatiebesluit elektronische communicatiediensten, Staatsblad 2024, 262](https://zoek.officielebekendmakingen.nl/stb-2024-262.html).

ACM beschrijft toezicht op consumentgerichte communicatie- en e-handelsdiensten sinds 28 juni 2025, waaronder toegankelijkheid van websites/apps, ondersteuning en aanvullende communicatievoorzieningen. Ook een abonnementsverkooproute kan afzonderlijk relevant zijn. [ACM: toegankelijkheid van diensten](https://www.acm.nl/nl/toegankelijkheid/toegankelijkheid-van-e-handelsdiensten-en-elektronische-communicatiediensten).

| Gebruikssituatie | Voorlopige beoordeling | Nog vastleggen |
| --- | --- | --- |
| Tiedragon levert TeleTypTel rechtstreeks aan consumenten | Waarschijnlijk relevante dienstcategorie; opgave micro-onderneming kan dienstenuitzondering dragen | Juridische entiteit, groepsverbanden, financiële/medewerkerscriteria en feitelijke aanbiedersrol |
| Tiedragon levert software/private label aan een bedrijf | Verantwoordelijkheid voor de aangeboden dienst apart bepalen; contractuele toegankelijkheid blijft belangrijk | Wie exploiteert, contracteert, ondersteunt en publiceert verklaringen? |
| Zakelijke klant biedt klantenservice aan consumenten | Klant moet eigen sector/dienst beoordelen; aankoop van software is geen conformiteitsbewijs | Volledige klantreis inclusief website, personeel, externe diensten en thema |
| Overheidsklant | Afzonderlijk kader voor digitale overheid; niet gelijkstellen aan EAA | Opdrachtgever, geldende normaanwijzing, onderzoek en verklaring |
| SIP/PSTN en noodcommunicatie | Nieuwe afhankelijkheden en verplichtingen; niet afleiden uit werkende XMPP-chat | Providerafspraken, routering, locatie, bereikbaarheid, continuïteit en ketentests |

Voor overheidswebsites en apps moet de toepasselijke Nederlandse regeling en verklaring afzonderlijk worden gevolgd. Een commerciële conceptverklaring hieronder levert geen overheidsstatus A of B op. [Digitoegankelijk: verklaring en status](https://www.digitoegankelijk.nl/toegankelijkheidsverklaring/status).

**Juridische beperking:** wettelijke bronnen en toezichthouderinformatie zijn geraadpleegd; niet elke latere wijziging van alle betrokken wetten is artikelsgewijs geconsolideerd gecontroleerd. De volledige EUR-Lex-weergave gaf bij rechtstreeks openen een toegangscontrole; onderdelen waren via de geïndexeerde officiële tekst raadpleegbaar. Laat voor commerciële vrijgave een jurist de actuele toepasselijkheid, uitzonderingsonderbouwing en informatieplichten bevestigen. Dit is geen advies dat iedere geïdentificeerde technische afwijking nu een wettelijke overtreding vormt.

### 3.2 Normen en kwaliteitsdoelen

**EN 301 549 V4.1.1 (2026-09)** is inmiddels gepubliceerd. Gebruik daarom niet uitsluitend de oude V3.2.1-lijst. Relevante gebieden zijn communicatie (§6), web (§9), documenten (§10), software/hulpmiddelen (§11) en ondersteuning (§12). Onder meer RTT-weergave, gelijktijdigheid, audioactiviteit, DTMF en audiovisuele prestaties verdienen een afzonderlijke toets. §6.5.4 hanteert 100 ms voor audio/videosynchronisatie. Let op gewijzigde paragraafnummering: §6.2.3 betreft in V4 DTMF. [ETSI: EN 301 549 V4.1.1](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf).

Publicatie van een standaard is niet hetzelfde als een aanwijzing in het EU-Publicatieblad. In dit onderzoek is geen specifieke actuele OJ-aanwijzing van V4.1.1 onder de EAA vastgesteld; er wordt dus **geen juridisch conformiteitsvermoeden** op gebaseerd. Controleer dit opnieuw bij vrijgave. [Europese Commissie: geharmoniseerde normen](https://single-market-economy.ec.europa.eu/single-market/goods/european-standards/harmonised-standards_en). Voor het oudere overheidskader is V3.2.1 als aangewezen versie beschreven; dit is een andere juridische grondslag. [Commissie, ICT-standardisatieplan 2026](https://interoperable-europe.ec.europa.eu/collection/rolling-plan-ict-standardisation/accessibility-ict-products-and-services-rp-2026).

**WCAG 2.2 A/AA** is hier het technische webkwaliteitsdoel, niet een zelfstandige algemene wet voor iedere TeleTypTel-installatie. Ook focus die niet geheel verborgen is, doelgrootte en toegankelijke authenticatie horen daarbij. Focus Appearance (2.4.13) is AAA, niet AA; een universele eis van 44 px mag niet als de AA-eis van 2.5.8 worden voorgesteld. [WCAG 2.2](https://www.w3.org/TR/WCAG22/). De vervolgaudit moet een representatieve, volledige steekproef van gebruikersprocessen omvatten; deze nulmeting is geen volledige WCAG-EM-audit. [WCAG-EM 2.0, juli 2026](https://www.w3.org/TR/2026/NOTE-wcag-em-2-20260723/).

### 3.3 Communicatiestandaarden

| Referentie | Gebruik in deze beoordeling |
| --- | --- |
| [ITU-T F.703](https://www.itu.int/rec/T-REC-F.703/en) | Dienstconcept Total Conversation: samenhangende tekst, beeld en geluid. Geen productcertificaat |
| [XEP-0301](https://xmpp.org/extensions/xep-0301.html) | Stabiele XMPP-specificatie voor in-band RTT; eigen pad naast call-media |
| [XEP-0517](https://xmpp.org/extensions/xep-0517.html) | Experimentele Jingle-uitbreiding, auteur Edward Tie. Co-session is niet hetzelfde als gemeten mediakloksynchronisatie; publicatie is geen onafhankelijke productgoedkeuring |
| [RFC 8865](https://www.rfc-editor.org/rfc/rfc8865.html) | T.140 over WebRTC-datachannels; onderhandeling en gatewaygedrag moeten met een onafhankelijke implementatie worden getest |
| [RFC 4103](https://www.rfc-editor.org/rfc/rfc4103.html) | T.140 over RTP en verliesbescherming; niet hetzelfde protocol als JSON op een datachannel |
| [RFC 4733](https://www.rfc-editor.org/rfc/rfc4733.html) | RTP-telefoonevents/DTMF; zichtbare cijfertoetsen bewijzen nog geen aflevering bij de SIP-tegenpartij |
| [W3C WebRTC](https://www.w3.org/TR/webrtc/) | Media-/data-API; browserondersteuning bewijst niet de bereikbaarheid, gebruiksvriendelijkheid of kwaliteit van de gehele dienst |

Vervolgprofielen voor de externe keten: Jingle XEP-0166/0167/0176, SIP/SDP, RFC 9071 bij multiparty-RTT, ETSI ES 202 975 voor relay en ETSI TS 103 479 / EN 303 919 voor de noodcommunicatieketen. Deze moeten samen met de betreffende ketenpartners worden afgebakend; in deze audit niet volledig clausulegewijs gevalideerd. **Geen live 112-test uitvoeren.**

## 4. Uitgevoerde tests en behaalde deelresultaten

Uitvoer en reproduceerstappen: `artifacts/accessibility-2026-11-04/` en `docs/ACCESSIBILITY_AUDIT_REPRODUCTION.md`.

| Uitvoering | Resultaat | Wat dit wél en niet bewijst |
| --- | --- | --- |
| Tien regressiebestanden, Node test runner | **99/99 geslaagd** | Onder meer Unicode, TC/chat-isolatie, toetsenbordinvoer, opstartgate, certificaatonderscheid, biometrische volgorde en hersteltoestanden; geen fysieke apparaten |
| Zes protocol-/vertaalbestanden | **10 testeenheden geslaagd, 1 mislukt** | Unit-/fixturegedrag; het aantal testeenheden is niet gelijk aan het aantal eisen |
| `live-rtt-integration.test.js` | **Timeout** op zoeken/klikken van synthetisch contact `Noor (test)`, regel 147 | Integratietest komt niet door de eerste contactselectie. Geen bewijs dat de echte vertaaldienst stuk is; evenmin geslaagde end-to-end-vertaling |
| `jingle-webrtc-media.test.js` | Vier mediaprofielen geslaagd; 16 ongeldige onderhandelingen geweigerd | Echte lokale Chromium WebRTC-verbindingen met synthetische media en in-memory signaling; geen live ejabberd of SIP |
| PHP vertaling | **170 checks geslaagd** | In-memory database, mockprovider; geen Google-oproep |
| PHP tolkenservice | **49 checks geslaagd** | Autorisatie/toestemming en servicegedrag; geen bewijs van driepartij-mediakwaliteit |
| Nieuw audit-script, axe-core 4.10.3 | **14 DOM/CSS-scenario's**: 7 in Chromium en 7 in WebKit | Eén unieke contrastregel overtreden in de oproepfixture, in beide engines. Overige scenario's bevatten ook onbesliste controles |

De RTT-kanaaltest slaat echte WebKit-mediatransporten expliciet over omdat de geïnstalleerde engine geen `RTCPeerConnection` aanbiedt. De Node-runner telt deze interne overslag niet als aparte skipped-test. De geslaagde WebKit-UI-tests mogen daarom niet worden gelezen als bewijs van werkende iOS-WebRTC.

De 14 scenario's omvatten desktopchat, 320 CSS-px breedte, TC op telefoon/tablet in beide oriëntaties en een inkomende oproep. Geen documentbrede horizontale overflow gemeten in deze fixtures; dat dekt niet alle lange berichten, zoomstanden of geopende menu's.

**Positief, met begrensd bewijs:**

- `chat.html:297` bevat gescheiden eigen/andermans RTT met labels; `:309` heeft een benoemde TC-tekstinvoer. TC-tekst en gewone chat worden in tests gescheiden gehouden.
- `jingle-t140.js:68` en bijbehorende tests behandelen UTF-8, backspace en ongeldig transport. Oude of afgesloten sessies worden niet zomaar hergebruikt.
- `xmpp-availability.js:122` gebruikt een echte modale startupgate, inert achtergrond en herhaalactie. Geteste fouten onderscheiden certificaatproblemen van algemene onbereikbaarheid.
- `chat.html:1397` biedt zichtbare antwoord-/weigeracties. Dat helpt bediening zonder geluid op de voorgrond, maar zegt niets over een vergrendelde telefoon.
- `InterpreterService.php:172` en `:205` bevatten deelnemer-/toestemmingscontroles. Een tolk krijgt niet vanzelf toegang tot iedere chat.
- Vertaalfouten hoeven het origineel niet te vervangen; voorkeuren en begrenzingen bestaan. Vertaling is aanvullend en geen vervanging van originele RTT of een gekwalificeerde tolk.

**Geen algemene vinkjes “WCAG gehaald”:** deze punten zijn bouwstenen of gedeeltelijke tests, niet een oordeel over alle voorkomens van een succescriterium.

## 5. Bevindingen en risico's

Prioriteit P0 = vrijgave-/claimblokkade met potentieel ernstige gevolgen; P1 = belangrijk toegankelijkheids- of communicatieverlies; P2 = verbetering of bewijsaanvulling. P0 betekent niet dat een incident is waargenomen.

### A01 — P1 — Contrast van oproep aannemen: gemeten afwijking

**G/B.** `chat-client.css:2391`: witte tekst op `#16a34a`, 16 px vet, circa **3,30:1**. Axe rapporteert 3,29 door zijn afronding. Dit is geen grote tekst en blijft onder 4,5:1. In beide browsers bevestigd op `#dialogAnswerButton`. Relevante norm: WCAG 1.4.3. [W3C contrastuitleg](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Maatregel: kleurpaar corrigeren, alle toestanden/merken opnieuw meten. Geen productiestijl gewijzigd in deze audit.

### A02 — P1 — Modale focus en terugkeer onvolledig

**G/B.** In de oproepfixture gaat Tab van Reject naar buiten het venster en vervolgens naar de hoofdtoolbar. `chat-client.js:13619` toont de overlay en focust Answer, zonder zichtbare containment. Account-/profielmodals hebben vergelijkbare bronpatronen (`:3219`, `:3628`, `:6830`, `:6863`). Verifiëren in de complete app, inclusief eventuele globale handlers; de auditfixture voert die niet uit.

Risico: bediening achter een verduisterde overlay en verlies van oriëntatie; WCAG 2.4.3 en mogelijk 2.4.11/4.1.2. `aria-modal` alleen blokkeert geen toetsenbordfocus. Gebruik een consistent modaal patroon en herstel de logische focus na sluiten. [W3C modal-dialog patroon](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### A03 — P1 — Polling kan focus verwijderen

**B.** `tolk/tolk.js:221`, `:236`, `:327` bouwen knoppen periodiek opnieuw; `chat-client.js:14666` vervangt de conversatielijst. Het gefocuste DOM-element kan verdwijnen, ook zonder inhoudelijke wijziging. Geen echte VoiceOver-reproductie uitgevoerd. Behoud stabiele elementen en de gebruikerspositie; toets met wachten op een tolkactie en met binnenkomende presence/berichten.

### A04 — P1 — Dedicated TC-tekst bereikt de tolkteksttak niet

**B.** `chat-client.js:15052` verwerkt `totalConversationLocalText`; `chat-interpreter.js:231` luistert naar `messageInput`. De onderzochte doorgifte verbindt de aparte calltekst niet met deze tolkhandler. `tests/interpreter-inline.test.js:138` test de gewone composer en bewijst deze route dus niet.

Maatregel: één expliciete, sessiegebonden tekstpublicatie naar de bevoegde drie deelnemers; geen verborgen kopie via de gewone chat. Controleer taal-/auteurslabels en stop de doorgifte onmiddellijk bij vertrek of intrekking.

### A05 — P1 — Grote edits en backpressure kunnen RTT laten stilstaan

**G/B.** De UI staat 20.000 tekens toe (`chat.html:309`); één gecodeerd adapterblok mag maximaal 4.096 bytes zijn (`jingle-t140.js:68`). `setText` maakt één wijzigingsblok. De bestaande unit-test bevestigt afwijzing van 5.000 tekens. Een mislukte verzending laat de baseline terecht intact, maar een buffer-drained retry is in de adapter niet aanwezig; de volgende gebruikersactie kan nodig blijven.

Maatregel: Unicode-veilige segmentatie, begrensde wachtrij, hervatting zonder extra toetsaanslag en zichtbare niet-afgeleverde tekst. Behoud sessie-isolatie bij opnieuw bellen.

### A06 — P1 — XMPP-herstel is niet hetzelfde als gesprek-/berichtbehoud

**B/G gedeeltelijk.** Hersteltests slagen, maar de bronpaden voor socketvervanging/Jingle-reset (`chat-client.js:6453`, `jingle-call-router.js:125`) en mediafouten (`jingle-webrtc-audio.js:357`) tonen geen volledige ICE-restart-/callresumptionketen. Browser stream management houdt counters bij; een aantoonbare payloadwachtrij met replay van alle onbevestigde stanzas ontbreekt in de onderzochte paden (`chat-client.js:8535`, `:8583`, `:9594`).

Maatregel: afzonderlijke toestanden voor signaling, media en aflevering; verlies-/duplicatietests met netwerkonderbreking. Geen belofte “altijd verbonden” op mobiele platforms.

### A07 — P1 — Externe interoperabiliteit en audioprofiel beperkt

**B/O.** De Jingle-router kiest projectgebonden profielen (`jingle-call-router.js:6`, `:46`). De media-adapter accepteert PCMU/8000 en VP8 (`jingle-webrtc-audio.js:107`, `:130`). Het PCMU-only pad kan geen breedbandaudio tot 7 kHz dragen; toets dit als afwijking van de gekozen EN-benchmark (§6.1), niet als uitspraak over ieder ander WebRTC-pad. De lokale gateway beperkt eveneens codecs en bestemmingen.

DTMF-UI gebruikt `RTCDTMFSender` alleen indien beschikbaar (`chat-client.js:13926`). Het beperkte Jingle-profiel onderhandelt geen extra telephone-event-payload; de gateway noemt DTMF-conversie nog onvoltooid (`services/media-gateway/README.md:87`). Invoer accepteert uitsluitend 0–9, * en # (`chat-client.js:13970`), niet A–D zoals in de gekozen EN §6.2.3-toets. Daadwerkelijke tonevents aan de externe kant zijn niet gemeten. Een nummerformulier of SIP-module in ejabberd is geen bewijs van complete telefoon-/RTT-interconnectie.

Maatregel: gedocumenteerd interoperabiliteitsprofiel met codecselectie, RTT, DTMF, verliesherstel en expliciete melding bij ontbrekende capabilities; samen met een onafhankelijke tegenpartij testen.

### A08 — P2 — Tolkfocus en meldingen

**B/meting kleurwaarden.** `tolk/tolk.css:13` gebruikt een oranje focusoutline `#ffb000` op witte kaarten: **1,83:1**. Dit is onvoldoende voor de onderzochte auteursfocusindicator volgens WCAG 1.4.11; dynamische apparatencontrole blijft nodig. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

`tolk/tolk.js:85`, `:217` en `tolk/support-queue.js:29` geven niet overal live-semantieken voor concepttekst, status en fouten. Onderzoek WCAG 4.1.3 met echte hulpmiddelen; voorkom tegelijk dat iedere RTT-letter ongevraagd de schermlezer onderbreekt. In inline captions kan `pointer-events:none` toegang tot overlopen tekst bemoeilijken (`chat-client.css:2476`, `:8967`).

### A09 — P1 bewijs / P2 presentatie — Live tekst, audioactiviteit en timing

**B/O.** XEP-0301 sequencegaps kunnen een oude draft laten staan tot reset (`chat-client.js:9033`, `:12677`). Een gebruiker moet kunnen onderscheiden of tekst actueel is. Voor A/V-synchronisatie, end-to-end RTT-latency, alle sprekers, lang teruglezen en gelijktijdig DTMF bestaat geen volledig gemeten conformiteitsdossier.

Een groene microfoonknop of volumeschuif is geen bewijs van een indicator van geluid van de andere deelnemer. Het gevonden audio-analyserpad hoort bij voice recording (`chat-client.js:7683`). De remote track wordt afgespeeld (`chat-client.js:11482`), maar een remote-activiteitsmeting/weergave ontbreekt in de onderzochte TC-, support- en tolkpaden. **Bronmatig implementatiegat** voor EN §6.2.2.3/§6.5.5; nog niet op fysieke apparaten hertest.

### A10 — P0 voor veiligheidsclaims — Gateway en 112 niet productiegevalideerd

**B/O.** `services/media-gateway/media-bridge.js:38`, `:48`, `:126` en `sip-call.js:45` beschrijven een geïsoleerd lab met UDP/plain RTP en vaste bestemming. Geen geverifieerde providerkoppeling, locatieketen of onafhankelijke noodcommunicatieacceptatie. `chat-dialer.js:187` valideert nummerinvoer maar bewijst geen externe oproep.

Niet verkopen als vervanging voor bereikbare noodcommunicatie. Neem pas een externe productiefunctie in scope na afzonderlijk ontwerp, dreigingsmodel, ketenafspraken en goedgekeurde testnummers. Dit rapport zegt niet dat toegankelijke noodcommunicatie slechts een vrijwillige wens is wanneer een toepasselijke aanbiedersplicht bestaat.

### A11 — P1 conditioneel — Relay en vertaling hebben aparte privacygrenzen

**B/O.** De ontwikkelrelay `php/rtt-websocket-server.php:4`, `:685` kan breed luisteren, XML broadcasten en volledige stanzas loggen. Niet vastgesteld of deze publiek draait; geen live beveiligingstest uitgevoerd. Houd hem uit productie tenzij afzonderlijk beveiligd.

`TranslationService.php:123`, `:152`, `:168` gebruikt externe Google-verwerking en accountvoorkeuren. Een voorkeur van de vertalende gebruiker bewijst niet dat alle deelnemers passend geïnformeerd zijn. Onderzoek grondslag, verwerkersafspraken en bewaarbeleid apart; dit rapport schrijft niet voor dat toestemming altijd de enige grondslag is. Geen medische of noodbeslissing uitsluitend op machinevertaling laten rusten.

### A12 — P1 bewijs — Onvolledige gebruikersreis-/apparaatdekking

**O.** De timeout in de live-RTT-test en ontbrekende fysieke apparaat-/hulpmiddeltests blokkeren een algemene kwaliteitsclaim. Geen volledige audit van authenticatie, herstel, bestandsupload, staffoverdracht, administratieve formulieren, betalingen, documenten en klantthema's. Native startupmeldingen in Windows wijzigen onder meer een Label (`desktop/TeleTypTel.Windows/MessengerForm.cs:238`); de daadwerkelijke aankondiging door Narrator is niet vastgesteld.

Aanvullende bronsteekproeven buiten Messenger:

- Support-liveconcepttekst staat buiten het berichtenlog; de gegenereerde tekstcontainer heeft alleen een label (`support-call.js:32`, `:184`). Aankondiging door hulpmiddelen is niet bewezen. Het supportvenster is bewust niet-modaal; daarvoor wordt geen modal-focuslus geëist.
- De admin-supportqueue vervangt bij gewijzigde gegevens zijn knoppen (`admin/support-chat.js:49`, `:173`): focusbehoud testen tijdens oppakken/overdragen.
- Aanmelding verbergt bij plankiezen en verzenden de initiërende controls zonder expliciete focusoverdracht (`aanmelden/intake.js:47`, `:76`, `:140`). Er is wel een statusregio; dit is geen algemene claim dat feedback ontbreekt.
- Herhaalde knoppen “Beheren” in staff/accounttabellen zijn in een losse screenreaderknoppenlijst ambigu (`admin/staff.js:129`, `admin/index.php:803`). Tabelcontext kan voldoende zijn: voorlopig verbeterpunt, geen zelfstandig bewezen normovertreding.
- De publieke homepage heeft een skiplink, focusbaar hoofddoel en native FAQ-controls (`index.php:40`, `:50`, `:155`). In deze steekproef geen concrete defectclaim; volledige zoom-/hulpmiddeltest blijft open.

### Verworpen of nog onbewezen vermoedens

- Een eerste statische vergelijking van `--selection-muted` en `--selection-bg` gaf 1,12:1. **Niet overgenomen als fout:** de specifiekere regel in `chat-client.css:7192` rendert de geselecteerde rij in beide browsers op `#2563eb`; de automatische contrastcontrole meldt hier geen fout. Themawijzigingen opnieuw testen.
- Het ontbreken van een extra focusrand op de TC-textarea is **niet op zichzelf** een bewezen WCAG-fout. De zichtbare caret en andere indicatoren moeten met hardwaretoetsenbord en vergroting beoordeeld worden. [W3C Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).
- Oude screenshots met zwarte video, eerdere buildproblemen en historische geslaagde tests zijn geen actuele reproductie en worden niet als nieuwe testuitslag gepresenteerd.

## 6. Nog noodzakelijke menselijke en ketentests

| Scenario | Deelnemers / omgeving | Vereist bewijs |
| --- | --- | --- |
| Zonder geluid aanmelden, inkomende oproep aannemen/weigeren, gesprek beëindigen | Dove gebruiker; meldingen toegestaan én geweigerd | Geen uitsluitend hoorbare blokkade; begrijpelijke terugval |
| TC met tolk en horende deelnemer | Dove gebarentaalgebruiker, tolk, horende deelnemer | Alle bedoelde media/teksten bij juiste partij; bronherkenning; toestemming/vertrek; geen tekst uit vorige oproep |
| Keyboard-only, focus en foutcorrectie | Hardwaretoetsenbord; Windows en iPad | Alle essentiële acties bereikbaar, geen verborgen focus of verlies door polling |
| Screenreader en braille | VoiceOver iPhone/iPad, TalkBack Android, NVDA/Narrator Windows; zo nodig doofblinde tester | Namen/rollen, meldingen en regelgewijze RTT bruikbaar zonder voortdurende onderbreking |
| Kleine en grote weergave | Portrait/landscape, 320 CSS px, 200% tekst, 400% zoom waar relevant, schermtoetsenbord, tekstafstand | Geen verlies van benodigde inhoud of bediening; ook lange vertalingen |
| Netwerk en media | Wifi/mobiel, TURN-only, packet loss/jitter, onderbreking, tweede oproep, 30 minuten duurtest | Meetbare latency, fps, A/V-skew, aflevering, fout-/herstelstatus en geen cross-session-lek |
| Externe interop | Onafhankelijke SIP/RTT-client plus contractuele testomgeving | SDP/capabilities, T.140/RED, DTMF en driepartijgedrag; nooit een ongecoördineerde 112-oproep |
| Volledige klantenservice-/abonnementsreis | Bezoeker, staff, beheerder; representatieve zakelijke configuratie | Consent, uploadfout, overdracht, verzekering/aanmelding indien in scope, factuur/document en ondersteuning |

Deze sessie heeft geen live menselijk gebruiksonderzoek uitgevoerd. Betrek betaalde ervaringsdeskundige testers; test niet uitsluitend met de ontwikkelaar of met iemand die het product al kent.

## 7. Commerciële toepassing voor Tiedragon

TeleTypTel kan dienen als demonstratie van **AI-ondersteunde maatwerkontwikkeling met toetsbare toegankelijkheidsdoelen**. De combinatie van realtime tekst, media, klantenservice en tolkaanvraag is concreet te demonstreren. Dat is een voorstel voor positionering, geen bewezen marktuniciteit of superioriteit ten opzichte van concurrenten.

Een verantwoord aanbod bestaat uit: behoefteonderzoek met gebruikers, een afgesproken standaardprofiel, bouw/integratie, onafhankelijke audit, herstelronde en onderhoud per release. Lever per klant een bewijsmap met exacte versie, configuratie, testgevallen, meetresultaten, beperkingen en regressieafspraken. Een nieuw logo of thema moet opnieuw door contrast-/focuscontroles; verkoop private label niet als automatische conformiteit.

**Nu bruikbare formulering:** “Tiedragon ontwikkelt communicatieoplossingen met realtime tekst, beeld en geluid, met toegankelijkheid als ontwerp- en testdoel. TeleTypTel toont deze aanpak; toepassing en conformiteit worden per oplossing onderzocht.”

**Nog niet onderbouwd:** “volledig EAA/WCAG-gecertificeerd”, “werkt met iedere SIP-provider”, “gegarandeerd toegankelijk voor iedereen”, “112-gecertificeerd”, “erkend door Tolkcontact/PostNL” of “AI garandeert foutloze vertaling”. AI-gebruik verkort mogelijk ontwikkelwerk, maar vervangt geen normbeoordeling, verantwoordelijkheid of gebruikerstests.

## 8. Vervolg en verklaring

Het concrete verbeterplan staat in `docs/ACCESSIBILITY_IMPLEMENTATION_PLAN_2026-11-04.md`. Een niet-gepubliceerde conceptverklaring staat in `docs/ACCESSIBILITY_STATEMENT_DRAFT.md`.

Vrijgave van algemene conformiteitsclaims pas na: bevestigde juridische scope; vastgelegde distributieversie; herstel van relevante tekortkomingen; volledige representatieve audit met echte hulpmiddelen; meetbare media-/interopacceptatie voor aangeboden functies; goedgekeurde dienstinformatie en onderhoudsproces. Tot die tijd: expliciete beperkingen en geen volledige conformiteitsclaim.
