<div id="billingView" class="admin-view" role="region" aria-labelledby="billingTitle" hidden>
  <div class="page-heading">
    <div><h2 id="billingTitle" tabindex="-1">Facturatie</h2><p class="small">Facturen aan klanten of zorgverzekeraars, en automatische periodieke facturatie.</p></div>
    <button id="newInvoiceButton" type="button">Conceptfactuur toevoegen</button>
  </div>
  <p class="privacy-note">Geen automatische incasso, e-mailverzending of VECOZO-declaraties. Controleer ontvanger, btw en contractafspraken vóór definitief maken. Lege bedrijfsgegevens blokkeren definitieve facturen. Voor een factuur aan een zorgverzekeraar is ook de AGB-code van de zorgaanbieder verplicht.</p>
  <p id="billingStatus" class="status" role="status"></p>
  <p id="billingWorkerStatus" class="status"></p>
  <section>
    <h3>Facturen</h3>
    <div class="table-wrap"><table><thead><tr><th>Nummer</th><th>Ontvanger</th><th>Klantaccount</th><th>Status</th><th>Leverdatum</th><th>Vervaldatum</th><th>Totaal</th><th>Actie</th></tr></thead><tbody id="invoiceRows"></tbody></table></div>
    <div class="pagination"><button id="invoicePrevious" type="button" class="secondary">Vorige facturen</button><span id="invoicePageInfo"></span><button id="invoiceNext" type="button" class="secondary">Volgende facturen</button></div>
  </section>
  <section>
    <h3>Automatische facturatie</h3>
    <p class="small">Maak de afspraak bij Gebruikersbeheer → Beheren → Periodieke facturatie. De afgesproken planprijs en btw worden vastgelegd. Een gewijzigd plan of gewijzigde prijs vereist herbevestiging. Maximaal 100 afspraken worden hier getoond.</p>
    <div class="table-wrap"><table><thead><tr><th>Ontvanger</th><th>Klantaccount</th><th>Plan</th><th>Volgende datum</th><th>Actief</th><th>Uitvoer</th><th>Melding</th><th>Actie</th></tr></thead><tbody id="recurringRows"></tbody></table></div>
  </section>
