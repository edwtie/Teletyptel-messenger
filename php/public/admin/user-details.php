<div id="userDetailsPanel" class="admin-view" role="region" aria-labelledby="userDetailsTitle" hidden>
  <div class="page-heading">
    <div><h2 id="userDetailsTitle" tabindex="-1">Gebruiker beheren</h2><p class="small">Gegevens, accountinstellingen en abonnement van deze gebruiker.</p></div>
    <button id="closeUserDetails" class="secondary" type="button">Terug naar gebruikerslijst</button>
  </div>
  <p id="userDetailsStatus" class="status" role="status" aria-live="polite"></p>
  <section>
    <h3>Gebruikersgegevens</h3>
    <dl id="userFields" class="user-fields"></dl>
    <details><summary>Gekoppelde aanmeldaccounts</summary><div id="userIdentities"></div></details>
  </section>
  <div id="userAdministration" class="user-management-grid" hidden>
    <section>
      <h3>Account beheren</h3>
      <form id="userAccountForm" class="plan-form">
        <label>Accountstatus <select id="userAccountStatus" disabled><option value="active">Actief</option><option value="trial">Proef</option><option value="suspended">Opgeschort</option><option value="closed">Gesloten</option></select></label>
        <p class="small">Administratieve status; deze blokkeert niet automatisch de toegang tot ejabberd.</p>
        <label>Beheernotitie <textarea id="userAdminNote" maxlength="1000" rows="4" disabled></textarea></label>
        <p class="small">Gebruik deze notitie niet voor BSN of medische gegevens.</p>
        <button id="saveUserAccount" type="submit" disabled>Wijzigingen opslaan</button>
        <p id="userAccountSaveStatus" class="status" role="status" aria-live="polite"></p>
      </form>
    </section>
    <section>
      <h3>Abonnement en facturatie</h3>
      <p id="userSubscriptionSummary"></p>
      <div class="plan-form">
        <button id="userSubscriptionButton" class="secondary" type="button" disabled>Abonnement wijzigen</button>
        <button id="userInvoiceButton" class="secondary" type="button" disabled>Factuur maken</button>
        <button id="userRecurringButton" class="secondary" type="button" disabled>Periodieke facturatie</button>
      </div>
    </section>
  </div>
  <section>
    <details id="userChatLog">
      <summary>Gesprekslog bekijken</summary>
      <p class="privacy-note">Alleen opgeslagen gespreksmetadata: met wie, privé of groep, wanneer en hoeveel. Geen berichtinhoud, bijlagen, locaties, transcripties of wachtwoorden. Deze inzage wordt vastgelegd in de beheerlog.</p>
      <p class="small">De historie bevat alleen gegevens die TeleTypTel al heeft opgeslagen. Tijdstippen en datumfilters zijn UTC. Niet-opgeslagen of verwijderde gesprekken kunnen ontbreken; dit is geen live-volgsysteem.</p>
      <form id="activityFilterForm" class="filters">
        <label>Vanaf <input id="activityFrom" type="date"></label>
        <label>Tot en met <input id="activityTo" type="date"></label>
        <label>Gesprek <select id="activityKind"><option value="">Alle gesprekken</option><option value="contact">Privé</option><option value="group">Groepen</option></select></label>
        <label>Gesprekspartner / groeps-JID <input id="activityPeer" maxlength="255" autocomplete="off" placeholder="Alle gesprekspartners"></label>
        <button type="submit">Filteren</button><button id="clearActivityFilters" class="secondary" type="button">Filters wissen</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Gesprekspartner / groep</th><th>Soort</th><th>Berichten</th><th>Uit / in</th><th>Oproepen</th><th>Eerste activiteit</th><th>Laatste activiteit</th></tr></thead><tbody id="userConversations"></tbody></table></div>
      <p id="conversationLimitHint" class="small" hidden>De 100 recentste gesprekken worden getoond. Verfijn de filters voor oudere gesprekken.</p>
      <h3>Activiteiten</h3>
      <div class="table-wrap"><table><thead><tr><th>Tijdstip (UTC)</th><th>Gesprekspartner / groep</th><th>Gebeurtenis</th><th>Richting</th><th>Status</th><th>Duur</th></tr></thead><tbody id="userActivity"></tbody></table></div>
      <div class="pagination"><button id="activityPrevious" class="secondary" type="button" disabled>Vorige activiteiten</button><span id="activityPageInfo" class="small"></span><button id="activityNext" class="secondary" type="button" disabled>Volgende activiteiten</button></div>
    </details>
  </section>
</div>
