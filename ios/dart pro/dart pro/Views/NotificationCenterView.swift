import SwiftUI

struct NotificationRecord: Codable, Identifiable {
    let id: String
    let title: String
    let body: String
    let rceptNo: String? // 상세보기 링크용 접수번호
    let date: Date
}

struct NotificationCenterView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var notifications: [NotificationRecord] = []
    
    var body: some View {
        NavigationView {
            Group {
                if notifications.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "bell.slash")
                            .font(.system(size: 50))
                            .foregroundColor(.secondary)
                        Text("수신된 알림이 없습니다.")
                            .font(AppTheme.headlineFont)
                            .foregroundColor(.secondary)
                    }
                } else {
                    List {
                        ForEach(notifications) { record in
                            NavigationLink(destination: DisclosureDetailView(record: record)) {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text("공시 알림")
                                            .font(.caption2)
                                            .fontWeight(.bold)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(AppTheme.primary.opacity(0.1))
                                            .foregroundColor(AppTheme.primary)
                                            .cornerRadius(4)
                                        
                                        Spacer()
                                        
                                        Text(timeAgo(record.date))
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                    
                                    Text(record.title)
                                        .font(.system(size: 15, weight: .bold))
                                    
                                    Text(record.body)
                                        .font(.system(size: 14))
                                        .foregroundColor(.secondary)
                                        .lineLimit(2)
                                }
                                .padding(.vertical, 8)
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                        .onDelete(perform: deleteNotifications)
                    }
                    .refreshable {
                        loadNotifications()
                    }
                }
            }
            .navigationTitle("알림 센터")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("닫기") { dismiss() }
                }
            }
            .onAppear(perform: loadNotifications)
        }
    }
    
    private func loadNotifications() {
        let manager = DARTManager()
        manager.fetchNotificationsFromServer { fetchedNotifications in
            self.notifications = fetchedNotifications.sorted(by: { $0.date > $1.date })
            saveNotifications() // 로컬에도 캐시로 저장
        }
    }
    
    private func saveNotifications() {
        if let encoded = try? JSONEncoder().encode(notifications) {
            UserDefaults.standard.set(encoded, forKey: "notification_history")
        }
    }
    
    private func deleteNotifications(at offsets: IndexSet) {
        notifications.remove(atOffsets: offsets)
        saveNotifications()
    }
    
    private func timeAgo(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
