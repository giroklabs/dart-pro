import SwiftUI
import SafariServices

struct DisclosureDetailView: View {
    let record: NotificationRecord
    @StateObject var authManager = AuthManager.shared
    @State private var isGeminiEnabled = false
    @State private var showSafari = false
    @State private var showAISafari = false
    @State private var showPremiumAlert = false
    @State private var geminiResult: AnalysisResult?
    @State private var isAnalyzing = false
    
    // 기본 로컬 분석 (백업용)
    private var quickAnalysis: AnalysisResult {
        QuickAnalysisManager.shared.analyze(reportName: record.body, corpName: record.title)
    }
    
    var body: some View {
        let analysis = geminiResult ?? quickAnalysis
        
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // 헤더 섹션
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(analysis.category)
                            .font(.caption)
                            .fontWeight(.bold)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(AppTheme.primary.opacity(0.1))
                            .foregroundColor(AppTheme.primary)
                            .cornerRadius(4)
                        
                        Spacer()
                        
                        Text(record.date, style: .date)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    Text(record.title)
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text(record.body)
                        .font(.body)
                        .foregroundColor(.primary)
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(12)
                .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
                
                // 상세보기 및 AI 분석 링크 (한 줄 배치)
                HStack(spacing: 20) {
                    if let rceptNo = record.rceptNo, !rceptNo.isEmpty {
                        Button(action: { showSafari = true }) {
                            HStack {
                                Image(systemName: "doc.text.fill")
                                Text("DART 상세보기")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(AppTheme.primary)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .sheet(isPresented: $showSafari) {
                            if let url = URL(string: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=\(rceptNo)") {
                                SafariView(url: url)
                            }
                        }
                    }
                    
                    Button(action: {
                        if authManager.isPremium {
                            if let url = URL(string: "https://dartpro.duckdns.org/dashboard") {
                                UIApplication.shared.open(url)
                            }
                        } else {
                            showPremiumAlert = true
                        }
                    }) {
                        HStack {
                            Image(systemName: "sparkles")
                            Text("AI 심층분석")
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.purple)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                }
                .alert("프리미엄 전용 기능", isPresented: $showPremiumAlert) {
                    Button("확인", role: .cancel) { }
                } message: {
                    Text("Gemini AI 심층 분석은 프리미엄 구독자에게만 제공됩니다. 웹 대시보드에서 전문적인 리포트를 확인해 보세요!")
                }
                
                Spacer()
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("공시 상세")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: isGeminiEnabled) { newValue in
            if newValue && authManager.isPremium && geminiResult == nil {
                startGeminiAnalysis()
            }
        }
    }
    
    private func startGeminiAnalysis() {
        isAnalyzing = true
        let manager = DARTManager()
        manager.fetchAIAnalysis(reportName: record.body, corpName: record.title, rceptNo: record.rceptNo) { result in
            if let result = result {
                self.geminiResult = result
            }
            self.isAnalyzing = false
        }
    }
}
