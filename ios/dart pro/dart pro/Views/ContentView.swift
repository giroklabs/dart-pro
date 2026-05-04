import SwiftUI
import FirebaseAuth

struct ContentView: View {
    @StateObject var manager = DARTManager()
    @StateObject var authManager = AuthManager.shared
    @State private var showingSearch = false
    @State private var showingSettings = false
    @State private var showingNotificationCenter = false
    
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
                                .foregroundColor(.primary)
                            if let user = authManager.user {
                                Text("\(user.email ?? "사용자")님 환영합니다")
                                    .font(AppTheme.captionFont)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        Spacer()
                        
                        HStack(spacing: 12) {
                            // 알림 센터 버튼
                            Button(action: { showingNotificationCenter = true }) {
                                Image(systemName: "bell")
                                    .font(.title3)
                                    .foregroundColor(.primary)
                            }
                            
                            // 설정 버튼
                            Button(action: { showingSettings = true }) {
                                Image(systemName: "gearshape")
                                    .font(.title3)
                                    .foregroundColor(.primary)
                            }
                            
                            // 검색 버튼
                            Button(action: { showingSearch = true }) {
                                Image(systemName: "magnifyingglass")
                                    .font(.title3)
                                    .foregroundColor(.primary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.secondary.opacity(0.1))
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
        .sheet(isPresented: $showingSettings) {
            SettingsView(manager: manager)
        }
        .sheet(isPresented: $showingNotificationCenter) {
            NotificationCenterView()
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
