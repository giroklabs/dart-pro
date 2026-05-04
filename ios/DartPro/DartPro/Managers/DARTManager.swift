import Foundation
import Combine

class DARTManager: ObservableObject {
    @Published var disclosures: [DisclosureItem] = []
    @Published var watchlist: [WatchItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let baseURL = "http://localhost:3000/api" // 실제 배포 주소로 변경 필요
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        loadWatchlist()
        fetchLatestDisclosures()
        
        // FCM 토큰 갱신 시 자동 동기화
        NotificationCenter.default.addObserver(forName: Notification.Name("FCMTokenUpdated"), object: nil, queue: .main) { _ in
            self.syncWithBackend()
        }
    }
    
    func fetchLatestDisclosures() {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        
        let corpCodes = watchlist.map { $0.code }.joined(separator: ",")
        var urlString = "\(baseURL)/dart/list.json?page_count=20"
        if !corpCodes.isEmpty {
            urlString += "&corp_code=\(corpCodes)"
        }
        
        guard let url = URL(string: urlString) else { return }
        
        URLSession.shared.dataTaskPublisher(for: url)
            .map { $0.data }
            .decode(type: DisclosureResponse.self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoading = false
                if case .failure(let error) = completion {
                    self.errorMessage = "데이터 로드 실패: \(error.localizedDescription)"
                }
            } receiveValue: { response in
                if response.status == "000" {
                    self.disclosures = response.list ?? []
                } else if response.status == "013" {
                    self.disclosures = []
                } else {
                    self.errorMessage = response.message ?? "알 수 없는 오류"
                }
            }
            .store(in: &cancellables)
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
        let body: [String: Any] = [
            "token": fcmToken,
            "corp_codes": codes
        ]
        
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
