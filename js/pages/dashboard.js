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

async function initDashboard() {
  const api = window.DART_API;
  if (!api.getKey()) return;

  try {
    const today = new Date();
    const endDe = fmt(today);
    const bgnDe7 = fmt(new Date(today.getTime() - 7 * 86400000));
    const bgnDeToday = endDe;

    // 오늘 공시
    const todayData = await api.searchDisclosures({ bgn_de: bgnDeToday, end_de: endDe, page_count: 1 });
    document.getElementById('stat-today-count').textContent = todayData.total_count || 0;
    document.getElementById('stat-today-label').textContent = api.formatDate(endDe);

    // 최근 7일 정기공시
    const regularData = await api.searchDisclosures({ bgn_de: bgnDe7, end_de: endDe, pblntf_ty: 'A', page_count: 1 });
    document.getElementById('stat-regular').textContent = regularData.total_count || 0;

    // 유가/코스닥 최근 공시
    const kospiData = await api.searchDisclosures({ bgn_de: bgnDeToday, end_de: endDe, corp_cls: 'Y', page_count: 1 });
    document.getElementById('stat-kospi').textContent = kospiData.total_count || 0;

    const kosdaqData = await api.searchDisclosures({ bgn_de: bgnDeToday, end_de: endDe, corp_cls: 'K', page_count: 1 });
    document.getElementById('stat-kosdaq').textContent = kosdaqData.total_count || 0;

    // 최근 공시 피드
    const feedData = await api.searchDisclosures({ bgn_de: bgnDe7, end_de: endDe, page_count: 10 });
    const feedEl = document.getElementById('dashboard-feed');
    if (!feedData.list || feedData.list.length === 0) {
      feedEl.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>최근 공시가 없습니다.</p></div>';
      return;
    }
    feedEl.innerHTML = feedData.list.map(item => renderFeedCard(item)).join('');

    // 유형별 통계
    renderTypeStats(feedData.list);
  } catch (err) {
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
