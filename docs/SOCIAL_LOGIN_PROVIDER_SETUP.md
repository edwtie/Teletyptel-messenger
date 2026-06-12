# Social Login Provider Setup

TeleTypTel gebruikt social login als aanmeldlaag bovenop het eigen accountmodel.
De XMPP-identiteit blijft apart: een Google-, Facebook-, Apple- of
Auth0-account wordt gekoppeld aan een TeleTypTel `account_id`, en dat account
krijgt daarna een XMPP JID op de gekozen server.

Dit voorkomt dat `famtie@freedom.nl` per ongeluk als XMPP-server `freedom.nl`
wordt behandeld wanneer de echte XMPP-server `localhost` of `teletyptel.nl` is.

## Basisregel

```text
login identity  -> account_id -> xmpp identity
Google/Facebook/Apple/Auth0/telefoon/e-mail -> tt_... -> localpart@xmpp-domain
```

Voor productie:

```text
https://teletyptel.nl/api/auth/{provider}/start
https://teletyptel.nl/api/auth/{provider}/callback
```

Voor lokale ontwikkeling:

```text
http://localhost/api/auth/{provider}/start
http://localhost/api/auth/{provider}/callback
```

Gebruik `localhost` voor lokale Google-tests. Een losse interne hostnaam zoals
`teletyptel` wordt door Google meestal niet geaccepteerd als OAuth redirect.
Facebook en Apple zijn strenger en vragen vaak een publiek of gevalideerd
domein.

## Provider Configuratie

Secrets horen niet in Git. Zet ze in serverconfiguratie, `.env` of een secret
store buiten de repository.

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TELETYPTEL_OAUTH_GOOGLE_REDIRECT_URI=

FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
TELETYPTEL_OAUTH_FACEBOOK_REDIRECT_URI=

APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
TELETYPTEL_OAUTH_APPLE_REDIRECT_URI=

