import Foundation

struct APIError: Error, LocalizedError, Equatable {
    enum Kind {
        /// No answer. Keep the readings and try later.
        case offline
        /// Wrong key or deactivated device. Stop until an admin fixes it.
        case unauthorized
        /// The server keeps no readings by design (unassigned, no consent, no site). Do not retry them.
        case refused
        /// Malformed request. Do not retry it.
        case invalid
        /// Too many calls or a server error. Keep the readings and try later.
        case retryLater
        case other
    }

    let status: Int
    let code: String?
    let message: String

    var errorDescription: String? { message }

    var kind: Kind {
        switch status {
        case 0: return .offline
        case 401, 403: return .unauthorized
        case 409: return .refused
        case 400, 422: return .invalid
        case 408, 429, 500...: return .retryLater
        default: return .other
        }
    }
}

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String?
        let message: String?
    }

    let error: Body?
}

/// The SITE14 API, as documented in Backend/DEVICES.md.
struct APIClient {
    let baseURL: URL

    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 40
        config.waitsForConnectivity = false
        config.httpAdditionalHeaders = ["User-Agent": DeviceInfo.userAgent, "Accept": "application/json"]
        return URLSession(configuration: config)
    }()

    func lookupPairing(code: String) async throws -> PairingInfo {
        try await send("GET", "/pairing/\(Self.escape(code))")
    }

    func claimPairing(code: String, request: ClaimRequest) async throws -> ClaimResponse {
        try await send("POST", "/pairing/\(Self.escape(code))/claim", body: request)
    }

    func heartbeat(_ device: StoredDevice, battery: Int?) async throws -> Heartbeat {
        try await send("POST", "/ingest/heartbeat", body: HeartbeatBody(batteryPercent: battery), device: device)
    }

    func sendReadings(_ device: StoredDevice, readings: [Reading]) async throws -> IngestResult {
        try await send("POST", "/ingest/readings", body: ReadingsBatch(sentAt: Date(), readings: readings), device: device)
    }

    func site(_ device: StoredDevice) async throws -> SiteResponse {
        try await send("GET", "/ingest/site", device: device)
    }

    private static func escape(_ code: String) -> String {
        code.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? code
    }

    private func send<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil, device: StoredDevice? = nil) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/v1").appendingPathComponent(String(path.dropFirst()), isDirectory: false))
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSON.encoder.encode(body)
        }
        if let device {
            request.setValue(device.serialNumber, forHTTPHeaderField: "X-Device-Serial")
            request.setValue(device.apiKey, forHTTPHeaderField: "X-Device-Key")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await Self.session.data(for: request)
        } catch {
            throw APIError(status: 0, code: "OFFLINE", message: "No connection. Readings are kept and sent when the connection is back.")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let body = (try? JSON.decoder.decode(ErrorEnvelope.self, from: data))?.error
            throw APIError(status: status, code: body?.code, message: body?.message ?? "Something went wrong (\(status)). Try again.")
        }
        do {
            return try JSON.decoder.decode(T.self, from: data)
        } catch {
            throw APIError(status: status, code: "BAD_RESPONSE", message: "The server sent an answer this app does not understand. Update the app.")
        }
    }
}
