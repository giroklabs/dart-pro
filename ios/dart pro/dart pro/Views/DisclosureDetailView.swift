import SwiftUI
import SafariServices

struct DisclosureDetailView: View {
    let record: NotificationRecord
    @StateObject var authManager = AuthManager.shared
    @State private var isGeminiEnabled = false
    @State private var showSafari = false
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
                
                // 상세보기 링크 버튼
                if let rceptNo = record.rceptNo, !rceptNo.isEmpty {
                    Button(action: { showSafari = true }) {
                        HStack {
                            Image(systemName: "doc.text.fill")
                            Text("DART 공시 원문 상세보기")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(AppTheme.primary)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .sheet(isPresented: $showSafari) {
                        if let url = URL(string: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=\(rceptNo)") {
                            SafariView(url: url)
                        }
                    }
                }
                
                // Gemini AI 분석 섹션
                VStack(alignment: .leading, spacing: 15) {
                    HStack {
                        Image(systemName: "sparkles")
                            .foregroundColor(.purple)
                        Text(isAnalyzing ? "Gemini 실시간 분석 중..." : "Gemini AI 스마트 분석")
                            .font(.headline)
                        
                        Spacer()
                        
                        if isAnalyzing {
                            ProgressView()
                        } else if authManager.isPremium {
                            Toggle("", isOn: $isGeminiEnabled)
                                .labelsHidden()
                                .tint(.purple)
                        } else {
                            Image(systemName: "lock.fill")
                                .foregroundColor(.secondary)
                                .font(.caption)
                        }
                    }
                    
                    if !authManager.isPremium {
                        VStack(alignment: .center, spacing: 10) {
                            Text("프리미엄 전용 기능입니다.")
                                .font(.subheadline)
                                .fontWeight(.bold)
                            Text("AI 분석을 통해 공시의 핵심과 투자 인사이트를 즉시 확인하세요.")
                                .font(.caption)
                                .multilineTextAlignment(.center)
                                .foregroundColor(.secondary)
                            
                            Button("프리미엄 업그레이드") {
                                // 업그레이드 로직
                            }
                            .font(.caption)
                            .fontWeight(.bold)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color.purple.opacity(0.1))
                            .foregroundColor(.purple)
                            .cornerRadius(20)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.purple.opacity(0.05))
                        .cornerRadius(10)
                    } else if isGeminiEnabled {
                        VStack(alignment: .leading, spacing: 12) {
                            if isAnalyzing {
                                Text("Gemini가 공시 내용을 심층 분석하고 있습니다. 잠시만 기다려주세요...")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    .italic()
                            } else {
                                Text(analysis.insight)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.purple)
                                
                                Divider()
                                
                                ForEach(analysis.points, id: \.self) { point in
                                    HStack(alignment: .top, spacing: 8) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.caption)
                                            .foregroundColor(.purple)
                                            .padding(.top, 2)
                                        Text(point)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                
                                HStack {
                                    Text("투자 영향도:")
                                        .font(.caption)
                                        .fontWeight(.bold)
                                    Text(analysis.impact)
                                        .font(.caption)
                                        .foregroundColor(.purple)
                                }
                                .padding(.top, 4)
                            }
                        }
                        .padding()
                        .background(Color.purple.opacity(0.05))
                        .cornerRadius(10)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    } else {
                        Text("토글을 켜서 AI 분석 내용을 확인하세요.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(12)
                .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
                
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
