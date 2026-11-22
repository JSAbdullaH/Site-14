import CoreLocation
import Foundation

/// Reads the position and sends it to SITE14, in the foreground and in the background.
///
/// Follows Backend/DEVICES.md: a reading every 5 s, sent in batches every 10 s, a heartbeat every 30 s,
/// a buffer kept on disk while offline, and no retry of readings the server refuses by design.
@MainActor
final class LocationStreamer: NSObject, ObservableObject {
    enum Phase: Equatable {
        /// Not sharing. The wearer has not started, or stopped.
        case stopped
        /// Waiting for the wearer to answer the location prompt.
        case needsPermission
        /// Location is off for this app.
        case denied
        case streaming
        /// iPhone only: the Apple Watch is sending instead.
        case handedOff
        /// The server does not accept this device's key (401) or the device is deactivated (403).
        case revoked(String)
    }

    static let sampleInterval: TimeInterval = 5
    static let flushInterval: TimeInterval = 10
    static let heartbeatInterval: TimeInterval = 30
    static let siteRefreshInterval: TimeInterval = 30 * 60
    /// Readings less accurate than this are shown but not sent.
    static let worstAccuracy: CLLocationAccuracy = 150
    /// Farther than this from the site, a coarse position is enough and saves battery.
    static let farFromSite: CLLocationDistance = 2000

    @Published private(set) var device: StoredDevice?
    @Published private(set) var phase: Phase = .stopped
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var preciseLocation = true
    @Published private(set) var location: CLLocation?
    @Published private(set) var heartbeat: Heartbeat?
    @Published private(set) var site: Site?
    @Published private(set) var serverStatus: LocationStatus?
    @Published private(set) var serverZone: String?
    @Published private(set) var refusal: Refusal?
    @Published private(set) var lastSentAt: Date?
    @Published private(set) var lastError: String?
    @Published private(set) var pendingCount = 0

    /// Called with true when sharing starts and false when it stops. The watch tells the iPhone.
    var onStreamingChange: ((Bool) -> Void)?

    private let manager = CLLocationManager()
    private let buffer = ReadingBuffer()
    private var timer: Timer?
    private var activity: CLBackgroundActivitySession?
    private var sending = false
    private var lastFlushAt = Date.distantPast
    private var lastBeatAt = Date.distantPast
    private var lastSampleAt = Date.distantPast
    private var lastSiteFetchAt = Date.distantPast
    private var coarse = false

    private static let wantsKey = "site14.wantsStreaming"

