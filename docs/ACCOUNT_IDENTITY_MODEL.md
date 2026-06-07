# TeleTypTel Account Identity Model

Status: ontwerpvoorstel

Doel: TeleTypTel moet voor gewone gebruikers werken zoals moderne messengers: aanmelden met telefoonnummer, e-mail of gekoppelde accounts, terwijl XMPP intern de open technische laag blijft.

## Kernidee

De gebruiker heeft een TeleTypTel-account. Dat account kan meerdere login-identiteiten hebben. De XMPP-identiteit is niet hetzelfde als de login-identiteit.

```text
Gebruiker gebruikt:
  telefoonnummer
  e-mail
  Google / Facebook / Apple

TeleTypTel gebruikt:
  account_id

XMPP gebruikt:
  xmpp_jid
  xmpp_domain
  xmpp_resource
```

Voorbeeld:

```text
Login/e-mail:
  famtie@freedom.nl

Intern XMPP-account op lokale server:
  famtie@localhost

Later productie:
  famtie@teletyptel.nl
```

Hiermee voorkomen we dat een e-maildomein per ongeluk als XMPP-serverdomein wordt gebruikt.

## Waarom Dit Nodig Is

WhatsApp heeft gebruikers gewend gemaakt aan een eenvoudig model:

```text
telefoonnummer -> contact -> gesprek
```

TeleTypTel moet dezelfde eenvoud bieden, maar zonder gesloten platformmacht:

```text
telefoonnummer/e-mail -> TeleTypTel-account -> open XMPP-netwerk
```

De gebruiker hoeft geen JID, XMPP-host, poort, WebSocket of TLS-modus te begrijpen. Die gegevens horen bij serverinstellingen of developer/adminschermen.

## Lagen

### 1. Publieke Identiteit

Deze gegevens gebruiken mensen om elkaar te vinden:

- telefoonnummer
- e-mail
- weergavenaam
- avatar
- eventueel provider-ID

Telefoonnummer wordt later de primaire contact-ingang, omdat dit aansluit op Android/iOS-contactlijsten en het WhatsApp-achtige gebruik.

### 2. Login-Identiteiten

Een account kan meerdere manieren hebben om aan te melden:

- telefoonnummer + code of wachtwoord
- e-mail + wachtwoord
- Google account
- Facebook account
- Apple account
- provider SSO, bijvoorbeeld KPN, Odido, Ziggo of zorgprovider

Google/Facebook/Apple zijn alleen aanmeldmethoden. Zij worden niet eigenaar van het gesprekssysteem.

### 3. TeleTypTel Account

Dit is de hoofdidentiteit in de TeleTypTel-database:

- account_id
- display_name
- avatar
- language
- accessibility_profile
- provider_id
- created_at
- updated_at

### 4. XMPP Identiteit

Deze laag is technisch:

- xmpp_jid
- xmpp_domain
- xmpp_host
- xmpp_port
- xmpp_websocket
- xmpp_tls_mode
- xmpp_resource

Voor gewone gebruikers blijft deze laag verborgen. In developer/admin mode mag dit zichtbaar zijn.

## Databasevoorstel

### accounts

