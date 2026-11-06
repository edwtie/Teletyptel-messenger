// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TeleTypTelNative",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "TeleTypTelCore", targets: ["TeleTypTelCore"])],
    targets: [
        .target(name: "TeleTypTelCore"),
        .testTarget(name: "TeleTypTelCoreTests", dependencies: ["TeleTypTelCore"])
    ]
)
