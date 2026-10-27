# Klantenservice-chat op de website

De homepage (`index.php`) en demo (`demo.html`) hebben rechtsonder een knop
met alleen een chat-icoon (toegankelijke naam **Klantenservice**). De bezoeker opent de popup, vult een voornaam of schuilnaam in, kiest een taal,
accepteert expliciet de chatvoorwaarden (live RTT en automatische Google-vertaling,
ook van concepttekst vóór versturen) en start de chat. Het vakje staat standaard uit.
Een Messenger-account is niet nodig.
Je chat met echte medewerkers, geen chatbot of gesimuleerde reactie. Zodra een
medewerker de chat heeft opgepakt, zijn ook RTT, TC en een gebarentolk beschikbaar.

## Vertaling voor anderstalige bezoekers

- Op het startscherm staan **naam en taal** bij elkaar. Nederlands, Engels, Duits,
  Frans en Spaans wisselen direct alle eigen popupteksten: labels, uitleg,
  toestemmingsinformatie, meldingen en toegankelijke icoonnamen. De browsertaal
  is het eerste voorstel; een expliciete keuze blijft in deze tab onthouden via
  sessionStorage. Gebruikersnaam, berichten en concepttekst worden niet gewijzigd.
- De taalwissel gebruikt lokale taalteksten, geen Google of andere externe dienst.
  RTT en eventuele media blijven lopen. De hoofdwebsite en de staffinterface
  krijgen hierdoor niet de taal van een bezoeker.
- De taal bij het starten wordt de opgeslagen vertaaltaal. Na instemming met
  de nieuwe voorwaarden staan berichtvertaling en live vertaling automatisch aan.
  Alleen de oude RTT-bevestiging geeft geen Google-toestemming; bestaande chats
  worden niet stilzwijgend aangezet.
- Het wereldbolsymbool opent **Taal van dit venster**, **Vertalen naar** en één
  toestemmingsvakje voor automatische bericht- en live RTT-vertaling. Er is geen
  handmatige vertaalmodus of vertaalactie per bericht. De bestaande twaalf
  berichtvertaaltalen blijven beschikbaar. Alleen de venstertaal wijzigen
  verleent geen nieuwe toestemming en verandert geen opgeslagen vertaaltaal.
- Bezoeker en toegewezen medewerker geven ieder toestemming voor Google Cloud
  Translation. Dezelfde serverconfiguratie, API-sleutel en gebruikslimieten als
  Messenger worden gebruikt. Geen sleutel of fictief Messenger-account bij de bezoeker.
- Toestemming geldt per gesprek, niet voor alle websitebezoekers. Vink de
  toestemming onder de wereldbol uit en sla op om haar in te trekken; tekstchat
  en RTT blijven werken. Een nieuwe medewerker moet zelf opnieuw instemmen.
- Automatisch vertaalt ontvangen berichten (bij openen maximaal de tien nieuwste
  berichten als kandidaten). Eigen concepttekst krijgt een live vertaalvoorbeeld.
  Origineel en vertaling blijven apart. **Vertaling**
  bevat een uitklapbare waarschuwing dat machinevertalingen fouten kunnen bevatten.
- De gecombineerde toestemming benoemt bij beide deelnemers expliciet live RTT.
  Eigen en ontvangen concepttekst gaat dan na een korte typpauze naar Google,
  vóór versturen. De voorlopige vertaling wordt bij wijzigingen of stoppen gewist.
  Onvertaalde RTT blijft direct werken. Geen automatische vertaling van tolktekst,
  gebaren, audio of video; geen automatische opname.
- Tijdens het typen staat de eigen tekst rechts in een groene live chatballon;
  ontvangen RTT staat links. De voorlopige vertaling verschijnt in dezelfde ballon
  onder het origineel, na de bestaande korte typpauze. De ballonnen staan onder
  de berichtgeschiedenis en boven het invoerveld, bij bezoeker én medewerker.
  Leegmaken, verzenden of stoppen verwijdert de voorlopige weergave. Alleen
  verzonden berichten komen in de geschiedenis; een lokale typeweergave geeft
  geen extra Google-toestemming en start geen camera of microfoon.
