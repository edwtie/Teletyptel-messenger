const adminManagement = (() => {
  let context;
  let generation = 0;
  let modalGeneration = 0;
  let invoicePage = 1;
  let defaults = {};
  let settingsRevision = "";
  let invoice = null;
  let requestKey = "";
  let recurringAccount = null;
  let recurringRule = null;
  let recurringPlanVersion = null;
  let busy = false;
  const element = (identifier) => document.getElementById(identifier);
  const value = (identifier) => element(identifier).value;
  const checked = (identifier) => element(identifier).checked;
  const today = () => new Date().toISOString().slice(0, 10);
  const amount = (cents) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(cents) / 100);
  const post = (body) => context.fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const get = (parameters) => context.fetch("api.php?" + new URLSearchParams(parameters));
  const live = (request) => request === modalGeneration && context.active();
  const invoiceFields = ["Account", "Recipient", "Customer", "Address", "Email", "Description", "Service", "Due", "Quantity", "Unit", "Vat", "PaidOn", "Reference"];
  const recurringFields = ["Recipient", "Customer", "Address", "Email", "Vat", "Next"];
  const billingFields = ["CompanyName", "Address", "VatId", "CompanyNumber", "AgbCode", "Iban", "DefaultVat", "TaxNote", "PaymentDays"];
  const databaseFields = ["Host", "Port", "Database", "Username", "Password"];

  function clearSecrets() {
    for (const identifier of ["settingsOwnerPassword", "settingsMysqlPassword", "settingsXmppPassword", "settingsTranslationApiKey"]) element(identifier).value = "";
    element("settingsTranslationClear").checked = false;
    element("settingsMysqlClear").checked = false;
    element("settingsXmppClear").checked = false;
  }

  function clearModals() {
    modalGeneration += 1;
    busy = false;
    invoice = null;
    recurringAccount = null;
    recurringRule = null;
    recurringPlanVersion = null;
    requestKey = "";
    for (const identifier of ["invoiceDialog", "recurringDialog"]) {
      if (element(identifier).open) element(identifier).close();
    }
    for (const field of invoiceFields) element("invoice" + field).value = "";
    for (const field of recurringFields) element("recurring" + field).value = "";
    for (const identifier of ["invoiceIssueConfirm", "recurringEnabled", "recurringAutoIssue", "recurringConfirm"]) element(identifier).checked = false;
    for (const identifier of ["invoiceSummary", "invoiceStatus", "recurringStatus", "recurringPlan"]) element(identifier).replaceChildren();
    for (const identifier of ["invoiceIssuePanel", "invoicePaidForm", "invoicePrintLink", "recurringForm"]) element(identifier).hidden = true;
    element("invoicePrintLink").removeAttribute("href");
    element("invoiceTitle").textContent = "Factuur";
    element("recurringTitle").textContent = "Periodieke facturatie";
    for (const identifier of ["saveInvoiceButton", "issueInvoiceButton", "markInvoicePaidButton", "saveRecurringButton", "pauseRecurringButton"]) element(identifier).disabled = false;
  }

  function cancel() {
    generation += 1;
    clearModals();
    clearSecrets();
  }

  function clear() {
    cancel();
    settingsRevision = "";
    invoicePage = 1;
    defaults = {};
    for (const identifier of ["invoiceRows", "invoicePageInfo", "recurringRows", "billingStatus", "billingWorkerStatus", "settingsStatus"]) element(identifier).replaceChildren();
    for (const field of billingFields) element("settings" + field).value = "";
    for (const group of ["Mysql", "Xmpp"]) {
      for (const field of databaseFields) element("settings" + group + field).value = "";
      element("settings" + group + "Hint").textContent = "";
    }
    element("settingsSiteName").value = "";
    element("settingsPublicUrl").value = "";
    element("settingsForm").hidden = true;
  }

  function workerText(worker) {
    if (!worker?.lastRun) return "Automatische verwerking nog niet gecontroleerd. De Windows-taak TeleTypTel Admin Worker moet draaien.";
    const recent = Date.now() - Date.parse(worker.lastRun) < 5 * 60 * 1000;
    return (worker.ok && recent ? "Automatische verwerking actief." : "Let op: automatische verwerking gestopt, verouderd of mislukt.")
      + " Laatste uitvoering: " + worker.lastRun + " (UTC). Windows-gebruiker moet aangemeld zijn en WAMP moet draaien.";
  }

  async function loadBilling() {
    if (!context.active()) return;
    const request = ++generation;
    element("billingStatus").textContent = "Facturatie laden…";
    try {
      const data = await get({ action: "billing", page: String(invoicePage) });
      if (request !== generation || !context.active()) return;
      defaults = data.defaults || {};
      const escape = context.escape;
      const labels = { draft: "Concept", issued: "Definitief", paid: "Betaald" };
      element("invoiceRows").innerHTML = data.invoices.items.map((entry) => '<tr><td>' + escape(entry.invoice_number || "Concept")
        + '</td><td>' + escape(entry.customer_name) + '<div class="small">' + (entry.recipient_type === "insurer" ? "Zorgverzekeraar" : "Klant")
        + '</div></td><td>' + escape(entry.account_id) + '</td><td>' + escape(labels[entry.status] || entry.status)
        + '</td><td>' + escape(entry.service_on) + '</td><td>' + escape(entry.due_on) + '</td><td>' + escape(amount(entry.total_cents))
        + '</td><td><button type="button" data-open-invoice="' + escape(entry.id) + '">Bekijken</button></td></tr>').join("")
        || '<tr><td colspan="8">Nog geen facturen.</td></tr>';
      element("invoiceRows").querySelectorAll("[data-open-invoice]").forEach((button) => button.addEventListener("click", () => openInvoice(button.dataset.openInvoice)));
      element("recurringRows").innerHTML = (data.recurring || []).map((entry) => '<tr><td>' + escape(entry.customer_name)
        + '</td><td>' + escape(entry.account_id) + '</td><td>' + escape(entry.plan_id) + '</td><td>' + escape(entry.next_on)
        + '</td><td>' + (Number(entry.enabled) ? "Ja" : "Gepauzeerd") + '</td><td>' + (Number(entry.auto_issue) ? "Definitief" : "Concept")
        + '</td><td>' + escape(entry.last_error || "—") + '</td><td><button type="button" data-open-recurring="' + escape(entry.account_id)
        + '">Instellen</button></td></tr>').join("") || '<tr><td colspan="8">Geen automatische facturatieafspraken.</td></tr>';
      element("recurringRows").querySelectorAll("[data-open-recurring]").forEach((button) => button.addEventListener("click", () => recurringFor(button.dataset.openRecurring)));
      invoicePage = data.invoices.page;
      context.paginate("invoice", data.invoices);
      element("billingWorkerStatus").textContent = workerText(data.worker);
      element("billingStatus").textContent = data.invoices.total + " facturen. Bedragen inclusief btw.";
    } catch (error) {
      if (request === generation) element("billingStatus").textContent = error.message;
    }
  }

  function renderSettings(settings) {
    settingsRevision = settings.revision || "";
    element("settingsSiteName").value = settings.general?.siteName || "";
    element("settingsPublicUrl").value = settings.general?.publicUrl || "";
    element("settingsTranslationEnabled").checked = settings.translation?.enabled === true;
    element("settingsTranslationDaily").value = settings.translation?.dailyCharacters ?? 50000;
    element("settingsTranslationGlobal").value = settings.translation?.globalDailyCharacters ?? 500000;
    element("settingsTranslationHint").textContent = settings.translation?.apiKeyConfigured
      ? "API-sleutel ingesteld; deze wordt niet teruggestuurd naar de browser." : "Nog geen API-sleutel ingesteld.";
    for (const field of billingFields) {
      const key = field.charAt(0).toLowerCase() + field.slice(1);
      element("settings" + field).value = settings.billing?.[key] ?? (field === "PaymentDays" ? 14 : "");
    }
    for (const [group, name] of [["Mysql", "mysql"], ["Xmpp", "xmpp_mysql"]]) {
      const database = settings[name] || {};
      for (const field of databaseFields) {
        element("settings" + group + field).value = field === "Password" ? "" : database[field.toLowerCase()] ?? "";
        element("settings" + group + field).disabled = Boolean(database.environmentManaged);
      }
      element("settings" + group + "Clear").disabled = Boolean(database.environmentManaged);
      element("settings" + group + "Hint").textContent = database.environmentManaged ? "Beheerd via omgevingsvariabelen; hier niet wijzigbaar."
        : (database.passwordConfigured ? "Wachtwoord ingesteld. " : "Geen wachtwoord ingesteld. ") + "Leeg laten behoudt het bestaande wachtwoord.";
    }
    clearSecrets();
    element("settingsForm").hidden = false;
  }

  async function loadSettings() {
    const request = ++generation;
    element("settingsForm").hidden = true;
    if (!context.active() || !context.owner()) {
      element("settingsStatus").textContent = "Alleen de eigenaar kan algemene instellingen beheren.";
      return;
    }
    element("settingsStatus").textContent = "Instellingen laden…";
    try {
      const data = await get({ action: "settings" });
      if (request !== generation || !context.active()) return;
      renderSettings(data.settings);
      element("settingsStatus").textContent = "Wachtwoorden worden nooit teruggelezen.";
    } catch (error) {
      if (request === generation) element("settingsStatus").textContent = error.message;
    }
  }

  async function saveSettings(testOnly = false) {
    if (!context.active() || !context.owner() || element("saveSettingsButton").disabled) return;
    const request = generation;
    const body = { action: testOnly ? "test_settings" : "save_settings", revision: settingsRevision,
      ownerPassword: value("settingsOwnerPassword"), general: { siteName: value("settingsSiteName"), publicUrl: value("settingsPublicUrl") }, billing: {} };
    for (const field of billingFields) body.billing[field.charAt(0).toLowerCase() + field.slice(1)] = value("settings" + field);
    body.translation = { enabled: checked("settingsTranslationEnabled"), apiKey: value("settingsTranslationApiKey"),
      clearApiKey: checked("settingsTranslationClear"), dailyCharacters: value("settingsTranslationDaily"),
      globalDailyCharacters: value("settingsTranslationGlobal") };
    for (const [group, name] of [["Mysql", "mysql"], ["Xmpp", "xmpp_mysql"]]) {
      body[name] = { clearPassword: checked("settings" + group + "Clear") };
      for (const field of databaseFields) body[name][field.toLowerCase()] = value("settings" + group + field);
    }
    element("saveSettingsButton").disabled = true;
    element("testSettingsButton").disabled = true;
    clearSecrets();
    try {
      const data = await post(body);
      if (request !== generation || !context.active()) return;
      if (!testOnly) renderSettings(data.settings);
      element("settingsStatus").textContent = testOnly
        ? "Databaseverbinding getest; nog niet opgeslagen. Nieuwe wachtwoorden en sleutels zijn gewist: vul ze opnieuw in vóór opslaan. Google is niet getest."
        : "Instellingen opgeslagen en databaseverbinding getest. Google is niet getest. Geen accounts of databasegebruikers gewijzigd.";
    } catch (error) {
      if (request === generation) element("settingsStatus").textContent = error.message + " Vul wachtwoorden zo nodig opnieuw in.";
    } finally {
      element("saveSettingsButton").disabled = false;
      element("testSettingsButton").disabled = false;
    }
  }

  function fillInvoice(entry) {
    invoice = entry;
    const fields = { Account: entry.account_id, Recipient: entry.recipient_type, Customer: entry.customer_name,
      Address: entry.customer_address, Email: entry.customer_email, Description: entry.description,
      Service: entry.service_on, Due: entry.due_on, Quantity: entry.quantity, Unit: (Number(entry.unit_cents) / 100).toFixed(2),
      Vat: (Number(entry.vat_basis_points) / 100).toFixed(2) };
    for (const [field, content] of Object.entries(fields)) element("invoice" + field).value = content ?? "";
    element("invoiceAccount").readOnly = true;
    element("invoiceForm").hidden = entry.status !== "draft";
    element("invoiceIssuePanel").hidden = entry.status !== "draft";
    element("invoiceIssueConfirm").checked = false;
    element("invoicePaidForm").hidden = entry.status !== "issued";
    element("invoicePaidOn").value = today();
    element("invoicePaidOn").max = today();
    element("invoiceTitle").textContent = entry.invoice_number || "Conceptfactuur";
    element("invoiceSummary").textContent = entry.customer_name + " · " + entry.description + " · Excl. btw: "
      + amount(entry.subtotal_cents) + " · Btw: " + amount(entry.vat_cents) + " · Totaal: " + amount(entry.total_cents)
      + (entry.supplier?.agbCode ? " · AGB-code: " + entry.supplier.agbCode : "")
      + (entry.status === "paid" ? " · Betaald op " + entry.paid_on : "");
    element("invoicePrintLink").href = "invoice.php?id=" + encodeURIComponent(entry.id);
    element("invoicePrintLink").hidden = false;
  }

  async function invoiceFor(accountId = "") {
    if (!context.active()) return;
    clearModals();
    const request = modalGeneration;
    requestKey = crypto.randomUUID();
    element("invoiceDialog").showModal();
    element("invoiceForm").hidden = true;
    try {
      const data = accountId ? await get({ action: "billing_account", accountId }) : { defaults };
      if (!live(request)) return;
      const settings = data.defaults || {};
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + Number(settings.paymentDays || 14));
      element("invoiceAccount").value = accountId;
      element("invoiceAccount").readOnly = Boolean(accountId);
      element("invoiceRecipient").value = "customer";
      element("invoiceCustomer").value = data.account?.display_name || "";
      element("invoiceEmail").value = data.account?.email || "";
      element("invoiceQuantity").value = "1";
      element("invoiceVat").value = settings.defaultVat || "";
      element("invoiceService").value = today();
      element("invoiceDue").value = due.toISOString().slice(0, 10);
      element("invoiceForm").hidden = false;
    } catch (error) { if (live(request)) element("invoiceStatus").textContent = error.message; }
  }

  async function openInvoice(identifier) {
    if (!context.active()) return;
    clearModals();
    const request = modalGeneration;
    element("invoiceDialog").showModal();
    element("invoiceForm").hidden = true;
    try {
      const data = await get({ action: "invoice", id: identifier });
      if (!live(request)) return;
      requestKey = data.invoice.request_key;
      fillInvoice(data.invoice);
    } catch (error) { if (live(request)) element("invoiceStatus").textContent = error.message; }
  }

  async function invoiceAction(action) {
    if (!context.active() || busy) return;
    if (action !== "save_invoice" && !invoice) return;
    if (action === "issue_invoice" && !checked("invoiceIssueConfirm")) {
      element("invoiceStatus").textContent = "Controleer en bevestig de factuur eerst.";
      return;
    }
    const request = modalGeneration;
    const body = { action, id: invoice?.id || "", version: Number(invoice?.version || 0) };
    if (action === "save_invoice") Object.assign(body, { requestKey, accountId: value("invoiceAccount"), recipientType: value("invoiceRecipient"),
      customerName: value("invoiceCustomer"), customerAddress: value("invoiceAddress"), customerEmail: value("invoiceEmail"),
      description: value("invoiceDescription"), serviceOn: value("invoiceService"), dueOn: value("invoiceDue"),
      quantity: Number(value("invoiceQuantity")), unitPrice: value("invoiceUnit"), vat: value("invoiceVat") });
    if (action === "issue_invoice") body.confirmed = true;
    if (action === "invoice_paid") Object.assign(body, { paidOn: value("invoicePaidOn"), reference: value("invoiceReference") });
    busy = true;
    try {
      const data = await post(body);
      if (!live(request)) return;
      fillInvoice(data.invoice);
      element("invoiceStatus").textContent = action === "save_invoice" ? "Concept opgeslagen. Controleer dit vóór definitief maken."
        : action === "issue_invoice" ? "Factuur definitief gemaakt; niet automatisch verzonden." : "Betaling administratief geregistreerd.";
      if (context.page() === "billing") await loadBilling();
    } catch (error) { if (live(request)) element("invoiceStatus").textContent = error.message; }
    finally { if (live(request)) busy = false; }
  }

  async function recurringFor(accountId) {
    if (!context.active()) return;
    clearModals();
    const request = modalGeneration;
    element("recurringDialog").showModal();
    try {
      const data = await get({ action: "billing_account", accountId });
      if (!live(request)) return;
      recurringAccount = data.account;
      recurringRule = data.recurring;
      const rule = data.recurring;
      const plan = data.plans.find((entry) => entry.plan_id === data.account.subscription_plan);
      recurringPlanVersion = Number(plan?.version || 0);
      element("recurringPlan").textContent = (data.account.display_name || accountId) + " · " + accountId + " · Huidig plan: "
        + (plan?.name || data.account.subscription_plan) + " · " + (plan?.price_cents == null ? "Prijs niet ingesteld" : amount(plan.price_cents))
        + " excl. btw / " + (plan?.billing_period || "—");
      element("recurringRecipient").value = rule?.recipient_type || "customer";
      element("recurringCustomer").value = rule?.customer_name || data.account.display_name || "";
      element("recurringAddress").value = rule?.customer_address || "";
      element("recurringEmail").value = rule?.customer_email || data.account.email || "";
      element("recurringVat").value = rule ? (Number(rule.vat_basis_points) / 100).toFixed(2) : data.defaults?.defaultVat || "";
      element("recurringNext").value = rule?.next_on || today();
      element("recurringNext").min = today();
      element("recurringEnabled").checked = Number(rule?.enabled) === 1;
      element("recurringAutoIssue").checked = Number(rule?.auto_issue) === 1;
      element("pauseRecurringButton").hidden = !rule || Number(rule.enabled) !== 1;
      element("recurringForm").hidden = false;
      element("recurringStatus").textContent = rule?.last_error || "Alleen activeren na een overeengekomen facturatieafspraak.";
    } catch (error) { if (live(request)) element("recurringStatus").textContent = error.message; }
  }

  async function saveRecurring(pause = false) {
    if (!context.active() || !recurringAccount || busy) return;
    if (!pause && !checked("recurringConfirm")) {
      element("recurringStatus").textContent = "Bevestig eerst de facturatieafspraak.";
      return;
    }
    const request = modalGeneration;
    busy = true;
    try {
      const data = await post({ action: "save_recurring", accountId: recurringAccount.account_id,
        confirmed: checked("recurringConfirm"), expectedPlan: recurringAccount.subscription_plan, expectedPlanVersion: recurringPlanVersion,
        version: recurringRule ? Number(recurringRule.version) : null, enabled: !pause && checked("recurringEnabled"),
        autoIssue: checked("recurringAutoIssue"), recipientType: value("recurringRecipient"),
        customerName: value("recurringCustomer"), customerAddress: value("recurringAddress"), customerEmail: value("recurringEmail"),
        vat: value("recurringVat"), nextOn: value("recurringNext") });
      if (!live(request)) return;
      recurringRule = data.recurring;
      element("recurringEnabled").checked = Number(data.recurring.enabled) === 1;
      element("pauseRecurringButton").hidden = Number(data.recurring.enabled) !== 1;
      element("recurringConfirm").checked = false;
      element("recurringStatus").textContent = pause ? "Automatische facturatie gepauzeerd." : "Facturatieafspraak opgeslagen.";
      if (context.page() === "billing") await loadBilling();
    } catch (error) { if (live(request)) element("recurringStatus").textContent = error.message; }
    finally { if (live(request)) busy = false; }
  }

  function init(options) {
    context = options;
    element("newInvoiceButton").addEventListener("click", () => invoiceFor());
    element("invoicePrevious").addEventListener("click", () => { invoicePage -= 1; loadBilling(); });
    element("invoiceNext").addEventListener("click", () => { invoicePage += 1; loadBilling(); });
    element("closeInvoiceButton").addEventListener("click", clearModals);
    element("closeRecurringButton").addEventListener("click", clearModals);
    for (const identifier of ["invoiceDialog", "recurringDialog"]) element(identifier).addEventListener("cancel", (event) => { event.preventDefault(); clearModals(); });
    element("invoiceForm").addEventListener("submit", (event) => { event.preventDefault(); invoiceAction("save_invoice"); });
    element("invoiceForm").addEventListener("input", () => { element("invoiceIssuePanel").hidden = true; element("invoiceIssueConfirm").checked = false; });
    element("issueInvoiceButton").addEventListener("click", () => invoiceAction("issue_invoice"));
    element("invoicePaidForm").addEventListener("submit", (event) => { event.preventDefault(); invoiceAction("invoice_paid"); });
    element("recurringForm").addEventListener("submit", (event) => { event.preventDefault(); saveRecurring(); });
    element("pauseRecurringButton").addEventListener("click", () => saveRecurring(true));
    element("settingsForm").addEventListener("submit", (event) => { event.preventDefault(); saveSettings(); });
    element("testSettingsButton").addEventListener("click", () => saveSettings(true));
  }

  return { init, loadBilling, loadSettings, invoiceFor, recurringFor, cancel, clear, workerText };
})();
