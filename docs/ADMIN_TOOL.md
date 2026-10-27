# TeleTypTel gebruikersbeheer

Voor de aparte aanmeldwerkplek, planvoorwaarden (BSN/zorgstukken), staffrechten en veilige activering: [Aanmeldingen en zorgstukken](INTAKE.md).

Admin en eigenaar hebben apart **Staffbeheer** in het hoofdmenu (`/admin/#staff`), los van klanten en aanmeldingen. Dit gebruikt dezelfde compacte vormgeving als Gebruikersbeheer: naam en e-mail samen, iconen, statuskleuren, zoeken en direct filteren. Per medewerker opent **Beheren** een detailpagina met accountstatus en inzagerecht. De lijst toont 25 medewerkers per pagina.

Vanuit Staffbeheer kunnen zij staffaccounts aanmaken, inzage toekennen/intrekken en accounts blokkeren/deblokkeren, telkens met bevestiging en het eigen beheerwachtwoord. Bij selectievakjes verschijnt een actiebalk voor de huidige pagina; het bevestigingsvenster noemt de medewerkers waarop de actie van toepassing is. De verwerking stopt bij een fout en meldt hoeveel accounts al zijn gewijzigd. Filteren, pagineren en verversen wissen de selectie. Het bestaande beheer onder **Aanmeldingen & staff → Staffaccounts en bevoegdheden** blijft ook beschikbaar. Blokkeren trekt bestaande sessies in; deblokkeren herstelt oude sessies of medische inzage niet. Alle wijzigingen worden gelogd.

## Eerste beheerder

1. Start WAMP en open op de servercomputer `https://localhost/admin/`.
2. Als er nog geen beheeraccount bestaat, verschijnt **Eerste beheerder instellen**.
3. Kies zelf een beheer-e-mailadres en een apart wachtwoord van minimaal 12 tekens
   en maximaal 72 bytes. Gebruik niet je Google-wachtwoord.
4. Daarna kun je met dit beheeraccount inloggen op
   `https://dev.teletyptel.nl/admin/`. De sessie op localhost wordt niet gedeeld
   met het ontwikkeldomein.

Deze adressen horen bij de lokale WAMP-installatie. Andere installaties moeten
de beheerpagina via hun eigen HTTPS-host aanbieden. De eerste installatie is
alleen toegestaan via een loopbackverbinding met hostnaam localhost of het
loopbackadres, en alleen zolang de tabel `admin_users` helemaal leeg is.
Beheerders zijn aparte accounts met de rol `owner` of `admin`; een gewone
TeleTypTel- of Google-aanmelding geeft geen beheerrechten.

## Hoofdpagina, gebruikersbeheer, abonnementen en logs

De beheeromgeving heeft een eigen directory: `php/public/admin/`. De oude
`admin.php` verwijst door; `api/admin.php` blijft een compatibele API-ingang.
Het beheermenu bevat aparte schermen met iconen:

