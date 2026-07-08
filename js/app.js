// App Router & Initialization
document.addEventListener('DOMContentLoaded', () => {
  // API 키는 사용자가 설정 페이지에서 직접 입력합니다. 하드코딩 금지.

  // 기업 고유번호 DB 초기화 (배경 작업)
  DART_API.initCorpCodes();

  window.router = router;
  window.addEventListener('hashchange', router);
  
  // 데이터 변경 시 자동 UI 갱신
  document.addEventListener('watchlist-updated', () => router());
  document.addEventListener('auth-changed', () => router());

  router();
  
  // 실시간 공시알리미 폴링 시작
  initNotificationPoller();
});

window.showToast = function(message, type = 'info', duration = 3000, onClick = null) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'info';
  if (type === 'success') icon = 'check_circle';
  if (type === 'error') icon = 'error';
  if (type === 'new_releases') icon = 'new_releases';
  
  toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px;">${icon}</span><span style="flex:1;">${message}</span>`;
  
  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      onClick();
      toast.classList.add('toast-hiding');
      setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
    });
  }
  
  container.appendChild(toast);
  
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.classList.add('toast-hiding');
      setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
    }
  }, duration);
};

function initNotificationPoller() {
  const POLLING_INTERVAL = 60 * 1000; // 1분 주기
  const STORAGE_KEY = 'dart_notified_rcepts';
  
  setInterval(async () => {
    try {
      const watchlist = window.DART_API.getWatchlist();
      if (!watchlist || watchlist.length === 0) return;
      
      const today = new Date();
      const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
      
      // 최신 100건 전역 조회 후 관심종목 필터링 (API 한도 최적화)
      const res = await window.DART_API.searchDisclosures({
        bgn_de: dateStr,
        end_de: dateStr,
        page_count: 100
      });
      
      if (res && res.list && res.list.length > 0) {
        const matched = res.list.filter(item => watchlist.includes(item.corp_code));
        if (matched.length === 0) return;

        let notifiedObj = {};
        try {
          notifiedObj = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch(e) {}
        
        if (notifiedObj.date !== dateStr) {
          notifiedObj = { date: dateStr, rcepts: [] };
        }
        
        let newFound = false;
        // 가장 최근 공시부터 오래된 순으로 오므로 역순으로 알림 띄우기 (오래된 것부터)
        for (let i = matched.length - 1; i >= 0; i--) {
          const item = matched[i];
          if (!notifiedObj.rcepts.includes(item.rcept_no)) {
            notifiedObj.rcepts.push(item.rcept_no);
            newFound = true;
            
            const msg = `<strong style="color:#ffffff;font-size:14px;">${item.corp_name}</strong><br/><span style="font-size:13px;line-height:1.4;display:inline-block;margin-top:2px;">${item.report_nm}</span>`;
            window.showToast(msg, 'new_releases', 8000, () => {
              window.open(window.DART_API.viewerUrl(item.rcept_no), '_blank');
            });
          }
        }
        
        if (newFound) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(notifiedObj));
        }
      }
    } catch(err) {
      console.warn('Notification poller error:', err);
    }
  }, POLLING_INTERVAL);
}

async function router() {
  try {
    const hash = location.hash || '#/';
    const path = hash.split('?')[0];

    // Render layout
    const sidebar = document.getElementById('app-sidebar');
    const topbar = document.getElementById('app-topbar');
    const content = document.getElementById('app-content');

    if (!sidebar || !topbar || !content) return;

    sidebar.innerHTML = renderSidebar();
    topbar.innerHTML = renderTopbar();

    // Route pages
    switch (path) {
      case '#/':
        content.innerHTML = await renderDashboard();
        initDashboard();
        break;
      case '#/disclosures':
        content.innerHTML = renderDisclosures();
        doDisclosureSearch(1);
        break;
      case '#/company':
        content.innerHTML = await renderCompany();
        const params = new URLSearchParams(hash.split('?')[1] || '');
        if (params.get('q')) {
          const input = document.getElementById('company-corp-code');
          if (input) {
            input.value = params.get('q');
            doCompanySearch();
          }
        } else {
          const watchlist = DART_API.getWatchlist ? DART_API.getWatchlist() : [];
          if (watchlist.length > 0) {
            const input = document.getElementById('company-corp-code');
            if (input) {
              input.value = watchlist[0];
              doCompanySearch();
        }
        break;
      case '#/statistics':
        content.innerHTML = await renderStatistics();
        if (window.initStatistics) initStatistics();
        break;
      case '#/reports':
        content.innerHTML = renderReports();
        initReports();
        break;
      case '#/settings':
        content.innerHTML = await renderSettings();
        break;
      default:
        content.innerHTML = await renderDashboard();
        initDashboard();
    }

    // 상단바 검색 기능 초기화 및 애니메이션 효과
    if (window.initTopbar) window.initTopbar();
    content.style.animation = 'none';
    content.offsetHeight;
    content.style.animation = '';

  } catch (err) {
    console.error('[Router Error]', err);
    const content = document.getElementById('app-content');
    if (content) {
      content.innerHTML = `<div class="empty-state"><p>페이지 로드 중 오류가 발생했습니다: ${err.message}</p><button class="btn-primary" onclick="location.reload()">새로고침</button></div>`;
    }
  }
}
