import SwiftUI

struct SplashView: View {
    @State private var isActive = false
    @State private var currentDotIndex = 0
    @State private var logoOpacity = 0.0
    @State private var logoScale = 0.85

    var body: some View {
        if isActive {
            ContentView()
        } else {
            ZStack {
                Color(UIColor.systemBackground)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    Spacer()

                    // 중앙: 로고
                    VStack(spacing: 28) {
                        Image("applogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 120, height: 120)
                            .cornerRadius(24)
                            .shadow(color: Color.black.opacity(0.12), radius: 20, x: 0, y: 8)
                            .scaleEffect(logoScale)
                            .opacity(logoOpacity)

                        VStack(spacing: 6) {
                            Text("공시알리미")
                                .font(.system(size: 30, weight: .black))
                                .foregroundColor(.primary)

                            Text("실시간 DART 공시 모니터링")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.secondary)
                                .padding(.top, 2)
                        }
                        .opacity(logoOpacity)
                    }

                    Spacer()

                    // 하단 점 애니메이션
                    HStack(spacing: 8) {
                        ForEach(0..<3) { index in
                            Circle()
                                .fill(Color.primary.opacity(currentDotIndex == index ? 0.75 : 0.18))
                                .frame(width: 9, height: 9)
                                .scaleEffect(currentDotIndex == index ? 1.2 : 1.0)
                                .animation(.easeInOut(duration: 0.3), value: currentDotIndex)
                        }
                    }
                    .padding(.bottom, 56)
                }
            }
            .onAppear {
                // 로고 페이드인
                withAnimation(.easeOut(duration: 0.6)) {
                    logoOpacity = 1.0
                    logoScale = 1.0
                }
                startDotAnimation()

                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        isActive = true
                    }
                }
            }
        }
    }

    private func startDotAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { timer in
            if isActive {
                timer.invalidate()
                return
            }
            withAnimation(.easeInOut(duration: 0.4)) {
                currentDotIndex = (currentDotIndex + 1) % 3
            }
        }
    }
}

struct SplashView_Previews: PreviewProvider {
    static var previews: some View {
        SplashView()
    }
}
