# TeleTypTel — verbeterplan toegankelijkheid

Datum: 4 november 2026. **Gedeeltelijk uitgevoerd na toestemming:** eerste codefixes uit WP1/WP2 en een deel van A08. Zie [herstelronde en testbewijs](ACCESSIBILITY_FIXES_2026-11-04.md). Overige werkpakketten blijven open; geen infrastructuur- of repository-instellingen gewijzigd en niets gepubliceerd.

Basis: `docs/ACCESSIBILITY_CONFORMITY_AUDIT_2026-11-04.md`, bevindingen A01–A12. Dit plan gebruikt de bestaande PHP/web-, native-shell-, XMPP/Jingle- en gatewayarchitectuur; een volledige herschrijving is niet nodig.

## 1. Beslisvolgorde

1. Leg dienstaanbieder, consument/B2B-scope, micro-ondernemingsonderbouwing en releasegrenzen vast.
2. Herstel aantoonbare bedieningstekorten en het ontbreken van RTT-doorgifte naar de tolk.
3. Borg tekstaflevering, storingsherstel en herkenbare communicatiestatus.
4. Valideer complete gebruikersreizen op fysieke apparaten en met hulpmiddelen.
5. Neem externe SIP-/relay-/noodcommunicatiefuncties pas op na afzonderlijke ketenacceptatie.
6. Publiceer een gecontroleerde verklaring en onderhoud het bewijs per release.

P0 blokkeert de betreffende claim of productiekoppeling, niet noodzakelijk een duidelijk begrensde interne demonstratie. P1 blokkeert algemene toegankelijkheidsacceptatie. P2 kan gefaseerd, mits de gebruikersimpact en resterende beperking duidelijk zijn.

## 2. Werkpakketten en acceptatiecriteria

### WP0 — P0 — Scope, distributie en veilige claims

Eigenaar: Tiedragon/productverantwoordelijke, met juridisch adviseur. Afhankelijkheden: geen.

- Bevestig opgave micro-onderneming met juiste entiteit/groepsverbanden; onderscheid eigen consumentendienst van zakelijke klantimplementaties.
- Maak per web-, iOS-, Android- en Windows-release een manifest: commit, configuratieprofiel, native pakketversie, actieve capabilities en bekende beperkingen.
- Label lokale gatewayproeven als lab; geen publieke bereikbaarheid of 112-belofte zonder apart besluit.
- Leg vast wie een klacht opvolgt, wie externe ketenpartners beheert en welke toegankelijkheidsinformatie bij het contract hoort.

Acceptatie: een ondertekend scopebesluit; geen onbewezen certificerings-/noodoproepclaims; releaseherkomst reproduceerbaar; lokale secrets en persoonsdata buiten bewijs-/distributiepakketten. Een dienstverklaring is geen automatisch CE-productcertificaat.

### WP1 — P1 — Contrast, modals en stabiele focus (A01–A03, A08)

Eigenaar: frontendontwikkelaar + toegankelijkheidstester. Afhankelijkheid: WP0 bepaalt te testen thema's.

- Corrigeer Answer-tekst en de tolkfocusindicator; meet normale/hover/focus/disabled-toestanden afzonderlijk.
- Gebruik een gedeelde modale implementatie, bij voorkeur bestaande native `dialog`-mechanismen waar passend. Behoud label, beschrijving, inert achtergrond, terugkeerfocus en een duidelijke sluit-/weigeractie.
- Render gespreks- en tolklijsten met stabiele identifiers; update alleen veranderde inhoud. Leg geen volledige lijstvervanging op aan iemand die leest of navigeert.
- Bewaar een zichtbare toetsenbordfocus zonder onnodige rand tijdens touchtypen. Verwijder focus niet globaal om een visueel probleem te verbergen.

Acceptatie:

- Answer-tekst haalt minimaal 4,5:1; betekenisvolle focusindicator haalt 3:1 tegen de aangrenzende ondergrond. Zie bronverwijzingen bij A01/A08 in het rapport.
- Twintig Tab/Shift+Tab-stappen blijven binnen een open modal; na sluiten keert focus logisch terug. Geen activatie van afgedekte achtergrondknoppen.
- Een gefocuste tolkactie blijft na drie pollingcycli hetzelfde DOM-element of krijgt aantoonbaar logisch behouden focus. Geen ongewenste oproepacceptatie door herordening.
- Volledige keyboard-only route in Chromium, WebKit en WebView2; daarna VoiceOver/NVDA-controle.

### WP2 — P1 — Sessiegerichte RTT voor drie deelnemers (A04–A05)