- Zonder toestemming, bij een fout of bereikt limiet blijft de originele chat
  beschikbaar. Verzoeken worden begrensd; verouderde taal- en conceptresultaten
  worden niet getoond. Er is geen onbeperkte kosteloze vertaaldienst voor gasten.
- Vertalingen/concepten worden niet aan het opgeslagen transcript toegevoegd.
  Google ontvangt de te vertalen tekst; dit is geen uitsluitend lokale verwerking.
  Toestemmingen worden met de verwijderde chat opgeruimd. Historische antwoorden
  van een andere medewerker worden niet met diens opvolgers toestemming vertaald.
- De aparte service- en browsertests gebruiken een fictieve vertaalaanbieder:
  twee talen, beide toestemmingen, ingetrokken toestemming, live RTT, eigen
  voorbeeld, CSRF en afscherming van andere chats. Geen klantteksten naar Google.

## Compacte invoerbalk

- **× = Alles afsluiten**: eerst een duidelijke bevestiging, daarna wordt het
  gesprek ook op de server gesloten en stoppen RTT, camera, microfoon en live
  vertaling. Niet-verzonden tekst en gekozen bestanden worden gewist. Annuleren
  behoudt het gesprek. Bij een fout blijft het venster open voor opnieuw proberen;
  lokale media blijven gestopt. De dubbele afsluitknop onderaan is verwijderd.
  Opnieuw openen na afsluiten toont een leeg aanmeldformulier. De chatlauncher
  kan het venster nog tijdelijk verbergen; dat sluit het tekstgesprek niet af.

- De bezoekerspopup heeft één afgeronde balk: **+**, emoji, tekst, camera en
  microfoon. Tijdens typen vervangt versturen het microfoontje. Het tekstvak
  groeit tot enkele regels; Enter verstuurt, Shift+Enter voegt een regel toe.
- Emoji invoegen behoudt de cursorpositie en werkt ook met live RTT. Escape
  sluit eerst het emojipaneel. De invoerbalk past ook op 320 px brede schermen.
- De camera start na een expliciete klik Total Conversation zodra staff de
  chat heeft opgepakt; de andere deelnemer moet nog instemmen. Tijdens het
  gesprek schakelt die knop camera aan/uit. Het microfoontje bedient uitsluitend
  gespreksgeluid, geen spraakopnames, en is buiten een videogesprek uitgeschakeld.
  Automatische RTT opent nooit zelf camera of microfoon. Gebarentolk blijft
  bovenaan apart oproepbaar.

## Foto's en documenten

- **+** bij het bezoekersinvoerveld en de paperclip bij staff openen bestanden.
  Kies één bestand en bevestig met versturen; annuleren en opnieuw proberen zijn
  mogelijk. Een bestaand tekstconcept blijft staan. Ondersteund: PDF, DOC, DOCX,
  JPG/JPEG, PNG en WebP. HEIC, SVG, uitvoerbare bestanden en DOCM niet.
- Maximaal 5 MB per bestand, 20 MB per gesprek en 100 MB aan uploads per 24 uur
  over de klantenservice. Foto's zijn begrensd op 16 megapixels, worden opnieuw
  gecodeerd en verliezen metadata; JPEG-oriëntatie wordt meegenomen indien EXIF
  beschikbaar is. De PHP-uploadlimieten moeten minstens 5 MB toestaan.
- De server controleert bestandstype en inhoud; DOCX-containers worden begrensd
  en macro-/ingebedde objectbestanden geweigerd. Dit is geen antivirusscan.
  Open alleen vertrouwde documenten. Documenten worden uitsluitend als download
  aangeboden, foto's als beschermd voorbeeld. Geen bestanden naar Google/RTT.
- Bestandsinhoud staat uitsluitend in de database, niet in een openbare map.
  Download vereist de eigen bezoekerssessie of een bevoegd staff-/beheeraccount.
  Overige bezoekers, niet-toegewezen staff en geblokkeerde accounts krijgen geen
  toegang. CSRF, veilige downloadheaders, idempotente verzending en chatlimieten
  gelden ook voor uploads. Na 30 dagen gesloten bewaartermijn worden de bytes
  samen met het gesprek opgeruimd. De oorspronkelijke tekst wordt niet aangepast.