- **Hoofdpagina** (admin/#hoofdpagina): Apache-, MySQL- en PHP-status bovenaan,
  gevolgd door gebruikscijfers en ejabberd/SIP.
- **Gebruikersbeheer** (admin/#gebruikers): de gebruikerslijst, filters,
  accountgegevens en gesprekslog, zonder serverstatuspanelen.
- **Staffbeheer** (admin/#staff): staffaccounts en hun bevoegdheden, los van klanten.
- **Abonnementen** (admin/#abonnementen): plannen toevoegen/instellen,
  datumplanning en historie van abonnementsovergangen.
- **Facturatie** (admin/#facturatie): concepten, definitieve facturen,
  betaalregistratie en periodieke facturatie aan klanten of zorgverzekeraars.
- **Instellingen** (admin/#instellingen): algemene, database-, bedrijfs- en
  btw-instellingen; alleen zichtbaar en toegankelijk voor de eigenaar.
- **Systeem- en beheerlog** (admin/#logs): maximaal 80 recente systeem- en
  beheergebeurtenissen. Verversen haalt alleen de logs opnieuw op. Ook inzage in
  dit scherm wordt geregistreerd.

De actieve pagina is gemarkeerd in het menu. Directe links, vernieuwen en de
terug/vooruitknoppen van de browser behouden de gekozen pagina. Op smalle schermen
staat het menu boven de inhoud. Iconen hebben altijd zichtbare tekstlabels.
De hoofdpagina haalt geen gebruikerslijst of logregels op; gebruikersbeheer
laadt alleen de gebruikersgegevens en het logscherm alleen logregels.
Alle schermen blijven achter dezelfde beheerlogin.

Aanmeldvoorwaarden staan bij **Abonnementen → Instellen → Aanmelding en vereisten**.
De eigenaar stelt daar publicatie, audiogram/voorschrift en BSN in, samen met naam,
prijs en beschikbaarheid. **Plan opslaan** bewaart beide onderdelen in één transactie.
Bij een versieconflict of ongeldige voorwaarden blijft ook de eerdere planprijs intact.
Admins behouden hun bestaande planbeheerrechten; aanmeldvoorwaarden blijven uitsluitend
door de eigenaar instelbaar. De aparte beoordelingswerkplek verwijst naar deze editor.

## Gebruikers en gesprekslog

- Open **Gebruikersbeheer** vanuit het instellingenmenu van de chat.
- Zoek op naam, e-mail, JID of account-ID, eventueel met een accountstatusfilter.
  De lijst toont 25 gebruikers per pagina.
- De lijst heeft één actie per gebruiker: **Beheren**. Deze opent een aparte
  detailpagina binnen Gebruikersbeheer, zonder pop-up voor de gebruikersgegevens.
  Daar staan profielgegevens, accountinstellingen, abonnement en facturatie.
  **Terug naar gebruikerslijst** behoudt de zoekterm, statusfilter en lijstpagina.
- De compacte lijst toont gebruiker, abonnement en status met herkenbare iconen.
  JID, einddatum en gebruikscijfers staan bij **Beheren**. Het filter **Toon**
  werkt direct zodra je een andere status kiest.
- Met de selectievakjes kun je maximaal de 25 gebruikers op de huidige pagina
  tegelijk verwerken. Na selecteren verschijnt de actiebalk met passende knoppen:
  **Webtoegang blokkeren**, **Deblokkeren**, **Naar prullenbak** of **Herstellen**.
  **Selectie wissen** heft de selectie op. Iedere actie
  vereist een overzicht van de selectie, een bevestigingsvakje en het eigen
  beheerwachtwoord. Zoeken, verversen of van pagina wisselen wist de selectie.
- De prullenbak is herstelbaar en wist geen facturen, aanmeldingen, documenten of
  historie. Gebruik het statusfilter **Prullenbak** om accounts terug te vinden.
  Herstellen behoudt een blokkade die vóór het verwijderen al actief was.
- Blokkeren en verwijderen trekken bestaande TeleTypTel-websessies in en weigeren
  nieuwe webaanmeldingen. Ze verwijderen of blokkeren niet automatisch een reeds
  geopende of rechtstreekse ejabberd/XMPP-verbinding; daarvoor blijft apart
  ejabberd-serverbeheer nodig. Oude websessies worden na deblokkeren of herstellen
  niet opnieuw geldig. Automatische facturatie en geplande overgangen worden bij
  verwerking tegengehouden zolang het account geblokkeerd of verwijderd is.
- Klap **Gekoppelde aanmeldaccounts** of **Gesprekslog bekijken** open voor
  meer informatie; deze onderdelen zijn standaard ingeklapt.
- De gesprekstabel toont met welke contactpersonen of groepen de gebruiker
  gesprekken heeft opgeslagen, aantallen berichten/oproepen en eerste/laatste
  activiteit. Maximaal de 100 recentste gesprekken worden samengevat.
- Filter op datum, privé/groep en een exacte gesprekspartner- of groeps-JID.
  Activiteiten worden per 50 getoond. Tijdstippen en datumfilters zijn UTC;
  **Tot en met** omvat de hele gekozen dag.
- Op de detailpagina bewerk je accountstatus en beheernotitie en kies je
  **Wijzigingen opslaan**. Logfilters en verversen behouden niet-opgeslagen
  wijzigingen; teruggaan of navigeren naar een ander scherm wist ze.
  Plan en einddatum wijzig je via **Abonnement wijzigen**, zodat iedere wijziging
  in de historie komt. Een statuslabel is op zichzelf geen ejabberd-blokkade.

Dit overzicht leest alleen de bestaande `account_profiles`, `account_identities`,
`message_history` en `conversation_history` van TeleTypTel. Het is geen lijst van
alle zelfstandige ejabberd-accounts en geen directe ejabberd/MAM-export. Alleen
eerder opgeslagen activiteit is zichtbaar; verwijderde of nooit opgeslagen
gesprekken kunnen ontbreken. De tool slaat geen extra berichtinhoud op.
Wachtwoorden, hashes, provider-subjects/tokens, berichtinhoud, bijlagen, locaties
en gesprekstranscripties worden niet via deze gebruikers- en activiteiten-API
teruggegeven. Een laatst gebruikte provider is niet hetzelfde als online zijn.

## Abonnementen instellen en overzetten

1. Open **Abonnementen** en kies **Plan toevoegen** of **Instellen** bij een plan.
2. Stel een unieke vaste plancode, naam, omschrijving, optionele referentieprijs
   in EUR en prijsperiode in. Een lege prijs betekent *nog niet ingesteld*,
   niet gratis. Bedragen worden als gehele centen opgeslagen.
3. Met **Beschikbaar voor nieuwe toewijzingen** bepaal je of een plan nog gekozen
   kan worden. Uitschakelen verwijdert niets en verandert bestaande abonnementen
   niet. Het standaardplan `free` blijft beschikbaar voor nieuwe accounts.
4. Open **Gebruikersbeheer → Beheren → Abonnement wijzigen** bij de gewenste gebruiker.
   Controleer de getoonde naam, JID en account-ID, kies het plan en eventueel
   een einddatum en reden. Een lege einddatum betekent geen einddatum.
5. Vink de bevestiging aan en kies **Overgang direct uitvoeren**. De overgang
   gaat direct in; een oude einddatum moet worden gewist of vervangen door een
   geldige datum vanaf vandaag (UTC).

De bestaande codes `free`, `pro`, `business`, `subsidy` en `disabled` worden
behouden. Ook reeds gebruikte afwijkende codes worden in de catalogus opgenomen.
De initialisatie wijzigt geen gebruikersabonnementen of bestaande planinstellingen.
Voor `free` is de referentieprijs nul; andere bestaande prijzen zijn niet
verzonnen en blijven oningesteld totdat een beheerder ze invult.

**Abonnementsovergangen** toont 25 wijzigingen per pagina: oud/nieuw plan,
oude/nieuwe einddatum, reden, beheerder en UTC-tijdstip. Bij een gebruiker zie je
de 25 recentste eigen wijzigingen. Plannamen worden in de historie vastgelegd
zoals ze tijdens de overgang waren. Oudere, niet geregistreerde wijzigingen
worden niet achteraf geconstrueerd. Een identieke opdracht voegt geen dubbele
overgang toe; bij een verouderd abonnement of plan weigert de server de wijziging
en moet de beheerder opnieuw openen/verversen. Abonnement, historie en audit
worden binnen één databasetransactie opgeslagen.

Planbeheer wijzigt geen ejabberd-toegangsrechten en voert geen betalingen uit.
Facturatie moet apart per gebruiker worden geactiveerd; een planwijziging maakt
niet vanzelf een factuur. Prijswijzigingen veranderen de catalogus, niet de
eerder vastgelegde financiële afspraak.

De tabellen `subscription_plans` en `subscription_history` staan in
`php/schema.sql` en worden bij bevoegd beheer automatisch aangemaakt indien
nodig. Plan- en abonnementmutaties vereisen dezelfde beheerlogin en CSRF-header
als andere beheeraanvragen.

## Toegang en inzagecontrole

De server controleert elke gegevensaanvraag. Ook localhost vereist na installatie
een beheerlogin. De beheersessie heeft een eigen HttpOnly/SameSite-cookie en
verloopt na 30 minuten inactiviteit. POST-aanvragen vereisen een CSRF-token uit
`GET admin/api.php?action=session`, meegestuurd als `X-Teletyptel-Csrf`.
Inzage, aanmelding, eerste installatie en accountwijzigingen worden vastgelegd
in `admin_audit_log`; de actor en het betrokken account-ID zijn terug te vinden
in **Systeem- en beheerlog** (ververs na inzage). De pagina toont een beperkte
recente selectie; de audit is geen beveiliging tegen databasebeheerders.

Een eventueel bestaand noodtoken uit `TELETYPTEL_ADMIN_TOKEN` of de PHP-config
werkt uitsluitend via de header `X-Teletyptel-Admin-Token`, niet via een URL.
Tokengebruik wordt als `emergency-token` geregistreerd. De webinterface gebruikt
gewone beheeraccounts. Verleen beheerrechten alleen aan bevoegde beheerders,
informeer gebruikers over de beschikbare metadata en spreek een bewaartermijn
en toegestaan gebruik af. Er is hier geen automatische auditopschoning toegevoegd.

`php/schema.sql` bevat de audittabel voor nieuwe installaties; de bestaande
admin-API maakt ontbrekende beheertabellen/kolommen ook automatisch aan.

## Datumplanning en automatische verwerking

Kies bij **Gebruikersbeheer → Beheren → Abonnement wijzigen** voor **Op een toekomstige
datum** en bevestig de overgang. De ingangsdatum is vanaf de volgende UTC-dag.
Er kan per account één overgang openstaan. Een geplande einddatum mag niet vóór
de ingang liggen. Annuleren kan bij de gebruiker of onder **Abonnementen**.
Een plan met openstaande toewijzingen kan niet worden uitgeschakeld.

De worker voert een verschuldigde overgang één keer uit en registreert historie
en audit in dezelfde transactie. Bij een inmiddels gewijzigd abonnement, een
ongeldig doelplan of een achterhaalde einddatum wordt de planning als mislukt
gemarkeerd; er wordt niets blind overschreven. Beoordeel dan de gebruiker opnieuw.
Een account-einddatum is administratief en blokkeert ejabberd niet automatisch.

Installeer op de WAMP-computer eenmaal vanuit PowerShell:

```powershell
.\php\tools\install-admin-worker.ps1 -PhpPath 'C:\wamp64\bin\php\php8.4.15\php.exe'
```

Dit maakt de taak **TeleTypTel Admin Worker**: iedere minuut, verborgen,
zonder opgeslagen Windows-wachtwoord, onder de huidige Windows-gebruiker.
**Deze gebruiker moet aangemeld blijven; WAMP en de computer moeten draaien.**
Het is geen onbeheerde 24/7-serverdienst. Voor een server zonder aangemelde
gebruiker moet een beheerder een passende service-/taakidentiteit configureren.
Per uitvoering worden maximaal 100 overgangen en 100 verschuldigde
facturatieafspraken verwerkt; achterstand wordt bij volgende uitvoeringen
ingehaald. Een bestandslock voorkomt overlappende lokale runs.

Handmatig uitvoeren: `php php/tools/admin-worker.php`. De laatste uitvoering
staat in `php/storage/admin-worker.json`; Abonnementen en Facturatie tonen een
waarschuwing bij fouten of een uitvoering ouder dan vijf minuten. Datums en
planning zijn UTC, dus niet automatisch middernacht Nederlandse tijd.

## Facturen en verlenging

1. Vul later bij **Instellingen** bedrijfsnaam, volledig adres, btw-ID,
   KvK-nummer, btw-percentage en eventueel IBAN/toelichting in. Vul voor
   facturen aan zorgverzekeraars ook de **AGB-code zorgaanbieder** in.
   Bedrijfs- en btw-velden blijven aanvankelijk leeg; er is geen btw-tarief
   of bedrijfsidentiteit verzonnen. Valuta is EUR.
2. Kies **Beheren → Factuur maken** bij een gebruiker of **Conceptfactuur toevoegen**
   onder Facturatie. Kies klant of zorgverzekeraar als ontvanger.
3. Vul naam, adres, optioneel e-mail, leverdatum/begin periode, vervaldatum,
   omschrijving, aantal, prijs exclusief btw en expliciet btw-percentage in.
   Bewaar eerst een concept. De implementatie ondersteunt één factuurregel.
4. Controleer het opgeslagen concept en vink de bevestiging aan om het
   definitief te maken. Zonder bedrijfs- en btw-instellingen of klantadres kan
   dat niet. Bij ontvanger **Zorgverzekeraar** blokkeert ook een ontbrekende
   of verkeerd geschreven AGB-code het definitief maken, zonder een nummer te
   verbruiken. Nummering is doorlopend per jaar: `TT-JJJJ-000001`.
5. Definitieve inhoud en bedrijfsgegevens, inclusief de ingevulde AGB-code,
   worden vastgelegd en niet meer
   bewerkt. **Afdrukken / opslaan als PDF** gebruikt de browserafdrukfunctie.
   Een concept is duidelijk als concept gemarkeerd.
6. Registreer ontvangen betaling met datum en betalingskenmerk. Dit registreert
   alleen administratie; het schrijft geen geld af.

Voor automatische facturen: **Gebruikersbeheer → Beheren → Periodieke facturatie**, ontvanger en
btw invullen, volgende datum kiezen, activeren en de afspraak bevestigen.
Dit vereist een maand-/jaarplan met positieve prijs. Zonder het tweede vinkje
maakt iedere periode een concept; met **Ook automatisch definitief maken**
krijgt de factuur automatisch een nummer zodra de bedrijfsgegevens compleet
zijn, inclusief AGB-code bij facturatie aan een zorgverzekeraar.
Bij onvolledige gegevens blijft een concept achter met een melding;
maak dat later handmatig definitief. De volgende factuurdatum schuift door.
Per afspraak en periode voorkomt een unieke aanvraagcode dubbele facturen.
Maandultimo en schrikkeldagen behouden de oorspronkelijke dag als anker.

Een prijs-/planwijziging, afgesloten/opgeschort account of een factuurperiode
na de account-einddatum pauzeert automatische facturatie. Controleer dan de
melding en bevestig een nieuwe afspraak. Facturatie verlengt niet zelf de
administratieve einddatum van het account en verleent geen toegangsrechten.
**Automatische facturatie pauzeren** stopt toekomstige verwerking; bestaande
facturen blijven staan.

De AGB-code mag tijdens inrichting leeg blijven, maar is in deze toepassing
verplicht voor definitieve facturen aan zorgverzekeraars, zowel handmatig als
automatisch. Gewone klantfacturen vereisen dit veld niet. Als ingevuld staat
de code ook op de afdruk/PDF van de factuur. Eerder definitief gemaakte facturen
houden hun oorspronkelijke gegevens; een latere instelling wijzigt ze niet.

Vul de eigen geregistreerde AGB-code van de facturerende zorgaanbieder in:
acht cijfers, inclusief eventuele voorloopnullen. De code blijft tekst en wordt
niet afgerond of automatisch aangevuld. Dit formaat volgt de
[Vektis-registratieregels](https://www.vektis.nl/uploads/AGB/AGB%20Registratie%20%26%20Controle.pdf).
De invoercontrole weigert ook acht nullen. Dit controleert alleen de
schrijfwijze, niet het bestaan, de geldigheid of de juiste zorgsoort. Controleer
dat zelf in het [AGB-register](https://www.vektis.nl/agb-register/zoeken).
Aanvullende AGB-codes (zoals behandelaar of verwijzer) en andere
zorgsoort-/verzekeraarspecifieke declaratievelden vallen buiten deze functie.

Dit is gewone facturatie aan een ontvanger, **geen VECOZO-koppeling of
zorgdeclaratie**, geen dekkingstoets en geen toestemming van een zorgverzekeraar.
Vul geen BSN of medische gegevens in. E-mail is alleen een contactveld:
er is geen automatische verzending, incasso of betaalprovider.
Creditnota's, terugbetalingen en een volledige boekhouding zijn niet inbegrepen.
Laat het toepasselijke btw-regime en de factuurgegevens controleren; de software
bepaalt niet of een vrijstelling geldt. Zie de
[factuureisen van de Belastingdienst](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/factuureisen/).
De controle hier is voor standaardfacturatie met btw-ID/KvK, niet voor iedere
bijzondere fiscale situatie.

## Algemene instellingen en herstel

Alleen een ingelogde **owner** heeft toegang. Testen/opslaan vraagt opnieuw het
huidige beheerwachtwoord; een noodtoken alleen geeft geen toegang.
App- en XMPP-databasehost, poort, naam, gebruikersnaam en wachtwoord zijn
instelbaar. Een leeg wachtwoordveld behoudt het bestaande geheim; alleen
**Databasewachtwoord expliciet leeg maken** verwijdert het. Bestaande geheimen
worden nooit naar de browser teruggestuurd. Na testen worden ingevoerde
wachtwoorden gewist: vul nieuwe wachtwoorden opnieuw in vóór opslaan.

Opslaan test de app-database en een gewijzigde XMPP-verbinding. De app-database
moet bestaande beheertabellen en dezelfde bevoegde eigenaar bevatten. Dit maakt
of migreert geen database en maakt geen SQL-gebruikers of wachtwoorden aan.
Omgevingsvariabelen hebben voorrang; daarmee beheerde groepen zijn niet
wijzigbaar via het scherm. Gelijktijdige wijzigingen worden met revisies
gedetecteerd.

De override staat buiten de webroot in `php/storage/admin-settings.json`,
niet in de versiebeheerconfiguratie. Beperk NTFS-rechten tot de bevoegde
beheerder en PHP-/taakidentiteit; dit bestand bevat databasegeheimen.
Stel Apache DocumentRoot uitsluitend in op `php/public`, niet op de repository.
Maak beveiligde back-ups van zowel database als private configuratie.
Bij een verkeerde override kan de serverbeheerder dit bestand buiten de
webroot hernoemen om terug te vallen op `php/config.php` en omgevingsvariabelen.
Wijzig het niet terwijl een verwerking loopt.

Sitenaam en publiek HTTPS-adres zijn geregistreerde algemene gegevens.
Ze wijzigen geen DNS, Apache-vhost, TLS-certificaat, OAuth-redirects of
ejabberd-hostnaam. Het XMPP-databaseblok wijzigt alleen de PHP-verbinding,
niet de database-inloggegevens in ejabberd zelf.

## Tests

Voer uit vanuit de repository met PHP 8.0+ en `pdo_sqlite`:

```text
php php/tests/admin-user-directory-smoke.php
php php/tests/subscriptions-smoke.php
php php/tests/admin-management-smoke.php
node tests/admin-ui.test.js
php php/tests/xmpp-library-smoke.php
npm test
```

De PHP-beheertests gebruiken SQLite in het geheugen en een tijdelijke private
instellingenmap, geen echte gebruikers, facturen of databasewachtwoordwijzigingen.
De UI-tests gebruiken een mock-DOM en fetch, geen volledige browserrendering.

Optioneel, met de beheertabellen al geïnstalleerd en CREATE TEMPORARY TABLES-recht:

```text
php php/tests/admin-management-mysql-smoke.php --temporary-tables
```

Deze integratietest kloont alleen tabelstructuren naar verbindingsgebonden
tijdelijke tabellen. Alle testmutaties blijven daarin; er worden geen echte
accounts of facturen toegevoegd. Na opruimen controleert de test dat de echte
accountprofielen ongewijzigd zijn.

## Berichtvertaling

Onder **Instellingen → Berichtvertaling** kan uitsluitend de eigenaar (de bestaande
serverinstellingenrol, niet staff of een gewone admin) Google Cloud Translation
Basic v2 instellen. Inschakelen, opslaan en sleutelwijzigingen vereisen de bestaande
CSRF-controle en bevestiging met het beheerwachtwoord. De dienst staat standaard uit.

De API-sleutel wordt alleen server-side opgeslagen in de bestaande private
`php/storage/admin-settings.json`, buiten `php/public`. Het instellingenantwoord
bevat uitsluitend `apiKeyConfigured`, nooit de sleutel zelf. Leeg laten bewaart de
sleutel; verwijderen vereist expliciet aanvinken en uitschakelen. Bescherm deze map
en back-ups met bestandsrechten; plaats nooit de volledige `php`-map in de webroot.
Staff en chatgebruikers kunnen de sleutel niet lezen of wijzigen.

Gebruik een eigen Google Cloud Translation Basic v2-sleutel (geen Gemini-sleutel).
Beperk deze in Google Cloud tot de Translation API en het uitgaande server-IP.
Controleer kosten, quota en de afspraken over het verwerken van berichttekst voordat
je inschakelt. De databaseverbindingstest controleert **niet** of Google de sleutel
accepteert. Op 26 oktober 2026 is de ingestelde Google-sleutel apart getest met
korte fictieve Nederlandse teksten: gewone/automatische berichtvertaling en
live-RTT-concepten leverden Engelse vertalingen op. Hiervoor is uitsluitend een
SQLite-geheugendatabase gebruikt; geen echte accounts, gesprekken of voorkeuren
zijn aangepast. De browsertests gebruiken nog steeds fictieve providerantwoorden.

Op deze lokale WAMP-installatie ontbrak de CA-bundel voor PHP cURL (fout 60).
De via HTTPS opgehaalde en met SHA-256 gecontroleerde
[Mozilla-bundel van curl](https://curl.se/docs/caextract.html) staat nu buiten de
webroot in `C:/wamp64/bin/php/certs/cacert.pem`. PHP 8.5 gebruikt deze via
`curl.cainfo` in `php.ini` en `phpForApache.ini`; Apache is daarna herladen.
Let op: de HTTP-vhosts `localhost` en `teletyptel` gebruiken hier afzonderlijk
PHP 8.0.30 via FastCGI, niet de PHP 8.5-module van Apache. Ook in
`C:/wamp64/bin/php/php8.0.30/php.ini` is de CA-locatie ingesteld. Controleer
de actieve PHP-versie en configuratie via de betrokken webserverroute, niet
alleen via de opdrachtregel. Bestaande FastCGI-processen kunnen na een gewone
Apache-herlaadactie de oude configuratie behouden; stop en start Apache dan
volledig via WAMP. Controleer daarna opnieuw de bericht- en live-RTT-vertaling.
De oorspronkelijke ini-bestanden hebben een `.before-translation-tls-20261026`
back-up. Bij PHP-upgrades moet de absolute CA-locatie opnieuw worden ingesteld
en de bundel periodiek via de officiële bron worden vernieuwd. Schakel
certificaatvalidatie niet uit. Zie [PHP curl.cainfo](https://www.php.net/manual/en/curl.configuration.php).

De server gebruikt PHP cURL met TLS-validatie, een vast Google HTTPS-adres, een
timeout en een API-key-header. Alleen tekst, doeltaal en het formaat worden gestuurd,
geen account-ID, JID of contactlijst. Zie de officiële documentatie voor
[Basic v2](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate)
en [API-key-headers](https://docs.cloud.google.com/docs/authentication/api-keys-use).

`api/translation.php` vereist een actieve gebruikerssessie en voor POST een
sessiegebonden CSRF-token. Geblokkeerde/verwijderde accounts en onvoltooide 2FA-sessies
hebben geen toegang. Voorkeuren staan per account in `translation_preferences`.
De endpoint maakt deze tabel en `translation_usage` zo nodig aan (CREATE-recht nodig);
dezelfde definities staan in `php/schema.sql` voor voorafgaande installatie.
Bij bestaande installaties voegt de endpoint `live_rtt_consent` en `own_live_rtt_consent` toe aan
`translation_preferences` (ALTER-recht nodig). Bestaande accounts krijgen standaard
geen toestemming voor live RTT; bestaande talen en berichtvoorkeuren blijven behouden.
Voor eigen concepttekst is een afzonderlijke opt-in nodig, ook als inkomende RTT
al wordt vertaald. De server controleert dit apart. Het eigen vertaalvoorbeeld
gebruikt dezelfde gekozen doeltaal en blijft lokaal; het verzonden bericht blijft
de originele tekst. Eigen en ontvangen concepten hebben afzonderlijke resultaten
maar delen één wachtrij, minimaal 3 seconden tussen aanvragen en de bestaande quota.

Per bericht maximaal 5.000 Unicode-tekens, per gebruiker maximaal 30 aanvragen per
minuut en 1.000 per dag. De daglimieten voor tekens zijn instelbaar: standaard
50.000 per gebruiker en 500.000 voor de hele server, gemeten per UTC-dag. Verbruik
wordt transactioneel gereserveerd vóór de provideroproep, ook bij providerfouten.
De gebruikstabel bewaart alleen tellers, geen berichtteksten of vertalingen;
verlopen tellers worden bij nieuwe vertaalverzoeken opgeruimd. Aanvullende Google
Cloud-quota blijven nodig; de lokale limieten zijn geen facturatiegarantie.

Gebruikers kiezen de vertaaltaal los van de interfacetaal, plus uit/handmatig/
automatisch. Automatisch vereist toestemming en vertaalt alleen nieuwe inkomende
tekstberichten, nooit automatisch de historie, live RTT, bijlagen of locaties.
Vertalingen zijn persoonlijk zichtbaar en worden niet naar gesprekspartners of
groepskamers doorgestuurd. Met de XEP-0171-dienst lopen de persoonlijke
vertaalverzoeken en antwoorden wel via XMPP-IQ.

Live RTT heeft een aparte opt-in bij de gebruiker, ook bij automatische
berichtvertaling. Na inschakeling worden conceptteksten van het geopende gesprek
naar Google gestuurd; ook nog niet verzonden of later gewiste tekst. De gebruiker
moet dit met de gesprekspartner afstemmen. Het origineel blijft direct zichtbaar;
de voorlopige vertaling verschijnt apart. XMPP RTT, relay en Jingle/T.140 gebruiken
dezelfde vertaalfunctie. Dit is geen SIP-vertaalgateway.

De browser bundelt wijzigingen (800 ms pauze, maximaal circa 4 seconden wachten
bij doortypen), met minimaal 3 seconden tussen live aanvragen en één lopend
live verzoek. Alleen het nieuwste concept wordt verwerkt. Bij verder typen blijft
de vertaling van het ongewijzigde begin staan met ‘Wordt bijgewerkt…’.
Resultaten met gewiste of gecorrigeerde brontekst verdwijnen direct, net als bij
afronden, wisselen of uitloggen. Bij
providerfouten stopt live vertalen totdat de voorkeuren opnieuw worden geladen.
De bestaande serverlimieten gelden gezamenlijk voor live en gewone vertalingen;
herhaalde concepten tellen steeds volledig mee en kunnen de limiet snel bereiken.
Quota worden niet automatisch verhoogd. Live vertalingen blijven uitsluitend in
browsergeheugen; wissen of annuleren haalt tekst niet terug bij de provider.

Geïsoleerde tests (geen echte sleutel, gesprekken of Google-verbruik):

```text
php php/tests/translation-smoke.php
node tests/translation-ui.test.js
node tests/live-rtt-integration.test.js
node tests/xmpp-translation-ui.test.js
php php/tests/translation-xmpp-smoke.php
node scripts/capture-messenger-demo.js
```

### XMPP-vertaaldienst en MUC

De lokale dienst `translation@localhost/teletyptel-translation` gebruikt een apart
technisch ejabberd-account, geen gewoon TeleTypTel-gebruikersprofiel. De worker
`php/tools/translation-xmpp-worker.php` meldt zich via gecontroleerde STARTTLS en
SCRAM aan, maar treedt niet toe tot kamers en verwerkt geen groepsberichten.
Hij beantwoordt persoonlijke XEP-0171-verzoeken en discovery. De aanvrager moet
een bestaand, niet-geblokkeerd account zijn met een overeenkomende bare JID in
`account_profiles`. XMPP-verzoeken gebruiken XMPP-authenticatie, niet een PHP-cookie.
De opgeslagen doeltaal, afzonderlijke RTT-toestemmingen en bestaande quota worden
opnieuw gecontroleerd. Bron/destinatietalen en Google-engine staan in het antwoord.
Ondersteund: discovery, taalparen, één doeltaal per verzoek. Meerdere doeltalen in
één IQ, woordenboeken en pivotvertalingen worden niet ondersteund.

Instellingen en het willekeurige servicewachtwoord staan uitsluitend in
`php/storage/translation-xmpp.json`, buiten de webroot en uitgesloten van Git.
De Google-sleutel blijft in de bestaande admininstellingen; de worker leest deze
opnieuw per verzoek. De browser krijgt alleen het dienst-JID, nooit wachtwoorden.
Lokale XMPP-certificaatvertrouwing is beperkt tot de XMPP-verbinding; gebruik
geen globale `openssl.cafile` met alleen het lokale certificaat, want dat kan
Google HTTPS-validatie verstoren.

Starten en bij Windows-aanmelding starten:

```powershell
php/tools/start-translation-xmpp.ps1 -InstallAtLogon
```

De taak heet `TeleTypTel Translation XMPP`. Hij start verborgen onder de huidige
gebruiker; de worker herverbindt na verbindingsverlies en heeft een proceslock.
Met toestemming van de eigenaar gebruikt uitsluitend dit taakproces
`-ExecutionPolicy Bypass` voor het lokale startscript. De algemene Windows
uitvoeringspolicy is niet gewijzigd.
Dit is geen machinebrede Windows-service die vóór aanmelding beschikbaar is.
Logbestanden in `php/storage/translation-worker.*.log` bevatten alleen status,
geen teksten of sleutels. PHP 8.1+ is vereist voor de bestaande XMPP-bibliotheek;
de lokale launcher gebruikt PHP 8.5. De web-API blijft PHP 8.0-compatibel.

Activeren na geslaagde verbindingstest: `php php/tools/setup-translation-xmpp.php --enable`.
Terug naar HTTP: hetzelfde commando met `--disable`, daarna voorkeuren opnieuw laden.
De setup-tool is uitsluitend voor de lokale Docker-container `teletyptel-ejabberd`
en verandert geen bestaande servicewachtwoorden.

Een echte test vereist expliciete toestemming en een werkende Google-koppeling:
`php php/tests/translation-xmpp-live.php --run-local`. Deze maakt twee tijdelijke
accounts en een besloten, niet-persistente kamer, gebruikt fictieve tekst en ruimt
deze accounts, kamer en persoonlijke voorkeuren weer op. Google-verbruik blijft
wel meetellen. Op 26 oktober 2026 zijn 38 live-controles geslaagd, inclusief
Engels/Turks, aparte RTT-afzenders en uitsluitend persoonlijke vertaalantwoorden.
