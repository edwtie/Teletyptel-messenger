# Concept — toegankelijkheidsinformatie TeleTypTel

**NIET PUBLICEREN ZONDER REVIEW.** Dit is een voorstel, geen afgegeven conformiteitsverklaring. Vul de scope en verantwoordelijke in en controleer de tekst juridisch en technisch vóór publicatie. Gebruik voor een overheidsklant diens toepasselijke verklaringsproces; neem geen status A/B over uit dit document.

## Over de dienst

TeleTypTel is een communicatieplatform van Tiedragon voor chat en gesprekken met realtime tekst, beeld en geluid. Het platform bevat mogelijkheden voor het aanvragen van een tolk. Beschikbaarheid verschilt per versie, configuratie en aangesloten dienst.

Verantwoordelijke juridische entiteit: **[invullen en controleren]**.

Deze informatie betreft: **[webadres, appnamen, versies, klantconfiguratie en onderzochte functies invullen]**.

Datum van vaststelling/publicatie: **[invullen na goedkeuring]**.

## Onderzoek en huidige status

Op 4 november 2026 is een interne broncode- en testnulmeting uitgevoerd op de ontwikkelversie. Daarbij zijn geïsoleerde browser- en protocoltests gebruikt. Dit was geen volledige onafhankelijke toegankelijkheidsaudit van alle schermen, apparaten en externe verbindingen.

**Volledige conformiteit met WCAG, EN 301 549 of toepasselijke wettelijke eisen is nog niet aangetoond.** De juridische toepasselijkheid en eventuele dienstenuitzondering moeten per aanbieder en toepassing worden bevestigd.

## Voorzieningen

De onderzochte software bevat realtime tekst, visuele oproepacties, labels op veel bedieningsknoppen en gescheiden eigen/ontvangen tekst tijdens Total Conversation. Foutmeldingen en herhaalacties zijn op verschillende plaatsen aanwezig. Deze voorzieningen zijn nog niet in iedere situatie met hulpmiddelen en gebruikers getest.

## Bekende beperkingen

- Contrast en toetsenbordfocus zijn niet overal voldoende; bij vernieuwende lijsten kan de gebruikerspositie verloren gaan.
- Tekst uit de aparte TC-invoer wordt nog niet in alle onderzochte paden aan de tolk doorgegeven. Grote tekstwijzigingen en verbindingsstoringen kunnen de tekstaflevering belemmeren.
- Screenreadergebruik, achtergrondoproepen en alle fysieke apparaten zijn niet volledig gevalideerd.
- Automatische vertaling kan fouten bevatten of onbeschikbaar zijn. Afhankelijk van de instelling wordt tekst door een externe vertaaldienst verwerkt; raadpleeg de privacy-informatie.
- Externe SIP-/tolkdienstkoppelingen en noodcommunicatie zijn niet algemeen productiegevalideerd. Gebruik deze ontwikkelversie niet als enige middel om noodhulp te bereiken.

Controleer deze lijst tegen de daadwerkelijk aangeboden release: na herstel mag een beperking pas worden verwijderd na een hertest.

## Een probleem melden

Neem voor toegankelijkheidsvragen contact op via **info@tiedragon.nl**. Vermeld zo mogelijk app-/browserversie, apparaat, gebruikte hulpmiddelen en welke handeling niet lukte. Stuur geen wachtwoorden, medische documenten of volledige privégesprekken mee.

Alternatieve toegankelijke contactroute: **[vaststellen en testen]**.

Reactietermijn, opvolging en escalatie: **[door Tiedragon te bevestigen; geen termijn toegezegd in dit concept]**.

## Verbetering en actualisatie

Tiedragon stelt op basis van de nulmeting een herstel- en gebruikerstestplanning vast. Publiceer hier de goedgekeurde mijlpalen, laatste hertest en link naar de voor de aangeboden versie relevante onderzoeksresultaten. Herzie de verklaring bij wezenlijke wijzigingen in functionaliteit, thema, platform of externe diensten.

Interne onderbouwing: `docs/ACCESSIBILITY_CONFORMITY_AUDIT_2026-11-04.md` en `docs/ACCESSIBILITY_IMPLEMENTATION_PLAN_2026-11-04.md`. Deze concepttekst vervangt geen volledige sectorspecifieke dienstinformatie, privacyverklaring of wettelijke beoordeling.
