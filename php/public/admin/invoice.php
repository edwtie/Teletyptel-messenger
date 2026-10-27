<?php
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TeleTypTel factuur</title>
  <style>
    body { font: 16px/1.5 Arial, sans-serif; color: #17243a; margin: 32px auto; max-width: 900px; padding: 0 24px; }
    [hidden] { display: none !important; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin: 36px 0; }
    .address { white-space: pre-line; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; margin: 28px 0; }
    th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #c7d3e3; overflow-wrap: anywhere; }
    .total { font-size: 22px; text-align: right; }
    button, a { padding: 10px; }
    @media print { .controls { display: none; } body { margin: 0; max-width: none; } tr { break-inside: avoid; } }
    @media screen and (max-width: 600px) { .parties { grid-template-columns: 1fr; } table { font-size: 12px; } }
  </style>
</head>
<body>
  <div class="controls"><a href="./#facturatie">Naar beheer</a><button id="printButton" type="button" hidden>Afdrukken / PDF opslaan</button></div>
  <p id="status" role="status">Factuur laden…</p>
  <article id="document" hidden></article>
  <script>
    const output = document.getElementById("document");
    const status = document.getElementById("status");
    const printButton = document.getElementById("printButton");
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
    const money = (value) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value) / 100);
    async function loadInvoice() {
      try {
        const identifier = new URLSearchParams(window.location.search).get("id") || "";
        if (!/^[a-f0-9]{32}$/.test(identifier)) throw new Error("Ongeldige factuur.");
        const response = await fetch("api.php?" + new URLSearchParams({ action: "invoice", id: identifier }), { credentials: "same-origin", cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || "Log eerst in bij beheer.");
        const invoice = data.invoice;
        const supplier = invoice.supplier || {};
        const draft = invoice.status === "draft";
        output.innerHTML = '<h1>' + (draft ? "CONCEPT — geen definitieve factuur" : "Factuur " + escape(invoice.invoice_number)) + '</h1>'
          + '<p>Factuurdatum: ' + escape(invoice.issued_on || "Nog niet uitgegeven") + ' · Vervaldatum: ' + escape(invoice.due_on) + '</p>'
          + '<div class="parties"><div><h2>Van</h2><strong>' + escape(supplier.companyName || "Bedrijfsgegevens worden bij definitief maken vastgelegd")
          + '</strong><p class="address">' + escape(supplier.address) + '</p><p>Btw-ID: ' + escape(supplier.vatId)
          + '<br>KvK: ' + escape(supplier.companyNumber) + (supplier.agbCode ? '<br>AGB-code: ' + escape(supplier.agbCode) : "")
          + '</p></div><div><h2>Aan ' + (invoice.recipient_type === "insurer" ? "zorgverzekeraar" : "klant")
          + '</h2><strong>' + escape(invoice.customer_name) + '</strong><p class="address">' + escape(invoice.customer_address)
          + '</p><p>' + escape(invoice.customer_email) + '<br>Klantreferentie: ' + escape(invoice.account_id) + '</p></div></div>'
          + '<p>Leverdatum / begin periode: ' + escape(invoice.service_on) + '</p>'
          + '<table><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs excl. btw</th><th>Btw</th><th>Subtotaal excl. btw</th></tr></thead><tbody><tr><td class="address">'
          + escape(invoice.description) + '</td><td>' + Number(invoice.quantity) + '</td><td>' + money(invoice.unit_cents)
          + '</td><td>' + (Number(invoice.vat_basis_points) / 100).toFixed(2) + '%</td><td>' + money(invoice.subtotal_cents) + '</td></tr></tbody></table>'
          + '<p class="total">Btw: ' + money(invoice.vat_cents) + '<br><strong>Totaal: ' + money(invoice.total_cents) + '</strong></p>'
          + '<p class="address">' + escape(supplier.taxNote) + '</p>'
          + (supplier.iban ? '<p>IBAN: ' + escape(supplier.iban) + ' · Betalingskenmerk: ' + escape(invoice.invoice_number || "CONCEPT") + '</p>' : "")
          + (invoice.status === "paid" ? '<p>Betaald op ' + escape(invoice.paid_on) + ' · ' + escape(invoice.payment_reference) + '</p>' : "");
        output.hidden = false;
        printButton.hidden = false;
        status.textContent = draft ? "Concept: niet als definitieve factuur gebruiken." : "";
        document.title = invoice.invoice_number || "Conceptfactuur";
      } catch (error) { status.textContent = error.message; }
    }
    printButton.addEventListener("click", () => window.print());
    window.addEventListener("pagehide", () => { output.replaceChildren(); output.hidden = true; printButton.hidden = true; });
    window.addEventListener("pageshow", (event) => { if (event.persisted) loadInvoice(); });
    setTimeout(() => { output.replaceChildren(); output.hidden = true; printButton.hidden = true; status.textContent = "Ververs om de beheersessie opnieuw te controleren."; }, 30 * 60 * 1000);
    loadInvoice();
  </script>
</body>
</html>
