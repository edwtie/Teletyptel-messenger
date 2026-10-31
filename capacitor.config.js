const fs = require("node:fs");
const path = require("node:path");
const base = require("./capacitor.config.json");
const { loadAndroidSettings, capacitorAndroidConfig } = require("./scripts/android-settings");

const android = process.env.TELETYPTEL_MOBILE_TARGET === "android" || process.argv.includes("android");
if (android) {
  module.exports = capacitorAndroidConfig(loadAndroidSettings());
} else {
  if (!process.argv.includes("ios") && fs.existsSync(path.join(__dirname, "android"))
      && process.argv.some((argument) => ["add", "copy", "sync", "update"].includes(argument))) {
    throw new Error("Specify android or ios. Use npm run android:sync or npm run ios:sync.");
  }
  module.exports = base;
}
