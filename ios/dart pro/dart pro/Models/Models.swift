import Foundation

struct DisclosureResponse: Codable {
    let status: String
    let message: String?
    let list: [DisclosureItem]?
}

struct DisclosureItem: Codable, Identifiable {
    let id = UUID()
    let corp_code: String?
    let corp_name: String?
    let report_nm: String?
    let rcept_no: String?
    let flr_nm: String?
    let rcept_dt: String?
    let corp_cls: String?
    let stock_code: String?
    let rm: String?
    
    enum CodingKeys: String, CodingKey {
        case corp_code, corp_name, report_nm, rcept_no, flr_nm, rcept_dt, corp_cls, stock_code, rm
    }
    
    // QUICK 분석 결과 반환
    var analysis: AnalysisResult {
        QuickAnalysisManager.shared.analyze(reportName: report_nm ?? "", corpName: corp_name ?? "")
    }
    
    var formattedDate: String {
        guard let dateString = rcept_dt, dateString.count == 8 else { return rcept_dt ?? "" }
        let year = dateString.prefix(4)
        let month = dateString.dropFirst(4).prefix(2)
        let day = dateString.dropFirst(6)
        return "\(year).\(month).\(day)"
    }
}

struct WatchItem: Codable, Identifiable {
    var id: String { code }
    let code: String
    let name: String
}
