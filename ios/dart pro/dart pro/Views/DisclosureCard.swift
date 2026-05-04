import SwiftUI

struct DisclosureCard: View {
    let item: DisclosureItem
    let isGeminiEnabled: Bool
    @StateObject var authManager = AuthManager.shared
    @State private var showSafari = false
    @State private var showAISafari = false
    @State private var showPremiumAlert = false
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
            
            // 링크 섹션: 상세보기 및 AI 분석
            HStack(spacing: 16) {
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
                
                Button(action: {
                    if authManager.isPremium {
                        showAISafari = true
                    } else {
                        showPremiumAlert = true
                    }
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkles")
                        Text("AI 심층분석")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.purple)
                }
                .sheet(isPresented: $showAISafari) {
                    if let url = URL(string: "https://dartpro.duckdns.org/dashboard") {
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
        .alert("프리미엄 전용 기능", isPresented: $showPremiumAlert) {
            Button("확인", role: .cancel) { }
        } message: {
            Text("Gemini AI 심층 분석은 프리미엄 구독자에게만 제공됩니다. 웹 대시보드에서 전문적인 리포트를 확인해 보세요!")
        }
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