TELETYPTEL_OAUTH_AUTH0_DOMAIN=
TELETYPTEL_OAUTH_AUTH0_CLIENT_ID=
TELETYPTEL_OAUTH_AUTH0_CLIENT_SECRET=
TELETYPTEL_OAUTH_AUTH0_REDIRECT_URI=
```

De PHP-backend leest dezelfde waarden ook uit `php/config.php` onder `oauth`.
De webinstaller `php/public/install.php` kan deze IDs en secrets tijdens
installatie invullen voor Google, Facebook, Apple en Auth0. Laat
`php/config.example.php` leeg of met placeholders; echte secrets horen niet in
Git.

De backend gebruikt Authorization Code Flow met PKCE:

```text
1. Maak state + code_verifier.
2. Stuur gebruiker naar provider authorization endpoint.
3. Provider stuurt code terug naar callback.
4. Backend controleert state.
5. Backend wisselt code + code_verifier om voor tokens.
6. Backend valideert ID token of profielrespons.
7. Backend koppelt provider-id aan account_id.
8. Client krijgt TeleTypTel sessie en XMPP-config terug.
```

Geimplementeerde backendroutes:

```text
/api/auth/google/start
/api/auth/google/callback
/api/auth/facebook/start
/api/auth/facebook/callback
/api/auth/apple/start
/api/auth/apple/callback
/api/auth/auth0/start
/api/auth/auth0/callback
```

Als providerconfiguratie ontbreekt, geven deze routes bewust
`provider_not_configured` terug in plaats van half te starten.

## Google

1. Open Google Cloud Console.
2. Maak of kies een project.
3. Configureer OAuth consent screen.
4. Maak OAuth Client ID met type `Web application`.
5. Voeg redirect URI toe:

```text
https://teletyptel.nl/api/auth/google/callback
```

Voor de huidige dev-omgeving moet deze exacte URI ook in Google Cloud Console staan:

```text
https://dev.teletyptel.nl/api/auth/google/callback
```

Voor lokale tests eventueel:

```text
http://localhost/api/auth/google/callback
```

Google vergelijkt de redirect URI exact. Een verschil tussen `http` en `https`,
een andere hostnaam of een extra slash veroorzaakt `redirect_uri_mismatch` of
de melding dat de app niet voldoet aan het OAuth 2.0-beleid.

Gebruik in TeleTypTel:

```text
provider = google
identifier = sub uit Google ID token
email = email claim
email_verified = email_verified claim
```

Gebruik `sub` als stabiele sleutel, niet het e-mailadres.

## Facebook

1. Open Meta for Developers.
2. Maak een app.
3. Voeg Facebook Login toe.
4. Stel Valid OAuth Redirect URIs in:

```text
https://teletyptel.nl/api/auth/facebook/callback
```

5. Vraag alleen minimale rechten:

```text
public_profile
email
```

Gebruik in TeleTypTel:

```text
provider = facebook
identifier = Facebook user id
email = Graph API email, indien aanwezig
```

Facebook kan geen e-mail leveren. De user id blijft daarom de primaire
koppeling.

## Apple

1. Gebruik een Apple Developer account.
2. Zet Sign in with Apple aan op de App ID.
3. Maak een Services ID voor web-login.
4. Configureer Domains and Subdomains:

```text
teletyptel.nl
```

5. Configureer Return URLs:

```text
https://teletyptel.nl/api/auth/apple/callback
```

6. Maak een client secret JWT buiten Git en bewaar:

```text
APPLE_CLIENT_ID
APPLE_CLIENT_SECRET
```

Gebruik in TeleTypTel:

```text
provider = apple
identifier = sub uit Apple identity token
email = echte e-mail of private relay e-mail
```

Apple geeft de naam vaak alleen bij de eerste toestemming. Sla die dus meteen
op als profielvoorstel.

## Auth0

1. Maak een Auth0 Application met type Regular Web Application.
2. Noteer je tenant domain, bijvoorbeeld:

```text
your-tenant.eu.auth0.com
```

3. Configureer Allowed Callback URLs:

```text
https://teletyptel.nl/api/auth/auth0/callback
```

Voor lokale tests eventueel:

```text
http://localhost/api/auth/auth0/callback
```

4. Gebruik minimale scopes:

```text
openid email profile
```

Gebruik in TeleTypTel:

```text
provider = auth0
identifier = sub uit Auth0 /userinfo of ID token
email = email claim
```

## XMPP-Kant

Er bestaat geen XEP met de naam "Google Login", "Facebook Login" of "Apple
Login". XMPP gebruikt hiervoor algemenere bouwstenen:

| Protocol | Rol |
| --- | --- |
| XEP-0493 | OAuth Client Login voor XMPP-accounttoegang zonder wachtwoord delen. |
| RFC 7628 | SASL `OAUTHBEARER`, gebruikt door XEP-0493. |
| XEP-0388 | Moderne SASL2-profielen en extensies. |
| XEP-0494 | Client Access Management: lijst en intrekken van clients/grants. |
| XEP-0077 | Accountregistratie, wachtwoord wijzigen en account verwijderen. |
| XEP-0070 | Oudere XMPP-verificatie van HTTP-verzoeken; niet hetzelfde als social login. |

Voor TeleTypTel betekent dit:

```text
Social login bij TeleTypTel backend:
  Google/Facebook/Apple -> TeleTypTel sessie -> interne XMPP login

Later, wanneer de XMPP-server OAuth ondersteunt:
  XEP-0493 -> SASL OAUTHBEARER -> XMPP bind
  XEP-0494 -> gebruiker kan gekoppelde clients/grants intrekken
```

## Databasekoppeling

Minimaal nodig:

```text
accounts
  id
  created_at
  status

account_identities
  account_id
  provider
  provider_subject
  email
  email_verified
  linked_at

account_xmpp
  account_id
  jid
  xmpp_domain
  xmpp_host
  xmpp_websocket
```

Unieke sleutel:

```text
provider + provider_subject
```

Niet uniek genoeg:

```text
email
```

E-mailadressen kunnen wijzigen, verborgen zijn of via Apple relay lopen.

## Gebruikerservaring

Beginscherm:

```text
Aanmelden met telefoonnummer
Aanmelden met e-mail
Doorgaan met Google
Doorgaan met Apple
Doorgaan met Facebook
```

Na aanmelden:

```text
Profiel -> gekoppelde accounts
Instellingen -> XMPP-server / apparaten / camera / microfoon
Beveiliging -> actieve clients en toegang intrekken
```

`JID` is dus een technisch veld. In de normale UI gebruiken we `E-mail`,
`Telefoonnummer` of `Account`.