    /// Kept across launches, so tracking resumes by itself after the app is relaunched.
    private(set) var wantsStreaming: Bool {
        get { UserDefaults.standard.bool(forKey: Self.wantsKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.wantsKey) }
    }

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .otherNavigation
        #if os(iOS)
        manager.pausesLocationUpdatesAutomatically = false
        #endif
        pendingCount = buffer.count
        preciseLocation = manager.accuracyAuthorization == .fullAccuracy
    }

    var isSharing: Bool { phase == .streaming }

    var position: SitePosition {
        if site != nil { return SitePosition.of(location, site: site) }
        switch serverStatus {
        case .inZone: return SitePosition(place: .inZone(serverZone ?? "a zone"))
        case .onSite: return SitePosition(place: .onSite)
        case .offSite: return SitePosition(place: .offSite(distance: .infinity, direction: "", bearing: 0))
        case nil: return SitePosition(place: .unknown)
        }
    }

    // MARK: - Device

    /// Sets the credentials. Starts again if the wearer was sharing before.
    func use(_ newDevice: StoredDevice?) {
        guard newDevice != device else { return }
        let wasSharing = wantsStreaming
        halt()
        device = newDevice
        heartbeat = nil
        site = nil
        serverStatus = nil
        serverZone = nil
        refusal = nil
        lastError = nil
        if newDevice == nil {
            buffer.clear()
            pendingCount = 0
            wantsStreaming = false
            phase = .stopped
        } else if wasSharing {
            start()
        } else {
            Task { await sendHeartbeat() }
        }
    }

    // MARK: - Start and stop

    func start() {
        guard device != nil else { return }
        wantsStreaming = true
        switch manager.authorizationStatus {
        case .notDetermined:
            phase = .needsPermission
            #if os(iOS)
            manager.requestAlwaysAuthorization()
            #else
            manager.requestWhenInUseAuthorization()
            #endif
        case .denied, .restricted:
            phase = .denied
        default:
            begin()
        }
    }

    func stop() {
        wantsStreaming = false
        halt()
        phase = .stopped
        Task { await flush(force: true) }
    }

    /// After a 401 or 403, once the admin has fixed the device.
    func retry() {
        if case .revoked = phase { phase = .stopped }
        lastError = nil
        start()
    }

    #if os(iOS)
    /// The Apple Watch sends while it is sharing: the iPhone keeps a coarse position but sends nothing.
    func handOff(_ watchIsSharing: Bool) {
        if watchIsSharing, phase == .streaming {
            Task { await flush(force: true) }
            phase = .handedOff
            applyAccuracy()
        } else if !watchIsSharing, phase == .handedOff {
            phase = .streaming
            lastSampleAt = .distantPast
            applyAccuracy()
            Task { await sendHeartbeat() }
        }
    }
    #endif

    private func begin() {
        guard device != nil else { return }
        if case .revoked = phase { return }
        manager.allowsBackgroundLocationUpdates = true
        #if os(iOS)
        manager.showsBackgroundLocationIndicator = true
        if manager.authorizationStatus == .authorizedAlways {
            // Wakes the app again if the system ended it while sharing.
            manager.startMonitoringSignificantLocationChanges()
        }
        #endif
        if activity == nil { activity = CLBackgroundActivitySession() }
        applyAccuracy()
        manager.startUpdatingLocation()
        if phase != .handedOff { phase = .streaming }
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: Self.sampleInterval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        onStreamingChange?(true)
        Task { await sendHeartbeat() }
    }

    private func halt() {
        let wasRunning = timer != nil
        timer?.invalidate()
        timer = nil
        manager.stopUpdatingLocation()
        #if os(iOS)
        manager.stopMonitoringSignificantLocationChanges()
        #endif
        activity?.invalidate()
        activity = nil
        if wasRunning { onStreamingChange?(false) }
    }

    private func tick() {
        let now = Date()
        if phase == .streaming, now.timeIntervalSince(lastBeatAt) >= Self.heartbeatInterval {
            Task { await sendHeartbeat() }
        }
        if now.timeIntervalSince(lastFlushAt) >= Self.flushInterval {
            Task { await flush() }
        }
    }

    /// Fine near the site, coarse far away or while the watch is sending.
    private func applyAccuracy() {
        var far = false
        if let site, let location {
            far = SiteGeometry.distance(from: location.coordinate, to: site.boundary) > Self.farFromSite
        }
        let wantCoarse = far || phase == .handedOff
        guard wantCoarse != coarse else { return }
        coarse = wantCoarse
        manager.desiredAccuracy = wantCoarse ? kCLLocationAccuracyHundredMeters : kCLLocationAccuracyBest
        manager.distanceFilter = wantCoarse ? 50 : kCLDistanceFilterNone
    }

    // MARK: - Positions

    private func received(_ locations: [CLLocation]) {
        guard let latest = locations.last(where: { $0.horizontalAccuracy >= 0 }) else { return }
        location = latest
        applyAccuracy()
        guard phase == .streaming else { return }

        for loc in locations where loc.horizontalAccuracy >= 0 && loc.horizontalAccuracy <= Self.worstAccuracy {
            // A cached fix from before sharing started is not where the wearer is now.
            guard Date().timeIntervalSince(loc.timestamp) < 60 else { continue }
            guard loc.timestamp.timeIntervalSince(lastSampleAt) >= Self.sampleInterval else { continue }
            lastSampleAt = loc.timestamp
            buffer.append(Reading(
                recordedAt: loc.timestamp,
                latitude: loc.coordinate.latitude,
                longitude: loc.coordinate.longitude,
                batteryPercent: DeviceInfo.batteryPercent()
            ))
        }
        pendingCount = buffer.count
        if Date().timeIntervalSince(lastFlushAt) >= Self.flushInterval {
            Task { await flush() }
        }
    }

    // MARK: - Server

    private var api: APIClient? { device.map { APIClient(baseURL: $0.apiBaseURL) } }

    func flush(force: Bool = false) async {
        guard let device, let api, !sending else { return }
        if case .revoked = phase { return }
        buffer.pruneOld()
        let batch = buffer.batch()
        pendingCount = buffer.count
        guard !batch.isEmpty else { return }
        guard force || Date().timeIntervalSince(lastFlushAt) >= Self.flushInterval else { return }

        sending = true
        lastFlushAt = Date()
        defer {
            sending = false
            pendingCount = buffer.count
        }
        do {
            let result = try await api.sendReadings(device, readings: batch)
            buffer.remove(batch)
            serverStatus = result.locationStatus
            serverZone = result.zone?.name
            refusal = nil
            lastSentAt = Date()
            lastError = nil
        } catch let error as APIError {
            switch error.kind {
            case .refused:
                buffer.remove(batch)
                refusal = error.code.flatMap(Refusal.init(rawValue:))
                lastError = refusal == nil ? error.message : nil
            case .invalid:
                buffer.remove(batch)
                lastError = error.message
            case .unauthorized:
                revoke(error)
            case .offline, .retryLater, .other:
                lastError = error.message
            }
        } catch {
            lastError = error.localizedDescription
        }
        // A long offline buffer goes out in several batches.
        if buffer.count >= 120, case .streaming = phase {
            lastFlushAt = .distantPast
        }
    }

    func sendHeartbeat() async {
        guard let device, let api else { return }
        if case .revoked = phase { return }
        lastBeatAt = Date()
        do {
            let beat = try await api.heartbeat(device, battery: DeviceInfo.batteryPercent())
            heartbeat = beat
            refusal = beat.reason.flatMap(Refusal.init(rawValue:))
            if beat.site?.id != site?.id || Date().timeIntervalSince(lastSiteFetchAt) > Self.siteRefreshInterval {
                await refreshSite()
            }
        } catch let error as APIError where error.kind == .unauthorized {
            revoke(error)
        } catch let error as APIError {
            lastError = error.message
        } catch {
            lastError = error.localizedDescription
        }
    }

    func refreshSite() async {
        guard let device, let api else { return }
        lastSiteFetchAt = Date()
        do {
            let answer = try await api.site(device)
            site = answer.site
            applyAccuracy()
        } catch let error as APIError where error.kind == .unauthorized {
            revoke(error)
        } catch {
            return
        }
    }

    private func revoke(_ error: APIError) {
        halt()
        phase = .revoked(error.status == 403
            ? "Your company has deactivated this device. Ask your manager to turn it back on."
            : "Your company no longer accepts this device. Connect it again with a new code.")
    }

    // MARK: - Permission

    private func authorizationChanged() {
        authorization = manager.authorizationStatus
        preciseLocation = manager.accuracyAuthorization == .fullAccuracy
        guard wantsStreaming, device != nil else { return }
        switch authorization {
        case .denied, .restricted:
            halt()
            phase = .denied
        case .notDetermined:
            break
        default:
            if timer == nil { begin() }
            #if os(iOS)
            if authorization == .authorizedAlways { manager.startMonitoringSignificantLocationChanges() }
            #endif
        }
    }
}

extension LocationStreamer: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated { self.received(locations) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated { self.authorizationChanged() }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        MainActor.assumeIsolated {
            if denied {
                self.halt()
                self.phase = .denied
            }
        }
    }
}
