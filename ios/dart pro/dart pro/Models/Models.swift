import Foundation

struct DisclosureResponse: Codable {
    let status: String
    let message: String?
    let list: [DisclosureItem]?
}

struct DisclosureItem: Codable, Identifiable {
    var id: String { rcept_no }
    let corp_code: String
    let corp_name: String
    let stock_code: String?
    let corp_cls: String // Y: 유가, K: 코스닥, N: 코넥스, E: 기타
    let report_nm: String
    let rcept_no: String
    let flr_nm: String
    let rcept_dt: String
    let rm: String?
    
    var formattedDate: String {
        guard rcept_dt.count == 8 else { return rcept_dt }
        let year = rcept_dt.prefix(4)
        let month = rcept_dt.dropFirst(4).prefix(2)
        let day = rcept_dt.dropFirst(6)
        return "\(year).\(month).\(day)"
    }
}

struct WatchItem: Codable, Identifiable {
    var id: String { code }
    let code: String
    let name: String
}
