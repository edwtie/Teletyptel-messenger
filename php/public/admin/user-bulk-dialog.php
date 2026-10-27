<dialog id="userBulkDialog" aria-labelledby="userBulkTitle">
  <div class="section-heading"><h2 id="userBulkTitle">Actie bevestigen</h2><button id="closeUserBulk" class="secondary" type="button" autofocus>Annuleren</button></div>
  <p id="userBulkSummary"></p>
  <ul id="userBulkTargets"></ul>
  <p class="privacy-note">Blokkeren en de prullenbak weigeren de TeleTypTel-webaanmelding en trekken bestaande websessies in. Rechtstreekse of al geopende ejabberd/XMPP-verbindingen worden hiermee niet geblokkeerd. Herstellen bewaart een eerdere blokkade. Oude sessies worden nooit hersteld.</p>
  <p class="small">Er wordt niets definitief gewist: facturen, aanmeldingen, documenten en historie blijven bewaard. Automatische facturatie en geplande overgangen worden bij verwerking tegengehouden zolang een account geblokkeerd of in de prullenbak is.</p>
  <form id="userBulkConfirmForm" class="plan-form">
    <label>Je beheerwachtwoord <input id="userBulkPassword" type="password" autocomplete="current-password" required maxlength="72"></label>
    <label class="checkbox-label"><input id="userBulkConfirm" type="checkbox" required>Ik bevestig de actie voor alle hierboven vermelde gebruikers.</label>
    <button id="userBulkConfirmButton" type="submit">Actie uitvoeren</button>
    <p id="userBulkStatus" class="status" role="status" aria-live="polite"></p>
  </form>
</dialog>