Eigenaar: media-/frontendontwikkelaar; tolk als acceptatietester. Afhankelijkheid: expliciet tekst-/privacycontract voor de sessie.

- Maak één call-tekstbron met `callId`, `participantId`, volgorde en origineel/vertaling-onderscheid.
- Verbind `totalConversationLocalText` met de bevoegde tolk-mediatak; laat gewone chat buiten de TC-tekststroom.
- Voeg begrensde Unicode-veilige segmentatie en automatisch bufferherstel toe. Behoud originele input tot succes of expliciete fout.
- Stuur geen oude tekst naar een volgende oproep en geen tekst naar iemand die de sessie heeft verlaten.

Acceptatie:

- Drie synthetische peers zien bedoelde tekst en correcties vanuit de **TC-textarea**, zonder de verborgen chatcomposer te gebruiken.
- Tests met emoji, combinatietekens, Arabisch/RTL, IME, 20.000 UI-tekens en grote midden-in-tekstcorrecties leveren identieke uiteindelijke tekst bij de ontvangers.
- Bufferblokkade gevolgd door herstel verzendt zonder extra toetsaanslag; wachtrij blijft begrensd. Bij niet-herstel blijft tekst zichtbaar en is de storing begrijpelijk.
- Beëindigen, intrekken, afwijzen en twee opeenvolgende oproepen tonen geen vorige sessietekst.
- Toestemming weigeren onderbreekt niet onbedoeld de oorspronkelijke tweepartijverbinding.

### WP3 — P1 — Signaling-, media- en afleverherstel (A06, A09)

Eigenaar: XMPP/WebRTC-ontwikkelaar. Afhankelijkheid: WP2.

- Maak onderscheid tussen server bereikbaar, XMPP geauthenticeerd, mediaverbinding actief, RTT-kanaal gereed en bericht bevestigd.
- Ontwerp herverzending van onbevestigde stanzas met idempotentie; herstel counters niet zonder bijbehorende afleverstrategie.
- Voeg ondersteund mediaherstel toe of een expliciete, toegankelijke herbelroute; geen stille hangende sessie.
- Geef desynchronisatie van live tekst zichtbaar én programmatisch aan; herstel via reset zonder tekst als actueel voor te stellen zolang dat niet zo is.
- Onderzoek echte inkomende audioactiviteitsindicatie, per deelnemer waar nodig, niet slechts microfoon aan/uit.

Acceptatie: gecontroleerde netwerkonderbrekingen van 1, 5 en 30 seconden veroorzaken geen stille tekstverliezen of dubbele definitieve berichten; geen vastlopend herverbindingscircuit. Signaling- en mediafout worden apart gelogd zonder gespreksinhoud. Een actieve sessie blijft bedienbaar. Een doofblinde tester kan status en herstelactie waarnemen zonder voortdurend door ieder teken te worden onderbroken.

### WP4 — P1 — Media- en interopprofiel (A07, A09–A10)

Eigenaar: media-engineer met SIP-/relaypartner. Afhankelijkheid: WP0, WP2, WP3.

- Scheid het beperkte TeleTypTel-profiel van algemene interopclaims. Leg codecs, security, taal/spreker, direction, negotiatie, RTT en DTMF expliciet vast.
- Voeg een passend breedbandaudiopad toe; test de werkelijke keten, niet alleen een codecnaam in SDP.
- Borg bruikbare video voor gebarentaal: behoud handen/gezicht en kies bewust tussen passend beeld en bijsnijden. Een beeldvullend canvas alleen is geen kwaliteitsbewijs.
- Valideer T.140-datachannel tegenover onafhankelijk endpoint; valideer omzetting naar RTP/RED, multiparty en DTMF apart.
- Neem ook A–D op in het DTMF-acceptatieprofiel en bewijs onderhandelde telephone-events; stuur cijfertoetsen nooit ongemerkt als RTT-tekst.
- Behoud XEP-0301 waar passend voor chat; noem private JSON-RTT niet RFC 8865. Behandel XEP-0517 als experimentele koppeling.

Acceptatie: gesigneerde testmatrix met ten minste één onafhankelijke tegenpartij per aangeboden profiel, onderhandelingslog met geheimen verwijderd, RTT verlies-/herstelresultaat en DTMF-ontvangstbevestiging. Kies voor de praktijktest als **eigen kwaliteitsdoel** 720p/30 fps onder afgesproken goede netwerkomstandigheden en documenteer degradatie. Toets normatieve audiovisuele grenswaarden afzonderlijk volgens de in het rapport gekozen normversie; rapporteer percentielen én pieken, niet alleen gemiddelden.

