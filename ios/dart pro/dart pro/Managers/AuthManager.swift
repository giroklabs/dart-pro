import Foundation
import Combine
import FirebaseAuth
import GoogleSignIn
import FirebaseCore

class AuthManager: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    @Published var isPremium = true // 테스트를 위해 기본 true 설정 (나중에 결제 로직 연결)
    
    static let shared = AuthManager()
    
    private init() {
        self.user = Auth.auth().currentUser
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
                self?.user = authResult?.user
                print("Successfully signed in: \(authResult?.user.email ?? "")")
            }
        }
    }
    
    func signOut() {
        do {
            try Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
            self.user = nil
        } catch {
            print("Sign Out Error")
        }
    }
}
