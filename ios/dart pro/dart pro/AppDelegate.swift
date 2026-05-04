import UIKit
import FirebaseCore
import FirebaseMessaging
import GoogleSignIn
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Firebase 초기화
        FirebaseApp.configure()
        
        // 알림 권한 및 대리자 설정
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
        
        let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
        UNUserNotificationCenter.current().requestAuthorization(options: authOptions) { _, _ in }
        
        application.registerForRemoteNotifications()
        
        return true
    }
    
    // MARK: - Google Sign-In URL Handler
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return GIDSignIn.sharedInstance.handle(url)
    }
    
    // MARK: - APNs Registration
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }
    
    // MARK: - MessagingDelegate
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("🚀 Firebase FCM Token: \(String(describing: fcmToken))")
        if let token = fcmToken {
            UserDefaults.standard.set(token, forKey: "fcm_token")
            // 토큰이 갱신되었음을 알림
            NotificationCenter.default.post(name: Notification.Name("FCMTokenUpdated"), object: nil)
        }
    }
    
    // MARK: - UNUserNotificationCenterDelegate
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // 포그라운드에서도 알림 표시
        completionHandler([.banner, .sound, .badge])
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        // 알림 클릭 처리 및 저장
        let content = response.notification.request.content
        let title = content.title
        let body = content.body
        
        saveToHistory(title: title, body: body)
        
        print("📌 Notification Clicked: \(title)")
        completionHandler()
    }
    
    private func saveToHistory(title: String, body: String) {
        let newRecord = ["id": UUID().uuidString, "title": title, "body": body, "date": Date().timeIntervalSince1970] as [String : Any]
        
        var history = UserDefaults.standard.array(forKey: "notification_history_raw") as? [[String: Any]] ?? []
        history.insert(newRecord, at: 0)
        if history.count > 50 { history.removeLast() } // 최대 50개 유지
        
        UserDefaults.standard.set(history, forKey: "notification_history_raw")
        
        // NotificationCenterView에서 사용하는 NotificationRecord 형식으로 변환하여 저장
        let records = history.compactMap { dict -> NotificationRecord? in
            guard let id = dict["id"] as? String,
                  let title = dict["title"] as? String,
                  let body = dict["body"] as? String,
                  let timestamp = dict["date"] as? Double else { return nil }
            return NotificationRecord(id: id, title: title, body: body, date: Date(timeIntervalSince1970: timestamp))
        }
        
        if let encoded = try? JSONEncoder().encode(records) {
            UserDefaults.standard.set(encoded, forKey: "notification_history")
        }
    }
}
