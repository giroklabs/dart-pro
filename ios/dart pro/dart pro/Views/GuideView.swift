import SwiftUI

struct GuideView: View {
    @Binding var hasSeenGuide: Bool
    @Binding var sessionDismissed: Bool
    @State private var doNotShowAgain: Bool = false
    @State private var currentPage = 0
    
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("건너뛰기") {
                    finishGuide()
                }
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(AppTheme.textSecondary)
                .padding()
            }
            
            TabView(selection: $currentPage) {
                GuidePageTemplate(
                    imageName: "GuideImage1",
                    title: "AI 심층분석 및 핵심요약",
                    description: "복잡한 공시를 AI가 알기 쉽게 분석해 드립니다.\n가장 빠르고 정확하게 기업의 핵심 정보를 파악하세요."
                )
                .tag(0)
                
                GuidePageTemplate(
                    imageName: "GuideImage2",
                    title: "관심 종목 설정",
                    description: "내가 보유한 주식이나 관심있는 기업을 등록해 보세요.\n중요한 공시가 올라오면 가장 먼저 알려드립니다."
                )
                .tag(1)
                
                GuidePageTemplate(
                    imageName: "GuideImage3",
                    title: "실시간 맞춤형 알림",
                    description: "관심 종목의 공시를 실시간 푸시 알림으로 받아보세요.\n놓치기 쉬운 주요 공시를 신속하게 확인할 수 있습니다."
                )
                .tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))
            
            VStack(spacing: 20) {
                Button(action: {
                    doNotShowAgain.toggle()
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: doNotShowAgain ? "checkmark.square.fill" : "square")
                            .foregroundStyle(doNotShowAgain ? AppTheme.primary : AppTheme.textSecondary)
                            .font(.system(size: 20))
                        Text("다시 보지 않기")
                            .font(.system(size: 14))
                            .foregroundStyle(AppTheme.textPrimary)
                    }
                }
                
                Button(action: {
                    dismissGuide()
                }) {
                    Text(currentPage == 2 ? "시작하기" : "다음")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(AppTheme.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
            .padding(.top, 20)
        }
        .background(AppTheme.background)
    }
    
    private func dismissGuide() {
        if currentPage < 2 {
            withAnimation {
                currentPage += 1
            }
        } else {
            finishGuide()
        }
    }
    
    private func finishGuide() {
        if doNotShowAgain {
            hasSeenGuide = true
        }
        withAnimation(.easeInOut) {
            sessionDismissed = true
        }
    }
}

struct GuidePageTemplate: View {
    let imageName: String
    let title: String
    let description: String
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            Image(imageName)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 460) // 조금 긴 스크린샷 비율을 감안하여 높이 조정
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(0.1), radius: 10, y: 4)
                .padding(.horizontal, 20)
            
            VStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(AppTheme.textPrimary)
                
                Text(description)
                    .font(.system(size: 15))
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            
            Spacer()
        }
        .padding(32)
    }
}

#Preview {
    GuideView(hasSeenGuide: .constant(false), sessionDismissed: .constant(false))
}