- Nodig op de server: Fileinfo, GD, ZipArchive en mbstring. De geïsoleerde tests
  controleren PDF/DOCX/foto's, typevervalsing, limieten, downloads, intrekking van
  stafftoegang, herhaalverzoeken en opruiming, zonder echte klantbestanden.

## RTT, TC en gebarentolk

- **RTT** staat standaard aan: de bezoeker stemt bij het starten in met live tekst
  delen; de staffwerkplek meldt dit bij het oppakken/openen van een eigen gesprek.
  Zodra beide schermen openstaan en de chat is opgepakt, start de verbinding
  automatisch. Geen aparte RTT- of TC-knop en geen cameratoegang voor RTT.
  Ook wissen en emoji's worden live doorgegeven; versturen bewaart het bericht.
  Zonder WebRTC of bij een verbindingsfout blijft gewone tekstchat beschikbaar.
- De knoppen tonen alleen symbolen met toegankelijke namen en tooltips.
  In de bezoekerspopup staan taal, gebarentolk en hulp bovenaan naast sluiten
  (×), ook op mobiel. De panelen gebruiken de popupbreedte; er staat steeds
  één uitleg- of taalpaneel open. Voor het starten blijven de oproepknoppen verborgen.
  **?** bevat uitleg en verbindingsinformatie; het wereldbolsymbool opent taal
  en vertaaltoestemming. Het tolk-symbool roept de gebarentolk op.
- **TC** (Total Conversation): live tekst, beeld en geluid in dezelfde popup/inbox.
  Beide deelnemers moeten instemmen; de browser vraagt om camera/microfoon.
  Een overstap van RTT naar TC vervangt alleen de oproepverbinding en vraagt
  opnieuw deelname met media; de gewone tekstchat en berichten blijven behouden.
- **Gebarentolk oproepen** start zo nodig een TC-uitnodiging en vraagt een eigen
  goedgekeurde tolk. De andere deelnemer moet afzonderlijk **Tolk toelaten** kiezen.
  Pas als beide deelnemers TC hebben geaccepteerd én de tolk toelaten, verschijnt
  de aanvraag in de bestaande tolkwerkplek onder **Klantenservice · gebarentolk**.
- Een beschikbare tolk accepteert daar de oproep. De melding legt uit dat camera,
  microfoon en live tekst worden gedeeld. Na acceptatie opent de tolk de eigen
  klantenservice-weergave en sluit aan. Een eenmalige marker in sessionStorage
  onthoudt alleen die klik; een URL alleen start nooit media. Zonder marker moet
  de tolk expliciet deelnemen. Bezoeker en staff blijven in hun bestaande scherm.
- De tolk ziet geen eerdere berichten, accountgegevens of dossiers. Alleen nieuwe
  live tekst en tijdens deelname afgeronde tekst worden gedeeld, zonder herhaling
  van eerdere chatgeschiedenis. Tolktekst wordt niet automatisch vertaald;
  vertaling tussen bezoeker en medewerker volgt hun aparte vertaaltoestemming.
- **Tolk verwijderen** sluit alleen de twee tolkverbindingen. De oorspronkelijke
  TC-verbinding blijft bestaan. Microfoon- en cameratoggles beïnvloeden dezelfde
  lokale tracks naar beide deelnemers. Een geblokkeerde of weggevallen tolk wordt
  verwijderd zonder de oorspronkelijke oproep te beëindigen.
- **Oproep beëindigen**, de popup sluiten, van staffgesprek wisselen, uitloggen of
  het gesprek terugzetten naar de wachtrij stopt lokale media. Afsluiten van de
  oproep sluit niet automatisch de tekstchat: na beëindigen of weigeren van video
  herstart RTT automatisch zonder camera/microfoon. Een geweigerd cameraverzoek
  laat bestaande RTT werken. Sluiten van het venster stopt ook RTT; opnieuw openen
  start RTT weer, maar nooit automatisch camera/microfoon. Browser-/netwerkfouten
  kunnen een heropening nodig maken; geen onbeperkte automatische belpogingen.
