import SwiftUI
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Also runs when iOS relaunches the app in the background for a location event:
        // creating the model resumes sharing if the wearer had it on.
        _ = AppModel.shared
        return true
    }
}

@main
struct SITE14App: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @ObservedObject private var model = AppModel.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(model.streamer)
                .environmentObject(model.watch)
                .onOpenURL { model.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { model.open(url) }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, model.device != nil {
                Task { await model.streamer.sendHeartbeat() }
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if model.device == nil {
            PairView()
        } else {
            TrackerView()
        }
    }
}
