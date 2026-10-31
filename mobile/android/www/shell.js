"use strict";
const address = window.teletyptelAndroidServer;
if (typeof address === "string" && new URL(address).protocol === "https:") {
  document.getElementById("retry").href = address;
  document.getElementById("server").textContent = new URL(address).host;
}
