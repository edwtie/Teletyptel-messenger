<?php
header('Cache-Control: no-store, private');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
?>
<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gebarentolk · klantenservice</title><link rel="stylesheet" href="tolk.css?v=20261027-support-tc"><link rel="stylesheet" href="../support-call.css?v=20261027-close-all"><script src="../support-language.js?v=20261027-short-support" defer></script><script src="../support-call.js?v=20261027-secure-open" defer></script><script src="support.js?v=20261027-support-tc" defer></script></head>
<body><header><a href="./">← Tolkwerkplek</a><h1>Klantenservice · gebarentolk</h1></header><main><p>Je deelt beeld, geluid en live tekst met de bezoeker en de medewerker. Geen eerdere berichten, dossiers of opnames. Jouw tekst blijft alleen in de lopende oproep zichtbaar.</p><div id="supportInterpreterCall"></div><form id="supportInterpreterTextForm"><label>Jouw live tekst<textarea id="supportInterpreterText" maxlength="2000" rows="3"></textarea></label><button type="submit">Tekst afronden</button></form><p id="supportInterpreterError" role="status"></p></main></body></html>
