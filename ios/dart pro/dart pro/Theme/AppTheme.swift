import SwiftUI

struct AppTheme {
    // Colors
    static let primary = Color(hex: "FFCC00") // DART의 포인트 컬러 유지
    static let secondary = Color(hex: "4A4A4A")
    static let background = Color(hex: "FFFFFF")
    static let cardBackground = Color(hex: "F5F5F7")
    static let textPrimary = Color(hex: "1D1D1F")
    static let textSecondary = Color(hex: "86868B")
    
    // Gradients
    static let backgroundGradient = LinearGradient(
        gradient: Gradient(colors: [Color(hex: "FFFFFF"), Color(hex: "F5F5F7")]),
        startPoint: .top,
        endPoint: .bottom
    )
    
    static let primaryGradient = LinearGradient(
        gradient: Gradient(colors: [Color(hex: "FFCC00"), Color(hex: "FFB800")]),
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // Fonts (MaruBuri 폰트가 없다면 시스템 폰트로 대체)
    static let titleFont = Font.system(size: 22, weight: .bold, design: .rounded)
    static let headlineFont = Font.system(size: 18, weight: .semibold, design: .rounded)
    static let bodyFont = Font.system(size: 16, weight: .regular, design: .rounded)
    static let captionFont = Font.system(size: 14, weight: .medium, design: .rounded)
    static let largeTitleFont = Font.system(size: 32, weight: .black, design: .rounded)
}

// Color Hex Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
