import CoreLocation
import MapKit
import SwiftUI

struct TrackerView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var streamer: LocationStreamer
    @EnvironmentObject private var watch: PhoneWatchLink
    @State private var confirmDisconnect = false

    var body: some View {
        NavigationStack {
            List {
                header
                sharing
                warnings
                siteSection
                details
                deviceSection
            }
            .navigationTitle("SITE14")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                await streamer.sendHeartbeat()
                await streamer.refreshSite()
                await streamer.flush(force: true)
            }
            .confirmationDialog("Disconnect this iPhone?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
                Button("Disconnect", role: .destructive) { model.disconnect() }
            } message: {
                Text("It stops sharing your location, on the iPhone and the Apple Watch. Your company can connect it again with a new code.")
            }
            .alert("Already connected", isPresented: Binding(get: { model.incomingCode != nil }, set: { if !$0 { model.incomingCode = nil } })) {
                Button("OK") { model.incomingCode = nil }
            } message: {
                Text("This iPhone is already connected to \(model.device?.companyName ?? "a company"). Disconnect it first to use a new code.")
            }
        }
    }

    // MARK: Sections

    private var header: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(streamer.heartbeat?.companyName ?? model.device?.companyName ?? "")
                    .font(.title3.bold())
                if let wearer = streamer.heartbeat?.wearer {
                    Label(wearer.fullName, systemImage: "person.fill")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var sharing: some View {
        Section {
            HStack(spacing: 14) {
                StatusDot(color: statusColor, pulsing: streamer.isSharing)
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusTitle).font(.headline)
                    Text(statusDetail).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 6)

            switch streamer.phase {
            case .streaming, .handedOff:
                Button("Stop sharing", role: .destructive) { streamer.stop() }
            case .revoked:
                Button("Try again") { streamer.retry() }
                Button("Connect again with a new code") { model.disconnect() }
            case .denied:
                Button("Open Settings") { openSettings() }
            case .stopped, .needsPermission:
                Button {
                    streamer.start()
                } label: {
                    Text("Start sharing location").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            }
        }
    }

    @ViewBuilder
    private var warnings: some View {
        if let refusal = streamer.refusal {
            Section {
                Label(refusal.text, systemImage: "hourglass").foregroundStyle(.orange)
            }
        }
        if streamer.isSharing, streamer.authorization == .authorizedWhenInUse {
            Section {
                Label("Sharing stops if iOS closes the app. Set Location to Always so it keeps going.", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Button("Open Settings") { openSettings() }
            }
        }
        if streamer.isSharing, !streamer.preciseLocation {
            Section {
                Label("Precise Location is off, so the site may not be detected. Turn it on in Settings.", systemImage: "scope")
                    .foregroundStyle(.orange)
                Button("Open Settings") { openSettings() }
            }
        }
    }

    private var siteSection: some View {
        Section {
            if let site = streamer.site {
                SiteMapView(site: site)
                    .frame(height: 280)
                    .listRowInsets(EdgeInsets())
                let position = streamer.position
                LabeledContent("Where you are") {
                    VStack(alignment: .trailing) {
                        Text(position.title).foregroundStyle(.primary)
                        if let detail = position.detail { Text(detail).font(.caption) }
                    }
                }
                LabeledContent("Shift", value: "\(site.shiftStart) – \(site.shiftEnd)")
                if let center = SiteGeometry.center(of: site.boundary) {
                    Button {
                        let item = MKMapItem(placemark: MKPlacemark(coordinate: center))
                        item.name = site.name
                        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
                    } label: {
                        Label("Directions to the site", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                    }
                }
            } else {
                Text(streamer.refusal == .noSite ? "You are not assigned to a site yet." : "Loading your site…")
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text(streamer.site.map { "Your site · \($0.name)" } ?? "Your site")
        }
    }

    private var details: some View {
        Section("Details") {
            LabeledContent("Last sent") {
                if let at = streamer.lastSentAt {
                    Text("\(at, style: .relative) ago")
                } else {
                    Text("Not yet")
                }
            }
            if streamer.pendingCount > 0 {
                LabeledContent("Waiting to send", value: "\(streamer.pendingCount)")
            }
            if let error = streamer.lastError {
                Text(error).font(.footnote).foregroundStyle(.secondary)
            }
            LabeledContent("Apple Watch", value: watchText)
        }
    }

    private var deviceSection: some View {
        Section("This iPhone") {
            if let device = model.device {
                LabeledContent("Name", value: device.name)
                LabeledContent("Serial", value: device.serialNumber)
                    .textSelection(.enabled)
            }
            Button("Disconnect", role: .destructive) { confirmDisconnect = true }
        }
    }

    // MARK: Text

    private var watchText: String {
        if watch.watchSharing { return "Sharing from the watch" }
        if !watch.watchPaired { return "No watch paired" }
        if !watch.watchAppInstalled { return "Install SITE14 on the watch" }
        return "Ready"
    }

    private var statusColor: Color {
        switch streamer.phase {
        case .streaming, .handedOff: return streamer.refusal == nil ? .green : .orange
        case .denied, .revoked: return .red
        case .stopped, .needsPermission: return .gray
        }
    }

    private var statusTitle: String {
        switch streamer.phase {
        case .streaming: return "Sharing location"
        case .handedOff: return "Apple Watch is sharing"
        case .needsPermission: return "Waiting for permission"
        case .denied: return "Location is off for SITE14"
        case .revoked: return "Device not accepted"
        case .stopped: return "Not sharing"
        }
    }

    private var statusDetail: String {
        switch streamer.phase {
        case .streaming: return "Also in the background, with the app closed."
        case .handedOff: return "This iPhone takes over if the watch stops."
        case .needsPermission: return "Allow location access to start."
        case .denied: return "Settings → SITE14 → Location → Always."
        case .revoked(let message): return message
        case .stopped: return "Your time on site is not being recorded."
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }
}

struct StatusDot: View {
    let color: Color
    let pulsing: Bool
    @State private var animate = false

    var body: some View {
        ZStack {
            if pulsing {
                Circle().fill(color.opacity(0.35))
                    .scaleEffect(animate ? 1.8 : 1)
                    .opacity(animate ? 0 : 1)
            }
            Circle().fill(color)
        }
        .frame(width: 14, height: 14)
        .onAppear {
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { animate = true }
        }
        .accessibilityHidden(true)
    }
}

struct SiteMapView: View {
    let site: Site
    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $camera) {
            MapPolygon(coordinates: site.boundary.outline)
                .foregroundStyle(Color.accentColor.opacity(0.12))
                .stroke(Color.accentColor, lineWidth: 2)
            ForEach(site.zones) { zone in
                MapPolygon(coordinates: zone.boundary.outline)
                    .foregroundStyle((zone.isOutdoor ? Color.yellow : Color.blue).opacity(0.22))
                    .stroke(zone.isOutdoor ? Color.yellow : Color.blue, lineWidth: 1)
                if let center = SiteGeometry.center(of: zone.boundary) {
                    Annotation(zone.name, coordinate: center, anchor: .center) {
                        EmptyView()
                    }
                }
            }
            if let center = SiteGeometry.center(of: site.boundary) {
                Marker(site.name, systemImage: "building.2.fill", coordinate: center)
                    .tint(Color.accentColor)
            }
            UserAnnotation()
        }
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
        .onChange(of: site.id) { _, _ in camera = .automatic }
    }
}
