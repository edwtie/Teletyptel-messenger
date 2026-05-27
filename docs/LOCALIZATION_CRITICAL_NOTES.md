# Localization Critical Notes

Teletyptel currently uses two localization shapes:

- loose `.lng` key-value files for the web client;
- `LngPdk` / `.lngpdk` packages for signed, bundled language resources.

This split is intentional for early development, but it is not free. It creates
technical and product risks that must be handled before production.

## Current `.lng` Use

The web client loads:

```text
php/public/lang/eng.lng
php/public/lang/ned.lng
```

This is useful right now because:

- it is fast to edit;
- it works with ordinary static web hosting;
- it keeps the first web client independent from the package compiler;
- it is easy to inspect in browser dev tools.

But loose `.lng` files are weak as a production format:

- no package manifest;
- no version or channel metadata;
- no signature;
- no checksum chain;
- no asset relationship model;
- no author/product identity;
- no guaranteed completeness check across languages;
- easy to deploy a mismatched language file with the wrong web build.

Loose `.lng` should therefore be treated as a development and fallback format.
It is not the final trust boundary for language resources.

## LngPdk Role

LngPdk should become the product package format for language resources.

It should contain or reference:

- UI strings;
- help text;
- provider-facing text;
- media and smiley metadata where needed;
- manifest metadata;
- product and channel;
- version;
- author;
- signature and hash;
- package compatibility information.

The main benefit is not only translation. The benefit is controlled deployment:
one package tells the application exactly which localized resources belong
together.

## Critical Risks

### 1. Two Sources Of Truth

If web `.lng` files and `.lngpdk` packages both evolve independently, strings
will drift. A button can be translated in one surface but not the other.

Rule: `.lng` is source input or fallback. `.lngpdk` is the distributable package
once the compiler path is ready.

### 2. Security Confusion

Users may see a verified package indicator in one product and assume all
language text is verified. Loose web `.lng` files do not provide that guarantee.

Rule: UI must not show "verified language package" unless the active resources
actually came from a verified package.

### 3. Web Cache Staleness

The service worker can keep an old language file while the JavaScript expects
new keys.

Rule: cache version must change when language keys change. Missing translations
must fall back to readable keys or English.

### 4. Missing Completeness Checks

A simple parser will happily run with missing keys. That is useful for
development, but dangerous for releases.

Rule: release builds should run a language completeness check against the
canonical key list.

### 5. Overloading Localization

Localization must not become a hidden plugin system. Translated text should not
control protocol behavior or security-sensitive routing.

Rule: language packages may describe UI resources, not decide XMPP trust,
encryption, routing or authentication policy.

## Migration Direction

Short term:

- keep `php/public/lang/*.lng` for the web demo;
- keep keys stable and simple;
- store `preferredLanguage` in the MySQL account profile;
- document that these files are unsigned.

Next:

- add a key completeness validator;
- generate web `.lng` files from the same source tree used by LngPdk;
- add package metadata to the UI status when packages are used.

Later:

- serve `.lngpdk` packages to web/mobile clients;
- verify package signatures before applying them;
- support fallback order: verified package -> bundled default -> loose dev
  `.lng` -> visible key.

## Decision

For Alpha, loose `.lng` files are acceptable because they keep iteration fast.

For Beta, LngPdk should become the normal release path for language resources.
Loose `.lng` may remain as a development fallback, but should not be presented
as verified or production-trusted localization.
