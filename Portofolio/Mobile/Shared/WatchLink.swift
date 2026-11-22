import Foundation
import WatchConnectivity

/// What the iPhone and the Apple Watch say to each other.
///
/// The iPhone holds the device key from pairing and hands it to the watch, so both send as one device
/// (the server allows one device per employee). Only one of them sends at a time: while the watch is
/// sharing it says so every 30 s, and the iPhone holds back. If the iPhone hears nothing for
/// `leaseSeconds`, it takes over, before the server would mark the wearer offline (3 min).
enum WatchMessage {
    static let device = "device"
    static let request = "request"
    static let sharing = "sharing"
    static let at = "at"
    static let leaseSeconds: TimeInterval = 150
    static let pingSeconds: TimeInterval = 30

    static func encode(_ device: StoredDevice?) -> Data {
        device.flatMap { try? JSON.encoder.encode($0) } ?? Data()
    }

    static func decode(_ value: Any?) -> StoredDevice?? {
        guard let data = value as? Data else { return .none }
        if data.isEmpty { return .some(nil) }
        return .some(try? JSON.decoder.decode(StoredDevice.self, from: data))
    }
}

#if os(iOS)
@MainActor
final class PhoneWatchLink: NSObject, ObservableObject {
    @Published private(set) var watchPaired = false
    @Published private(set) var watchAppInstalled = false
    /// The watch is sharing and the iPhone holds back.
    @Published private(set) var watchSharing = false

    var onWatchSharingChange: ((Bool) -> Void)?
    private var device: StoredDevice?
    private var leaseUntil = Date.distantPast
    private var timer: Timer?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.checkLease() }
        }
    }

    /// Sends the credentials to the watch, or tells it to forget them (nil).
    func share(_ newDevice: StoredDevice?) {
        device = newDevice
        if newDevice == nil { setSharing(false, until: .distantPast) }
        push()
    }

    private func push() {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        try? session.updateApplicationContext([WatchMessage.device: WatchMessage.encode(device), WatchMessage.at: Date()])
    }

    private func refreshState() {
        let session = WCSession.default
        watchPaired = session.isPaired
        watchAppInstalled = session.isWatchAppInstalled
        if !watchAppInstalled { setSharing(false, until: .distantPast) }
        push()
    }

    private func heard(sharing: Bool, at: Date) {
        guard device != nil else { return }
        if sharing {
            setSharing(true, until: at.addingTimeInterval(WatchMessage.leaseSeconds))
        } else if at >= leaseUntil.addingTimeInterval(-WatchMessage.leaseSeconds) {
            setSharing(false, until: .distantPast)
        }
    }

    private func checkLease() {
        if watchSharing, Date() > leaseUntil { setSharing(false, until: .distantPast) }
    }

    private func setSharing(_ value: Bool, until: Date) {
        leaseUntil = until
        let active = value && until > Date()
        guard active != watchSharing else { return }
        watchSharing = active
        onWatchSharingChange?(active)
    }

    fileprivate func received(_ message: [String: Any]) -> [String: Any] {
        if let sharing = message[WatchMessage.sharing] as? Bool {
            heard(sharing: sharing, at: message[WatchMessage.at] as? Date ?? Date())
        }
        return [WatchMessage.device: WatchMessage.encode(device)]
    }
}

extension PhoneWatchLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.refreshState() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // The wearer switched to another watch.
        session.activate()
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.refreshState() }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        let sharing = message[WatchMessage.sharing] as? Bool
        let at = message[WatchMessage.at] as? Date
        Task { @MainActor in
            var copy: [String: Any] = [:]
            if let sharing { copy[WatchMessage.sharing] = sharing }
            if let at { copy[WatchMessage.at] = at }
            replyHandler(self.received(copy))
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let sharing = message[WatchMessage.sharing] as? Bool
        let at = message[WatchMessage.at] as? Date ?? Date()
        Task { @MainActor in
            if let sharing { _ = self.received([WatchMessage.sharing: sharing, WatchMessage.at: at]) }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        let sharing = context[WatchMessage.sharing] as? Bool
        let at = context[WatchMessage.at] as? Date ?? Date()
        Task { @MainActor in
            if let sharing { _ = self.received([WatchMessage.sharing: sharing, WatchMessage.at: at]) }
        }
    }
}
#endif

#if os(watchOS)
@MainActor
final class WatchPhoneLink: NSObject, ObservableObject {
    /// Called with the credentials from the iPhone, or nil when the iPhone disconnected.
    var onDevice: ((StoredDevice?) -> Void)?
    @Published private(set) var phoneReachable = false

    private var sharing = false
    private var timer: Timer?

    func activate() {
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Asks the iPhone for the credentials, for a watch that has none yet.
    func requestDevice() {
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else { return }
        session.sendMessage([WatchMessage.request: WatchMessage.device], replyHandler: { reply in
            let decoded = WatchMessage.decode(reply[WatchMessage.device])
            Task { @MainActor in
                if case let .some(device) = decoded { self.onDevice?(device) }
            }
        }, errorHandler: nil)
    }

    /// Tells the iPhone the watch is sharing (it holds back) or stopped (it takes over).
    func report(sharing value: Bool) {
        sharing = value
        timer?.invalidate()
        timer = nil
        send()
        if value {
            timer = Timer.scheduledTimer(withTimeInterval: WatchMessage.pingSeconds, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.send() }
            }
        }
    }

    private func send() {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let message: [String: Any] = [WatchMessage.sharing: sharing, WatchMessage.at: Date()]
        try? session.updateApplicationContext(message)
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil, errorHandler: nil)
        }
    }

    private func apply(_ context: [String: Any]) {
        if case let .some(device) = WatchMessage.decode(context[WatchMessage.device]) {
            onDevice?(device)
        }
    }
}

extension WatchPhoneLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext[WatchMessage.device] as? Data
        let reachable = session.isReachable
        Task { @MainActor in
            self.phoneReachable = reachable
            if let context { self.apply([WatchMessage.device: context]) } else { self.requestDevice() }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in self.phoneReachable = reachable }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        let data = context[WatchMessage.device] as? Data
        Task { @MainActor in
            if let data { self.apply([WatchMessage.device: data]) }
        }
    }
}
#endif
