import Foundation
import Combine
import FirebaseAuth
import GoogleSignIn
import FirebaseCore
import FirebaseFirestore
import AuthenticationServices
import CryptoKit

class AuthManager: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    @Published var isPremium = false
    
    private var listener: ListenerRegistration?
    private var currentNonce: String?
    static let shared = AuthManager()
    
    private var authStateListener: AuthStateDidChangeListenerHandle?

    private init() {
        // Firebase가 직접 인증 상태를 감지 → 타이밍 문제 해결
        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, firebaseUser in
            DispatchQueue.main.async {
                self?.user = firebaseUser
                if let uid = firebaseUser?.uid {
                    self?.startUserListener(uid: uid)
                }
            }
        }
    }
    
    func startUserListener(uid: String) {
        listener?.remove()
        
        let db = Firestore.firestore()
        listener = db.collection("users").document(uid).addSnapshotListener { [weak self] snapshot, error in
            let data = snapshot?.data()
            
            DispatchQueue.main.async {
                // 문서가 없거나 isPremium 필드가 없으면 확실히 false
                self?.isPremium = data?["isPremium"] as? Bool ?? false
            }
            
            // FCM 토큰도 함께 업데이트 (있을 경우)
            if let token = UserDefaults.standard.string(forKey: "fcm_token") {
                db.collection("users").document(uid).setData(["fcmToken": token], merge: true)
            }
        }
    }
    
    func signInWithGoogle() {
        guard let clientID = FirebaseApp.app()?.options.clientID else { return }
        let config = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.configuration = config
        
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootViewController = windowScene.windows.first?.rootViewController else { return }
        
        isLoading = true
        
        GIDSignIn.sharedInstance.signIn(withPresenting: rootViewController) { [weak self] result, error in
            if let error = error {
                print("Google Sign-In Error: \(error.localizedDescription)")
                self?.isLoading = false
                return
            }
            
            guard let user = result?.user,
                  let idToken = user.idToken?.tokenString else {
                self?.isLoading = false
                return
            }
            
            let credential = GoogleAuthProvider.credential(withIDToken: idToken,
                                                         accessToken: user.accessToken.tokenString)
            
            Auth.auth().signIn(with: credential) { authResult, error in
                DispatchQueue.main.async { self?.isLoading = false }
                if let error = error {
                    print("Firebase Auth Error: \(error.localizedDescription)")
                    return
                }
                // user 할당은 authStateDidChangeListener가 자동 처리
                print("Successfully signed in: \(authResult?.user.email ?? "")")
            }
        }
    }
    
    // MARK: - Apple Sign-In
    func startSignInWithApple() -> ASAuthorizationAppleIDRequest {
        let nonce = randomNonceString()
        currentNonce = nonce
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)
        return request
    }

    func signInWithApple(credential: ASAuthorizationAppleIDCredential) {
        guard let nonce = currentNonce,
              let appleIDToken = credential.identityToken,
              let tokenString = String(data: appleIDToken, encoding: .utf8) else {
            print("Apple Sign-In Error: invalid state")
            return
        }
        isLoading = true
        let firebaseCredential = OAuthProvider.appleCredential(
            withIDToken: tokenString,
            rawNonce: nonce,
            fullName: credential.fullName
        )
        Auth.auth().signIn(with: firebaseCredential) { authResult, error in
            DispatchQueue.main.async { self.isLoading = false }
            if let error = error {
                print("Firebase Apple Auth Error: \(error.localizedDescription)")
                return
            }
            print("Successfully signed in with Apple: \(authResult?.user.email ?? "")")
        }
    }

    // MARK: - Sign Out
    func signOut() {
        do {
            listener?.remove()
            try Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
            self.user = nil
            self.isPremium = false
            // 로컬 관심종목 데이터 초기화 (계정 간 데이터 혼선 방지)
            UserDefaults.standard.removeObject(forKey: "dart_watchlist")
            UserDefaults.standard.removeObject(forKey: "notification_history")
            UserDefaults.standard.removeObject(forKey: "notification_history_raw")
            NotificationCenter.default.post(name: Notification.Name("UserDidSignOut"), object: nil)
        } catch {
            print("Sign Out Error")
        }
    }
    
    // MARK: - Account Deletion
    func deleteAccount(completion: @escaping (Bool) -> Void) {
        guard let currentUser = Auth.auth().currentUser else {
            completion(false)
            return
        }
        let uid = currentUser.uid
        let db = Firestore.firestore()
        
        // 1. Firestore 사용자 문서 삭제
        db.collection("users").document(uid).delete { [weak self] error in
            if let error = error {
                print("[DeleteAccount] Firestore 삭제 실패: \(error.localizedDescription)")
            }
            
            // 2. Firebase Auth 계정 삭제
            currentUser.delete { error in
                DispatchQueue.main.async {
                    if let error = error {
                        print("[DeleteAccount] Auth 삭제 실패: \(error.localizedDescription)")
                        completion(false)
                        return
                    }
                    
                    // 3. 로컬 데이터 초기화
                    self?.listener?.remove()
                    self?.user = nil
                    self?.isPremium = false
                    UserDefaults.standard.removeObject(forKey: "dart_watchlist")
                    UserDefaults.standard.removeObject(forKey: "notification_history")
                    UserDefaults.standard.removeObject(forKey: "notification_history_raw")
                    NotificationCenter.default.post(name: Notification.Name("UserDidSignOut"), object: nil)
                    print("[DeleteAccount] 계정 삭제 완료")
                    completion(true)
                }
            }
        }
    }

    // MARK: - Nonce Helpers
    private func randomNonceString(length: Int = 32) -> String {
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length
        while remainingLength > 0 {
            let randoms: [UInt8] = (0 ..< 16).map { _ in
                var random: UInt8 = 0
                _ = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
                return random
            }
            randoms.forEach { random in
                if remainingLength == 0 { return }
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }
        return result
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }
}