```sql
CREATE TABLE accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  avatar_data_url MEDIUMTEXT NULL,
  avatar_color CHAR(7) NOT NULL DEFAULT '#2563eb',
  language VARCHAR(16) NOT NULL DEFAULT 'nl',
  accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT 'default-live-text',
  provider_id VARCHAR(96) NOT NULL DEFAULT 'teletyptel',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### account_identities

```sql
CREATE TABLE account_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  type VARCHAR(32) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_identity_type_identifier (type, identifier),
  KEY idx_identity_account (account_id)
);
```

Voorbeelden:

```text
type=email, identifier=famtie@freedom.nl
type=phone, identifier=+31612345678
type=google, identifier=<google-sub>
type=facebook, identifier=<facebook-id>
type=apple, identifier=<apple-sub>
```

### account_credentials

```sql
CREATE TABLE account_credentials (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  password_updated_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### account_xmpp

```sql
CREATE TABLE account_xmpp (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  xmpp_jid VARCHAR(255) NOT NULL,
  xmpp_domain VARCHAR(255) NOT NULL,
  xmpp_host VARCHAR(255) NOT NULL,
  xmpp_port INT NOT NULL DEFAULT 5222,
  xmpp_websocket VARCHAR(255) NOT NULL DEFAULT '',
  xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT 'websocket',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_xmpp_jid (xmpp_jid)
);
```

## UI Ontwerp

### Startscherm

Gewone gebruiker ziet:

- telefoonnummer of e-mail
- wachtwoord
- aanmelden
- nieuwe gebruiker
- wachtwoord vergeten
- doorgaan met Google
- doorgaan met Facebook
- doorgaan met Apple

Niet tonen:

- JID
- XMPP host
- XMPP poort
- WebSocket URL
- TLS mode

### Instellingen

Normale instellingen:

- profiel
- telefoonnummer
- e-mail
- avatar
- taal
- webcam
- camera
- microfoon
- kaartprovider
- chat-achtergrond
- toegankelijkheid

Geavanceerde instellingen:

- XMPP server
- XMPP WebSocket
- relay
- developer/debug

### Profiel

Profiel bevat:

- naam
- avatar
- telefoonnummer
- e-mail
- geboortedatum
- taal
- provider

## Loginflow

### Aanmelden Met E-mail

```text
1. Gebruiker vult famtie@freedom.nl in.
2. Server zoekt account_id via account_identities.
3. Server controleert wachtwoord in account_credentials.
4. Server haalt XMPP-identiteit op uit account_xmpp.
5. Client verbindt met xmpp_jid, xmpp_domain en xmpp_websocket.
```

Belangrijk:

```text
famtie@freedom.nl is login/e-mail.
famtie@localhost is lokale XMPP-identiteit.
```

### Nieuwe Gebruiker

```text
1. Gebruiker vult telefoonnummer of e-mail in.
2. Server maakt account aan.
3. Server maakt login-identiteit aan.
4. Server maakt XMPP-account aan.
5. Server koppelt account_id aan xmpp_jid.
6. Client logt automatisch in.
```

Voor lokale ontwikkeling:

```text
email: famtie@freedom.nl
xmpp_jid: famtie@localhost
xmpp_domain: localhost
```

Voor productie:

```text
email: famtie@freedom.nl
xmpp_jid: famtie@teletyptel.nl
xmpp_domain: teletyptel.nl
```

## Migratie Vanuit Huidige Code

De huidige tabel `account_profiles` mengt meerdere lagen:

- profiel
- login
- wachtwoord
- XMPP instellingen
- voorkeuren

Migratiepad:

1. Laat `account_profiles` voorlopig bestaan.
2. Voeg nieuwe tabellen toe naast de bestaande tabel.
3. Schrijf nieuwe accounts naar het nieuwe model.
4. Lees oude accounts via compatibiliteitslaag.
5. Migreer oude records automatisch bij eerste login.
6. Verwijder pas later de oude velden.

## Fases

### Fase 1: Ontwerp Vastleggen

- [ ] Dit document bespreken.
- [ ] Besluiten of telefoonnummer primair wordt.
- [ ] Besluiten welke login-methoden in Alpha/Beta komen.
- [ ] Besluiten hoe localhost accounts worden gemapt.

### Fase 2: Database Voorbereiden

- [ ] Nieuwe tabellen toevoegen.
- [ ] Compatibiliteitslaag naast `account_profiles`.
- [ ] Migratiehelper maken.
- [ ] Testdata voor `email -> xmpp_jid` mapping.

### Fase 3: Loginflow Aanpassen

- [ ] UI-label `E-mail` blijft zichtbaar.
- [ ] `JID` verbergen voor normale gebruikers.
- [ ] Aanmelden zoekt via `account_identities`.
- [ ] Client krijgt XMPP-config van server.
- [ ] Oude fout voorkomen: e-maildomein mag nooit XMPP-domein worden.

### Fase 4: Nieuwe Gebruiker

- [ ] Nieuwe gebruiker maakt TeleTypTel-account.
- [ ] Lokale ontwikkeling maakt `localpart@localhost`.
- [ ] Productie maakt `localpart@teletyptel.nl`.
- [ ] Wachtwoordherstel blijft via e-mail.

### Fase 5: Telefoonnummer

- [ ] Telefoonnummer als identiteit toevoegen.
- [ ] Android/iOS-contactmatching voorbereiden.
- [x] Verificatiecode ontwerp maken.
- [ ] Landcode-normalisatie toevoegen.

### Fase 6: Social Login

- [x] Google login ontwerp.
- [ ] Facebook login ontwerp.
- [ ] Apple login ontwerp.
- [ ] Gekoppelde accounts tonen in profiel.

## Social Login Ontwerp

Google, Facebook en Apple worden niet de hoofdidentiteit van TeleTypTel. Ze zijn alleen gekoppelde aanmeldmethoden.

```text
Google/Facebook/Apple account
  -> login identity
  -> TeleTypTel account_id
  -> XMPP identity
```

Dus:

```text
Google sub: 109283746...
Facebook id: 123456789...
Apple sub: 000123.abc...

TeleTypTel:
  account_id = tt_42
  xmpp_jid = famtie@localhost
```

### Technische Flow

Voor web, Android en iOS gebruiken we dezelfde basis:

```text
1. Gebruiker kiest "Doorgaan met Google/Facebook/Apple".
2. Browser/app opent de provider login.
3. Provider stuurt terug naar TeleTypTel redirect_uri met code en state.
4. TeleTypTel backend wisselt code om voor tokens.
5. Backend valideert identity token of provider-profiel.
6. Backend zoekt of maakt account_id.
7. Backend geeft TeleTypTel sessie terug aan de client.
8. Client krijgt interne XMPP-config van TeleTypTel.
```

Belangrijk: token-uitwisseling gebeurt op de server, niet volledig in JavaScript.

De praktische provider-registratie staat apart in
[SOCIAL_LOGIN_PROVIDER_SETUP.md](SOCIAL_LOGIN_PROVIDER_SETUP.md).

### Google

Google gebruikt OpenID Connect bovenop OAuth 2.0.

Opslaan in `account_identities`:

```text
type = google
identifier = sub uit Google ID token
email = email claim
verified = email_verified claim
```

Gebruik:

- `sub` is de stabiele Google gebruikers-ID.
- `email` is handig voor profiel en herstel, maar mag niet de primaire sleutel zijn.
- `state` en PKCE gebruiken tegen CSRF en code-interceptie.

### Facebook

Facebook Login werkt via OAuth 2.0. Facebook levert meestal een Facebook user id en, als toegestaan, een e-mailadres.

Opslaan in `account_identities`:

```text
type = facebook
identifier = Facebook user id
email = email uit Facebook Graph API, indien beschikbaar
```

Gebruik:

- Facebook user id is de koppeling.
- E-mail kan ontbreken of niet geverifieerd zijn.
- Facebook Login mag alleen aanmelden of koppelen, niet de TeleTypTel-accountnaam bepalen.

### Apple

Sign in with Apple gebruikt OpenID Connect-achtige tokens en kan een verborgen relay-mail leveren.

Opslaan in `account_identities`:

```text
type = apple
identifier = sub uit Apple identity token
email = echte of private relay e-mail
```

Gebruik:

- `sub` is de stabiele Apple gebruikers-ID per app/team.
- E-mail kan een private relay-adres zijn.
- Naam wordt vaak alleen bij eerste toestemming geleverd, dus direct opslaan.

### Account Koppelen

Een bestaande gebruiker kan later extra login-methoden koppelen:

```text
Profiel -> Gekoppelde accounts
  Telefoonnummer bevestigd
  E-mail bevestigd
  Google gekoppeld
  Facebook gekoppeld
  Apple gekoppeld
```

Koppelen mag alleen als de gebruiker al is ingelogd.

### Nieuwe Account Via Social Login

Als iemand via Google/Facebook/Apple binnenkomt, blijft de provider alleen een
aanmeldmethode. De XMPP-JID wordt apart gekozen of gekoppeld.

```text
1. Lees provider-id en e-mailadres.
2. Als provider-id al gekoppeld is: gebruik bestaande account_id en JID.
3. Als provider-e-mail geverifieerd is en al aan een TeleTypTel-account hangt:
   koppel de provider aan dat bestaande account en behoud dezelfde JID.
4. Anders: stel een vrije lokale JID voor op basis van de e-mail-localpart.
5. Als de gewenste JID bezet is: bied localpart1, localpart2, ... aan.
6. Als gebruiker toch dezelfde JID wil: bevestig eigenaarschap via het
   eerder gekoppelde e-mailadres voordat de provider wordt gekoppeld.
```

### Verificatiecode Voor Gekoppelde Identiteiten

Als een gewenste JID al bestaat, mag een nieuwe loginmethode die JID alleen
overnemen of eraan gekoppeld worden na bewijs van eigenaarschap.

```text
1. Server zoekt het bestaande TeleTypTel-account bij de JID.
2. Server zoekt het eerder geverifieerde e-mailadres van dat account.
3. Server stuurt een 6-cijferige code naar dat adres.
4. Gebruiker voert de code in.
5. Bij geldige code wordt Google/Facebook/Apple/e-mail gekoppeld aan dezelfde account_id.
```

Regels:

- codes zijn 6 cijfers;
- codes zijn maximaal 10 minuten geldig;
- codes worden alleen gehasht opgeslagen;
- maximaal 5 pogingen per code;
- zonder geverifieerd bestaand e-mailadres wordt geen JID overgenomen.

### Twee-Factor Authenticatie

Voor beta en productie krijgt elk account een security-profiel:

```text
account_id
two_factor_enabled
two_factor_method = email_code / authenticator / passkey
two_factor_secret
recovery_email
```

Start met `authenticator` via TOTP QR-code voor telefoon-apps zoals Google
Authenticator, Microsoft Authenticator, Apple Passwords of 1Password.
`email_code` blijft bruikbaar voor e-mailverificatie en fallback. Passkeys
kunnen later erbij. 2FA wordt
gevraagd bij:

- nieuw apparaat;
- koppelen van Google/Facebook/Apple;
- wijzigen van wachtwoord of herstel-e-mail;
- overnemen van een bestaande JID.

Voor lokale ontwikkeling:

```text
famtie@freedom.nl via Google -> famtie@localhost
famtie@freedom.nl via Google, maar famtie bezet -> famtie1@localhost
geverifieerde bestaande e-mail -> behoud bestaande JID
```

Voor productie:

```text
social login -> account_id -> localpart@teletyptel.nl
```

### Beveiligingsregels

- Gebruik Authorization Code Flow met PKCE.
- Gebruik `state` voor CSRF-bescherming.
- Valideer issuer, audience, expiry en signature van ID tokens.
- Sla provider access tokens niet op tenzij echt nodig.
- Maak TeleTypTel sessies zelf, los van provider-sessies.
- Laat gebruiker gekoppelde accounts kunnen verwijderen.
- Vereis minimaal een herstelmethode: e-mail of telefoonnummer.

### UI

Startscherm:

```text
Telefoonnummer of e-mail
Wachtwoord

[Aanmelden]
[Nieuwe gebruiker]

[Doorgaan met Google]
[Doorgaan met Facebook]
[Doorgaan met Apple]
```

Instellingen/profiel:

```text
Gekoppelde accounts
  Google: gekoppeld / koppelen
  Facebook: gekoppeld / koppelen
  Apple: gekoppeld / koppelen
```

## XMPP/XEP Mapping Voor Login-Identiteiten

XMPP heeft niet een specifieke XEP met de naam "Google account", "Facebook account" of "Apple account". Die accounts vallen onder de algemene OAuth/OpenID Connect wereld.

Wel zijn er XMPP-specificaties die hierbij aansluiten:

### XEP-0493: OAuth Client Login

XEP-0493 is de belangrijkste moderne XMPP-koppeling voor OAuth.

Gebruik:

```text
XMPP-client krijgt toegang tot een XMPP-account zonder het gewone wachtwoord te kennen.
```

Dit past vooral bij:

- OAuth/OIDC voor XMPP-login
- SSO via een identity provider
- OAUTHBEARER SASL
- beheerbare/revokebare clienttoegang

Belangrijk onderscheid:

```text
XEP-0493:
  OAuth gebruiken om toegang tot een XMPP-account te geven.

TeleTypTel social login:
  Google/Facebook/Apple gebruiken om een TeleTypTel account_id te vinden.
```

Voor TeleTypTel kunnen we XEP-0493 later gebruiken als de XMPP-server zelf OAuth/OIDC ondersteunt. Voor de eerste implementatie blijft social login waarschijnlijk een TeleTypTel-backendfunctie bovenop XMPP.

### XEP-0388: Extensible SASL Profile

XEP-0388 hoort bij moderne SASL-authenticatie in XMPP.

Gebruik:

```text
Server biedt moderne SASL-mechanismen aan.
Client kiest mechanisme zoals SCRAM of OAUTHBEARER.
```

Voor OAuth-login is vooral `OAUTHBEARER` relevant. Dat mechanisme komt uit OAuth/SASL-specificaties, terwijl XEP-0493 beschrijft hoe XMPP dit netjes gebruikt.

### XEP-0494: Client Access Management

Bij OAuth hoort ook beheer:

```text
Welke apps hebben toegang?
Kan de gebruiker toegang intrekken?
```

XEP-0493 verwijst naar Client Access Management voor het beheren en intrekken van autorisaties.

### XEP-0077: In-Band Registration

XEP-0077 is voor accountregistratie via XMPP.

Gebruik:

```text
Client vraagt server om een nieuw XMPP-account te maken.
```

Dit is niet hetzelfde als Google/Facebook/Apple login, maar wel relevant voor:

- nieuwe lokale XMPP-gebruiker maken
- eerste accountregistratie
- mogelijk captcha of serverpolicy

### XEP-0070: Verifying HTTP Requests via XMPP

XEP-0070 is eerder de omgekeerde richting:

```text
Een website kan via XMPP controleren of iemand eigenaar is van een XMPP-account.
```

Dit is handig voor "Login with XMPP", maar niet direct voor "Login with Google".

## Conclusie Voor TeleTypTel

Voor TeleTypTel is de juiste aanpak:

```text
Korte termijn:
  Google/Facebook/Apple login in TeleTypTel backend.
  Backend koppelt provider-id aan account_id.
  Backend levert interne XMPP-config aan client.

Latere XMPP-native stap:
  XEP-0493 gebruiken wanneer onze XMPP-server OAuth/OIDC ondersteunt.
  OAUTHBEARER/SASL inzetten voor XMPP-login zonder wachtwoord.
```

Dus:

```text
Google/Facebook/Apple account
  -> geen eigen XEP per provider
  -> wel mogelijk via OAuth/OIDC
  -> XMPP-kant: XEP-0493 + SASL/OAUTHBEARER
```

## Open Vragen

- Wordt telefoonnummer direct verplicht, of eerst optioneel?
- Is e-mail in Alpha/Beta voldoende als primaire login?
- Moet `localpart` uit e-mail komen, of altijd een gegenereerde accountnaam zijn?
- Hoe gaan we dubbele e-mails/telefoonnummers voorkomen?
- Moet `account_id` een UUID worden?
- Moet XMPP-accountnaam privacyvriendelijk zijn, bijvoorbeeld `u-12345@teletyptel.nl` in plaats van `famtie@teletyptel.nl`?

## Aanbevolen Besluit

Voor de korte termijn:

```text
Login primair:
  e-mail + wachtwoord

Intern lokaal:
  localpart@email -> localpart@localhost

UI:
  geen JID tonen aan gewone gebruiker
```

Voor de volgende stap:

```text
Telefoonnummer toevoegen als primaire contactidentiteit.
E-mail blijft voor login en wachtwoordherstel.
XMPP blijft volledig intern.
```

Dit geeft WhatsApp-achtig gemak, maar met een open XMPP-basis.
