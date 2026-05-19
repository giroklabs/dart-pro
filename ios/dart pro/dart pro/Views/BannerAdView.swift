import SwiftUI
import GoogleMobileAds

struct BannerAdView: UIViewControllerRepresentable {
    let adUnitID: String
    
    func makeUIViewController(context: Context) -> UIViewController {
        let view = BannerView(adSize: AdSizeBanner)
        let viewController = UIViewController()
        view.adUnitID = adUnitID
        view.rootViewController = viewController
        viewController.view.addSubview(view)
        viewController.view.frame = CGRect(origin: .zero, size: AdSizeBanner.size)
        view.load(Request())
        return viewController
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