</div>
<div id="settingsView" class="admin-view" role="region" aria-labelledby="settingsTitle" hidden>
  <div class="page-heading"><h2 id="settingsTitle" tabindex="-1">Algemene instellingen</h2></div>
  <p class="privacy-note">Alleen de eigenaar. Een nieuwe databaseverbinding wordt vóór opslaan getest. Dit migreert geen gegevens en verandert geen databasegebruikers, DNS, Apache, certificaten of ejabberd-serverconfiguratie.</p>
  <p id="settingsStatus" role="status" class="status"></p>
  <section>
    <form id="settingsForm" class="plan-form">
      <h3>Algemeen</h3>
      <label>Sitenaam <input id="settingsSiteName" maxlength="120"></label>
      <label>Publiek siteadres (HTTPS) <input id="settingsPublicUrl" type="url" placeholder="https://dev.teletyptel.nl" maxlength="255"></label>
      <p class="small">Dit is het geregistreerde siteadres; domein, webserver en certificaat moeten afzonderlijk kloppen.</p>
      <fieldset><legend>App-database</legend>
        <label>Hostnaam <input id="settingsMysqlHost" required></label>
        <label>Poort <input id="settingsMysqlPort" type="number" min="1" max="65535" required></label>
        <label>Databasenaam <input id="settingsMysqlDatabase" required></label>
        <label>Databasegebruiker <input id="settingsMysqlUsername" required autocomplete="off"></label>
        <label>Nieuw databasewachtwoord <input id="settingsMysqlPassword" type="password" autocomplete="new-password"></label>
        <label class="checkbox-label"><input id="settingsMysqlClear" type="checkbox">Databasewachtwoord expliciet leeg maken</label>
        <p id="settingsMysqlHint" class="small"></p>
      </fieldset>
      <fieldset><legend>XMPP-databaseverbinding van PHP</legend>
        <label>Hostnaam <input id="settingsXmppHost" required></label>
        <label>Poort <input id="settingsXmppPort" type="number" min="1" max="65535" required></label>
        <label>Databasenaam <input id="settingsXmppDatabase" required></label>
        <label>Databasegebruiker <input id="settingsXmppUsername" required autocomplete="off"></label>
        <label>Nieuw databasewachtwoord <input id="settingsXmppPassword" type="password" autocomplete="new-password"></label>
        <label class="checkbox-label"><input id="settingsXmppClear" type="checkbox">Databasewachtwoord expliciet leeg maken</label>
        <p id="settingsXmppHint" class="small"></p>
      </fieldset>
      <fieldset>
        <legend>Berichtvertaling — Google Cloud Translation</legend>
        <p class="small">Optionele serverkoppeling met Google Cloud Translation Basic (v2), niet Gemini. Tekst gaat alleen na toestemming naar Google. Er kunnen gebruikskosten ontstaan. Beperk de sleutel in Google Cloud tot deze API en het server-IP; stel daar ook quota in.</p>
        <label class="checkbox-label"><input id="settingsTranslationEnabled" type="checkbox">Berichtvertaling inschakelen</label>
        <label>Nieuwe API-sleutel <input id="settingsTranslationApiKey" type="password" maxlength="512" autocomplete="new-password" spellcheck="false"></label>
        <label class="checkbox-label"><input id="settingsTranslationClear" type="checkbox">Opgeslagen API-sleutel verwijderen</label>
        <p id="settingsTranslationHint" class="small"></p>
        <label>Maximum tekens per gebruiker per dag <input id="settingsTranslationDaily" type="number" min="1000" max="1000000" value="50000" required></label>
        <label>Maximum tekens voor de hele server per dag <input id="settingsTranslationGlobal" type="number" min="1000" max="10000000" value="500000" required></label>
        <p class="small">Daarnaast maximaal 30 vertaalverzoeken per minuut per gebruiker en 5.000 tekens per bericht. Live RTT vereist aparte toestemming van de gebruiker en deelt deze limieten: elk concept telt opnieuw mee en kan extra kosten geven. De verbindingstest hieronder test alleen de databases; de Google-sleutel wordt pas gebruikt wanneer een gebruiker een vertaling aanvraagt. Leeg laten behoudt de bestaande sleutel. Een verwijderde sleutel vereist dat vertalen uit staat.</p>
      </fieldset>
      <h3>Bedrijf en btw</h3>
      <p class="small">Mag leeg blijven. Definitieve facturen vereisen gecontroleerde bedrijfs- en btw-gegevens. Valuta: EUR. Voer geen BSN of medische gegevens in.</p>
      <label>Bedrijfsnaam <input id="settingsCompanyName" maxlength="120"></label>
      <label>Volledig bedrijfsadres <textarea id="settingsAddress" maxlength="500"></textarea></label>
      <label>Btw-identificatienummer <input id="settingsVatId" maxlength="64"></label>
      <label>KvK-nummer <input id="settingsCompanyNumber" maxlength="64"></label>
      <label>AGB-code zorgaanbieder <input id="settingsAgbCode" type="text" inputmode="numeric" pattern="(?!00000000)[0-9]{8}" maxlength="8" autocomplete="off" aria-describedby="settingsAgbHint"></label>
      <p id="settingsAgbHint" class="small">Acht cijfers, inclusief eventuele voorloopnullen. Mag tijdens inrichting leeg blijven; verplicht bij definitief maken van facturen aan zorgverzekeraars, ook automatisch. Gebruik je eigen geregistreerde code. Alleen de schrijfwijze wordt gecontroleerd, niet de registratie bij Vektis.</p>
      <label>IBAN (optioneel) <input id="settingsIban" maxlength="64"></label>
      <label>Standaard btw-percentage <input id="settingsDefaultVat" inputmode="decimal" placeholder="Leeg = nog niet ingesteld"></label>
      <label>Btw-toelichting (bijvoorbeeld bij vrijstelling) <textarea id="settingsTaxNote" maxlength="500"></textarea></label>
      <label>Betaaltermijn in dagen <input id="settingsPaymentDays" type="number" min="1" max="365" value="14"></label>
      <h3>Bevestiging eigenaar</h3>
      <label>Huidig beheerwachtwoord <input id="settingsOwnerPassword" type="password" autocomplete="current-password" required></label>
      <div class="toolbar"><button id="testSettingsButton" class="secondary" type="button">Verbinding testen</button><button id="saveSettingsButton" type="submit">Testen en opslaan</button></div>
    </form>
  </section>
</div>
