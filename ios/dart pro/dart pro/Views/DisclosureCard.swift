import SwiftUI

struct DisclosureCard: View {
    let item: DisclosureItem
    let isGeminiEnabled: Bool
    @StateObject var authManager = AuthManager.shared
    @State private var showSafari = false
    @State private var geminiResult: AnalysisResult?
    @State private var isAnalyzing = false
    
    // 기본 로컬 분석 (백업용)
    private var quickAnalysis: AnalysisResult {
        item.analysis
    }
    
    var body: some View {
        let analysis = geminiResult ?? quickAnalysis
        
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
            
            // DART 상세보기 링크 (웹 스타일)
            if let rceptNo = item.rcept_no, !rceptNo.isEmpty {
                Button(action: { showSafari = true }) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.right.square")
                        Text("DART 상세보기")
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(AppTheme.primary)
                }
                .sheet(isPresented: $showSafari) {
                    if let url = URL(string: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=\(rceptNo)") {
                        SafariView(url: url)
                    }
                }
            }
            
            // 분석 섹션 (QUICK 분석 + Gemini 연동)
            VStack(alignment: .leading, spacing: 10) {
                // 상단 헤더
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
                    
                    // 투자 영향도 표시
                    if isAnalyzing {
                        ProgressView().scaleEffect(0.7)
                    } else {
                        Text(analysis.impact)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(impactColor(analysis.typeCls))
                    }
                }
                
                // 분석 내용
                VStack(alignment: .leading, spacing: 8) {
                    // 기본 QUICK 분석 결과
                    VStack(alignment: .leading, spacing: 4) {
                        Text(analysis.insight)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary.opacity(0.9))
                        
                        if !isGeminiEnabled {
                            ForEach(analysis.points.prefix(2), id: \.self) { point in
                                HStack(alignment: .top, spacing: 4) {
                                    Text("•")
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)
                                    Text(point)
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                    
                    // Gemini AI 상세 분석 (글로벌 토글 ON & 프리미엄일 때)
                    if isGeminiEnabled && authManager.isPremium {
                        VStack(alignment: .leading, spacing: 6) {
                            Divider()
                                .padding(.vertical, 4)
                            
                            HStack {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 10))
                                    .foregroundColor(.purple)
                                Text(isAnalyzing ? "Gemini 분석 중..." : "Gemini Insight")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.purple)
                            }
                            
                            if isAnalyzing {
                                Text("데이터를 분석하여 투자 인사이트를 도출하고 있습니다.")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                                    .italic()
                            } else {
                                ForEach(analysis.points, id: \.self) { point in
                                    HStack(alignment: .top, spacing: 6) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 10))
                                            .foregroundColor(.purple)
                                            .padding(.top, 2)
                                        Text(point)
                                            .font(.system(size: 12))
                                            .foregroundColor(.primary.opacity(0.8))
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                            }
                        }
                        .transition(.opacity)
                    }
                }
            }
            .padding(12)
            .background(isGeminiEnabled && authManager.isPremium ? Color.purple.opacity(0.03) : Color.secondary.opacity(0.05))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isGeminiEnabled && authManager.isPremium ? Color.purple.opacity(0.3) : impactColor(analysis.typeCls).opacity(0.2), lineWidth: 1)
            )
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(16)
        .padding(.horizontal)
        .onChange(of: isGeminiEnabled) { newValue in
            if newValue && authManager.isPremium && geminiResult == nil {
                startGeminiAnalysis()
            }
        }
    }
    
    private func startGeminiAnalysis() {
        isAnalyzing = true
        let manager = DARTManager()
        manager.fetchAIAnalysis(reportName: item.report_nm ?? "", corpName: item.corp_name ?? "", rceptNo: item.rcept_no) { result in
            if let result = result {
                self.geminiResult = result
            }
            self.isAnalyzing = false
        }
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
