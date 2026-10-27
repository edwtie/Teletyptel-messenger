"use strict";
(async () => {
  const identifier = new URLSearchParams(location.search).get("call") || "";
  const input = document.getElementById("supportInterpreterText");
  const media = window.TeleTypTelSupportCall.mount({ container: document.getElementById("supportInterpreterCall"), input, interpreter: true, endpoint: "../api/support-call-interpreter.php", rtcEndpoint: "../api/rtc-config.php" });
  document.getElementById("supportInterpreterTextForm").addEventListener("submit", (event) => { event.preventDefault(); media.final(input.value); input.value = ""; });
  let accepted = false;
  try { accepted = sessionStorage.getItem("support-interpreter-accepted-" + identifier) === "yes"; sessionStorage.removeItem("support-interpreter-accepted-" + identifier); } catch {}
  try { await media.openInterpreter(identifier); if (accepted) await media.joinInterpreter(); }
  catch { document.getElementById("supportInterpreterError").textContent = "Deze oproep is niet beschikbaar. Ga terug naar de tolkwerkplek."; }
})();
