"use strict";

function loginAssets(html) {
  const assets = {};
  for (const [name, identifier] of [["NativeGoogleSignIn", "dialogGoogleLoginFallbackButton"], ["NativeFacebookSignIn", "dialogFacebookLoginButton"]]) {
    const button = html.match(new RegExp('<button id="' + identifier + '"[\\s\\S]*?</button>'))?.[0];
    const source = button?.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
    if (!source || /<(?:script|image|use|foreignObject|style)\b|\bon\w+\s*=|href\s*=/i.test(source)) throw new Error("Missing or unsafe existing native sign-in mark: " + name);
    assets[name] = source.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ')
      .replace('class="facebook-login-glyph"', 'fill="#1877f2"');
  }
  return assets;
}

module.exports = { loginAssets };
