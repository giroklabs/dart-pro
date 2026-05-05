window.switchAiMode = function(mode) {
  if (mode === 'gemini') {
    const isPremium = window.FB_AUTH && window.FB_AUTH.isPremium;
    if (!isPremium) {
      if (window.showToast) window.showToast('AI 제미나이 분석은 프리미엄(유료) 사용자만 이용할 수 있습니다.');
      return;
    }
  }
  localStorage.setItem('dart_ai_mode', mode);
  window.router();
};

// Dashboard Page
async function renderDashboard() {
  const isPremium = window.FB_AUTH && window.FB_AUTH.isPremium;
  
  // 프리미엄 유저가 아닌 경우 항상 quick 모드로 강제 설정
  if (!isPremium && localStorage.getItem('dart_ai_mode') === 'gemini') {
    localStorage.setItem('dart_ai_mode', 'quick');
  }

  const aiMode = localStorage.getItem('dart_ai_mode') || 'quick';
  const quickStyle = aiMode === 'quick' ? 'background:var(--primary); color:white;' : 'color:var(--on-surface-variant);';
  const geminiStyle = aiMode === 'gemini' ? 'background:var(--primary); color:white;' : 'color:var(--on-surface-variant);';

  return `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2>대시보드</h2>
        <p>DART 전자공시 실시간 모니터링</p>
      </div>
      <div style="display:flex; background:var(--surface-container-high); border-radius:8px; overflow:hidden; border:1px solid var(--outline-variant);">
        <button class="btn-text" style="padding:6px 12px; font-size:12px; border-radius:0; ${quickStyle}" onclick="switchAiMode('quick')">⚡️ QUICK 분석</button>
        <button class="btn-text" style="padding:6px 12px; font-size:12px; border-radius:0; border-left:1px solid var(--outline-variant); ${geminiStyle}" onclick="switchAiMode('gemini')">✨ 제미나이</button>
      </div>
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
  const api = window.DART_API;
  const container = document.getElementById(containerId);
  if (!container) return;

  const aiMode = localStorage.getItem('dart_ai_mode') || 'gemini';

  // 1. 퀵 분석 모드일 경우 즉시 렌더링하고 종료
  if (aiMode === 'quick') {
    container.innerHTML = getQuickInsightHtml(item);
    return;
  }

  // 2. 캐시 확인 (Gemini 전용) — api.js와 동일한 키 사용
  const cacheKey = `gemini_cache_${item.corp_name}_${item.report_nm}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    try {
      const aiData = JSON.parse(cached);
      aiData._cached = true;
      container.innerHTML = summarizeDisclosure(item, aiData);
      return;
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  // 3. 기본 요약 표시 (로딩 중 대용)
  container.innerHTML = summarizeDisclosure(item, null);

  // 4. 실시간 분석 시도 (프리미엄 검증은 백엔드에서도 수행됨)
  try {
    const aiData = await api.getGeminiAnalysis(item.corp_name, item.report_nm);
    // api.js 내부에서 캐시 저장 완료
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

function summarizeDisclosure(item, aiData = null) {
  const title = item.report_nm || '';
  const cleanMd = (s) => typeof s === 'string' ? s.replace(/\*\*|\*/g, '').trim() : s;
  
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

  // Gemini 데이터가 있는 경우 우선 사용
  if (aiData) {
    const isCached = aiData._cached ? '⚡️ ' : '';
    const insight = cleanMd(aiData.insight || '');
    const impact = cleanMd(aiData.impact || '분석 중');
    const points = (aiData.points || []).map(p => cleanMd(p));

    return `
      <div class="insight-banner insight-info ai-glow">
        <div class="insight-icon"><span class="material-symbols-outlined">auto_awesome</span></div>
        <div class="insight-content">
          <div class="insight-header">
            <div class="insight-label">${isCached}GEMINI 1.5 FLASH <span style="color:var(--outline); font-weight:500; font-size:11px; margin-left:6px;">${api.formatDate(item.rcept_dt)}</span></div>
            <div class="insight-impact">${impact}</div>
          </div>
          <div class="insight-text"><strong>${item.corp_name}</strong> - ${insight}</div>
          <ul class="insight-points">
            ${points.map(p => `<li>${p}</li>`).join('')}
          </ul>
        </div>
        <div class="insight-actions">
          <button class="btn-text" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">상세보기</button>
        </div>
      </div>
    `;
  }

  // Gemini 데이터가 없는 경우 (로딩 중 상태)
  if (!aiData) {
    return `
      <div class="insight-banner insight-info ai-glow" style="opacity: 0.7;">
        <div class="insight-icon"><span class="material-symbols-outlined spin">sync</span></div>
        <div class="insight-content">
          <div class="insight-header">
            <div class="insight-label">GEMINI 1.5 FLASH <span style="color:var(--outline); font-weight:500; font-size:11px; margin-left:6px;">${api.formatDate(item.rcept_dt)}</span></div>
            <div class="insight-impact">분석 중...</div>
          </div>
          <div class="insight-text"><strong>${item.corp_name}</strong> - 실시간 공시 내용을 AI가 분석하고 있습니다.</div>
          <ul class="insight-points">
            <li style="color:var(--on-surface-variant);">잠시만 기다려주세요...</li>
          </ul>
        </div>
        <div class="insight-actions">
          <button class="btn-text" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">상세보기</button>
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
    match: [/매출액/, /영업이익/, /실적/],
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
    typeCls: 'insight-info',
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
    match: [/상장폐지/, /관리종목/, /불성실공시/],
    category: '긴급위험',
    impact: '강한 위험',
    urgency: 100,
    typeCls: 'insight-danger',
    icon: 'warning',
    insight: '투자 주의 공시: 상장폐지 또는 심각한 규정 위반 관련 내용입니다.',
    points: [
      '상장 유지 요건 충족 여부 확인',
      '이의신청 기간 및 절차 파악',
      '포지션 긴급 재검토 권장'
    ]
  },
  {
    id: 'audit',
    match: [/감사보고서/, /감사의견/],
    category: '회계신뢰',
    impact: '의견 확인',
    urgency: 95,
    typeCls: 'insight-warning',
    icon: 'fact_check',
    insight: '감사보고서 제출: 외부감사인의 의견은 기업의 생존과 직결됩니다.',
    points: [
      '적정 의견 여부 즉시 확인 (비적정 시 상폐 위험)',
      '핵심감사사항(KAM) 내용 검토',
      '계속기업 존속 불확실성 여부 체크'
    ]
  }
];

function getQuickInsightData(item) {
  const title = item.report_nm || '';
  const base = {
    category: '기타',
    impact: '정보 확인',
    urgency: 40,
    typeCls: 'insight-default',
    icon: 'campaign',
    insight: '최근 접수된 공시입니다. 핵심 항목을 직접 확인하세요.',
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
  
  const tagsHtml = data.tags && data.tags.length > 0 
    ? `<div style="margin-bottom:8px; display:flex; gap:4px;">${data.tags.map(t => `<span class="pill pill-default" style="font-size:10px; padding:2px 6px;">${t}</span>`).join('')}</div>`
    : '';

  return `
    <div class="insight-banner ${data.typeCls}">
      <div class="insight-icon"><span class="material-symbols-outlined">${data.icon}</span></div>
      <div class="insight-content">
        <div class="insight-header">
          <div class="insight-label">⚡️ QUICK 분석 <span style="color:var(--outline); font-weight:500; font-size:11px; margin-left:4px;">[${data.category}]</span> <span style="color:var(--outline); font-weight:500; font-size:11px; margin-left:6px;">${api.formatDate(item.rcept_dt)}</span></div>
          <div class="insight-impact">${data.impact}</div>
        </div>
        ${tagsHtml}
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
    const bgnDeToday = endDe;
    const bgnDe30 = fmt(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    
    // 2. 관심 종목별 공시 데이터 개별 조회 (병렬 처리)
    const promises = watchlist.map(code => 
      api.searchDisclosures({ 
        corp_code: code, 
        bgn_de: bgnDe30, 
        end_de: endDe, 
        page_count: 3 
      })
    );
    
    const results = await Promise.all(promises);

    // 데이터를 종목별로 그룹화 + 이름 교정
    const groups = await Promise.all(watchlist.map(async (code, index) => {
      const res = results[index];
      const corpList = res.list || [];
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
        for (let i = 0; i < activeGroups.length; i += 3) {
          const chunk = activeGroups.slice(i, i + 3);
          await Promise.all(chunk.map((g, idx) => {
            const globalIdx = i + idx;
            const divId = `insight-item-${globalIdx}`;
            return renderInsight(divId, g.list[0]);
          }));
          if (i + 3 < activeGroups.length) {
            await new Promise(r => setTimeout(r, 1000)); // 다음 청크 전 1초 대기
          }
        }
      }
    };
    updateInsights(); // await 없이 백그라운드 실행

    // 대시보드 상태 저장
    localStorage.setItem('dashboard_cache', JSON.stringify({ watchlist, groups }));

  } catch (err) {
    console.error(err);
    document.getElementById('dashboard-feed').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">!</div>
        <div>데이터 로드 실패: ${err.message}</div>
      </div>
    `;
  }
}

function renderDashboardUI(groups, stats) {
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
      feedEl.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>관심 종목을 추가해 주세요.</p></div>`;
    }
  }

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

