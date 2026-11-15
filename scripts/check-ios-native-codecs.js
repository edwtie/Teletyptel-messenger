const { run } = require("./check-ios-native-update");
const { checkMedia } = require("./check-ios-native-media");

function checkCodecs() {
  return checkMedia(run());
}

if (require.main === module) checkCodecs();
module.exports = { checkCodecs };
