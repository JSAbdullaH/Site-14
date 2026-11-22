import Foundation

/// Readings not yet accepted by the server, kept on disk so nothing is lost offline or when the app is closed.
@MainActor
final class ReadingBuffer {
    /// Six hours at one reading every five seconds.
    static let maxCount = 4320
    /// The server rejects readings older than this (MAX_READING_AGE_HOURS).
    static let maxAge: TimeInterval = 23 * 3600

    private(set) var items: [Reading] = []
    private let url: URL

    init(fileName: String = "pending-readings.json") {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent(fileName)
        if let data = try? Data(contentsOf: url), let saved = try? JSON.decoder.decode([Reading].self, from: data) {
            items = saved
        }
        pruneOld()
    }

    var count: Int { items.count }

    func append(_ reading: Reading) {
        items.append(reading)
        if items.count > Self.maxCount { items.removeFirst(items.count - Self.maxCount) }
        persist()
    }

    /// The oldest readings, up to the server's batch limit.
    func batch(max: Int = 120) -> [Reading] { Array(items.prefix(max)) }

    func remove(_ sent: [Reading]) {
        let done = Set(sent.map(\.recordedAt))
        items.removeAll { done.contains($0.recordedAt) }
        persist()
    }

    func pruneOld(now: Date = Date()) {
        let before = items.count
        items.removeAll { now.timeIntervalSince($0.recordedAt) > Self.maxAge }
        if items.count != before { persist() }
    }

    func clear() {
        items = []
        try? FileManager.default.removeItem(at: url)
    }

    private func persist() {
        guard let data = try? JSON.encoder.encode(items) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
