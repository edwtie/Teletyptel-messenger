<dialog id="staffActionDialog" aria-labelledby="staffActionTitle">
  <div class="section-heading"><h2 id="staffActionTitle">Staffaccount beheren</h2><button id="closeStaffAction" class="secondary" type="button" autofocus>Sluiten</button></div>
  <p id="staffActionSummary" class="privacy-note"></p>
  <ul id="staffActionTargets" hidden></ul>
  <p id="staffActionStatus" class="status" role="status" aria-live="polite"></p>
  <form id="staffActionForm" class="plan-form">
    <fieldset id="staffCreateFields" class="plan-form">
      <legend>Nieuw staffaccount</legend>
      <label>Naam <input id="staffCreateName" maxlength="120" required></label>
      <label>E-mailadres <input id="staffCreateEmail" type="email" maxlength="255" autocomplete="off" required></label>
      <label>Nieuw staffwachtwoord <input id="staffCreatePassword" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
    </fieldset>
    <label>Jouw eigen beheerwachtwoord <input id="staffConfirmPassword" type="password" autocomplete="current-password" required></label>
    <label class="checkbox-label"><input id="staffActionConfirm" type="checkbox" required>Ik bevestig de hierboven getoonde actie.</label>
    <button id="saveStaffAction" type="submit">Bevestigen</button>
  </form>
</dialog>
