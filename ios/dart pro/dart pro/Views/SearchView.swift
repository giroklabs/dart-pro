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
                Color(.systemGroupedBackground).ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        
                        TextField("기업명 또는 종목코드", text: $searchText)
                            .submitLabel(.search)
                            .onSubmit {
                                performSearch()
                            }
                        
                        if !searchText.isEmpty {
                            Button(action: { 
                                searchText = "" 
                                searchResults = []
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(12)
                    .padding()
                    
                    // Results List
                    if searchResults.isEmpty && !isSearching && !searchText.isEmpty {
                        VStack(spacing: 12) {
                            Spacer()
                            Image(systemName: "questionmark.circle")
                                .font(.system(size: 40))
                                .foregroundColor(.secondary)
                            Text("검색 결과가 없습니다.")
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                    } else {
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
                }
                
                if isSearching {
                    ProgressView()
                        .padding()
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color(.systemBackground).opacity(0.8)))
                }
            }
            .navigationTitle("종목 검색")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }
    
    private func performSearch() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else { return }
        
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
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text(corp.code)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Image(systemName: isWatched ? "star.fill" : "star")
                    .foregroundColor(isWatched ? .yellow : .secondary)
                    .font(.title3)
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
        }
        .buttonStyle(PlainButtonStyle())
    }
}
