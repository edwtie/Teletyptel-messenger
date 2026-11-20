#!/bin/bash
set -euo pipefail

version=$(xcodebuild -version)
printf '%s\n' "$version"
[[ "$version" == "Xcode 27.2"$'\n'* ]]
for platform in iphoneos iphonesimulator; do
  sdk=$(xcrun --sdk "$platform" --show-sdk-version)
  printf '%s SDK: %s\n' "$platform" "$sdk"
  [[ "$sdk" == 27.2 || "$sdk" == 27.2.* ]]
done
