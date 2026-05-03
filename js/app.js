// App Router & Initialization
document.addEventListener('DOMContentLoaded', () => {
  // API 키는 사용자가 설정 페이지에서 직접 입력합니다. 하드코딩 금지.

  // 기업 고유번호 DB 초기화 (배경 작업)
  DART_API.initCorpCodes();

  window.router = router;
  window.addEventListener('hashchange', router);
  router();
});

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
        break;
      case '#/company':
        content.innerHTML = renderCompany();
        const params = new URLSearchParams(hash.split('?')[1] || '');
        if (params.get('q')) {
          const input = document.getElementById('company-corp-code');
          if (input) input.value = params.get('q');
        }
        break;
      case '#/settings':
        content.innerHTML = renderSettings();
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
