import Foundation

struct AnalysisResult {
    let category: String
    let insight: String
    let points: [String]
    let impact: String
    let typeCls: String // success, warning, info, danger, default
    let icon: String
}

class QuickAnalysisManager {
    static let shared = QuickAnalysisManager()
    
    func analyze(reportName: String, corpName: String) -> AnalysisResult {
        var insight = "최근 접수된 공시입니다. 상세 내용을 검토하세요."
        var points = ["공시 제목: \(reportName.components(separatedBy: "[").first?.trimmingCharacters(in: .whitespaces) ?? reportName)", "신규 접수된 공시를 확인하세요."]
        var impact = "정보 확인"
        var category = "기타"
        var typeCls = "default"
        var icon = "bell.fill"

        // 1. 배당 관련
        if reportName.contains("배당") {
            insight = "현금/현물 배당 결정: 주주 환원의 핵심 지표가 발표되었습니다."
            points = ["과거 배당금 대비 증액 여부 확인", "시가배당률과 예상 수익률 검토", "배당 기준일까지 보유 여부 판단"]
            impact = "긍정적 (배당수익)"
            category = "주주환원"
            typeCls = "success"
            icon = "dollarsign.circle.fill"
        } 
        // 2. 실적 보고서 (정기)
        else if reportName.contains("사업보고서") || reportName.contains("분기보고서") || reportName.contains("반기보고서") {
            insight = "정기 실적 보고서: 기업의 공식 성적표가 공개되었습니다."
            points = ["매출·영업이익·순이익 전년 동기 대비 확인", "어닝 서프라이즈/쇼크 여부 판단", "부채비율 및 현금흐름 변화 체크"]
            impact = "실적 변동"
            category = "정기실적"
            typeCls = "info"
            icon = "doc.text.magnifyingglass"
        }
        // 3. 실적 속보
        else if reportName.contains("매출액") || reportName.contains("영업이익") || reportName.contains("실적") {
            insight = "실적 관련 공시: 매출 또는 이익 변동 내용이 포함되어 있습니다."
            points = ["예상 대비 실적 달성 여부 확인", "가이던스 상향/하향 여부 검토", "업종 내 경쟁사 대비 포지셔닝 확인"]
            impact = "실적 변동"
            category = "실적속보"
            typeCls = "info"
            icon = "chart.line.uptrend.xyaxis"
        }
        // 4. 수주/계약
        else if reportName.contains("공급계약") || reportName.contains("수주") || reportName.contains("납품계약") || reportName.contains("용역계약") {
            insight = "신규 수주/공급계약: 매출 증대로 직결되는 호재입니다."
            points = ["계약 금액이 연매출 대비 몇 % 수준인지 확인", "계약 기간 및 납품 일정 검토", "상대방 기업 신뢰도 및 반복 거래 여부 체크"]
            impact = "매출 증대"
            category = "영업이벤트"
            typeCls = "success"
            icon = "signature"
        }
        // 5. 유상증자
        else if reportName.contains("유상증자") {
            insight = "유상증자: 신주 발행으로 주식 수가 증가합니다. 자금 조달 목적 확인이 중요합니다."
            points = ["조달 자금 용도(성장 투자 vs 채무 상환) 확인", "할인율 및 신주 배정 비율 검토", "기존 주주 지분 희석 비율 계산"]
            impact = "희석 우려"
            category = "자본조달"
            typeCls = "warning"
            icon = "exclamationmark.triangle.fill"
        }
        // 6. 자사주 (취득/소각)
        else if reportName.contains("자기주식") || reportName.contains("자사주") {
            if reportName.contains("소각") {
                insight = "자사주 소각: 유통 주식 수 감소로 주주 가치 제고 효과가 있습니다."
                points = ["소각 주식 수 및 비율 확인", "소각 후 EPS 상승 효과 계산", "주주 환원 정책 강화 의지 긍정적 평가"]
                impact = "강한 호재"
                category = "주주환원"
                typeCls = "success"
                icon = "flame.fill"
            } else {
                insight = "자사주 취득: 경영진의 주가 저평가 인식 신호로 해석될 수 있습니다."
                points = ["취득 규모(발행주식 대비 %) 확인", "취득 기간 및 방법 확인", "소각 계획 포함 여부 체크"]
                impact = "긍정적 (주가 지지)"
                category = "주주환원"
                typeCls = "success"
                icon = "shield.fill"
            }
        }
        // 7. 지분 변동 (내부자)
        else if reportName.contains("소유상황") || reportName.contains("장내매수") || reportName.contains("장내매도") || reportName.contains("대량보유") {
            let isBuy = reportName.contains("매수") || reportName.contains("취득")
            insight = isBuy ? "내부자 지분 매수: 경영진/대주주가 자사 주식을 매수했습니다." : "내부자 지분 변동: 경영진 또는 대주주의 지분이 변경되었습니다."
            points = [
                isBuy ? "매수 목적(신뢰 표명 vs 경영권 강화) 판단" : "매도 규모 및 잔여 지분율 확인",
                "변동 후 최대주주 지분율 체크",
                "5% 이상 대량 보유 시 공개 매수 가능성 검토"
            ]
            impact = isBuy ? "긍정적 시그널" : "내부자 시그널"
            category = "지배구조"
            typeCls = isBuy ? "success" : "info"
            icon = "person.text.rectangle.fill"
        }
        // 8. 기업 구조 변경
        else if reportName.contains("합병") || reportName.contains("분할") || reportName.contains("인수") || reportName.contains("양수도") {
            insight = "기업 구조 변경(합병/분할/인수): 사업 전략의 큰 변화를 의미합니다."
            points = ["합병 비율 또는 인수 금액 적정성 검토", "시너지 효과 및 통합 리스크 평가", "주주총회 승인 여부 및 일정 확인"]
            impact = "구조적 변화"
            category = "구조개편"
            typeCls = "warning"
            icon = "arrow.triangle.merge"
        }
        // 9. 감사보고서/의견
        else if reportName.contains("감사보고서") || reportName.contains("감사의견") {
            let isBad = reportName.contains("한정") || reportName.contains("거절") || reportName.contains("부적정")
            insight = isBad ? "비적정 감사의견: 재무제표 신뢰성에 심각한 문제가 있을 수 있습니다." : "감사보고서 제출: 외부감사인의 의견을 반드시 확인하세요."
            points = isBad ? ["감사 사유 파악", "상장폐지 위험 여부 즉시 확인"] : ["적정 의견 여부 확인", "핵심감사사항(KAM) 내용 검토"]
            impact = isBad ? "긴급 위험" : "정보 확인"
            category = "재무건전성"
            typeCls = isBad ? "danger" : "info"
            icon = "checkerboard.shield"
        }

        return AnalysisResult(
            category: category,
            insight: insight,
            points: points,
            impact: impact,
            typeCls: typeCls,
            icon: icon
        )
    }
}
