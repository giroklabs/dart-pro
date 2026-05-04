import Foundation
import Combine
import FirebaseAuth

class DARTManager: ObservableObject {
    @Published var disclosures: [DisclosureItem] = []
    @Published var watchlist: [WatchItem] = [] {
        didSet {
            saveWatchlist()
            // 서버에서 가져오는 중에는 다시 서버로 저장하지 않음 (무한루프 방지)
            if !isFetchingFromServer {
                syncWithBackend()
            }
        }
    }
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private var isFetchingFromServer = false
    private let baseURL = "https://dartpro.duckdns.org/api" // 운영 서버 주소 사용
    private var cancellables = Set<AnyCancellable>()
    
    // Gemini AI 실시간 분석 요청 (캐시 활용)
    func fetchAIAnalysis(reportName: String, corpName: String, rceptNo: String?, completion: @escaping (AnalysisResult?) -> Void) {
        guard let url = URL(string: "\(baseURL)/ai/analyze") else {
            completion(nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        var body: [String: String] = [
            "reportName": reportName,
            "corpName": corpName
        ]
        if let rNo = rceptNo {
            body["rceptNo"] = rNo
        }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data, let result = try? JSONDecoder().decode(AnalysisResult.self, from: data) {
                DispatchQueue.main.async {
                    completion(result)
                }
            } else {
                DispatchQueue.main.async {
                    completion(nil)
                }
            }
        }.resume()
    }
    
    init() {
        isFetchingFromServer = true // 초기화 중 동기화 차단
        loadWatchlist()
        fetchLatestDisclosures()
        isFetchingFromServer = false // 초기화 완료
        
        // FCM 토큰 갱신 시 자동 동기화
        NotificationCenter.default.addObserver(forName: Notification.Name("FCMTokenUpdated"), object: nil, queue: .main) { _ in
            if !self.isFetchingFromServer {
                self.syncWithBackend()
            }
        }
        
        // 로그인 상태 변경 시 서버에서 관심 종목 가져오기
        AuthManager.shared.$user
            .sink { user in
                if user != nil {
                    self.fetchWatchlistFromServer()
                }
            }
            .store(in: &cancellables)
    }
    

    
    func fetchLatestDisclosures() {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd"
        let endDe = formatter.string(from: Date())
        let bgnDe = formatter.string(from: Calendar.current.date(byAdding: .month, value: -3, to: Date()) ?? Date())
        
        let corpCodes = watchlist.map { $0.code }.joined(separator: ",")
        var urlString = "\(baseURL)/dart/list.json?page_count=20&bgn_de=\(bgnDe)&end_de=\(endDe)"
        if !corpCodes.isEmpty {
            urlString += "&corp_code=\(corpCodes)"
        }
        
        guard let url = URL(string: urlString) else { 
            self.isLoading = false
            return 
        }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            self?.isLoading = false
            
            if let error = error {
                print("[API] Disclosures error: \(error.localizedDescription)")
                return
            }
            
            guard let data = data else { return }
            
            // 원문 로그 확인
            if let jsonString = String(data: data, encoding: .utf8) {
                print("[API] Raw Disclosures: \(jsonString.prefix(500))...")
            }
            
            do {
                let response = try JSONDecoder().decode(DisclosureResponse.self, from: data)
                DispatchQueue.main.async {
                    self?.isLoading = false
                    if response.status == "000" {
                        self?.disclosures = response.list ?? []
                        print("[API] Disclosures updated: \(self?.disclosures.count ?? 0) items")
                    } else {
                        print("[API] Server message: \(response.message ?? "no message")")
                        self?.disclosures = []
                    }
                }
            } catch {
                DispatchQueue.main.async { self?.isLoading = false }
                print("[API] Decoding failure: \(error)")
            }
        }.resume()
    }
    
    func testPushNotification() {
        guard let url = URL(string: "\(baseURL)/test-push") else { return }
        let fcmToken = UserDefaults.standard.string(forKey: "fcm_token") ?? ""
        let uid = AuthManager.shared.user?.uid ?? ""
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "fcmToken": fcmToken,
            "uid": uid
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, _, _ in
            if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                print("[API] Test push response: \(json)")
            }
        }.resume()
    }
    
    func searchCompanies(query: String, completion: @escaping ([WatchItem]) -> Void) {
        guard query.count >= 2 else { return }
        
        let urlString = "\(baseURL)/dart/search?query=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        guard let url = URL(string: urlString) else { return }
        
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data else { return }
            // 백엔드가 [{name, code}, ...] 형태의 JSON을 반환한다고 가정
            if let results = try? JSONDecoder().decode([WatchItem].self, from: data) {
                DispatchQueue.main.async {
                    completion(results)
                }
            }
        }.resume()
    }
    
    // 관심 종목 관리
    func toggleWatch(code: String, name: String) {
        if let index = watchlist.firstIndex(where: { $0.code == code }) {
            watchlist.remove(at: index)
        } else {
            watchlist.append(WatchItem(code: code, name: name))
        }
        saveWatchlist()
        fetchLatestDisclosures()
        syncWithBackend()
    }
    
    // 서버에서 관심 종목 리스트 가져오기 (동기화)
    func fetchWatchlistFromServer() {
        guard let uid = AuthManager.shared.user?.uid else { 
            print("[API] Fetch skipped: User not logged in")
            return 
        }
        
        print("[API] Fetching for UID: \(uid)")
        isFetchingFromServer = true // 루프 방지 시작
        
        let urlString = "https://dartpro.duckdns.org/api/push/watchlist?uid=\(uid)"
        guard let url = URL(string: urlString) else { 
            isFetchingFromServer = false
            return 
        }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            defer { 
                DispatchQueue.main.async { self?.isFetchingFromServer = false } 
            }
            
            guard let data = data, error == nil else { return }
            
            if let codes = try? JSONDecoder().decode([String].self, from: data) {
                DispatchQueue.main.async {
                    // 서버에서 받은 코드를 WatchItem 객체로 변환
                    self?.watchlist = codes.map { WatchItem(code: $0, name: "동기화 종목") }
                    print("[API] Watchlist synced from server: \(codes.count) items")
                    self?.fetchLatestDisclosures() // 종목이 생겼으니 공시 바로 조회
                }
            }
        }.resume()
    }
    
    private func loadWatchlist() {
        if let data = UserDefaults.standard.data(forKey: "dart_watchlist"),
           let list = try? JSONDecoder().decode([WatchItem].self, from: data) {
            self.watchlist = list
        }
    }
    
    private func saveWatchlist() {
        if let data = try? JSONEncoder().encode(watchlist) {
            UserDefaults.standard.set(data, forKey: "dart_watchlist")
        }
    }
    
    // 백엔드에 FCM 토큰 및 관심 종목 동기화
    func syncWithBackend() {
        let fcmToken = UserDefaults.standard.string(forKey: "fcm_token") ?? ""
        guard !fcmToken.isEmpty else { return }
        
        let codes = watchlist.map { $0.code }
        var body: [String: Any] = [
            "token": fcmToken,
            "corp_codes": codes
        ]
        
        if let uid = AuthManager.shared.user?.uid {
            body["uid"] = uid
        }
        
        guard let url = URL(string: "\(baseURL)/push/register") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[API] Sync error:", error)
            } else {
                print("[API] Sync success")
            }
        }.resume()
    }
}
