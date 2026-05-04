import SwiftUI

struct SearchView: View {
    @ObservedObject var manager: DARTManager
    @Environment(\.dismiss) var dismiss
    @State private var searchText = ""
    @State private var searchResults: [WatchItem] = []
    @State private var isSearching = false
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.background.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)
                        TextField("기업명 또는 종목코드", text: $searchText)
                            .foregroundColor(.white)
                            .onChange(of: searchText) { newValue in
                                searchCompanies(query: newValue)
                            }
                        if !searchText.isEmpty {
                            Button(action: { searchText = "" }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(12)
                    .padding()
                    
                    // Results List
                    ScrollView {
                        LazyVStack(spacing: 1) {
                            ForEach(searchResults) { corp in
                                SearchResultRow(corp: corp, isWatched: manager.watchlist.contains(where: { $0.code == corp.code })) {
                                    manager.toggleWatch(code: corp.code, name: corp.name)
                                }
                            }
                        }
                    }
                }
                
                if isSearching {
                    ProgressView().tint(AppTheme.primary)
                }
            }
            .navigationTitle("종목 검색")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("닫기") { dismiss() }
                        .foregroundColor(AppTheme.primary)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
    
    private func searchCompanies(query: String) {
        guard query.count >= 2 else {
            self.searchResults = []
            return
        }
        
        isSearching = true
        manager.searchCompanies(query: query) { results in
            self.searchResults = results
            self.isSearching = false
        }
    }
}

struct SearchResultRow: View {
    let corp: WatchItem
    let isWatched: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(corp.name)
                        .font(AppTheme.headlineFont)
                        .foregroundColor(.white)
                    Text(corp.code)
                        .font(AppTheme.captionFont)
                        .foregroundColor(.gray)
                }
                Spacer()
                Image(systemName: isWatched ? "star.fill" : "star")
                    .foregroundColor(isWatched ? AppTheme.primary : .gray)
                    .font(.title3)
            }
            .padding()
            .background(Color.white.opacity(0.05))
        }
    }
}
