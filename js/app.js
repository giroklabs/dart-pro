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
  const hash = location.hash || '#/';
  const path = hash.split('?')[0];

  // Render layout
  const sidebar = document.getElementById('app-sidebar');
  const topbar = document.getElementById('app-topbar');
  const content = document.getElementById('app-content');

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
      // Auto-search if query param
      const params = new URLSearchParams(hash.split('?')[1] || '');
      if (params.get('q')) {
        document.getElementById('company-corp-code').value = params.get('q');
      }
      break;
    case '#/settings':
      content.innerHTML = renderSettings();
      break;
    default:
      content.innerHTML = await renderDashboard();
      initDashboard();
  }

  initTopbar();

  // Re-animate
  content.style.animation = 'none';
  content.offsetHeight;
  content.style.animation = '';
}
