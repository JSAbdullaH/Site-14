import Foundation

@MainActor
final class WatchModel: ObservableObject {
    static let shared = WatchModel()

    @Published private(set) var device: StoredDevice?
    let streamer = LocationStreamer()
    let phone = WatchPhoneLink()

    private init() {
        device = CredentialStore.load()
        streamer.use(device)
        streamer.onStreamingChange = { [weak self] sharing in self?.phone.report(sharing: sharing) }
        phone.onDevice = { [weak self] device in self?.receive(device) }
        phone.activate()
    }

    /// Credentials from the iPhone. nil means the iPhone was disconnected: the watch stops too.
    private func receive(_ newDevice: StoredDevice?) {
        guard newDevice != device else { return }
        if let newDevice {
            CredentialStore.save(newDevice)
        } else {
            streamer.stop()
            CredentialStore.clear()
        }
        device = newDevice
        streamer.use(newDevice)
    }
}
