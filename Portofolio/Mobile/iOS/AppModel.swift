// xcode: set sdk=iOS

import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published private(set) var device: StoredDevice?
    /// A code from a link or QR scan, waiting for the pairing screen.
    @Published var incomingCode: String?

    let streamer = LocationStreamer()
    let watch = PhoneWatchLink()

    private init() {
        device = CredentialStore.load()
        streamer.use(device)
        watch.onWatchSharingChange = { [weak self] sharing in self?.streamer.handOff(sharing) }
        watch.activate()
        watch.share(device)
    }

    func open(_ url: URL) {
        if let code = PairingCode.extract(from: url.absoluteString) { incomingCode = code }
    }

    func lookup(code: String) async throws -> PairingInfo {
        try await APIClient(baseURL: AppConfig.apiBaseURL).lookupPairing(code: code)
    }

    /// Claims the code, keeps the key in the Keychain, gives it to the watch and starts sharing.
    func connect(code: String, name: String?) async throws {
        let base = AppConfig.apiBaseURL
        let result = try await APIClient(baseURL: base).claimPairing(code: code, request: ClaimRequest(
            deviceType: "phone",
            name: name?.isEmpty == false ? name : nil,
            model: DeviceInfo.modelName,
            platformVersion: DeviceInfo.osVersion,
            batteryPercent: DeviceInfo.batteryPercent()
        ))
        let stored = StoredDevice(
            serialNumber: result.serialNumber,
            apiKey: result.apiKey,
            companyName: result.companyName,
            name: result.device.name ?? DeviceInfo.modelName,
            apiBaseURL: base
        )
        guard CredentialStore.save(stored) else {
            throw APIError(status: -1, code: "KEYCHAIN", message: "This iPhone could not keep the device key. Restart it and try again.")
        }
        incomingCode = nil
        device = stored
        streamer.use(stored)
        watch.share(stored)
        streamer.start()
    }

    func disconnect() {
        streamer.stop()
        streamer.use(nil)
        CredentialStore.clear()
        watch.share(nil)
        device = nil
    }
}
