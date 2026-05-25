import Foundation

struct AnalysisResult: Codable {
    let category: String
    let insight: String
    let points: [String]
    let impact: String
    let typeCls: String // success, warning, info, danger, default
    let icon: String?
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

        // 0. 소송/법적 리스크 관련
        if reportName.contains("소송") || reportName.contains("피소") {
            insight = "법적 리스크 관련 공시: 재무적 손실 또는 영업 차질 가능성을 검토해야 합니다."
            points = [
                "이전 공시 대비 변경사항 확인",
                "소송 금액이 자기자본 대비 몇 %인지 확인",
                "승소/패소 가능성 및 법적 리스크 평가",
                "영업 정지 등 실질적 타격 여부 체크"
            ]
            impact = reportName.contains("정정") ? "확인 요망" : "변동성 주의"
            category = "법적리스크"
            typeCls = "danger"
            icon = "gavel.fill"
        } 
        // 1. 배당 관련
        else if reportName.contains("배당") {
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
        // 10. 채권/파생 발행
        else if reportName.contains("일괄신고") || reportName.contains("증권발행실적") || reportName.contains("파생결합사채") || reportName.contains("파생결합증권") {
            insight = "채권/파생상품 발행 공시: 자금 조달 규모와 조건을 확인하세요."
            points = ["발행 금액 및 만기 조건 확인", "조달 자금 사용 목적 검토", "기발행 잔액 대비 총 부채 영향 체크"]
            impact = "자금조달"
            category = "채권발행"
            typeCls = "info"
            icon = "doc.text.fill"
        }
        // 11. IR/기업설명회
        else if reportName.contains("기업설명회") || reportName.contains("IR개최") || reportName.contains("IR 개최") {
            insight = "기업설명회(IR) 개최: 경영진이 사업 현황과 전망을 직접 공개합니다."
            points = ["설명회 일정 및 참가 방법 확인", "주요 발표 내용(실적·전략·가이던스) 모니터링", "설명회 이후 시장 반응 및 주가 흐름 확인"]
            impact = "정보 공개"
            category = "투자자소통"
            typeCls = "info"
            icon = "megaphone.fill"
        }
        // 12. 주주총회
        else if reportName.contains("주주총회") {
            insight = "주주총회 소집/결과 공시: 주요 안건의 가결 여부가 경영 방향에 영향을 줍니다."
            points = ["주요 안건(배당·정관변경·임원선임 등) 확인", "반대 의결 비율이 높은 안건 체크", "가결된 결의 사항의 향후 일정 모니터링"]
            impact = "의결 확인"
            category = "주주총회"
            typeCls = "info"
            icon = "checkmark.seal.fill"
        }
        // 13. 감자/자본감소
        else if reportName.contains("감자") || reportName.contains("자본감소") {
            insight = "감자(자본감소) 공시: 유상감자는 주주 손실, 무상감자는 재무구조 개선 목적입니다."
            points = ["유상/무상 감자 여부 구분 필수", "감자 비율 및 주주 환급금 확인", "감자 후 재무건전성 및 주가 희석 영향 계산"]
            impact = "주의 요망"
            category = "자본감소"
            typeCls = "warning"
            icon = "arrow.down.circle.fill"
        }
        // 14. 기재정정
        else if reportName.contains("기재정정") {
            insight = "기재정정 공시: 기존 공시의 내용이 수정되었습니다. 변경 항목을 반드시 확인하세요."
            points = ["원본 공시 대비 변경된 핵심 항목 파악", "금액·일정·비율 등 수치 변경 여부 체크", "정정 사유가 단순 오기인지 실질 변경인지 판단"]
            impact = "변경 확인"
            category = "정정공시"
            typeCls = "warning"
            icon = "pencil.and.list.clipboard"
        }
        // 15. 취득/처분/발행 결과
        else if reportName.contains("취득결과") || reportName.contains("처분결과") || reportName.contains("발행결과") {
            insight = "취득/처분/발행 이행 결과 공시: 계획 대비 실제 실행 결과를 확인하세요."
            points = ["예정 대비 실제 취득/처분 규모 비교", "미이행 또는 변경 사항 여부 체크", "잔여 물량의 향후 처리 계획 확인"]
            impact = "결과 확인"
            category = "이행결과"
            typeCls = "info"
            icon = "checkmark.circle.fill"
        }
        // 16. 타법인 출자 / 사업 양수도
        else if reportName.contains("타법인출자") || reportName.contains("영업양수") || reportName.contains("사업양수") || reportName.contains("영업양도") {
            insight = "타법인 출자/사업 양수도: 사업 영역 확대 또는 구조 재편 신호입니다."
            points = ["투자 규모가 자기자본 대비 몇 %인지 확인", "인수 대상의 수익성·부채 현황 검토", "사업 시너지 및 통합 리스크 평가"]
            impact = "전략 변화"
            category = "사업확장"
            typeCls = "info"
            icon = "building.2.fill"
        }
        // 17. 배당기준일 / 중간배당
        else if reportName.contains("배당기준일") || reportName.contains("중간배당") {
            insight = "배당기준일/중간배당 공시: 배당 수령을 위한 보유 기한을 확인하세요."
            points = ["배당 기준일 전일까지 매수 완료 필요", "예상 배당금 및 시가배당률 확인", "기존 연간 배당 정책과의 일관성 체크"]
            impact = "배당 일정"
            category = "배당일정"
            typeCls = "success"
            icon = "calendar.badge.checkmark"
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
