import SwiftUI
import FirebaseAuth
import AuthenticationServices

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var manager: DARTManager
    @StateObject var authManager = AuthManager.shared
    @AppStorage("isPushEnabled") private var isPushEnabled = true
    @State private var showDeleteConfirm = false
    @State private var showFinalDeleteConfirm = false
    @State private var isDeleting = false
    
    var body: some View {
        NavigationView {
            List {
                // 계정 섹션
                Section(header: Text("계정 정보")) {
                    if let user = authManager.user {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Image(systemName: "person.crop.circle.fill")
                                    .font(.system(size: 40))
                                    .foregroundColor(AppTheme.primary)
                                
                                VStack(alignment: .leading) {
                                    Text(user.email ?? "사용자")
                                        .font(AppTheme.headlineFont)
                                    Text("공시알리미 프리미엄")
                                        .font(.caption)
                                        .foregroundColor(AppTheme.primary)
                                }
                                
                                Spacer()
                                
                                Button(action: { authManager.signOut() }) {
                                    Text("로그아웃")
                                        .font(.system(size: 13))
                                        .foregroundColor(.red)
                                }
                            }
                        }
                        .padding(.vertical, 6)
                        .listRowSeparator(.hidden)
                    } else {
                        VStack(spacing: 8) {
                            // 구글 로그인
                            Button(action: { authManager.signInWithGoogle() }) {
                                HStack(spacing: 8) {
                                    Image(systemName: "globe")
                                        .font(.system(size: 16, weight: .medium))
                                    Text("Google로 로그인")
                                        .font(.system(size: 16, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                .background(Color.black)
                                .cornerRadius(8)
                            }
                            // Apple 로그인
                            SignInWithAppleButton(.signIn) { request in
                                let appleRequest = authManager.startSignInWithApple()
                                request.requestedScopes = appleRequest.requestedScopes
                                request.nonce = appleRequest.nonce
                            } onCompletion: { result in
                                switch result {
                                case .success(let auth):
                                    if let credential = auth.credential as? ASAuthorizationAppleIDCredential {
                                        authManager.signInWithApple(credential: credential)
                                    }
                                case .failure(let error):
                                    print("Apple Sign-In failed: \(error.localizedDescription)")
                                }
                            }
                            .signInWithAppleButtonStyle(.black)
                            .frame(height: 44)
                            .cornerRadius(8)
                        }
                        .padding(.vertical, 4)
                        .listRowSeparator(.hidden)
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
                        if let url = URL(string: "https://dartpro.duckdns.org/") {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        Text("공식 사이트")
                    }
                }
                
                // 계정 삭제 섹션
                if authManager.user != nil {
                    Section {
                        Button(action: { showDeleteConfirm = true }) {
                            HStack {
                                Image(systemName: "person.crop.circle.badge.minus")
                                Text("계정 삭제")
                            }
                            .foregroundColor(.red)
                        }
                        .disabled(isDeleting)
                    } footer: {
                        Text("계정을 삭제하면 모든 데이터(관심종목, 알림 내역)가 영구적으로 삭제되며 복구할 수 없습니다.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .listStyle(InsetGroupedListStyle())
            .alert("계정을 삭제하시겠습니까?", isPresented: $showDeleteConfirm) {
                Button("취소", role: .cancel) { }
                Button("계속", role: .destructive) { showFinalDeleteConfirm = true }
            } message: {
                Text("계정 삭제 시 모든 데이터가 영구 삭제됩니다.")
            }
            .alert("최종 확인", isPresented: $showFinalDeleteConfirm) {
                Button("취소", role: .cancel) { }
                Button("계정 삭제", role: .destructive) {
                    isDeleting = true
                    authManager.deleteAccount { success in
                        isDeleting = false
                        if success { dismiss() }
                    }
                }
            } message: {
                Text("정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")
            }
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
