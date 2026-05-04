import SwiftUI
import FirebaseAuth

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var manager: DARTManager
    @StateObject var authManager = AuthManager.shared
    @AppStorage("isPushEnabled") private var isPushEnabled = true
    
    var body: some View {
        NavigationView {
            List {
                // 계정 섹션
                Section(header: Text("계정 정보")) {
                    if let user = authManager.user {
                        HStack {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 40))
                                .foregroundColor(AppTheme.primary)
                            
                            VStack(alignment: .leading) {
                                Text(user.email ?? "사용자")
                                    .font(AppTheme.headlineFont)
                                Text("DART Pro 프리미엄")
                                    .font(.caption)
                                    .foregroundColor(AppTheme.primary)
                            }
                        }
                        .padding(.vertical, 8)
                        
                        Button(action: { authManager.signOut() }) {
                            Text("로그아웃")
                                .foregroundColor(.red)
                        }
                    } else {
                        Button(action: { authManager.signInWithGoogle() }) {
                            Text("구글로 로그인하기")
                                .foregroundColor(AppTheme.primary)
                        }
                    }
                }
                
                // 알림 설정 섹션
                Section(header: Text("알림 설정")) {
                    Toggle("실시간 공시 푸시 알림", isOn: $isPushEnabled)
                        .tint(AppTheme.primary)
                    
                    Button(action: {
                        manager.testPushNotification()
                    }) {
                        Label("알림 테스트 실행", systemImage: "bell.badge")
                    }
                }
                
                // 정보 섹션
                Section(header: Text("앱 정보")) {
                    HStack {
                        Text("현재 버전")
                        Spacer()
                        Text(AppVersionHelper.versionString)
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("제작사")
                        Spacer()
                        Text("GIROK Labs.")
                            .foregroundColor(.secondary)
                    }
                    
                    Button(action: {
                        if let url = URL(string: "https://giroklabs.github.io/privacy.html") {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        Text("개인정보 처리방침")
                    }
                    
                    Button(action: {
                        if let url = URL(string: "https://t.me/giroklabs") {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        Text("공식 텔레그램 채널")
                    }
                }
            }
            .listStyle(InsetGroupedListStyle())
            .navigationTitle("설정")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("닫기") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct AppVersionHelper {
    static var versionString: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}
