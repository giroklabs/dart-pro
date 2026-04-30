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

  return `
    <div class="page-header">
      <h2>대시보드</h2>
      <p>DART 전자공시 실시간 모니터링</p>
    </div>
    <div id="quick-insight-container"></div>
    <div class="stat-grid">
      <div class="card card-static" id="stat-total">
        <p class="stat-label">오늘의 공시</p>
        <div class="stat-value" id="stat-today-count">-</div>
        <div class="stat-meta info"><span class="material-symbols-outlined">update</span><span id="stat-today-label">조회 중...</span></div>
      </div>
      <div class="card card-static">
        <p class="stat-label">유가증권</p>
        <div class="stat-value" id="stat-kospi">-</div>
        <div class="stat-meta neutral"><span class="material-symbols-outlined">monitoring</span><span>KOSPI</span></div>
      </div>
      <div class="card card-static">
        <p class="stat-label">코스닥</p>
        <div class="stat-value" id="stat-kosdaq">-</div>
        <div class="stat-meta neutral"><span class="material-symbols-outlined">monitoring</span><span>KOSDAQ</span></div>
      </div>
      <div class="card card-static">
        <p class="stat-label">정기공시</p>
        <div class="stat-value" id="stat-regular">-</div>
        <div class="stat-meta positive"><span class="material-symbols-outlined">verified</span><span>최근 7일</span></div>
      </div>
    </div>
    <div class="content-grid">
      <div class="content-main">
        <div class="section-header">
          <h3 class="section-title">최근 공시</h3>
          <button class="btn-text" onclick="location.hash='#/disclosures'">전체 보기 →</button>
        </div>
        <div id="dashboard-feed"><div class="loading"><div class="spinner"></div>공시 정보를 불러오는 중...</div></div>
      </div>
      <div class="content-aside">
        <div class="card card-static" style="padding:0;overflow:hidden;">
          <div style="padding:16px;border-bottom:1px solid var(--outline-variant);background:var(--surface-container-low);">
            <h3 class="t-headline-sm">공시 유형별 현황</h3>
          </div>
          <div id="type-stats" style="padding:16px;"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        <div class="dark-banner">
          <div class="dark-banner-head">
            <span class="material-symbols-outlined">auto_awesome</span>
            <span>DART Pro</span>
          </div>
          <p>전자공시 검색, 기업개황 조회, 공시서류 다운로드를 한 곳에서 이용하세요.</p>
          <button class="btn-action" onclick="location.hash='#/disclosures'">공시 검색 시작</button>
        </div>
      </div>
    </div>
  `;
}

function summarizeDisclosure(item) {
  const title = item.report_nm || '';
  let insight = "최근 접수된 공시입니다. 상세 내용을 검토하세요.";
  let typeCls = "insight-default";
  let icon = "campaign";

  if (title.includes("배당")) {
    insight = "<strong>현금/현물 배당 결정:</strong> 주당 배당금 및 배당 기준일을 확인하여 투자 수익률을 점검하세요.";
    typeCls = "insight-success";
    icon = "payments";
  } else if (title.includes("분기보고서") || title.includes("사업보고서")) {
    insight = "<strong>정기 실적 발표:</strong> 기업의 매출액, 영업이익 실적을 이전 분기/전년 대비 비교 분석이 필요합니다.";
    typeCls = "insight-info";
    icon = "monitoring";
  } else if (title.includes("유상증자") || title.includes("무상증자")) {
    insight = "<strong>증자 결정:</strong> 발행 주식 수 변동에 따른 주가 희석 또는 자산 가치 변화를 유의하세요.";
    typeCls = "insight-warning";
    icon = "add_chart";
  } else if (title.includes("주요사항보고서")) {
    insight = "<strong>경영 주요사항:</strong> 기업 운영에 중대한 영향을 미치는 결정이 포함되어 있습니다.";
    typeCls = "insight-major";
    icon = "priority_high";
  }

  return `
    <div class="insight-banner ${typeCls}">
      <div class="insight-icon"><span class="material-symbols-outlined">${icon}</span></div>
      <div class="insight-content">
        <div class="insight-label">AI QUICK INSIGHT</div>
        <div class="insight-text"><strong>${item.corp_name}</strong> - ${insight}</div>
      </div>
      <button class="btn-text" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">상세보기</button>
    </div>
  `;
}

async function initDashboard() {
  const api = window.DART_API;
  if (!api.getKey()) return;

  try {
    const today = new Date();
    const endDe = fmt(today);
    const bgnDe7 = fmt(new Date(today.getTime() - 6 * 86400000));
    const bgnDeToday = endDe;

    // 최근 공시 피드 (인사이트용 데이터 포함)
    const feedData = await api.searchDisclosures({ bgn_de: bgnDe7, end_de: endDe, page_count: 20 });
    
    // 1. 인사이트 생성 (가장 중요한 공시 하나 선정 - 주요사항보고서 또는 첫번째)
    const insightContainer = document.getElementById('quick-insight-container');
    if (feedData.list && feedData.list.length > 0) {
      const target = feedData.list.find(i => i.report_nm.includes('배당') || i.report_nm.includes('보고서')) || feedData.list[0];
      insightContainer.innerHTML = summarizeDisclosure(target);
    }

    // 2. 통계 업데이트
    const todayData = await api.searchDisclosures({ bgn_de: bgnDeToday, end_de: endDe, page_count: 1 });
    document.getElementById('stat-today-count').textContent = todayData.total_count || 0;
    document.getElementById('stat-today-label').textContent = api.formatDate(endDe);

    const regularData = await api.searchDisclosures({ bgn_de: bgnDe7, end_de: endDe, pblntf_ty: 'A', page_count: 1 });
    document.getElementById('stat-regular').textContent = regularData.total_count || 0;

    const kospiData = await api.searchDisclosures({ bgn_de: bgnDeToday, end_de: endDe, corp_cls: 'Y', page_count: 1 });
    document.getElementById('stat-kospi').textContent = kospiData.total_count || 0;

    const kosdaqData = await api.searchDisclosures({ bgn_de: bgnDeToday, end_de: endDe, corp_cls: 'K', page_count: 1 });
    document.getElementById('stat-kosdaq').textContent = kosdaqData.total_count || 0;

    // 3. 피드 리스트 렌더링
    const feedEl = document.getElementById('dashboard-feed');
    if (!feedData.list || feedData.list.length === 0) {
      feedEl.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>최근 공시가 없습니다.</p></div>';
    } else {
      feedEl.innerHTML = feedData.list.slice(0, 10).map(item => renderFeedCard(item)).join('');
    }

    renderTypeStats(feedData.list);
  } catch (err) {
    console.error(err);
    document.getElementById('dashboard-feed').innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">error</span><p>${err.message}</p></div>`;
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
