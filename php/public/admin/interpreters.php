<?php
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
?>
<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tolkenbeheer · TeleTypTel</title><link rel="stylesheet" href="../tolk/tolk.css?v=20261026-interpreter"></head>
<body><header><a href="./">← Adminpaneel</a><h1>Tolkenbeheer</h1></header><main>
<section><h2>Eigen tolken</h2><p>Gebruikers melden zich met hun bestaande Messenger-account aan bij de tolkwerkplek. Controleer hun bevoegdheid voordat je hen goedkeurt. Een tolk krijgt geen admin-, dossier- of geschiedenistoegang.</p><button id="refresh" type="button">Verversen</button><p id="status" role="status"></p><div id="interpreters" class="cards"></div></section>
<section><h2>Tolkcontact</h2><p>Nog niet gekoppeld. Er worden geen aanvragen naar Tolkcontact gestuurd. Technische aansluitgegevens zijn nog nodig.</p><button disabled>Externe koppeling niet beschikbaar</button></section>
</main><script src="interpreters.js?v=20261026-interpreter"></script></body></html>
