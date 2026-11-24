import MapKit
import SwiftUI

struct WatchSiteMapView: View {
    @EnvironmentObject private var streamer: LocationStreamer
    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        if let site = streamer.site {
            Map(position: $camera) {
                MapPolygon(coordinates: site.boundary.outline)
                    .foregroundStyle(Color.accentColor.opacity(0.15))
                    .stroke(Color.accentColor, lineWidth: 2)
                ForEach(site.zones) { zone in
                    MapPolygon(coordinates: zone.boundary.outline)
                        .foregroundStyle((zone.isOutdoor ? Color.yellow : Color.blue).opacity(0.25))
                        .stroke(zone.isOutdoor ? Color.yellow : Color.blue, lineWidth: 1)
                }
                if let center = SiteGeometry.center(of: site.boundary) {
                    Marker(site.name, systemImage: "building.2.fill", coordinate: center)
                        .tint(Color.accentColor)
                }
                UserAnnotation()
            }
            .mapControls {
                MapUserLocationButton()
            }
            .onChange(of: site.id) { _, _ in camera = .automatic }
            .navigationTitle(site.name)
        } else {
            VStack(spacing: 6) {
                Image(systemName: "map").font(.title2).foregroundStyle(.secondary)
                Text(streamer.refusal == .noSite ? "No site assigned" : "Loading site…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
