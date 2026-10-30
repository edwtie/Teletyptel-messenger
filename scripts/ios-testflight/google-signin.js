const fs = require("node:fs");
const path = require("node:path");

const clientId = "1072417513685-ntq135e2sdh73aufi552h0ml5l95s8no.apps.googleusercontent.com";
const serverClientId = "1072417513685-am13l0j2idfi4d8ffjh5i29v5l3ng90t.apps.googleusercontent.com";
const urlScheme = clientId.split(".").reverse().join(".");

function addGooglePackage(source) {
  if (source.includes("GoogleSignIn")) throw new Error("Review existing Google dependency before modifying staging");
  const capacitor = '.product(name: "Capacitor", package: "capacitor-swift-pm")';
  if (!source.includes("    dependencies: [") || !source.includes(capacitor)) throw new Error("Review changed Capacitor Swift package");
  return source.replace("    dependencies: [", '    dependencies: [\n        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", exact: "9.0.0"),')
    .replace(capacitor, '.product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),\n                ' + capacitor);
}

function configureGooglePackage(project) {
  const file = path.join(project, "ios/App/CapApp-SPM/Package.swift");
  fs.writeFileSync(file, addGooglePackage(fs.readFileSync(file, "utf8")));
}

module.exports = { clientId, serverClientId, urlScheme, addGooglePackage, configureGooglePackage };
