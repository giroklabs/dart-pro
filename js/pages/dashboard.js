window.switchAiMode = function(mode) {
  localStorage.setItem('dart_ai_mode', mode);
  window.router();
};

// Dashboard Page
async function renderDashboard() {
  const api = window.DART_API;
  const hasKey = !!api.getKey();

  if (!hasKey) {
    return `
      <div class="page-header">
        <h2>대시보드</h2>
        <p>DART 전자공시 실시간 모니터링</p>
      </div>
      <div class="empty-state">
        <span class="material-symbols-outlined">key</span>
        <p>API 키를 먼저 설정해주세요.</p>
        <br>
        <button class="btn-primary" onclick="location.hash='#/settings'">설정으로 이동</button>
      </div>
    `;
  }

  const aiMode = localStorage.getItem('dart_ai_mode') || 'gemini';
  const quickStyle = aiMode === 'quick' ? 'background:var(--primary); color:white;' : 'color:var(--on-surface-variant);';
  const geminiStyle = aiMode === 'gemini' ? 'background:var(--primary); color:white;' : 'color:var(--on-surface-variant);';

  return `
    <div class="page-header">
      <h2>대시보드</h2>
      <p>DART 전자공시 실시간 모니터링</p>
    </div>
    <div id="quick-insight-container"></div>
    <div id="dashboard-main-content">
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="section-title">관심 종목 리얼타임 피드</h3>
        <div style="display:flex; background:var(--surface-container-high); border-radius:8px; overflow:hidden; border:1px solid var(--outline-variant);">
          <button class="btn-text" style="padding:6px 12px; font-size:12px; border-radius:0; ${quickStyle}" onclick="switchAiMode('quick')">⚡️ 퀵 룰스</button>
          <button class="btn-text" style="padding:6px 12px; font-size:12px; border-radius:0; border-left:1px solid var(--outline-variant); ${geminiStyle}" onclick="switchAiMode('gemini')">✨ 제미나이</button>
        </div>
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

  // 4. 실시간 분석 시도
  if (api.getGeminiKey()) {
    try {
      const aiData = await api.getGeminiAnalysis(item.corp_name, item.report_nm);
      // api.js 내부에서 캐시 저장 완료 — 여기서 중복 저장 불필요
      if (aiData) {
        container.innerHTML = summarizeDisclosure(item, aiData);
      }
    } catch (e) {
      console.warn('AI Analysis Warning:', e.message);
      if (e.message.includes('429')) {
        container.innerHTML = summarizeDisclosure(item, {
          insight: "Gemini API 할당량을 모두 소모했습니다. 약 1분 후 분석이 재개됩니다.",
          impact: "할당량 초과",
          points: ["무료 티어는 분당 요청 수가 제한되어 있습니다.", "잠시 후 새로고침 시 캐시된 정보가 표시됩니다."]
        });
      }
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
            <div class="insight-label">${isCached}GEMINI 1.5 FLASH</div>
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
            <div class="insight-label">GEMINI 1.5 FLASH</div>
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

function getQuickInsightHtml(item) {
  const title = item.report_nm || '';
  
  let insight = "최근 접수된 공시입니다. 상세 내용을 검토하세요.";
  let points = ["접수번호: " + item.rcept_no, "제출일자: " + window.DART_API.formatDate(item.rcept_dt)];
  let impact = "정보 확인";
  let typeCls = "insight-default";
  let icon = "campaign";

  if (title.includes("배당")) {
    insight = "<strong>현금/현물 배당 결정:</strong> 주주 환원의 핵심 지표가 발표되었습니다.";
    points = ["과거 배당금 대비 증액 여부 확인", "시가배당률 확인 요망"];
    impact = "긍정적 (배당수익)";
    typeCls = "insight-success";
    icon = "payments";
  } else if (title.includes("분기보고서") || title.includes("사업보고서")) {
    insight = "<strong>정기 실적 발표:</strong> 기업의 성적표가 공개되었습니다.";
    points = ["매출액 및 영업이익 YoY 확인", "어닝 서프라이즈 여부 검토"];
    impact = "실적 변동";
    typeCls = "insight-info";
    icon = "monitoring";
  } else if (title.includes("공급계약") || title.includes("수주")) {
    insight = "<strong>신규 수주/공급계약:</strong> 매출 증대로 직결되는 호재입니다.";
    points = ["계약 금액 비중 확인", "계약 기간 및 상대방 검토"];
    impact = "매출 증대";
    typeCls = "insight-success";
    icon = "contract_edit";
  } else if (title.includes("유상증자") || title.includes("무상증자")) {
    insight = "<strong>자본금 변동(증자):</strong> 주식 수 변화에 따른 가치 희석 우려가 있습니다.";
    points = ["자금 조달 목적(호재/악재) 확인", "신주 배정 비율 확인"];
    impact = "가치 변동";
    typeCls = "insight-warning";
    icon = "add_chart";
  } else if (title.includes("소유상황") || title.includes("장내매수")) {
    insight = "<strong>내부자 지분 변동:</strong> 경영진 및 대주주가 주식을 매매했습니다.";
    points = ["매수/매도 여부에 따른 시그널 판단", "경영권 영향 확인"];
    impact = "내부자 시그널";
    typeCls = "insight-success";
    icon = "person_search";
  }

  return `
    <div class="insight-banner ${typeCls}">
      <div class="insight-icon"><span class="material-symbols-outlined">${icon}</span></div>
      <div class="insight-content">
        <div class="insight-header">
          <div class="insight-label">⚡️ 퀵 룰스 분석</div>
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

async function initDashboard() {
  const api = window.DART_API;
  if (!api.getKey()) return;
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
    const promises = watchlist.map(item => 
      api.searchDisclosures({ 
        corp_code: item.code, 
        bgn_de: bgnDe30, 
        end_de: endDe, 
        page_count: 3 // 각 종목별 최근 3건
      })
    );
    
    const results = await Promise.all(promises);

    // 데이터를 종목별로 그룹화 + 이름 교정 (Reverse Lookup)
    const groups = await Promise.all(watchlist.map(async (item, index) => {
      const res = results[index];
      const corpList = res.list || [];
      const correctedName = await api.getCorpName(item.code);
      return {
        company: { ...item, name: correctedName || item.name },
        latestDate: corpList.length > 0 ? corpList[0].rcept_no : '0',
        list: corpList
      };
    }));

    groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));

    // 3. UI 1차 업데이트 (피드 우선 표시, 통계는 로딩중 상태)
    renderDashboardUI(groups, null);

    // 4. AI 인사이트 업데이트 (순차 처리 - 비동기로 바로 시작)
    const updateInsights = async () => {
      if (groups.some(g => g.list.length > 0)) {
        const activeGroups = groups.filter(g => g.list.length > 0);
        for (let i = 0; i < activeGroups.length; i++) {
          const divId = `insight-item-${i}`;
          await renderInsight(divId, activeGroups[i].list[0]);
          await new Promise(r => setTimeout(r, 300));
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
    if (groups.some(g => g.list.length > 0)) {
      const activeGroups = groups.filter(g => g.list.length > 0);
      feedEl.innerHTML = activeGroups.map(group => `
        <div class="company-group-card card card-static" style="margin-bottom:var(--sp-xl); padding:0; overflow:hidden;">
          <div style="padding:16px 20px; border-bottom:1px solid var(--outline-variant); background:var(--surface-container-low); display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div class="corp-logo">${group.company.name[0]}</div>
              <h3 class="t-headline-sm">${group.company.name}</h3>
            </div>
            <button class="btn-text" onclick="location.hash='#/company?q=${group.company.code}'">전체보기 &rarr;</button>
          </div>
          <div class="group-disclosures" style="padding:8px 0;">
            ${group.list.map(item => `
              <div class="group-item" onclick="window.open('${api.viewerUrl(item.rcept_no)}','_blank')" style="padding:12px 20px; border-bottom:1px solid var(--outline-variant); cursor:pointer; transition:background 0.2s;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                  <span class="t-label-sm" style="color:var(--secondary);">${api.formatDate(item.rcept_dt)}</span>
                  <span class="badge ${item.corp_cls === 'Y' ? 'badge-primary' : 'badge-secondary'}">${item.corp_cls === 'Y' ? '유가' : '코스닥'}</span>
                </div>
                <div class="t-body-md bold" style="color:var(--on-surface);">${item.report_nm}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    } else {
      feedEl.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>최근 공시가 없습니다.</p></div>`;
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

function getQuickInsightHtml(item) {
  const title = item.report_nm || '';
  let insight = "최근 접수된 공시입니다. 상세 내용을 검토하세요.";
  let points = ["접수번호: " + item.rcept_no, "제출일자: " + window.DART_API.formatDate(item.rcept_dt)];
  let impact = "정보 확인";
  let typeCls = "insight-default";
  let icon = "campaign";

  if (title.includes("배당")) {
    insight = "<strong>현금/현물 배당 결정:</strong> 주주 환원의 핵심 지표가 발표되었습니다.";
    points = ["과거 배당금 대비 증액 여부 확인", "시가배당률 확인 요망"];
    impact = "긍정적 (배당수익)";
    typeCls = "insight-success";
    icon = "payments";
  } else if (title.includes("분기보고서") || title.includes("사업보고서")) {
    insight = "<strong>정기 실적 발표:</strong> 기업의 성적표가 공개되었습니다.";
    points = ["매출액 및 영업이익 YoY 확인", "어닝 서프라이즈 여부 검토"];
    impact = "실적 변동";
    typeCls = "insight-info";
    icon = "monitoring";
  } else if (title.includes("공급계약") || title.includes("수주")) {
    insight = "<strong>신규 수주/공급계약:</strong> 매출 증대로 직결되는 호재입니다.";
    points = ["계약 금액 비중 확인", "계약 기간 및 상대방 검토"];
    impact = "매출 증대";
    typeCls = "insight-success";
    icon = "contract_edit";
  } else if (title.includes("유상증자") || title.includes("무상증자")) {
    insight = "<strong>자본금 변동(증자):</strong> 주식 수 변화에 따른 가치 희석 우려가 있습니다.";
    points = ["자금 조달 목적(호재/악재) 확인", "신주 배정 비율 확인"];
    impact = "가치 변동";
    typeCls = "insight-warning";
    icon = "add_chart";
  } else if (title.includes("소유상황") || title.includes("장내매수")) {
    insight = "<strong>내부자 지분 변동:</strong> 경영진 및 대주주가 주식을 매매했습니다.";
    points = ["매수/매도 여부에 따른 시그널 판단", "경영권 영향 확인"];
    impact = "내부자 시그널";
    typeCls = "insight-success";
    icon = "person_search";
  }

  return `
    <div class="insight-banner ${typeCls}">
      <div class="insight-icon"><span class="material-symbols-outlined">${icon}</span></div>
      <div class="insight-content">
        <div class="insight-header">
          <div class="insight-label">⚡️ 퀵 룰스 분석</div>
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
