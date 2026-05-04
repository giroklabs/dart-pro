import SwiftUI

@main
struct DartProApp: App {
    // AppDelegate 연결 (FCM 및 알림 처리를 위해 필수)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
