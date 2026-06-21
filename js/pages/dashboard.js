// 1. 공시 카테고리 분류 헬퍼 (확장 필터 반영)
function getDisclosureCategory(item) {
  const title = item.report_nm || '';
  if (/배당|소각|자기주식/.test(title)) return '주주환원';
  if (/유상증자|사채권발행|단기차입금|채무보증|금전대여|증권발행|자산유동화/.test(title)) return '자금조달';
  if (/감사보고서|부적정|의견거절|한정/.test(title)) return '감사·리스크';
  if (/소유주식변동|임원ㆍ주요주주|대량보유/.test(title)) return '내부자시그널';
  if (/잠정실적|영업실적|매출액|영업이익/.test(title)) return '실적발표';
  if (/공급계약|단일판매|시설투자|특허/.test(title)) return '공급·투자';
  if (/대표이사|주주총회|최대주주변동|지배구조|불성실공시/.test(title)) return '경영·지배구조';
  if (/소송|판결|법원|회생|파산/.test(title)) return '법적분쟁';
  return '기타';
}




window.switchAiMode = function(mode) {
  localStorage.setItem('dart_ai_mode', mode);
  window.router();
};

// Dashboard Page
async function renderDashboard() {
  const isPremium = window.FB_AUTH && window.FB_AUTH.isPremium;
  
  let aiMode = localStorage.getItem('dart_ai_mode') || 'gemini';
  const quickStyle = aiMode === 'quick' ? 'background:var(--primary); color:white;' : 'color:var(--on-surface-variant);';
  const geminiStyle = aiMode === 'gemini' ? 'background:var(--primary); color:white;' : 'color:var(--on-surface-variant);';

  // 디폴트 필터는 전체
  window.currentDashboardFilter = window.currentDashboardFilter || '전체';
  
  const categories = ['전체', '자금조달', '감사·리스크', '내부자시그널', '주주환원', '실적발표', '공급·투자', '경영·지배구조', '법적분쟁'];
  const filterTabsHtml = categories.map(cat => {
    const activeCls = window.currentDashboardFilter === cat ? 'active' : '';
    return `<div class="filter-tab ${activeCls}" data-filter="${cat}" onclick="filterDashboardCategory('${cat}')">${cat}</div>`;
  }).join('');

  return `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div>
        <h2>대시보드</h2>
      </div>
      <div style="display:flex; background:var(--surface-container-high); border-radius:8px; overflow:hidden; border:1px solid var(--outline-variant);">
        <button class="btn-text" style="padding:6px 12px; font-size:12px; border-radius:0; ${geminiStyle}" onclick="switchAiMode('gemini')">🤖 학습모델</button>
        <button class="btn-text" style="padding:6px 12px; font-size:12px; border-radius:0; border-left:1px solid var(--outline-variant); ${quickStyle}" onclick="switchAiMode('quick')">⚡️ QUICK 분석</button>
      </div>
    </div>
    
    <!-- 카테고리 퀵 필터 탭 -->
    <div class="filter-tabs" id="category-filter-tabs">
      ${filterTabsHtml}
    </div>

    <div id="quick-insight-container"></div>
    <div id="dashboard-main-content">
      <div class="section-header">
        <h3 class="section-title">관심 종목 리얼타임 피드</h3>
      </div>
      <div id="dashboard-feed"></div>
    </div>
    </div>
  `;
}

