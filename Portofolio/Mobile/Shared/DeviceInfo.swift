import Foundation
#if os(iOS)
import UIKit
#elseif os(watchOS)
import WatchKit
#endif

enum DeviceInfo {
    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    static var osVersion: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return v.patchVersion > 0 ? "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)" : "\(v.majorVersion).\(v.minorVersion)"
    }

    /// "iPhone16,1", or the simulated model on the simulator.
    static var hardwareIdentifier: String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }

    #if os(watchOS)
    static let family = "Watch"
    static let osName = "watchOS"
    #else
    static var family: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }
    static var osName: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPadOS" : "iOS" }
    #endif

    /// The server reads the device from this. Format: Backend/src/utils/userAgent.js, APP_UA.
    static var userAgent: String {
        "SITE14/\(appVersion) (\(family); \(osName) \(osVersion); \(hardwareIdentifier))"
    }

    /// "iPhone 15 Pro" when the model is known, otherwise "iPhone".
    static var modelName: String {
        marketingNames[hardwareIdentifier] ?? family
    }

    @MainActor
    static func batteryPercent() -> Int? {
        #if os(iOS)
        UIDevice.current.isBatteryMonitoringEnabled = true
        let level = UIDevice.current.batteryLevel
        #elseif os(watchOS)
        WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
        let level = WKInterfaceDevice.current().batteryLevel
        #else
        let level: Float = -1
        #endif
        return level < 0 ? nil : Int((level * 100).rounded())
    }

    private static let marketingNames: [String: String] = [
        "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max", "iPhone12,8": "iPhone SE",
        "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro", "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro", "iPhone14,3": "iPhone 13 Pro Max",
        "iPhone14,6": "iPhone SE", "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus",
        "iPhone15,2": "iPhone 14 Pro", "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus", "iPhone16,1": "iPhone 15 Pro", "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,1": "iPhone 16 Pro", "iPhone17,2": "iPhone 16 Pro Max",
        "iPhone17,5": "iPhone 16e",
        "iPhone18,3": "iPhone 17", "iPhone18,1": "iPhone 17 Pro", "iPhone18,2": "iPhone 17 Pro Max", "iPhone18,4": "iPhone Air",
    ]
}
