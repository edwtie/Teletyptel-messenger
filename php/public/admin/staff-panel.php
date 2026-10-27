<div id="staffView" class="admin-view" role="region" aria-labelledby="staffTitle" hidden>
  <div class="page-heading">
    <div><h2 id="staffTitle" class="heading-icon" tabindex="-1"><svg class="icon" aria-hidden="true" focusable="false"><use href="#admin-icon-users"/></svg>Staffbeheer</h2><p class="small">Medewerkers zoeken, accounts beheren en inzagerechten instellen.</p></div>
    <button id="newStaffButton" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-add"/></svg>Staffaccount aanmaken</button>
  </div>
  <section id="staffListPanel">
    <div class="user-list-heading">
      <h3 class="heading-icon"><svg class="icon" aria-hidden="true"><use href="#admin-icon-users"/></svg>Medewerkers</h3>
      <p id="staffCount" class="small"></p>
    </div>
    <form id="staffFilterForm" class="user-search">
      <label>Medewerker zoeken<input id="staffSearch" type="search" placeholder="Naam of e-mailadres" maxlength="255" autocomplete="off"></label>
      <label><span class="user-filter-label"><svg class="icon" aria-hidden="true"><use href="#admin-icon-filter"/></svg>Toon</span><select id="staffFilter"><option value="">Alle staffaccounts</option><option value="active">Actief</option><option value="blocked">Geblokkeerd</option></select></label>
      <button type="submit"><svg class="icon" aria-hidden="true"><use href="#admin-icon-search"/></svg>Zoeken</button>
    </form>
    <p id="staffStatus" class="status" role="status" aria-live="polite"></p>
    <p class="small">Vink medewerkers aan om ze te beheren. Selectie geldt voor deze pagina.</p>
    <div id="staffBulkBar" class="user-bulk-bar" role="group" aria-label="Acties voor geselecteerde medewerkers" hidden>
      <span id="staffSelectionCount" role="status" aria-live="polite">0 geselecteerd</span>
      <div class="user-bulk-actions">
        <button id="staffBulkBlock" class="secondary" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-lock"/></svg>Blokkeren</button>
        <button id="staffBulkUnblock" class="secondary" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-unlock"/></svg>Deblokkeren</button>
        <button id="staffBulkGrant" class="secondary" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-eye"/></svg>Inzage toekennen</button>
        <button id="staffBulkRevoke" class="secondary user-danger" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-eye-off"/></svg>Inzage intrekken</button>
        <button id="staffBulkClear" class="secondary" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-close"/></svg>Selectie wissen</button>
      </div>
    </div>
    <div class="table-wrap"><table class="user-list-table"><thead><tr><th><input id="selectAllStaff" type="checkbox" aria-label="Alle medewerkers op deze pagina selecteren" disabled></th><th>Medewerker</th><th>Status</th><th>Inzagerecht</th><th>Actie</th></tr></thead><tbody id="staffRows"></tbody></table></div>
    <div class="pagination"><button id="staffPrevious" class="secondary" type="button" disabled>Vorige staffleden</button><span id="staffPageInfo"></span><button id="staffNext" class="secondary" type="button" disabled>Volgende staffleden</button></div>
  </section>
  <div id="staffDetailsPanel" class="admin-view" role="region" aria-labelledby="staffDetailsTitle" hidden>
    <div class="page-heading">
      <h3 id="staffDetailsTitle" tabindex="-1">Medewerker beheren</h3>
      <button id="closeStaffDetails" class="secondary" type="button"><svg class="icon" aria-hidden="true"><use href="#admin-icon-restore"/></svg>Terug naar medewerkers</button>
    </div>
    <section>
      <h3 class="heading-icon"><svg class="icon" aria-hidden="true"><use href="#admin-icon-users"/></svg>Medewerkergegevens</h3>
      <dl id="staffDetailsFields" class="user-fields"></dl>
    </section>
    <section>
      <h3>Account en inzagerecht</h3>
      <p class="small">Blokkeren trekt inzagerechten en bestaande sessies in. Na deblokkeren moet inzage opnieuw worden toegekend.</p>
      <div class="toolbar">
        <button id="staffDetailStatus" class="secondary" type="button"></button>
        <button id="staffDetailAccess" class="secondary" type="button"></button>
      </div>
    </section>
  </div>
</div>
