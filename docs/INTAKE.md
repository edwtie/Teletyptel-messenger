# Aanmeldingen, BSN en zorgstukken

## Gebruik

- Gebruiker: `/aanmelden/`, ook bereikbaar via het accountmenu in Messenger. Maak eerst een account of log in via de bestaande lokale/Google-aanmelding. Open daarna de aanmeldpagina en klik **Aanmelding laden**.
- Eigenaar: `/admin/#abonnementen` → **Instellen**. Naam, prijs, beschikbaarheid en aanmeldvoorwaarden staan samen in één formulier met één opslaanknop. Publicatie staat standaard uit.
- **BSN verplicht** en **Audiogram én voorschrift verplicht** zijn afzonderlijke planopties. Bij één van deze opties is ook een zorgverzekeraar verplicht. Een gewoon abonnement vraagt geen zorggegevens en accepteert deze ook niet.
- De gebruiker ziet alleen de eigen actieve aanvraag, kiest een verzekeraar/label en slaat gegevens en documenten eerst op. Daarna volgt expliciet indienen.
- De verzekeraarslijst is een gedateerde, lokale selectie uit het [Vektis UZOVI-register](https://www.vektis.nl/uzovi-register). Herkomst en peildatum staan in `php/data/insurers.json`. Dit controleert geen polis, identiteit of aanspraak. Actualiseer de lijst bij wijzigingen; laat ontbrekende verzekeraars via de beheerder afhandelen.
- BSN-validatie is uitsluitend een cijfer-/elfproef, geen identiteitscontrole. Een bestaand BSN blijft behouden wanneer het wijzigingsveld leeg blijft.

## Admin en staff

Actieve **eigenaren en admins hebben via hun beheerrol inzage in alle aanmeldingen en dossiers**, inclusief concepten, status, ontbrekende gegevens/documenten en inzagelog. Bij staff kent een admin of eigenaar het inzagerecht afzonderlijk toe, bevestigd met het eigen beheerwachtwoord. Rechten worden bij elke API-aanvraag opnieuw gecontroleerd; uitgeschakelde accounts hebben geen toegang. De staffschakelaar kan geen rolgebonden adminrechten wijzigen. De noodtoken geeft geen toegang tot zorgaanmeldingen.

Nieuwe staffaccounts beginnen zonder inzagerecht. Staff krijgt geen algemeen dashboard, chat-/gebruikersbeheer, abonnementbeheer, instellingen of facturatie. Een bevoegd beoordelaar ziet aanvragen, verzekeraar, gemaskeerd BSN en een inzagelog. Volledig BSN tonen of een document downloaden vraagt ook voor admins telkens het eigen beheerwachtwoord; vijf foute bevestigingen blokkeren bevestiging in die sessie gedurende vijftien minuten. Admin en eigenaar kunnen het staff-inzagerecht intrekken. De melding over ontbrekende onderdelen is een volledigheidscontrole, geen medische beoordeling of technisch foutenlog.

### Staff aanmaken en blokkeren

Open **Admin → Stafflijst** (`/admin/#staff`). De lijst toont alleen staffaccounts, met zoeken op naam/e-mail, filter op actief/geblokkeerd en inzagerechten. Het bestaande **Aanmeldingen & staff → Staffaccounts en bevoegdheden** blijft eveneens bruikbaar. Zowel admin als eigenaar kan:

- Een staffaccount met naam, e-mailadres en wachtwoord aanmaken. Het server-side accounttype is altijd staff; inzage staat eerst uit.
- Na wachtwoordbevestiging inzagerecht toekennen of intrekken.
- **Blokkeren** kiezen bij vertrek. Dit schakelt het account uit, trekt inzage in en verhoogt de sessieversie. Iedere volgende serveraanvraag met een oude sessie wordt geweigerd, ook als iemand tijdens de blokkade niets doet.
- **Deblokkeren** kiezen als toegang weer nodig is. Oude sessies blijven ongeldig, opnieuw inloggen is verplicht en medische inzage moet afzonderlijk opnieuw worden toegekend.

Aanmaken, rechtenwijzigingen, blokkeren en deblokkeren komen in het beheerlog. De medewerker en diens eerdere logregels worden niet verwijderd. Er worden geen ontslagredenen opgeslagen. Staff kan zichzelf of collega's niet beheren; deze acties kunnen ook geen owner/adminaccount wijzigen. Alleen de eigenaar behoudt toegang tot aanmeldvoorwaarden per plan.

Een blokkade kan reeds getoonde of gedownloade informatie niet terughalen. Dit blokkeert het afzonderlijke staff-beheeraccount, niet een eventueel los Messenger-account van dezelfde persoon. Bestaande ongewijzigde beheersessies blijven bij de migratie geldig; eenmaal ingetrokken sessies worden niet opnieuw geldig.

Behandelstatussen zijn **In behandeling**, **Aanvulling nodig**, **Beoordeling afgerond** en **Gesloten**. Gestructureerde vervolgacties verschijnen in het eigen portaal van de gebruiker. Er zijn geen medische vrije-tekstnotities of automatische medische beslissingen. Indienen of beoordelen verandert geen abonnement, verzendt geen verzekeringsclaim en start geen facturatie. Gebruik daarvoor het bestaande expliciete abonnements-/factuurbeheer.

## Activering

Gewone aanvragen werken zodra een plan is gepubliceerd. Zorgaanmelding blijft geblokkeerd totdat de operator de volgende inrichting afrondt:

1. Bestaande installatie: `php php/tools/intake-setup.php --schema` maakt intake-tabellen, de uitgeschakelde staff-inzagekolom en de sessieversiekolom. Bestaande accounts worden niet geblokkeerd en plannen worden niet gewijzigd. Nieuwe installaties gebruiken ook `php/schema.sql`.
2. Maak de encryptiesleutel met `php php/tools/intake-setup.php --key`. Dit overschrijft nooit een bestaande sleutel. `php/storage/intake.key` staat buiten `public/` en is gitignored. Beperk Windows-ACLs tot noodzakelijke beheerders en de PHP-service-identiteit; op Unix wordt 0600 gebruikt. Regel een afzonderlijke versleutelde sleutelbackup. Zonder de oorspronkelijke sleutel zijn dossiers onleesbaar. Sleutelrotatie met herencryptie is nog niet geïmplementeerd.
3. Installeer een ClamAV-compatibele commandlinescanner, bijvoorbeeld `clamscan`, met actuele definities. Configureer het absolute executable-pad als `scanner_path`. Exitcode 0 is verplicht; detectie, fout of timeout weigert de upload. Test de echte scanner en uitval vóór activering. Gebruik nooit een wrapper die zonder scan succes teruggeeft.
4. Stel met de verantwoordelijke privacy-/juridisch deskundige vast of TeleTypTel voor dit doel gezondheidsgegevens én BSN mag verwerken. De wens van de gebruiker, een vergoedingstraject of een AGB-code geldt in de software niet als juridische bevoegdheid. Bepaal toepasselijke onderbouwing, privacy-URL/-versie en bewaartermijn. Het bevestigingsvakje legt alleen vast dat de gebruiker wil indienen; het vervangt geen rechtsgrond.
5. Voeg de `intake`-sectie uit `php/config.example.php` aan de privé-serverconfiguratie toe. Vul `enabled`, `privacy_url` (HTTPS), `privacy_version`, `retention_days` (1–3650), `medical_processing_approved`, `medical_basis`, `bsn_processing_approved`, `bsn_legal_basis` en `scanner_path` bewust in. Medische/BSN-vlaggen worden nooit automatisch aangezet. Publiceer de bedoelde plannen en ken minimale staffrechten toe.
6. Controleer HTTPS, veilige cookies, de webroot (`php/public`, nooit de projectroot), database-/backuptoegang en de PHP-uploadtempmap. Uploads bestaan tijdelijk onversleuteld in de PHP-tempmap voor bestandscontrole; gebruik een privé-tempmap en versleutelde systeemschijf. PHP moet uploads van 4 MB ondersteunen, met `post_max_size` boven 4 MB. Apache begrenst de aanmeldroute daarnaast op 4 MB plus 64 KB overhead via `.htaccess`; configureer een equivalente grens bij een andere webserver.
7. Controleer de **TeleTypTel Admin Worker**. Die verwijdert nu verlopen zorginhoud, maximaal 100 aanvragen per run. De Windows-taak werkt alleen zolang WAMP en de ingestelde gebruikerssessie beschikbaar zijn. Richt voor productie een betrouwbare service/cronjob, monitoring en passende back-upretentie in.

Officiële achtergrond: [Rijksoverheid: wie mag BSN gebruiken](https://www.rijksoverheid.nl/vraag-en-antwoord/privacy-en-persoonsgegevens/welke-organisaties-mogen-mijn-burgerservicenummer-bsn-gebruiken) en [Autoriteit Persoonsgegevens: gezondheid](https://autoriteitpersoonsgegevens.nl/themas/gezondheid). Deze implementatie is geen juridische of zorgbeveiligingscertificering.

## Beveiliging en bewaartermijn

- Server-side eigenaarcontrole via de sessie, niet een aangeleverd accountnummer. Actief/trial-account en daadwerkelijke recente login (15 minuten) zijn vereist. Profiel opslaan verlengt de termijn niet. Oude OAuth-handoffs behouden hun oorspronkelijke authenticatietijd. Google met tweestapsverificatie geeft pas na die tweede stap toegang.
- Wijzigingen, BSN-onthulling en downloads gebruiken POST met CSRF-controle, uitsluitend HTTPS. Geen medische inhoud in URL, browseropslag, chatbijlagen of openbare bestandsroutes.
- AES-256-GCM met willekeurige nonce en recordgebonden authenticatie versleutelt BSN, verzekeraarkeuze en documentinhoud. Metadata zoals gebruiker, plan, status en inzageacties blijft leesbaar voor geautoriseerde databasebeheerders.
- PDF/PNG/JPEG met server-side MIME-controle, maximaal 4 MB per document, één audiogram en één voorschrift per actieve aanvraag. Downloads zijn attachments, geen ingesloten viewer. Malwarecontrole garandeert niet dat elk bestand onschadelijk is.
- De inzagelog bevat geen medische inhoud. BSN is standaard gemaskeerd; expliciete onthulling verdwijnt na vijftien seconden. Gedownloade bestanden vallen onder de beveiliging en verwijderplicht van het werkstation.
- Intrekken verwijdert direct de zorgpayload en documenten uit de actieve database, maar zegt geen abonnement op. Verlopen inhoud is direct niet meer opvraagbaar, ook vóór de worker opruimt. De termijn is een snapshot bij starten; nieuwe instellingen verlengen oude aanvragen niet.
- Dossier-/auditmetadata blijft bewaard. Leg vóór productie een aparte gemotiveerde bewaartermijn/verwijderprocedure vast voor deze metadata en backups. Automatische verwijdering daarvan en een complete AVG-inzage/exportprocedure vallen niet onder deze implementatie. Gewone aanvragen krijgen technisch een termijn van 30 dagen.
- De serviceworker bewaart intake-, admin- en API-routes niet en gebruikt daar geen offline cachefallback. Serverresponses zijn `no-store`. Sessieverloop/uitloggen wist de werkweergave en blokkeert vertraagde responses.
- Bij gewijzigde planprijs/voorwaarden moet een concept opnieuw worden gestart. Versienummers detecteren gelijktijdige wijzigingen.

## Verificatie

```
php php/tests/intake-smoke.php
php php/tests/intake-smoke.php --temporary-tables
pwsh -NoProfile -File php/tests/intake-http-smoke.ps1
npm test
```

De eerste test gebruikt SQLite in memory; de tweede uitsluitend tijdelijke MySQL-tabellen die echte tabellen in de testverbinding afschermen. Geen live gebruikers, aanvragen, facturen of medische dossiers worden aangemaakt. De HTTP-test gebruikt alleen gasten en vertrouwde HTTPS, zonder certificaatcontroles uit te schakelen.

Geïsoleerde tests gebruiken synthetische inhoud en een verkeerde scanner om fail-closed gedrag te controleren. Succesvol opslaan wordt intern in tijdelijke tabellen getest; dat vervangt de acceptatietest met de echte scanner niet. JavaScript-tests zijn mock-DOM-/fetch-tests, geen visuele browsertest. Controleer vóór productie ook echte login/Google/2FA, virusscanner, uploadlimieten, rechtenbeheer, downloads, schermlezergebruik en herstel uit backup.
