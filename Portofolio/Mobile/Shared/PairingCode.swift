import Foundation

enum PairingCode {
    private static let alphabet = Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")

    /// "ABCD2345" from a typed code, a QR link (https://…/pair/ABCD-2345) or the app link (site14://pair/ABCD2345).
    static func extract(from text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), url.scheme != nil {
            let parts = ([url.host ?? ""] + url.pathComponents).filter { $0 != "/" && !$0.isEmpty }
            if let i = parts.firstIndex(where: { $0.lowercased() == "pair" }), i + 1 < parts.count {
                return normalize(parts[i + 1])
            }
            if let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value {
                return normalize(code)
            }
            return nil
        }
        return normalize(trimmed)
    }

    static func normalize(_ text: String) -> String? {
        let code = text.uppercased().filter { $0.isLetter || $0.isNumber }
        return code.count == 8 && code.allSatisfy(alphabet.contains) ? code : nil
    }

    static func pretty(_ code: String) -> String {
        code.count > 4 ? "\(code.prefix(4))-\(code.dropFirst(4))" : code
    }
}

enum AppConfig {
    /// SITE14_API_URL in the build settings.
    static var apiBaseURL: URL {
        if let text = Bundle.main.object(forInfoDictionaryKey: "SITE14APIBaseURL") as? String,
           let url = URL(string: text.trimmingCharacters(in: .whitespaces)), url.scheme != nil {
            return url
        }
        return URL(string: "http://localhost:4000")!
    }
}
