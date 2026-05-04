import SwiftUI

struct DisclosureCard: View {
    let item: DisclosureItem
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                // 시장 구분 뱃지
                Text(item.corp_cls_name)
                    .font(.system(size: 10, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(item.corp_cls_color.opacity(0.2))
                    .foregroundColor(item.corp_cls_color)
                    .cornerRadius(4)
                
                Spacer()
                
                Text(item.formattedDate)
                    .font(AppTheme.captionFont)
                    .foregroundColor(AppTheme.textSecondary)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(item.corp_name)
                    .font(AppTheme.headlineFont)
                    .foregroundColor(AppTheme.textPrimary)
                
                Text(item.report_nm)
                    .font(AppTheme.bodyFont)
                    .foregroundColor(AppTheme.textPrimary)
                    .lineLimit(2)
            }
            
            HStack {
                Text(item.flr_nm)
                    .font(AppTheme.captionFont)
                    .foregroundColor(AppTheme.textSecondary)
                
                Spacer()
                
                // AI 분석 버튼 (예시)
                HStack(spacing: 4) {
                    Image(systemName: "sparkles")
                    Text("QUICK 분석")
                }
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(AppTheme.primary.opacity(0.1))
                .foregroundColor(AppTheme.primary)
                .cornerRadius(20)
            }
        }
        .padding(16)
        .background(AppTheme.cardBackground)
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.3), radius: 10, x: 0, y: 5)
    }
}

extension DisclosureItem {
    var corp_cls_name: String {
        switch corp_cls {
        case "Y": return "유가"
        case "K": return "코스닥"
        case "N": return "코넥스"
        default: return "기타"
        }
    }
    
    var corp_cls_color: Color {
        switch corp_cls {
        case "Y": return .blue
        case "K": return .orange
        case "N": return .green
        default: return .gray
        }
    }
}