- Tolkcontact blijft uitgeschakeld. Alleen de bestaande goedgekeurde eigen tolken
  worden gebruikt. Beschikbaarheid en een snelle reactie zijn niet gegarandeerd.

## Staff-inbox

- Open `/admin/support-chat.php`, ook bereikbaar via **Klantenservice** in het
  adminpaneel en de staffwerkplek voor aanmeldingen.
- Log in met je bestaande staff-, admin- of owner-account. Gewone Messenger-
  accounts hebben geen toegang. Deze inbox geeft geen inzagerecht in zorgdossiers,
  accountgegevens, facturen of Messenger-geschiedenis.
- Zet **Beschikbaar voor nieuwe chats** aan en houd de werkplek zichtbaar open.
  De website toont alleen beschikbaarheid bij een recente heartbeat van een
  actief account. Na 45 seconden zonder heartbeat vervalt die beschikbaarheid.
  Beschikbaar betekent niet dat iemand onmiddellijk antwoordt.
- Kies **Oppakken**. Slechts één medewerker kan een gesprek claimen. Staff ziet
  de wachtrij met opgegeven namen en status, maar leest en beantwoordt alleen
  toegewezen gesprekken. Owner/admin kan gesprekken inzien en terugzetten naar
  de wachtrij; antwoorden kan alleen de toegewezen medewerker.
- **Terug naar wachtrij** maakt een gesprek opnieuw beschikbaar. Zowel de bezoeker
  als de toegewezen medewerker kan het gesprek afsluiten. Owner/admin kan dit ook.
- Blokkeren of intrekken van een staffsessieversie stopt toegang bij de volgende
  aanvraag, wist de zichtbare inbox en zet de toewijzing terug in de wachtrij bij
  opruiming. Een gewone netwerkonderbreking draagt een gesprek niet automatisch
  over; de bezoeker ziet dat de toegewezen medewerker niet online is.

De bezoeker ziet een eerlijke wachtrij/offline-melding. Berichten kunnen ook zonder
beschikbare medewerker worden achtergelaten. Antwoorden verschijnen in de popup;
er zijn geen e-mail-, push- of sms-meldingen. Houd de pagina open of heropen de chat
binnen dezelfde browsersessie. Een opgegeven naam is **geen identiteitsbewijs**.
Deel geen accountgegevens op basis van alleen die naam.

## Privacy en techniek

- De aparte `teletyptel_support`-sessiecookie ontstaat pas bij openen van de popup.
  Hij is HttpOnly, SameSite=Strict en Secure onder HTTPS, zonder persistente
  vervaldatum. Geen chatinhoud of namen in localStorage, URL's of de cookie.
- Publieke toegang vereist HTTPS; HTTP is alleen toegestaan vanaf loopback voor
  lokale ontwikkeling. De beheerderssessie blijft apart (`teletyptel_admin`).
- Mutaties vereisen een sessiegebonden CSRF-token. API-antwoorden zijn `no-store`;
  de bestaande service worker cachet geen `/api/`- of `/admin/`-routes.
- Threads zijn gekoppeld aan een willekeurige, serverzijdige bezoekersidentiteit.
  Een thread-ID is geen toegangstoken. Naam en tekst worden als tekst weergegeven,
  niet als HTML. Uploads zijn afgeschermd per gesprek; automatische vertaling
  vereist de hierboven beschreven toestemming van beide deelnemers.
- Opgeslagen berichten gebruiken PHP/HTTPS met polling elke drie seconden. De
  server bewaart die transcripties in de database; die tekstchat is niet end-to-end
  versleuteld. Deel geen BSN, medische gegevens of wachtwoorden.
- Live RTT, audio en video gebruiken directe WebRTC-verbindingen met dezelfde
  STUN/TURN-configuratie als Messenger. De oproepbesturing pollt elke seconde via
  geautoriseerde PHP-endpoints. Dit is geen XMPP/XEP-0301- of SIP/T.140-koppeling en
  claimt geen interoperabiliteit met externe telefoons of cliënten. Er worden geen
  gast-Messengeraccounts aangemaakt. Windows WebKit zonder WebRTC houdt tekstchat
  beschikbaar en meldt dat de oproep niet ondersteund is.
