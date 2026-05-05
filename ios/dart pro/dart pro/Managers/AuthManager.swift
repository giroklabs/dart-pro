import Foundation
import Combine
import FirebaseAuth
import GoogleSignIn
import FirebaseCore
import FirebaseFirestore

class AuthManager: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    @Published var isPremium = false
    
    private var listener: ListenerRegistration?
    static let shared = AuthManager()
    
    private init() {
        self.user = Auth.auth().currentUser
        if let uid = self.user?.uid {
            startUserListener(uid: uid)
        }
    }
    
    func startUserListener(uid: String) {
        listener?.remove()
        
        let db = Firestore.firestore()
        listener = db.collection("users").document(uid).addSnapshotListener { [weak self] snapshot, error in
            guard let data = snapshot?.data() else { return }
            
            DispatchQueue.main.async {
                self?.isPremium = data["isPremium"] as? Bool ?? false
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
                self?.isLoading = false
                if let error = error {
                    print("Firebase Auth Error: \(error.localizedDescription)")
                    return
                }
                
                if let user = authResult?.user {
                    self?.user = user
                    self?.startUserListener(uid: user.uid)
                }
                print("Successfully signed in: \(authResult?.user.email ?? "")")
            }
        }
    }
    
    func signOut() {
        do {
            listener?.remove()
            try Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
            self.user = nil
            self.isPremium = false
        } catch {
            print("Sign Out Error")
        }
    }
}
