<dialog id="invoiceDialog" aria-labelledby="invoiceTitle">
  <div class="section-heading"><h2 id="invoiceTitle">Factuur</h2><button id="closeInvoiceButton" class="secondary" type="button" autofocus>Sluiten</button></div>
  <p id="invoiceStatus" role="status" class="status"></p>
  <form id="invoiceForm" class="plan-form">
    <label>Klantaccount-ID <input id="invoiceAccount" maxlength="96" required></label>
    <label>Factuur aan <select id="invoiceRecipient"><option value="customer">Klant</option><option value="insurer">Zorgverzekeraar</option></select></label>
    <label>Naam ontvanger <input id="invoiceCustomer" maxlength="120" required></label>
    <label>Factuuradres ontvanger <textarea id="invoiceAddress" maxlength="500"></textarea></label>
    <label>E-mail ontvanger (geen automatische verzending) <input id="invoiceEmail" type="email" maxlength="255"></label>
    <label>Omschrijving <textarea id="invoiceDescription" maxlength="1000" required></textarea></label>
    <label>Leverdatum / begin periode <input id="invoiceService" type="date" required></label>
    <label>Vervaldatum <input id="invoiceDue" type="date" required></label>
    <label>Aantal <input id="invoiceQuantity" type="number" min="1" max="10000" value="1" required></label>
    <label>Eenheidsprijs exclusief btw (EUR) <input id="invoiceUnit" inputmode="decimal" required></label>
    <label>Btw-percentage <input id="invoiceVat" inputmode="decimal" required></label>
    <button id="saveInvoiceButton" type="submit">Concept opslaan</button>
  </form>
  <div id="invoiceSummary"></div>
  <div id="invoiceIssuePanel" class="plan-form" hidden>
    <label class="checkbox-label"><input id="invoiceIssueConfirm" type="checkbox">Ontvanger, bedrijfsgegevens, levering, btw en (bij een zorgverzekeraar) AGB-code zijn gecontroleerd. Definitieve inhoud kan niet meer worden bewerkt.</label>
    <button id="issueInvoiceButton" type="button">Definitief maken en nummer toekennen</button>
  </div>
  <form id="invoicePaidForm" class="plan-form" hidden>
    <h3>Betaling administratief registreren</h3>
    <label>Betaaldatum <input id="invoicePaidOn" type="date" required></label>
    <label>Betalingskenmerk <input id="invoiceReference" maxlength="128" required></label>
    <button id="markInvoicePaidButton" type="submit">Als betaald registreren</button>
  </form>
  <p><a id="invoicePrintLink" class="button-link secondary" href="invoice.php" target="_blank" rel="noopener" hidden>Afdrukken / opslaan als PDF</a></p>
</dialog>
<dialog id="recurringDialog" aria-labelledby="recurringTitle">
  <div class="section-heading"><h2 id="recurringTitle">Periodieke facturatie</h2><button id="closeRecurringButton" class="secondary" type="button" autofocus>Sluiten</button></div>
  <p id="recurringStatus" class="status" role="status"></p>
  <p id="recurringPlan"></p>
  <form id="recurringForm" class="plan-form" hidden>
    <label>Factuur aan <select id="recurringRecipient"><option value="customer">Klant</option><option value="insurer">Zorgverzekeraar</option></select></label>
    <label>Naam ontvanger <input id="recurringCustomer" maxlength="120" required></label>
    <label>Factuuradres ontvanger <textarea id="recurringAddress" maxlength="500" required></textarea></label>
    <label>E-mail ontvanger <input id="recurringEmail" type="email" maxlength="255"></label>
    <label>Btw-percentage <input id="recurringVat" inputmode="decimal" required></label>
    <label>Eerstvolgende factuurdatum (UTC) <input id="recurringNext" type="date" required></label>
    <label class="checkbox-label"><input id="recurringEnabled" type="checkbox">Automatische facturen bij elke maand-/jaarperiode</label>
    <label class="checkbox-label"><input id="recurringAutoIssue" type="checkbox">Ook automatisch definitief maken, alleen met volledige bedrijfsgegevens</label>
    <p class="small">Zonder dit tweede vinkje ontstaan conceptfacturen. Bij een zorgverzekeraar is de AGB-code bij Instellingen nodig voor definitieve facturen; zonder code blijft de factuur een concept. Geen automatische afschrijving of verzending. De factuurperiode loopt door; dit wijzigt geen toegangsrechten of administratieve einddatum van het account.</p>
    <label class="checkbox-label"><input id="recurringConfirm" type="checkbox" required>Ik bevestig de facturatieafspraak met deze klant / zorgverzekeraar.</label>
    <button id="saveRecurringButton" type="submit">Facturatieafspraak opslaan</button>
    <button id="pauseRecurringButton" type="button" class="secondary" hidden>Automatische facturatie pauzeren</button>
  </form>
</dialog>