- Een oproep hoort bij precies één bezoeker, de toegewezen staffsessieversie en
  eventueel één toegewezen tolk. Een per-venster-ID voorkomt dat een tweede tab
  ongemerkt signaling overneemt. Dezelfde tolk kan niet gelijktijdig een andere
  Messenger-tolksessie accepteren; beide routes delen een transactionele reservering.
- Media en niet-verstuurde RTT worden niet door de signaling-API opgeslagen.
  De applicatie neemt niet op; deelnemers kunnen buiten de applicatie wel opnemen.
  Signaling bevat alleen SDP/ICE en wordt na 60 seconden bij opruiming verwijderd;
  afsluiten verwijdert het direct. Oproepmetadata blijft maximaal 24 uur vanaf
  aanmaak, tot de eerstvolgende opruiming nadat de oproep is afgelopen. Een
  onbeantwoorde oproep/tolkaanvraag verloopt na 10 minuten; een actieve oproep na
  twee uur. Zonder heartbeat eindigt deelname na 45 seconden; een geaccepteerde
  tolk krijgt maximaal twee minuten om voor het eerst aan te sluiten.
- Limieten: naam 80 tekens, bericht 2.000 tekens, maximaal 500 berichten per
  gesprek, 30 berichten per afzender per minuut en vijf nieuwe gesprekken per
  bezoeker/netwerkadres per uur. Alleen een HMAC van het netwerkadres wordt voor
  de tijdelijke limiet bewaard; er wordt geen rauw IP-adres in de supporttabellen
  opgeslagen. Een gedeeld netwerk kan daardoor tijdelijk dezelfde limiet raken.
- Een clientbericht-ID voorkomt dubbele opslag bij opnieuw proberen na een
  verloren antwoord. Claim-, sluit- en schrijfacties worden transactioneel
  geserialiseerd. Inzage, claimen, vrijgeven en sluiten krijgen een beperkte audit
  zonder berichtinhoud.
- Gesprekken zonder activiteit sluiten na 24 uur. Gesloten gesprekken, berichten
  en bijbehorende audit worden na 30 dagen verwijderd bij de volgende opruiming.
  Opruiming draait bij API-verkeer en via de bestaande `php/tools/admin-worker.php`.
  Houd de worker ingepland voor opruiming zonder websiteverkeer; dit is geen
  gegarandeerde verwijdering op exact de seconde. Back-ups vallen buiten deze
  opruiming en moeten een eigen bewaarbeleid hebben.

## Controle

`npm run test:support` controleert de service met tijdelijke SQLite-opslag en de
echte HTTP-controller/popup/inbox met Chromium en WebKit in mobiele browserprofielen.
Testen omvatten een echte bezoeker-staff-uitwisseling, cookie/CSRF-isolatie,
toewijzing, blokkeren, veilig tonen van tekst, opnieuw proberen, bewaartermijnen en
mobiele lay-out. Daarnaast test Chromium echte WebRTC-verbindingen met synthetische
camera/microfoon: RTT zonder capture, toestemming voor TC en tolk, drie deelnemers,
behoud van de oorspronkelijke oproep, geen eerdere geschiedenis naar de tolk en
het stoppen van tracks na annuleren, inclusief een laat beantwoord cameraverzoek.
Windows WebKit controleert de UI en fallback zonder WebRTC, niet echte iPhone-media.
De loginfixture gebruikt uitsluitend fictieve testaccounts; er
worden geen echte bezoekers, medewerkers of Messenger-accounts aangemaakt.

De bestaande adminlogin blijft de productielogin. Browseremulatie bewijst niet de
werking op fysieke telefoons, publieke netwerken of onder grote belasting.
Een werkende TURN-configuratie en tests op echte iPhone-/Android-apparaten blijven
nodig voor betrouwbaar gebruik buiten het lokale netwerk.
