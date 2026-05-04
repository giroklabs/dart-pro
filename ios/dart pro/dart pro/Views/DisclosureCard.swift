import SwiftUI

struct DisclosureCard: View {
    let item: DisclosureItem
    
    var body: some View {
        let analysis = item.analysis
        
        VStack(alignment: .leading, spacing: 12) {
            // 헤더: 법인구분 및 날짜
            HStack {
                Text(item.corp_cls == "Y" ? "코스피" : "코스닥")
                    .font(.system(size: 10, weight: .bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(item.corp_cls == "Y" ? Color.blue.opacity(0.1) : Color.orange.opacity(0.1))
                    .foregroundColor(item.corp_cls == "Y" ? .blue : .orange)
                    .cornerRadius(4)
                
                Spacer()
                
                Text(item.formattedDate)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            
            // 제목 및 회사명
            VStack(alignment: .leading, spacing: 4) {
                Text(item.corp_name ?? "알 수 없음")
                    .font(.system(size: 18, weight: .bold))
                
                Text(item.report_nm ?? "공시 정보 없음")
                    .font(.system(size: 14))
                    .foregroundColor(.primary)
                    .lineLimit(2)
            }
            
            // QUICK 분석 섹션 (웹 스타일)
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                        .foregroundColor(.yellow)
                        .font(.system(size: 12))
                    Text("QUICK 분석")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.secondary)
                    
                    Text("[\(analysis.category)]")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary.opacity(0.7))
                    
                    Spacer()
                    
                    Text(analysis.impact)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(impactColor(analysis.typeCls))
                }
                
                // 픽토그램 제거 및 텍스트 중심 레이아웃
                VStack(alignment: .leading, spacing: 6) {
                    Text(analysis.insight)
                        .font(.system(size: 13, weight: .bold)) // 강조를 위해 굵게 변경
                        .foregroundColor(.primary.opacity(0.9))
                    
                    ForEach(analysis.points, id: \.self) { point in
                        HStack(alignment: .top, spacing: 4) {
                            Text("•")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                            Text(point)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .padding(12)
            .background(Color.secondary.opacity(0.05))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(impactColor(analysis.typeCls).opacity(0.2), lineWidth: 1)
            )
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    private func impactColor(_ type: String) -> Color {
        switch type {
        case "success": return .green
        case "warning": return .orange
        case "danger": return .red
        case "info": return .blue
        default: return .secondary
        }
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
