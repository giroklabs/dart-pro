import SwiftUI
import FirebaseAuth

struct ContentView: View {
    @StateObject var manager = DARTManager()
    @StateObject var authManager = AuthManager.shared
    @State private var showingSearch = false
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.backgroundGradient.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("DART Pro")
                                .font(AppTheme.largeTitleFont)
                                .foregroundColor(AppTheme.primary)
                            if let user = authManager.user {
                                Text("\(user.email ?? "사용자")님 환영합니다")
                                    .font(AppTheme.captionFont)
                                    .foregroundColor(AppTheme.textSecondary)
                            } else {
                                Text("로그인하여 종목을 동기화하세요")
                                    .font(AppTheme.captionFont)
                                    .foregroundColor(AppTheme.textSecondary)
                            }
                        }
                        
                        Spacer()
                        
                        HStack(spacing: 12) {
                            Button(action: {
                                if authManager.user != nil {
                                    authManager.signOut()
                                } else {
                                    authManager.signInWithGoogle()
                                }
                            }) {
                                Image(systemName: authManager.user != nil ? "person.circle.fill" : "person.circle")
                                    .font(.title2)
                                    .foregroundColor(AppTheme.primary)
                            }
                            
                            Button(action: { showingSearch = true }) {
                                Image(systemName: "magnifyingglass")
                                    .font(.title2)
                                    .foregroundColor(AppTheme.primary)
                            }
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.05))
                        .clipShape(Capsule())
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                    .padding(.bottom, 20)
                    
                    // Main Content
                    if manager.disclosures.isEmpty && !manager.isLoading {
                        EmptyStateView()
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(manager.disclosures) { item in
                                    DisclosureCard(item: item)
                                        .padding(.horizontal, 16)
                                }
                            }
                            .padding(.top, 8)
                            .padding(.bottom, 30)
                        }
                        .refreshable {
                            manager.fetchLatestDisclosures()
                        }
                    }
                }
                
                if manager.isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.primary))
                        .scaleEffect(1.5)
                }
            }
            .navigationBarHidden(true)
        }
        .sheet(isPresented: $showingSearch) {
            SearchView(manager: manager)
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "tray.and.arrow.down")
                .font(.system(size: 60))
                .foregroundColor(AppTheme.textSecondary.opacity(0.5))
            
            Text("관심 종목을 추가하여\n실시간 공시를 받아보세요.")
                .font(AppTheme.headlineFont)
                .foregroundColor(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxHeight: .infinity)
    }
}


struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
