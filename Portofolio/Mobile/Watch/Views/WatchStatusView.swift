import SwiftUI

struct WatchStatusView: View {
    @EnvironmentObject private var streamer: LocationStreamer

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let site = streamer.site {
                    Text(site.name)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                placeBadge

                if let refusal = streamer.refusal {
                    Text(refusal.text)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                }

                control

                footer
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle("SITE14")
    }

    @ViewBuilder
    private var placeBadge: some View {
        let position = streamer.position
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color(for: position).opacity(0.3), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: streamer.isSharing ? 1 : 0)
                    .stroke(color(for: position), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                if case let .offSite(_, _, bearing) = position.place, bearing.isFinite {
                    Image(systemName: "location.north.fill")
                        .font(.title2)
                        .rotationEffect(.degrees(bearing))
                        .foregroundStyle(color(for: position))
                        .accessibilityHidden(true)
                } else {
                    Image(systemName: icon(for: position))
                        .font(.title2)
                        .foregroundStyle(color(for: position))
                }
            }
            .frame(width: 64, height: 64)

            Text(position.title)
                .font(.headline)
            if let detail = position.detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var control: some View {
        switch streamer.phase {
        case .streaming, .handedOff:
            Button(role: .destructive) {
                streamer.stop()
            } label: {
                Label("Stop", systemImage: "stop.fill")
            }
        case .denied:
            Text("Location is off for SITE14. Turn it on in the Watch app on iPhone → Privacy.")
                .font(.caption2)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
        case .revoked(let message):
            Text(message).font(.caption2).foregroundStyle(.red).multilineTextAlignment(.center)
            Button("Try again") { streamer.retry() }
        case .stopped, .needsPermission:
            Button {
                streamer.start()
            } label: {
                Label("Share from watch", systemImage: "location.fill")
            }
            .tint(.accentColor)
        }
    }

    private var footer: some View {
        VStack(spacing: 2) {
            if streamer.isSharing {
                if let at = streamer.lastSentAt {
                    Text("Sent \(at, style: .relative) ago")
                } else {
                    Text("Sending…")
                }
                if streamer.pendingCount > 2 {
                    Text("\(streamer.pendingCount) waiting")
                }
            } else {
                Text("Your iPhone shares while the watch does not.")
                    .multilineTextAlignment(.center)
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    private func color(for position: SitePosition) -> Color {
        guard streamer.isSharing else { return .gray }
        switch position.place {
        case .inZone: return .green
        case .onSite: return .blue
        case .offSite: return .orange
        case .unknown: return .gray
        }
    }

    private func icon(for position: SitePosition) -> String {
        switch position.place {
        case .inZone: return "checkmark"
        case .onSite: return "building.2.fill"
        case .offSite: return "location.north.fill"
        case .unknown: return "location.slash"
        }
    }
}
