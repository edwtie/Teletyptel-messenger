"use strict";
const address = window.teletyptelServer;
if (typeof address === "string") {
  const server = new URL(address);
  if (server.protocol === "https:" && !server.username && !server.password) {
    document.getElementById("retry").href = server.href;
    document.getElementById("server").textContent = server.host;
  }
}
