import SwiftUI

struct WatchlistView: View {
    @ObservedObject var manager: DARTManager
    @Environment(\.dismiss) var dismiss
    @State private var showingSearch = false

    var body: some View {
        NavigationView {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                Group {
                    if manager.watchlist.isEmpty {
                        emptyState
                    } else {
                        watchlistContent
                    }
                }
            }
            .navigationTitle("관심 종목")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("닫기") { dismiss() }
                        .foregroundColor(.primary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingSearch = true }) {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                    }
                }
            }
            .sheet(isPresented: $showingSearch) {
                SearchView(manager: manager)
            }
        }
    }

    // MARK: - Empty State
    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "star")
                .font(.system(size: 48, weight: .thin))
                .foregroundColor(.secondary)
            Text("관심 종목이 없어요")
                .font(.headline)
                .foregroundColor(.primary)
            Text("우측 상단 + 버튼으로\n종목을 추가해 보세요.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Watchlist Content
    private var watchlistContent: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(manager.watchlist) { item in
                    WatchlistRow(item: item) {
                        manager.toggleWatch(code: item.code, name: item.name)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 30)
        }
    }
}

// MARK: - Row
struct WatchlistRow: View {
    let item: WatchItem
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            // 종목 아이콘
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.accentColor.opacity(0.1))
                    .frame(width: 44, height: 44)
                Text(String(item.name.prefix(1)))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.accentColor)
            }

            // 종목 정보
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.primary)
                Text(item.code)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // 삭제 버튼
            Button(action: onDelete) {
                Image(systemName: "star.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.yellow)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(14)
    }
}