async function renderInsight(containerId, item) {
  // [가이드 3-2] 임시 디버그 로그 추가
  console.log('[DEBUG] renderInsight 호출값:', {
    corpName: item?.corp_name,
    reportName: item?.report_nm,
    rceptNo: item?.rcept_no,
    rawItem: item
  });

  const api = window.DART_API;
  const container = document.getElementById(containerId);
  if (!container) return;

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  let aiMode = localStorage.getItem('dart_ai_mode') || 'gemini';

  // 1. Lean Engine 요약 먼저 시도 (초고속, 캐시보다 우선)
  try {
    const leanSummary = await api.getLeanSummary(item.rcept_no);
    if (leanSummary) {
      container.innerHTML = summarizeDisclosure(item, null, leanSummary);
      return;
    }
  } catch (e) {
    console.warn('Lean Engine Error:', e);
  }

  if (aiMode === 'quick') {
    container.innerHTML = getQuickInsightHtml(item);
    return;
  }

  // 캐시 확인 (rcept_no 기반으로 우선 확인)
  const cacheKey = item.rcept_no ? `gemini_cache_${item.rcept_no}` : `gemini_cache_${item.corp_name}_${item.report_nm}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    try {
      const aiData = JSON.parse(cached);
      if (aiData.points && aiData.points.some(p => p.includes('모니터링 중입니다') || p.includes('상세보기'))) {
        localStorage.removeItem(cacheKey);
      } else {
        aiData._cached = true;
        container.innerHTML = summarizeDisclosure(item, aiData);
        return;
      }
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  container.innerHTML = summarizeDisclosure(item, null);

  try {


    // 2. Gemini AI 분석 (기존 로직 유지)
    const aiData = await api.getGeminiAnalysis(item.corp_name, item.report_nm, item.rcept_no);
    if (aiData) {
      container.innerHTML = summarizeDisclosure(item, aiData);
    }
  } catch (e) {
    console.warn('AI Analysis Warning:', e.message);
    if (e.message.includes('429')) {
      container.innerHTML = summarizeDisclosure(item, {
        insight: "Gemini API 할당량을 모두 소모했습니다. 약 1분 후 분석이 재개됩니다.",
        impact: "할당량 초과",
        points: ["현재 트래픽이 많습니다.", "잠시 후 새로고침 시 캐시된 정보가 표시됩니다."]
      });
    } else if (e.message.includes('Premium')) {
      container.innerHTML = summarizeDisclosure(item, {
        insight: "이 기능은 Premium 사용자만 이용할 수 있습니다.",
        impact: "권한 없음",
        points: ["Gemini AI 분석은 유료 요금제에서 제공됩니다."]
      });
    } else {
      container.innerHTML = summarizeDisclosure(item, {
        insight: `분석 실패: ${e.message}`,
        impact: "오류",
        points: ["서버 또는 네트워크 상태를 확인하세요."]
      });
    }
  }
}

// ==========================================
// 1.6 Disclosure Ranker 스코어링 (QUICK/Gemini 공통)
// ==========================================
function calculateDisclosureScore(reportName) {
  let score = 0;
  if (/[0-9]+억|[0-9,]+원|[0-9]+백만/.test(reportName)) score += 2.0;
  if (/[0-9.]+%/.test(reportName)) score += 1.2;
  if (/[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}/.test(reportName)) score += 0.8;
  const keywords = ['결정', '체결', '취득', '처분', '변경', '발생', '해지', '완료', '승인', '의결', '정정', '연장', '배당', '수주', '공급계약', '유상증자', '무상증자', '합병', '분할'];
  if (keywords.some(k => reportName.includes(k))) score += 1.5;
  const amountMatches = (reportName.match(/[0-9]+억|[0-9,]+원|[0-9]+백만/g) || []).length;
  score += Math.min(amountMatches, 3) * 0.5;
  const percentMatches = (reportName.match(/[0-9.]+%/g) || []).length;
  score += Math.min(percentMatches, 2) * 0.3;
  const riskKeywords = ['리스크', '불확실성', '위험', '손실', '하락', '변동성', '소송', '제재', '과징금', '관리종목', '상장폐지'];
  if (riskKeywords.some(k => reportName.includes(k))) score += 2.0;
  return parseFloat(score.toFixed(1));
}

function getRankLabel(score) {
  if (score >= 4.0) return 3; // 매우 중요
  if (score >= 2.5) return 2; // 중요
  if (score >= 1.0) return 1; // 보통
  return 0; // 참고
}

function summarizeDisclosure(item, aiData = null, leanSummary = null) {
  const aiMode = localStorage.getItem('dart_ai_mode') || 'gemini';
  const title = item.report_nm || '';
  const isPeriodic = title.startsWith("사업보고서") || title.startsWith("반기보고서") || title.startsWith("분기보고서");

  if (aiMode === 'quick' && !isPeriodic) {
    return getQuickInsightHtml(item);
  }
  const cleanMd = (s) => typeof s === 'string' ? s.replace(/\*\*|\*/g, '').trim() : s;
  
  // 만약 AI 데이터가 Pending(요약 대기중)이거나, 구형 더미 텍스트를 포함하고 있다면 Quick 분석 내용으로 대체
  const isDummyText = aiData && aiData.points && aiData.points.some(p => p.includes('모니터링 중입니다') || p.includes('상세보기'));
  if (!aiData || aiData.isPending || isDummyText) {
    const matchedRule = QUICK_RULES.find(rule => 
      rule.match.some(regex => regex.test(title)) &&
      (!rule.exclude || !rule.exclude.some(regex => regex.test(title)))
    );
    if (matchedRule) {
      aiData = {
        insight: matchedRule.insight,
        impact: matchedRule.impact,
        typeCls: matchedRule.typeCls,
        points: matchedRule.points,
        rankLabel: matchedRule.category
      };
    } else {
      const isSkipped = /투자설명서|효력발생안내|참고서류|기재정정/.test(title);
      if (isSkipped) {
        aiData = {
          insight: `${item.corp_name} - 단순 안내 성격의 공시로 요약이 생략되었습니다.`,
          impact: '요약 생략',
          typeCls: 'insight-neutral',
          points: [
            '상세 내용은 우측 상세보기를 통해 원문으로 확인 가능합니다.'
          ],
          rankLabel: '단순안내'
        };
      } else {
        aiData = {
          insight: `${item.corp_name} - ${title.trim()} 공시: 핵심 내용 및 상세 일정을 확인하세요.`,
          impact: '확인 요망',
          typeCls: 'insight-info',
          points: [
            '해당 공시의 상세 내역은 원본 뷰어를 통해 확인 가능합니다.',
            '자체 로컬 룰 엔진 분석 대기 중입니다.'
          ],
          rankLabel: '기타공시'
        };
      }
    }
  }

  // 삼성전자 배당 공시인 경우 고퀄리티 제미나이 분석 예시 제공
  if (!aiData && item.corp_name === '삼성전자' && title.includes('배당')) {
    aiData = {
      insight: "삼성전자가 분기 배당을 통해 주주 환원 정책의 일관성을 다시 한번 입증했습니다.",
      impact: "긍정적 (안정적 현금흐름)",
      points: [
        "주당 361원 분기 배당 정례화로 투자자 신뢰 및 가치 제고",
        "반도체 실적 개선세에 따른 배당 재원 확보 자신감 표명",
        "배당 기준일까지 보유 시 안정적인 분기 배당수익 확보 가능"
      ]
    };
  }

  // 현대자동차 특화 분석 예시
  if (!aiData && item.corp_name.includes('현대차') && title.includes('배당')) {
    aiData = {
      insight: "현대자동차가 역대급 실적을 바탕으로 주주 환원 정책을 대폭 강화했습니다.",
      impact: "긍정적 (배당 성장)",
      points: [
        "결산 배당금 증액을 통한 실질적 주주 수익률 향상",
        "미래 모빌리티 투자와 주주 환원의 균형 잡힌 자본 배분",
        "업계 최고 수준의 배당 성향 유지를 통한 투자 매력도 증대"
      ]
    };
  }
  if (!aiData && item.corp_name.includes('현대차') && title.includes('소유상황')) {
    aiData = {
      insight: "현대자동차 내부 임원의 지분 변동이 감지되었습니다.",
      impact: "정보 확인 (내부자 시그널)",
      points: [
        "경영진의 자사주 매입은 기업 가치 저평가에 대한 시그널로 해석 가능",
        "책임 경영 의지 확인 및 주가 하방 경직성 확보 기대",
        "변동 수량 및 지분율 변화가 경영권에 미치는 영향은 미미한 수준"
      ]
    };
  }

  // Lean Engine 데이터가 있는 경우 표시 (최우선 적용)
  if (leanSummary) {
    // 공시 성격에 따른 동적 라벨 생성
    const quickData = getQuickInsightData(item);
    const impactLabel = quickData.impact;
    const typeCls = quickData.typeCls;
    const icon = quickData.icon;

    let headerText = '';
    const bulletLines = [];
    const lines = (leanSummary || '').split('\n').map(l => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanedLine = line.replace(/^[-▪💡📢📌▯\s]+/, '');
      
      // 첫 줄이면서 불릿/이모지 시작이 아닌 경우 헤더로 지정
      if (!headerText && !line.startsWith('-') && !line.startsWith('▪') && !line.startsWith('💡') && !line.startsWith('📢') && !line.startsWith('📌') && !line.startsWith('▯')) {
        headerText = cleanedLine;
      } else {
        const cleanedBullet = cleanedLine.replace(/\*\*/g, '');
        bulletLines.push(`<li>${cleanedBullet}</li>`);
      }
    }

    let finalHeader = '';
    if (aiMode === 'gemini') {
      finalHeader = `<strong>${item.corp_name}</strong> - ${quickData.insight}`;
    } else {
      finalHeader = headerText || `<strong>${item.corp_name}</strong> - ${item.report_nm}`;
      finalHeader = finalHeader.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      // 종목명 볼드 처리 (이미 <strong>으로 감싸져 있지 않고, 종목명으로 시작하는 경우)
      if (!finalHeader.includes(`<strong>${item.corp_name}</strong>`) && finalHeader.startsWith(item.corp_name)) {
        finalHeader = finalHeader.replace(item.corp_name, `<strong>${item.corp_name}</strong>`);
      }
      
      // 구버전 캐시 데이터 포맷 온더플라이 동적 변환 보정 필터
      const legacyRegex = /^(.+?)의\s+(분기|반기|사업|정기|사업\(연간\))\s*보고서가\s+공시되었습니다\.?$/;
      finalHeader = finalHeader.replace(legacyRegex, '<strong>$1</strong> - $2 보고서가 공시되었습니다.');
    }
    
    const pointsHtml = bulletLines.join('');

    return `
      <div class="insight-banner ${typeCls}">
        <div class="insight-icon"><span class="material-symbols-outlined">${icon}</span></div>
        <div class="insight-content">
          <div class="insight-header">
            <div class="insight-label">${api.formatDate(item.rcept_dt)}</div>
            <div class="insight-impact">${impactLabel}</div>
          </div>
          <div class="insight-text">${finalHeader}</div>
          <ul class="insight-points">
            ${pointsHtml}
          </ul>
        </div>
        <div class="insight-actions">
          <button class="btn-text" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">상세보기</button>
        </div>
      </div>
    `;
  }

  // Gemini 데이터가 있는 경우 우선 사용
  if (aiData) {
    const insight = cleanMd(aiData.insight || '');
    let impact = cleanMd(aiData.impact || '분석 중');
    const points = (aiData.points || []).map(p => cleanMd(p));
    
    // 실시간 대기 또는 원점수 기반 뱃지가 포함된 문구인 경우 일반 필터로 대체
    const quickData = getQuickInsightData(item);
    if (impact.includes('실시간 대기 중') || impact.includes('점)')) {
      impact = quickData.impact;
    }
    
    const typeCls = quickData.typeCls || 'insight-info';
    const icon = quickData.icon || 'info';

    const finalHeader = `<strong>${item.corp_name}</strong> - ${quickData.insight}`;

    return `
      <div class="insight-banner ${typeCls}">
        <div class="insight-icon"><span class="material-symbols-outlined">${icon}</span></div>
        <div class="insight-content">
          <div class="insight-header">
            <div class="insight-label">${api.formatDate(item.rcept_dt)}</div>
            <div class="insight-impact">${impact}</div>
          </div>
          <div class="insight-text">${finalHeader}</div>
          <ul class="insight-points">
            ${points.map(p => `<li>${p}</li>`).join('')}
          </ul>
        </div>
        <div class="insight-actions">
          <button class="btn-detail" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">
            <span>상세보기</span><span class="material-symbols-outlined" style="font-size:16px;">arrow_outward</span>
          </button>
        </div>
      </div>
    `;
  }

  // Gemini 데이터가 없는 경우 (로딩 중 상태)
  if (!aiData) {
    return `
      <div class="insight-banner insight-info" style="opacity: 0.7;">
        <div class="insight-icon"><span class="material-symbols-outlined spin">sync</span></div>
        <div class="insight-content">
          <div class="insight-header">
            <div class="insight-label"><span style="color:var(--outline); font-weight:500; font-size:11px;">${api.formatDate(item.rcept_dt)}</span></div>
            <div class="insight-impact">분석 중...</div>
          </div>
          <div class="insight-text"><strong>${item.corp_name}</strong> - 로딩중</div>
        </div>
        <div class="insight-actions">
          <button class="btn-detail" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">
            <span>상세보기</span><span class="material-symbols-outlined" style="font-size:16px;">arrow_outward</span>
          </button>
        </div>
      </div>
    `;
  }
}

const QUICK_RULES = [
  {
    id: 'dividend',
    match: [/배당/],
    category: '주주환원',
    impact: '긍정적 (배당수익)',
    urgency: 60,
    typeCls: 'insight-success',
    icon: 'payments',
    insight: '현금/현물 배당 결정: 주주 환원의 핵심 지표가 발표되었습니다.',
    points: [
      '과거 배당금 대비 증액 여부 확인',
      '시가배당률과 예상 수익률 검토',
      '배당 기준일까지 보유 여부 판단'
    ]
  },
  {
    id: 'earnings_report',
    match: [/사업보고서/, /반기보고서/, /분기보고서/],
    category: '정기보고서',
    impact: '실적 확인',
    urgency: 70,
    typeCls: 'insight-info',
    icon: 'monitoring',
    insight: '정기 실적 보고서: 기업의 공식 성적표가 공개되었습니다.',
    points: [
      '매출·영업이익·순이익 전년 동기 대비 확인',
      '어닝 서프라이즈/쇼크 여부 판단',
      '부채비율 및 현금흐름 변화 체크'
    ]
  },
  {
    id: 'earnings_flash',
    match: [/매출액/, /영업이익/, /잠정실적/, /영업실적/],
    exclude: [/발행실적/, /모집/, /청약/],
    category: '잠정실적',
    impact: '실적 변동',
    urgency: 75,
    typeCls: 'insight-info',
    icon: 'trending_up',
    insight: '실적 관련 공시: 매출 또는 이익 변동 내용이 포함되어 있습니다.',
    points: [
      '예상 대비 실적 달성 여부 확인',
      '가이던스 상향/하향 여부 검토',
      '업종 내 경쟁사 대비 포지셔닝 확인'
    ]
  },
  {
    id: 'contract',
    match: [/공급계약/, /단일판매/, /수주/, /납품계약/, /용역계약/],
    category: '영업호재',
    impact: '매출 증대',
    urgency: 75,
    typeCls: 'insight-success',
    icon: 'contract_edit',
    insight: '신규 수주/공급계약: 매출 증대로 직결되는 호재입니다.',
    points: [
      '계약 금액이 연매출 대비 몇 % 수준인지 확인',
      '계약 기간 및 납품 일정 검토',
      '상대방 기업 신뢰도 및 반복 거래 여부 체크'
    ]
  },
  {
    id: 'rights',
    match: [/유상증자/],
    category: '자금조달',
    impact: '희석 우려',
    urgency: 85,
    typeCls: 'insight-warning',
    icon: 'add_chart',
    insight: '유상증자: 신주 발행으로 주식 수가 증가합니다. 자금 조달 목적 확인이 중요합니다.',
    points: [
      '조달 자금 용도(성장 투자 vs 채무 상환) 확인',
      '할인율 및 신주 배정 비율 검토',
      '기존 주주 지분 희석 비율 계산'
    ]
  },
  {
    id: 'bonus_issue',
    match: [/무상증자/],
    category: '주주친화',
    impact: '유동성 제고',
    urgency: 70,
    typeCls: 'insight-success',
    icon: 'add_chart',
    insight: '무상증자: 주식 수 증가로 유동성 제고 효과가 기대됩니다.',
    points: [
      '배정 비율(몇 주당 몇 주) 확인',
      '권리락일 및 신주 상장일 체크',
      '단기 수급 변화 모니터링'
    ]
  },
  {
    id: 'treasury_cancel',
    match: [/자기주식소각/, /자사주소각/],
    category: '주주환원',
    impact: '강한 호재',
    urgency: 90,
    typeCls: 'insight-success',
    icon: 'local_fire_department',
    insight: '자사주 소각: 유통 주식 수 감소로 주급 가치 제고 효과가 있습니다.',
    points: [
      '소각 주식 수 및 비율 확인',
      '소각 후 EPS 상승 효과 계산',
      '주주 환원 정책 강화 의지 긍정적 평가'
    ]
  },
  {
    id: 'treasury_buy',
    match: [/자기주식취득/, /자사주취득/, /자기주식매수/],
    category: '주주환원',
    impact: '긍정적 (주가 지지)',
    urgency: 70,
    typeCls: 'insight-success',
    icon: 'savings',
    insight: '자사주 취득: 경영진의 주가 저평가 인식 신호로 해석될 수 있습니다.',
    points: [
      '취득 규모(발행주식 대비 %) 확인',
      '취득 기간 및 방법(직접/신탁) 확인',
      '소각 계획 포함 여부 체크(소각 시 호재)'
    ]
  },
  {
    id: 'ownership',
    match: [/최대주주/, /소유상황/, /장내매수/, /장내매도/, /주식등의대량보유/],
    category: '지배구조',
    impact: '내부자 시그널',
    urgency: 80,
    typeCls: 'insight-purple',
    icon: 'person_search',
    insight: '경영진 및 대주주의 지분 변동 공시입니다. 매매 방향을 통한 시그널 판단이 필요합니다.',
    points: [
      '매수/매도 여부 및 규모 확인',
      '변동 후 최대주주 지분율 체크',
      '경영권 안정성 및 내부자 인식 점검'
    ]
  },
  {
    id: 'structure',
    match: [/합병/, /분할/, /인수/, /양수도/],
    category: '구조변화',
    impact: '변동성 주의',
    urgency: 95,
    typeCls: 'insight-warning',
    icon: 'merge',
    insight: '기업 구조 개편 공시입니다. 주가에 큰 영향을 미칠 수 있으므로 상세 검토가 필수입니다.',
    points: [
      '합병 비율 또는 인수 금액 적정성 검토',
      '시너지 효과 및 통합 리스크 평가',
      '주주총회 승인 여부 및 일정 확인'
    ]
  },
  {
    id: 'exec_change',
    match: [/임원/, /선임/, /해임/],
    category: '인사변동',
    impact: '경영 변화',
    urgency: 50,
    typeCls: 'insight-info',
    icon: 'manage_accounts',
    insight: '임원진 변동: 경영 전략 방향성에 영향을 줄 수 있는 인사 변화입니다.',
    points: [
      '신임 CEO/CFO의 경력 및 전문성 확인',
      '이전 경영진 정책과의 연속성 여부',
      '지배구조 투명성 점검'
    ]
  },
  {
    id: 'convertible',
    match: [/전환사채/, /신주인수권/, /교환사채/],
    category: '자본조달',
    impact: '희석 위험',
    urgency: 85,
    typeCls: 'insight-warning',
    icon: 'currency_exchange',
    insight: '메자닌(CB/BW) 발행: 향후 주식 전환 시 희석 우려가 있습니다.',
    points: [
      '발행 금액 및 전환 가격 확인',
      '전환 청구 기간 및 리픽싱 조건 체크',
      '희석 가능 주식 수 사전 계산 권장'
    ]
  },
  {
    id: 'litigation',
    match: [/소송/, /제재/, /과징금/, /행정처분/],
    category: '리스크',
    impact: '주의 요망',
    urgency: 90,
    typeCls: 'insight-warning',
    icon: 'gavel',
    insight: '법적 리스크 관련 공시: 재무적 손실 또는 영업 차질 가능성을 검토해야 합니다.',
    points: [
      '소송 금액이 자기자본 대비 몇 %인지 확인',
      '승소/패소 가능성 및 법적 리스크 평가',
      '영업 정지 등 실질적 타격 여부 체크'
    ]
  },
  {
    id: 'investment',
    match: [/출자/, /지분취득/, /신규투자/],
    category: '사업확장',
    impact: '성장 투자',
    urgency: 65,
    typeCls: 'insight-info',
    icon: 'business_center',
    insight: '신규 투자/출자: 사업 확장 또는 포트폴리오 다각화 목적입니다.',
    points: [
      '투자 규모가 총자산 대비 적정 수준인지 확인',
      '투자 대상 기업의 사업 연관성 검토',
      'ROI 및 회수 기간 예상치 확인'
    ]
  },
  {
    id: 'delisting',
    match: [/상장폐지/, /관리종목/],
    category: '긴급위험',
    impact: '강한 위험',
    urgency: 100,
    typeCls: 'insight-major',
    icon: 'warning',
    insight: '투자 주의 공시: 상장폐지 또는 심각한 규정 위반 관련 내용입니다.',
    points: [
      '상장 유지 요건 충족 여부 확인',
      '이의신청 기간 및 절차 파악',
      '포지션 긴급 재검토 권장'
    ]
  },
  {
    id: 'unfaithful_disclosure',
    match: [/불성실공시/],
    category: '규정위반',
    impact: '경고',
    urgency: 85,
    typeCls: 'insight-warning',
    icon: 'gavel',
    insight: '공시 규정 위반: 불성실공시법인 지정 관련 내용입니다.',
    points: [
      '벌점 부과 내역 및 누계 벌점 확인 (15점 이상 시 관리종목 지정 우려)',
      '위반 사유 및 회사의 재발 방지 대책 검토',
      '주가 단기 변동성 확대 주의'
    ]
  },
  {
    id: 'audit',
    match: [/감사보고서/, /감사의견/],
    category: '회계신뢰',
    impact: '감사보고서',
    urgency: 95,
    typeCls: 'insight-warning',
    icon: 'fact_check',
    insight: '감사보고서 제출: 외부감사인의 의견은 기업의 생존과 직결됩니다.',
    points: [
      '적정 의견 여부 즉시 확인 (비적정 시 상폐 위험)',
      '핵심감사사항(KAM) 내용 검토',
      '계속기업 존속 불확실성 여부 체크'
    ]
  },
  {
    id: 'bond_issuance',
    match: [/일괄신고/, /증권발행실적/, /파생결합사채/, /파생결합증권/, /구조화증권/],
    category: '채권발행',
    impact: '자금조달',
    urgency: 45,
    typeCls: 'insight-info',
    icon: 'receipt_long',
    insight: '채권/파생상품 발행 공시: 자금 조달 규모와 조건을 확인하세요.',
    points: [
      '발행 금액 및 만기 조건 확인',
      '조달 자금 사용 목적 검토',
      '기발행 잔액 대비 총 부채 영향 체크'
    ]
  },
  {
    id: 'ir',
    match: [/기업설명회/, /IR개최/, /IR 개최/],
    category: '투자자소통',
    impact: '정보 공개',
    urgency: 40,
    typeCls: 'insight-default',
    icon: 'campaign',
    insight: '기업설명회(IR) 개최: 경영진이 사업 현황과 전망을 직접 공개합니다.',
    points: [
      '설명회 일정 및 참가 방법 확인',
      '주요 발표 내용(실적·전략·가이던스) 모니터링',
      '설명회 이후 시장 반응 및 주가 흐름 확인'
    ]
  },
  {
    id: 'agm',
    match: [/주주총회/],
    category: '주주총회',
    impact: '의결 확인',
    urgency: 65,
    typeCls: 'insight-info',
    icon: 'how_to_vote',
    insight: '주주총회 소집/결과 공시: 주요 안건의 가결 여부가 경영 방향에 영향을 줍니다.',
    points: [
      '주요 안건(배당·정관변경·임원선임 등) 확인',
      '반대 의결 비율이 높은 안건 체크',
      '가결된 결의 사항의 향후 일정 모니터링'
    ]
  },
  {
    id: 'capital_reduction',
    match: [/감자/, /자본감소/],
    category: '자본감소',
    impact: '주의 요망',
    urgency: 88,
    typeCls: 'insight-warning',
    icon: 'trending_down',
    insight: '감자(자본감소) 공시: 유상감자는 주주 손실, 무상감자는 재무구조 개선 목적입니다.',
    points: [
      '유상/무상 감자 여부 구분 필수',
      '감자 비율 및 주주 환급금 확인',
      '감자 후 재무건전성 및 주가 희석 영향 계산'
    ]
  },
  {
    id: 'amendment',
    match: [/기재정정/],
    category: '정정공시',
    impact: '변경 확인',
    urgency: 72,
    typeCls: 'insight-warning',
    icon: 'edit_note',
    insight: '기재정정 공시: 기존 공시의 내용이 수정되었습니다. 변경 항목을 반드시 확인하세요.',
    points: [
      '원본 공시 대비 변경된 핵심 항목 파악',
      '금액·일정·비율 등 수치 변경 여부 체크',
      '정정 사유가 단순 오기인지 실질 변경인지 판단'
    ]
  },
  {
    id: 'acquisition_result',
    match: [/취득결과/, /처분결과/, /발행결과/],
    category: '이행결과',
    impact: '결과 확인',
    urgency: 55,
    typeCls: 'insight-info',
    icon: 'task_alt',
    insight: '취득/처분/발행 이행 결과 공시: 계획 대비 실제 실행 결과를 확인하세요.',
    points: [
      '예정 대비 실제 취득/처분 규모 비교',
      '미이행 또는 변경 사항 여부 체크',
      '잔여 물량의 향후 처리 계획 확인'
    ]
  },
  {
    id: 'investment_other',
    match: [/타법인출자/, /영업양수/, /사업양수/, /영업양도/],
    category: '사업확장',
    impact: '전략 변화',
    urgency: 78,
    typeCls: 'insight-info',
    icon: 'business_center',
    insight: '타법인 출자/사업 양수도: 사업 영역 확대 또는 구조 재편 신호입니다.',
    points: [
      '투자 규모가 자기자본 대비 몇 %인지 확인',
      '인수 대상의 수익성·부채 현황 검토',
      '사업 시너지 및 통합 리스크 평가'
    ]
  },
  {
    id: 'dividend_date',
    match: [/배당기준일/, /중간배당/],
    category: '배당일정',
    impact: '배당 일정',
    urgency: 62,
    typeCls: 'insight-success',
    icon: 'event',
    insight: '배당기준일/중간배당 공시: 배당 수령을 위한 보유 기한을 확인하세요.',
    points: [
      '배당 기준일 전일까지 매수 완료 필요',
      '예상 배당금 및 시가배당률 확인',
      '기존 연간 배당 정책과의 일관성 체크'
    ]
  }
];

function getQuickInsightData(item) {
  const title = item.report_nm || '';
  const rankScore = calculateDisclosureScore(title);
  const rankLabel = getRankLabel(rankScore);

  const base = {
    category: '기타',
    impact: '정보 확인',
    urgency: 40 + (rankScore * 5), // 점수에 따른 긴급도 보정
    rankScore,
    rankLabel,
    typeCls: 'insight-default',
    icon: 'campaign',
    insight: item.report_nm || '최근 접수된 공시입니다. 핵심 항목을 직접 확인하세요.',
    points: [
      `접수번호: ${item.rcept_no}`,
      `제출일자: ${window.DART_API.formatDate(item.rcept_dt)}`
    ],
    tags: []
  };

  const rule = QUICK_RULES.find(rule => rule.match.some(rx => rx.test(title)));
  let result = rule ? { ...base, ...rule } : { ...base };

  if (/정정/.test(title)) {
    result.tags.push('정정공시');
    result.urgency += 10;
    result.points = ['이전 공시 대비 변경사항 확인', ...result.points];
    result.impact = '확인 요망';
    result.typeCls = 'insight-warning';
  }

  if (/조회공시|풍문|해명/.test(title)) {
    result.impact = '변동성 주의';
    result.urgency += 15;
    result.tags.push('조회/풍문');
    result.typeCls = 'insight-warning';
    result.insight = '풍문이나 보도에 대한 회사 측의 해명 공시입니다. 사실 여부 확인이 필요합니다.';
    result.points = [
      '회사 측의 확정/미확정/부인 답변 확인',
      '추후 재공시 예정일 확인'
    ];
  }

  if (item.corp_cls === 'Y') result.tags.push('코스피');
  if (item.corp_cls === 'K') result.tags.push('코스닥');

  return result;
}

function getQuickInsightHtml(item) {
  const data = getQuickInsightData(item);
  
  const rankText = ['참고', '보통', '중요', '매우 중요'][data.rankLabel];
  const rankColor = ['var(--outline)', '#34a853', '#fbbc05', '#ea4335'][data.rankLabel];

  return `
    <div class="insight-banner ${data.typeCls}" id="quick-insight-${item.rcept_no}">
      <div class="insight-icon"><span class="material-symbols-outlined">${data.icon}</span></div>
      <div class="insight-content">
        <div class="insight-header">
          <div class="insight-label">${window.DART_API.formatDate(item.rcept_dt)}</div>
          <div class="insight-impact">${data.impact}</div>
        </div>
        <div class="insight-text"><strong>${item.corp_name}</strong> - ${data.insight}</div>
        <ul class="insight-points">
          ${data.points.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
      <div class="insight-actions">
        <button class="btn-text" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">상세보기</button>
      </div>
    </div>
  `;
}



async function initDashboard() {
  const api = window.DART_API;
  const watchlist = api.getWatchlist();

  // 1. 대시보드 캐시 로딩 (즉시 렌더링)
  const dashboardCache = localStorage.getItem('dashboard_cache');
  const feedEl = document.getElementById('dashboard-feed');

  if (dashboardCache && feedEl) {
    try {
      const cachedData = JSON.parse(dashboardCache);
      // 관심 종목 구성이 같은 경우에만 캐시 사용
      if (JSON.stringify(cachedData.watchlist) === JSON.stringify(watchlist)) {
        renderDashboardUI(cachedData.groups, cachedData.stats);
      }
    } catch (e) {
      localStorage.removeItem('dashboard_cache');
    }
  }

  try {
    const endDe = fmt(new Date());
    const bgnDe30 = fmt(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    
    // 2. 관심 종목의 공시들만 정확히 조회하기 위해 corp_code 파라미터에 콤마로 연결하여 전송 (전체 공시 100건 한계 버그 해결)
    const params = {
      bgn_de: bgnDe30,
      end_de: endDe,
      page_count: 100
    };
    if (watchlist && watchlist.length > 0) {
      params.corp_code = watchlist.join(',');
    }
    const res = await api.searchDisclosures(params);
    const allDisclosures = res.list || [];

    // 데이터를 종목별로 그룹화 + 이름 교정
    const groups = await Promise.all(watchlist.map(async (code) => {
      const corpList = allDisclosures.filter(item => item.corp_code === code).slice(0, 3);
      const correctedName = await api.getCorpName(code);
      return {
        company: { code: code, name: correctedName },
        latestDate: corpList.length > 0 ? corpList[0].rcept_no : '0',
        list: corpList
      };
    }));

    groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));

    // 3. UI 1차 업데이트 (피드 우선 표시, 통계는 로딩중 상태)
    renderDashboardUI(groups, null);

    // 4. AI 인사이트 업데이트 (청크 단위 처리: 한 번에 3개씩, 1초 간격)
    const updateInsights = async () => {
      if (groups.some(g => g.list.length > 0)) {
        const activeGroups = groups.filter(g => g.list.length > 0);
        const CHUNK_SIZE = 2; // [가이드 4-3] 요청 분산 처리
        for (let i = 0; i < activeGroups.length; i += CHUNK_SIZE) {
          const chunk = activeGroups.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (g, idx) => {
            const globalIdx = i + idx;
            const divId = `insight-item-${globalIdx}`;
            await renderInsight(divId, g.list[0]);
          }));
          if (i + CHUNK_SIZE < activeGroups.length) {
            await new Promise(r => setTimeout(r, 500)); // [가이드 4-3] 500ms 대기
          }
        }
      }
    };
    updateInsights(); 

    // 대시보드 상태 저장
    localStorage.setItem('dashboard_cache', JSON.stringify({ watchlist, groups }));

  } catch (err) {
    console.error('[Dashboard Init Error]', err);
    
    // 💡 Premium Fallback: API 에러 시 기존 로컬 캐시를 로드하여 대화형 화면 유지
    const cached = localStorage.getItem('dashboard_cache');
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        renderDashboardUI(cachedData.groups, cachedData.stats);
        
        // 사용자 피드백 안내 배너 표시
        const feedEl = document.getElementById('dashboard-feed');
        if (feedEl) {
          const warningBanner = document.createElement('div');
          warningBanner.className = 'insight-banner revised';
          warningBanner.style.marginBottom = '16px';
          warningBanner.style.backgroundColor = 'rgba(234, 67, 53, 0.1)';
          warningBanner.style.borderColor = 'rgba(234, 67, 53, 0.3)';
          warningBanner.innerHTML = `
            <div class="insight-icon" style="color: #ea4335;"><span class="material-symbols-outlined">warning</span></div>
            <div class="insight-content">
              <div class="insight-text" style="color: var(--on-surface);"><strong>DART API 요청 제한 안내</strong></div>
              <div style="font-size: 12px; color: var(--on-surface-variant); margin-top: 4px;">
                DART API 요청 제한(020)을 초과하여 임시 저장된 이전 데이터를 표시하고 있습니다. 잠시 후 새로고침해 주세요.
              </div>
            </div>
          `;
          feedEl.insertBefore(warningBanner, feedEl.firstChild);
        }
        return;
      } catch (e) {
        console.error('Failed to parse dashboard cache fallback:', e);
      }
    }

    document.getElementById('dashboard-feed').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">!</div>
        <div>데이터 로드 실패: ${err.message}</div>
        <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">DART API 요청 초과 상태입니다. 잠시 후 다시 시도해 주세요.</div>
      </div>
    `;
  }
}

