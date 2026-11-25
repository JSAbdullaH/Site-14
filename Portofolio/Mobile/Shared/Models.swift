import CoreLocation
import Foundation

/// The credentials a paired device keeps. The iPhone gets them from the pairing code
/// and hands them to the Apple Watch, so both send as the same device.
struct StoredDevice: Codable, Equatable {
    var serialNumber: String
    var apiKey: String
    var companyName: String
    var name: String
    var apiBaseURL: URL

    // JSON.encoder writes apiBaseURL as "api_base_url", and JSON.decoder reads that back as "apiBaseUrl",
    // not "apiBaseURL". Without this key the saved device never loads again: the app forgot its company
    // on every launch and the watch dropped the credentials the iPhone sent it.
    private enum CodingKeys: String, CodingKey {
        case serialNumber, apiKey, companyName, name
        case apiBaseURL = "apiBaseUrl"
    }
}

struct PersonName: Codable, Equatable {
    let fullName: String
}

struct PairingInfo: Codable, Equatable {
    let companyName: String
    let employee: PersonName?
    let label: String?
    let expiresAt: Date
}

struct ClaimRequest: Encodable {
    let deviceType: String
    let name: String?
    let model: String?
    let platformVersion: String?
    let batteryPercent: Int?
}

struct ClaimResponse: Decodable {
    struct Device: Decodable {
        let name: String?
        let deviceType: String
    }

    let companyName: String
    let serialNumber: String
    let apiKey: String
    let device: Device
}

/// Why the server keeps no readings for this device, from heartbeat and ingest.
enum Refusal: String, Codable {
    case deviceUnassigned = "DEVICE_UNASSIGNED"
    case noConsent = "NO_CONSENT"
    case noSite = "NO_SITE"

    var text: String {
        switch self {
        case .deviceUnassigned: return "Connected. Waiting for your company to assign this device to you."
        case .noConsent: return "Connected. You have not signed the tracking consent yet. Ask your manager."
        case .noSite: return "Connected. You are not assigned to a site yet."
        }
    }
}

struct Heartbeat: Decodable, Equatable {
    struct SiteRef: Decodable, Equatable {
        let id: String?
        let name: String
    }

    let serverTime: Date
    let companyName: String
    let wearer: PersonName?
    let site: SiteRef?
    let ready: Bool
    let reason: String?
}

struct Reading: Codable, Equatable {
    let recordedAt: Date
    let latitude: Double
    let longitude: Double
    /// Horizontal accuracy in metres. Optional so readings buffered by an older build still load.
    var accuracyM: Double? = nil
    let batteryPercent: Int?
}

struct ReadingsBatch: Encodable {
    let sentAt: Date
    let readings: [Reading]
}

struct HeartbeatBody: Encodable {
    let batteryPercent: Int?
}

enum LocationStatus: String, Decodable {
    case inZone = "in_zone"
    case onSite = "on_site"
    case offSite = "off_site"
}

struct IngestResult: Decodable {
    struct ZoneRef: Decodable, Equatable {
        let id: String
        let name: String
    }

    let accepted: Int
    let stored: Int
    let locationStatus: LocationStatus
    let outOfZone: Bool?
    let zone: ZoneRef?
}

/// GeoJSON Polygon. Positions are [longitude, latitude]. The first ring is the outline, the others are holes.
struct GeoPolygon: Codable, Equatable {
    let type: String
    let coordinates: [[[Double]]]

    var rings: [[CLLocationCoordinate2D]] {
        coordinates.map { ring in
            ring.compactMap { $0.count >= 2 ? CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) : nil }
        }
    }

    var outline: [CLLocationCoordinate2D] { rings.first ?? [] }
}

struct Zone: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let isOutdoor: Bool
    let boundary: GeoPolygon
}

struct Site: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let client: String?
    let boundary: GeoPolygon
    let shiftStart: String
    let shiftEnd: String
    let timeZone: String
    let zones: [Zone]
}

struct SiteResponse: Decodable {
    let site: Site?
    let ready: Bool
    let reason: String?
}
