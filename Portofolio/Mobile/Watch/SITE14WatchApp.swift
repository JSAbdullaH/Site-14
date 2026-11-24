import SwiftUI

@main
struct SITE14WatchApp: App {
    @ObservedObject private var model = WatchModel.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(model)
                .environmentObject(model.streamer)
                .environmentObject(model.phone)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            if model.device == nil {
                model.phone.requestDevice()
            } else {
                Task { await model.streamer.sendHeartbeat() }
            }
        }
    }
}

struct WatchRootView: View {
    @EnvironmentObject private var model: WatchModel

    var body: some View {
        if model.device == nil {
            NotConnectedView()
        } else {
            TabView {
                WatchStatusView()
                WatchSiteMapView()
            }
            .tabViewStyle(.verticalPage)
        }
    }
}

struct NotConnectedView: View {
    @EnvironmentObject private var phone: WatchPhoneLink

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "iphone.gen3.radiowaves.left.and.right")
                    .font(.system(size: 36))
                    .foregroundStyle(.tint)
                Text("Connect on iPhone")
                    .font(.headline)
                Text("Open SITE14 on your iPhone and connect it to your company. This watch joins on its own.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Check again") { phone.requestDevice() }
                    .disabled(!phone.phoneReachable)
            }
            .padding(.horizontal, 4)
        }
    }
}
