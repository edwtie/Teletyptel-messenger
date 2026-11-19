// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TeleTypTelHybrid",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "TeleTypTelHybridBridge", targets: ["TeleTypTelHybridBridge"])],
    dependencies: [.package(path: "../ios-native")],
    targets: [
        .target(name: "TeleTypTelHybridBridge", dependencies: [
            .product(name: "TeleTypTelCore", package: "ios-native")
        ]),
        .testTarget(name: "TeleTypTelHybridBridgeTests", dependencies: [
            "TeleTypTelHybridBridge", .product(name: "TeleTypTelCore", package: "ios-native")
        ])
    ]
)
