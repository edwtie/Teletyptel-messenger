# Standaarden en compliance voor grote klanten

Dit document beschrijft welke standaarden en kaders relevant zijn voor
TeleTypTel bij grotere organisaties. Het is geen certificeringsclaim. Het is een
orientatie voor architectuur, verkoop, aanbesteding, security review en
gesprekken met providers.

## Samenvatting

TeleTypTel hoort in grote klantomgevingen langs vier lijnen beoordeeld te
worden:

1. Communicatiestandaarden: XMPP, WebRTC, SIP en real-time text.
2. Toegankelijkheid: EN 301 549 en WCAG als praktische meetlat.
3. Privacy en beveiliging: AVG/GDPR, TLS, serverbeheer en dataminimalisatie.
4. Continuiteit: eigen serverkeuze, back-up, monitoring en exitstrategie.

## XMPP

XMPP is de hoofdstandaard voor berichten, aanwezigheid, contactlijsten,
groepsgesprekken en uitbreidingen. Voor TeleTypTel is XMPP belangrijk omdat het
decentrale servers en providerkeuze mogelijk maakt.

Voor grote klanten is ejabberd de gekozen serverrichting. De reden is
stabiliteit: ejabberd is gebouwd op Erlang/OTP, kan gedistribueerd draaien en is
bedoeld voor grote XMPP-deployments. Prosody en Openfire blijven nuttig als
extra interop-test, maar de providerroute start met ejabberd.

Gebruik in TeleTypTel:

- chat en live tekst;
- contactlijst en aanwezigheid;
- groepsgesprekken;
- bestanden en metadata;
- server discovery;
- account- en providerintegratie;
- toekomstige koppeling met mobiele clients.

Voor grote klanten betekent dit dat TeleTypTel niet afhankelijk hoeft te zijn van
een centrale consumentendienst. Een provider of organisatie kan eigen
infrastructuur beheren of een beheerde XMPP-dienst inkopen.

## WebRTC

WebRTC is de praktische browserlaag voor audio, video en datakanalen. Het past
goed bij TeleTypTel omdat moderne browsers camera, microfoon en peer-to-peer
media al ondersteunen.

Gebruik in TeleTypTel:

- audio en video in de browser;
- camera- en microfoonkeuze;
- mute, camera aan/uit en volume;
- datachannel-richting voor live tekst tijdens Total Conversation;
- STUN/TURN voor bereikbaarheid achter NAT/firewalls, bij voorkeur ontdekt via
  XMPP server discovery.

Voor productie is TURN belangrijk. Zonder goede TURN-server kunnen gesprekken
falen bij bedrijfsnetwerken, mobiele netwerken of strenge firewalls.

## SIP en telefonie

SIP is de bekende standaard voor VoIP, telefonieplatforms en providerkoppelingen.
Voor TeleTypTel is SIP vooral een gateway-onderwerp, niet iets dat de browser UI
zelf moet dragen.

De gekozen serverrichting sluit daarop aan: ejabberd beschikt over
SIP-ondersteuning via `ejabberd_sip` en `mod_sip`. Dat maakt ejabberd interessant
voor providerlabs waar XMPP/Jingle, WebRTC, STUN/TURN en SIP naast elkaar getest
moeten worden. DNS, TLS, poorten, NAT/firewall en interop met bijvoorbeeld
Asterisk, Kamailio of een providerplatform moeten wel apart worden gevalideerd.

Mogelijke SIP-routes:

- koppeling met Asterisk, Kamailio of providertelefonie;
- koppeling met relay-diensten;
- koppeling met bestaande klantcontact- of telefonieomgevingen;
- toekomstige route richting noodcommunicatie of publieke telefonie waar dat
  formeel is toegestaan.

Architectuurkeuze:

- de TeleTypTel client blijft gericht op XMPP/WebRTC en Total Conversation;
- SIP hoort in een server- of gatewaylaag;
- de gateway moet media, identiteit, locatie en real-time text zorgvuldig
  vertalen zonder informatieverlies;
- end-to-end encryptie en SIP-gateways zijn lastig te combineren, omdat een
  gateway vaak media of metadata moet verwerken.

## Real-time text

Real-time text is essentieel voor toegankelijke gesprekken. Het verschil met
gewone chat is dat tekst zichtbaar wordt terwijl iemand typt. Dat is belangrijk
voor doven, slechthorenden, tolken, relay-diensten en noodsituaties waarin
spraak niet goed werkt.

Relevante richting:

- live tekst in normale chat;
- live tekst tijdens audio/video;
- tekst synchroon met gesprek en eventueel locatie;
- gateway-onderzoek richting telefonie en noodcommunicatie.

Voor SIP/telefonie-interoperabiliteit zijn RTP/T.140-routes relevant. Voor
browserinteroperabiliteit zijn WebRTC-datakanalen relevant. TeleTypTel moet deze
werelden niet door elkaar halen, maar wel kunnen verbinden via een nette
gatewaylaag.

## Europese toegankelijkheidskaders

### EN 301 549

EN 301 549 is de Europese toegankelijkheidsstandaard voor ICT-producten en
-diensten. De standaard is relevant voor websites, mobiele apps, software,
documenten, hardware en communicatiefuncties.

Voor TeleTypTel is EN 301 549 belangrijk omdat het niet alleen over webpagina's
gaat, maar ook over software, tweerichtingscommunicatie, real-time text,
captioning, statusinformatie en bedienbaarheid.

