import CoreLocation
import Foundation

/// Local geometry, so the app can show where the site is between server answers.
/// The server stays the authority for shifts and zones.
enum SiteGeometry {
    static func contains(_ polygon: GeoPolygon, _ point: CLLocationCoordinate2D) -> Bool {
        let rings = polygon.rings
        guard let outline = rings.first, ringContains(outline, point) else { return false }
        return rings.dropFirst().allSatisfy { !ringContains($0, point) }
    }

    private static func ringContains(_ ring: [CLLocationCoordinate2D], _ p: CLLocationCoordinate2D) -> Bool {
        guard ring.count >= 3 else { return false }
        var inside = false
        var j = ring.count - 1
        for i in 0..<ring.count {
            let a = ring[i], b = ring[j]
            if (a.latitude > p.latitude) != (b.latitude > p.latitude),
               p.longitude < (b.longitude - a.longitude) * (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude {
                inside.toggle()
            }
            j = i
        }
        return inside
    }

    /// Meters from the point to the polygon's edge, 0 inside.
    static func distance(from point: CLLocationCoordinate2D, to polygon: GeoPolygon) -> CLLocationDistance {
        if contains(polygon, point) { return 0 }
        let ring = polygon.outline
        guard ring.count >= 2 else { return .infinity }
        let metersPerDegLat = 111_320.0
        let metersPerDegLng = 111_320.0 * cos(point.latitude * .pi / 180)
        func local(_ c: CLLocationCoordinate2D) -> (Double, Double) {
            ((c.longitude - point.longitude) * metersPerDegLng, (c.latitude - point.latitude) * metersPerDegLat)
        }
        var best = Double.infinity
        for i in 0..<(ring.count - 1) {
            let (ax, ay) = local(ring[i]), (bx, by) = local(ring[i + 1])
            let dx = bx - ax, dy = by - ay
            let len2 = dx * dx + dy * dy
            let t = len2 == 0 ? 0 : max(0, min(1, -(ax * dx + ay * dy) / len2))
            best = min(best, hypot(ax + t * dx, ay + t * dy))
        }
        return best
    }

    static func center(of polygon: GeoPolygon) -> CLLocationCoordinate2D? {
        var ring = polygon.outline
        if ring.count > 1, let first = ring.first, let last = ring.last, first.latitude == last.latitude, first.longitude == last.longitude {
            ring.removeLast()
        }
        guard !ring.isEmpty else { return nil }
        let lat = ring.map(\.latitude).reduce(0, +) / Double(ring.count)
        let lng = ring.map(\.longitude).reduce(0, +) / Double(ring.count)
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// Degrees clockwise from north.
    static func bearing(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
        let lat1 = a.latitude * .pi / 180, lat2 = b.latitude * .pi / 180
        let dLng = (b.longitude - a.longitude) * .pi / 180
        let y = sin(dLng) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
        return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }

    static func compassPoint(_ degrees: Double) -> String {
        let names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        return names[Int((degrees + 22.5) / 45) % 8]
    }

    static func formatDistance(_ meters: CLLocationDistance) -> String {
        if meters < 1000 { return "\(Int((meters / 10).rounded()) * 10) m" }
        return String(format: meters < 10_000 ? "%.1f km" : "%.0f km", meters / 1000)
    }
}

/// Where the wearer is relative to the site: from the server when fresh, otherwise worked out here.
struct SitePosition: Equatable {
    enum Place: Equatable {
        case inZone(String)
        case onSite
        case offSite(distance: CLLocationDistance, direction: String, bearing: Double)
        case unknown
    }

    let place: Place

    static func of(_ location: CLLocation?, site: Site?) -> SitePosition {
        guard let location, let site else { return SitePosition(place: .unknown) }
        let p = location.coordinate
        if SiteGeometry.contains(site.boundary, p) {
            if let zone = site.zones.first(where: { SiteGeometry.contains($0.boundary, p) }) {
                return SitePosition(place: .inZone(zone.name))
            }
            return SitePosition(place: .onSite)
        }
        let distance = SiteGeometry.distance(from: p, to: site.boundary)
        let target = SiteGeometry.center(of: site.boundary) ?? p
        let bearing = SiteGeometry.bearing(from: p, to: target)
        return SitePosition(place: .offSite(distance: distance, direction: SiteGeometry.compassPoint(bearing), bearing: bearing))
    }

    var title: String {
        switch place {
        case .inZone(let name): return "In \(name)"
        case .onSite: return "On site"
        case .offSite: return "Off site"
        case .unknown: return "Locating…"
        }
    }

    var detail: String? {
        if case let .offSite(distance, direction, _) = place {
            return "\(SiteGeometry.formatDistance(distance)) \(direction) to the site"
        }
        return nil
    }
}