Meet RTT-invoer tot netwerkafgifte apart van netwerkvertraging (toets EN §6.2.4), plus ontvangtijd en presentatie. Meet meerdere gelijktijdige bronnen (§6.2.6). Een enkel gelijk eindbericht bewijst geen realtime prestaties.

Voor 112: aparte gate met bevoegde ketenpartners, locatie/routering/continuïteit, vooraf goedgekeurde testomgeving en bewijs van acceptatie. Geen normale noodlijn gebruiken voor experimenten.

### WP5 — P1/P2 — Native, support, vertaling en volledige klantreis (A08, A11–A12)

Eigenaar: frontend/native/backend + productverantwoordelijke. Afhankelijkheid: WP1–WP3.

- Herstel eerst de contactselectie/fixtureoorzaak van de mislukte live-RTT-integratietest; wijzig geen productiegedrag uitsluitend om een foutieve test groen te maken.
- Onderzoek gewone chat én livevertaling, externe verwerking, melding bij uitval en behoud van het origineel. Laat een taalvaardige tester de begrijpelijkheid beoordelen.
- Toets aanmelden, password manager/paste, sociale login, 2FA, Face ID geweigerd, certificaatfout, upload, supportoverdracht en einde sessie.
- Maak status-/foutupdates bruikbaar voor screenreaders in tolkwerkplek, klantenservice en native opstartschermen.
- Test nacht-/lichtthema en ieder klantthema. Ook staff- en administratieve schermen mogen gebruikers met een beperking niet uitsluiten.

Acceptatie: geen onopgeloste essentiële gebruikersreis; originele tekst blijft beschikbaar bij provideruitval; geen toestemming-/privacymelding die alleen visueel beschikbaar is. Alle nieuwe thema's door contrastgate. Testresultaten noemen expliciet platform, versie en wat niet kon worden getest.

### WP6 — P1 bewijs — Onafhankelijke audit, verklaring en onderhoud

Eigenaar: onafhankelijk auditor, ervaringsdeskundige testers en productverantwoordelijke. Afhankelijkheid: relevante werkpakketten gereed.

- Gebruik een representatieve complete-processensteekproef volgens WCAG-EM; toets ook niet-webonderdelen en communicatieprestaties.
- Betrek dove/slechthorende, gebarentaal-, visueel beperkte en keyboard-only gebruikers; waar relevant doofblind/braille.
- Publiceer pas na review een scopespecifieke verklaring met actuele beperkingen, contactroute en realistische planning.
- Voeg afgesproken tests later aan CI toe, uitsluitend met aparte toestemming voor repository-/workflowwijzigingen.

Acceptatie: criteriummatrix met voldaan/niet voldaan/niet van toepassing/niet onderzocht, bewijs per bevinding, herstelhertest, releaseversie en verantwoordelijke. Nul axe-fouten is niet de enige gate. Geen status “volledig conform” zolang toepasselijke eisen open staan.

## 3. Testplanning

| Fase | Omgeving | Eindproduct |
| --- | --- | --- |
| Ontwikkelregressie | Geïsoleerde DOM/VM, SQLite memory, fake media | Herhaalbare tests zonder productieaccounts |
| Complete runtime | Lokale aparte testconfiguratie met fictieve accounts | Logs en schermopnamen van volledige gebruikersreizen |
| Apparaten | Echte iPhone/iPad, Windows, geleende Android of testlab | Toetsenbord, rotatie, consent, hulpmiddelen, achtergrondmeldingen |
| Netwerklab | Gecontroleerde latency/loss/TURN en drie peers | RTT/media/DTMF-metingen en herstelgedrag |
| Ketenacceptatie | Provider-/tolkdienstsandbox | Onafhankelijke interopacceptatie per aangeboden functie |
| Externe audit | Afgesproken productscope en release | Onderzoeksrapport, verbeterhertest, verklaring |

Nog geen betrouwbare kalender- of kostenraming: die hangt af van scope, externe partners, Android-apparaatbeschikbaarheid en de oorzaak van de integratietimeout. Voer eerst WP0–WP2 uit na toestemming en raam daarna de resterende integratie. Geen belofte dat een volledige toegankelijkheids- en telecomketenaudit binnen één build gereed is.

## 4. Zakelijk aanbod

Maak drie afzonderlijke leveringen: (1) verkenning/prototype, (2) gecontroleerde pilot met beperkingen, (3) productie met afgesproken toegankelijkheids- en interopacceptatie. Prijs audit, gebruikerssessies, ketentests en onderhoud herkenbaar mee. AI-ondersteunde ontwikkeling is de werkwijze; aantoonbare gebruiksresultaten zijn het verkoopbewijs.