Praktisch betekent dit:

- toegankelijkheid moet vanaf het ontwerp worden meegenomen;
- live tekst moet goed zichtbaar, snel en begrijpelijk zijn;
- knoppen en status moeten ook zonder kleur alleen begrijpelijk zijn;
- toetsenbordbediening en focus moeten kloppen;
- audio/videofuncties moeten alternatieven en duidelijke bediening hebben;
- documentatie en supportinformatie moeten toegankelijk zijn.

### WCAG 2.2 AA

WCAG 2.2 AA is een praktische web- en appmeetlat voor de TeleTypTel UI. Grote
klanten zullen vaak vragen om AA-conformiteit of een toegankelijkheidsrapport.

Belangrijke aandachtspunten:

- voldoende contrast;
- zichtbare focus;
- toetsenbordbediening;
- labels en foutmeldingen;
- voorspelbare navigatie;
- consistente hulp;
- geen informatie alleen via kleur;
- bruikbaarheid bij zoom en op mobiele schermen.

Let op: WCAG 2.2 is een W3C Recommendation, maar de geharmoniseerde Europese
EN 301 549-versie kan juridisch nog naar een andere WCAG-versie verwijzen. Voor
productontwikkeling is WCAG 2.2 AA verstandig als doel, terwijl juridische
conformiteit per aanbesteding of markt moet worden gecontroleerd.

### European Accessibility Act en Web Accessibility Directive

De EU Web Accessibility Directive is belangrijk voor publieke websites en apps.
De European Accessibility Act is breder en raakt producten en diensten in de
markt. Grote klanten kunnen daardoor toegankelijkheid als eis opnemen in
inkoop, contracten en productacceptatie.

TeleTypTel moet daarom voorbereid zijn op:

- toegankelijkheidsverklaring;
- testresultaten en auditrapport;
- ondersteuning voor hulptechnologie;
- documentatie voor beheerders en eindgebruikers;
- aantoonbare correcties na toegankelijkheidstests.

## Privacy en beveiliging

Voor grote klanten moet TeleTypTel privacy en beveiliging niet alleen als code
zien, maar als beheerproces.

Belangrijke punten:

- AVG/GDPR-grondslag voor accounts, profielen, gesprekken en locatie;
- dataminimalisatie: bewaar niet meer dan nodig;
- bewaartermijnen voor chatgeschiedenis en bestanden;
- versleutelde transportlaag met TLS;
- aparte opslag voor productieconfiguratie en secrets;
- logging zonder wachtwoorden, tokens of gevoelige inhoud;
- beheerrollen voor support en serverbeheer;
- incidentproces en back-upstrategie.

Locatie delen vraagt extra voorzichtigheid. Locatie moet expliciet,
tijdbegrensd en zichtbaar zijn voor de gebruiker.

## Noodcommunicatie en NG112

TeleTypTel kan technisch richting noodcommunicatie groeien, maar mag niet zonder
certificering claimen dat het 112/911 vervangt.

Voor toekomstige NG112-achtige routes zijn relevant:

- betrouwbare identiteit;
- betrouwbare locatie;
- audio, video en live tekst;
- routering naar de juiste meldkamer of gateway;
- logging en juridische bewijsbaarheid;
- fallback wanneer media of netwerk faalt.

In klantgesprekken moet dit worden gepresenteerd als onderzoeks- en
gatewayrichting, niet als huidige officiele noodcommunicatiedienst.

## Aanbevolen klanttraject

Voor grote klanten is een realistisch traject:

1. Workshop: doelgroep, juridische context en bestaande systemen.
2. Architectuurontwerp: XMPP-server, webclient, TURN, opslag en beheer.
3. Pilot: beperkte gebruikersgroep met logging en support.
4. Toegankelijkheidstest: WCAG/EN 301 549 review.
5. Security review: secrets, TLS, accounts, logging en beheer.
6. Interoperabiliteitstest: XMPP, WebRTC, eventueel SIP-gateway.
7. Acceptatie: beheerhandleiding, supportproces en SLA.
8. Productie: monitoring, back-up, incidentproces en releasebeheer.

## Bronnen

- ejabberd platform overview: https://ejabberd.im/
- ejabberd SIP listener documentation:
  https://docs.ejabberd.im/archive/26.04/listen/
- ETSI EN 301 549: https://www.etsi.org/human-factors-accessibility/en-301-549-v3-the-harmonized-european-standard-for-ict-accessibility
- European Commission Web Accessibility Directive standards:
  https://digital-strategy.ec.europa.eu/en/policies/web-accessibility-directive-standards-and-harmonisation
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C WCAG 2.2 AA conformance:
  https://www.w3.org/WAI/WCAG2AA-Conformance
- RFC 3261 SIP: https://www.rfc-editor.org/rfc/rfc3261
- RFC 4103 RTP Payload for Text Conversation:
  https://www.rfc-editor.org/rfc/rfc4103
- RFC 9071 RTP-Mixer Formatting of Multiparty Real-Time Text:
  https://www.rfc-editor.org/rfc/rfc9071
- RFC 8865 T.140 over WebRTC Data Channels:
  https://www.rfc-editor.org/rfc/rfc8865
- European Commission accessibility standardisation:
  https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/accessibility-standardisation_en