function renderDashboardUI(groups, stats, isFiltering = false) {
  if (!isFiltering) {
    window.DART_GROUPS = groups;
  }

  const api = window.DART_API;
  const feedEl = document.getElementById('dashboard-feed');
  const insightContainer = document.getElementById('quick-insight-container');

  // 1. 인사이트 컨테이너 초기화
  if (insightContainer) {
    insightContainer.innerHTML = '';
    const activeGroups = groups.filter(g => g.list.length > 0);
    activeGroups.forEach((group, i) => {
      const divId = `insight-item-${i}`;
      const div = document.createElement('div');
      div.id = divId;
      div.style.marginBottom = "12px";
      insightContainer.appendChild(div);
      div.innerHTML = summarizeDisclosure(group.list[0]);
    });
  }

  // 2. 피드 카드 렌더링
  if (feedEl) {
    if (groups.length > 0) {
      feedEl.innerHTML = groups.map(group => {
        const hasList = group.list && group.list.length > 0;
        return `
        <div class="company-group-card card card-static" style="margin-bottom:var(--sp-xl); padding:0; overflow:hidden;">
          <div style="padding:16px 20px; border-bottom:1px solid var(--outline-variant); background:var(--surface-container-low); display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div class="corp-logo">${(group.company.name && group.company.name[0]) || '?'}</div>
              <h3 class="t-headline-sm">${group.company.name || group.company.code}</h3>
            </div>
            <button class="btn-text" onclick="location.hash='#/company?q=${group.company.code}'">전체보기 &rarr;</button>
          </div>
          <div class="group-disclosures" style="padding:8px 0;">
            ${hasList ? group.list.map(item => `
              <div class="group-item" onclick="window.open('${api.viewerUrl(item.rcept_no)}','_blank')" style="padding:12px 20px; border-bottom:1px solid var(--outline-variant); cursor:pointer; transition:background 0.2s;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                  <span class="t-label-sm" style="color:var(--secondary);">${api.formatDate(item.rcept_dt)}</span>
                  <span class="badge ${item.corp_cls === 'Y' ? 'badge-primary' : 'badge-secondary'}">${item.corp_cls === 'Y' ? '유가' : '코스닥'}</span>
                </div>
                <div class="t-body-md bold" style="color:var(--on-surface);">${item.report_nm}</div>
              </div>
            `).join('') : `
              <div style="padding:16px 20px; color:var(--secondary); font-size:13px; text-align:center;">
                최근 30일 이내 공시가 없습니다.
              </div>
            `}
          </div>
        </div>
      `}).join('');
    } else {
      feedEl.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>선택한 카테고리의 공시가 없거나 관심 종목을 추가해 주세요.</p></div>`;
    }
  }
}

// 퀵 필터 탭 클릭 이벤트 및 필터링 기능 통합 정의
window.filterDashboardCategory = function(category) {
  window.currentDashboardFilter = category;
  
  const tabs = document.querySelectorAll('#category-filter-tabs .filter-tab');
  tabs.forEach(tab => {
    if (tab.getAttribute('data-filter') === category) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  if (window.DART_GROUPS) {
    const filtered = filterGroupsByCategory(window.DART_GROUPS, category);
    renderDashboardUI(filtered, null, true);
  }
};

function filterGroupsByCategory(groups, category) {
  if (category === '전체') return groups;
  
  return groups.map(g => {
    const filteredList = g.list.filter(item => getDisclosureCategory(item) === category);
    return {
      ...g,
      list: filteredList
    };
  }).filter(g => g.list.length > 0);
}

function renderFeedCard(item) {
  const api = window.DART_API;
  const corpName = item.corp_name || '';
  const ticker = corpName.length >= 2 ? corpName.slice(0, 2) : corpName;
  const corpClsName = api.corpClsNames[item.corp_cls] || item.corp_cls;
  const pillCls = api.pillClass(item.corp_cls);

  return `
    <div class="feed-card" onclick="window.open('${api.viewerUrl(item.rcept_no)}','_blank')">
      <div class="feed-card-header">
        <div class="feed-card-corp">
          <div class="feed-card-ticker">${ticker}</div>
          <div>
            <h4>${corpName}</h4>
            <p>${item.report_nm ? item.report_nm.split('[')[0].trim().slice(0,20) : ''}</p>
          </div>
        </div>
        <span class="feed-card-date">${api.formatDate(item.rcept_dt)}</span>
      </div>
      <div class="feed-card-title">${item.report_nm || ''}</div>
      <div class="feed-card-tags">
        <span class="pill ${pillCls}">${corpClsName}</span>
        ${item.flr_nm ? `<span style="font-size:12px;color:var(--on-surface-variant);">제출인: ${item.flr_nm}</span>` : ''}
      </div>
    </div>
  `;
}

function renderTypeStats(list) {
  const api = window.DART_API;
  const counts = {};
  list.forEach(item => {
    const cls = item.corp_cls || 'E';
    counts[cls] = (counts[cls] || 0) + 1;
  });
  const el = document.getElementById('type-stats');
  if (!el) return;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>법인구분</th><th class="text-right">건수</th></tr></thead>
    <tbody>${entries.map(([cls, cnt]) => `
      <tr><td><span class="pill ${api.pillClass(cls)}">${api.corpClsNames[cls] || cls}</span></td><td class="text-right mono">${cnt}</td></tr>
    `).join('')}</tbody>
  </table>`;
}

function fmt(d) {
  return d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

window.renderDashboard = renderDashboard;
window.initDashboard = initDashboard;

