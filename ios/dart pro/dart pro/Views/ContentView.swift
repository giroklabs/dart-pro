import SwiftUI
import FirebaseAuth

struct ContentView: View {
    @StateObject var manager = DARTManager()
    @StateObject var authManager = AuthManager.shared
    @State private var showingSearch = false
    @State private var showingSettings = false
    @State private var showingNotificationCenter = false
    @State private var isGeminiEnabled = false
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.backgroundGradient.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Slim Header
                    HStack {
                        Text("공시알리미")
                            .font(.system(size: 26, weight: .black))
                            .foregroundColor(.primary)
                        
                        Spacer()
                        
                        HStack(spacing: 12) {
                            Button(action: { showingNotificationCenter = true }) {
                                Image(systemName: "bell")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(.primary)
                            }
                            
                            Button(action: { showingSettings = true }) {
                                Image(systemName: "gearshape")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(.primary)
                            }
                            
                            Button(action: { showingSearch = true }) {
                                Image(systemName: "star.fill")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(.yellow)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.secondary.opacity(0.1))
                        .clipShape(Capsule())
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                    .padding(.bottom, 12)
                    
                    /*
                    // Global Gemini Analysis Toggle Bar
                    VStack(spacing: 0) {
                        HStack {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 14))
                                    .foregroundColor(.purple)
                                Text("Gemini AI 스마트 분석")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.purple)
                            }
                            
                            Spacer()
                            
                            if authManager.isPremium {
                                Toggle("", isOn: $isGeminiEnabled.animation())
                                    .labelsHidden()
                                    .tint(.purple)
                            } else {
                                HStack(spacing: 4) {
                                    Image(systemName: "lock.fill")
                                        .font(.system(size: 10))
                                    Text("Premium")
                                        .font(.system(size: 10, weight: .bold))
                                }
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.secondary.opacity(0.1))
                                .cornerRadius(8)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 14)
                        .background(Color.purple.opacity(0.05))
                        .cornerRadius(12)
                        .padding(.horizontal, 16)
                    }
                    .padding(.bottom, 10)
                    */
                    
                    // Main List
                    if manager.disclosures.isEmpty && !manager.isLoading {
                        EmptyStateView()
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(manager.disclosures) { item in
                                    DisclosureCard(item: item, isGeminiEnabled: isGeminiEnabled)
                                        .padding(.horizontal, 4)
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
            WatchlistView(manager: manager)
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
