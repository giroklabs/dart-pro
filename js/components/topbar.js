// Topbar Component
function renderTopbar() {
  return `
    <div style="display: flex; align-items: center; flex: 1; gap: 8px;">
      <button class="mobile-menu-btn" onclick="toggleSidebar()" aria-label="메뉴 열기">
        <span class="material-symbols-outlined">menu</span>
      </button>
      <div class="topbar-search" style="position: relative; display: flex; align-items: center; flex: 1;">
        <span class="material-symbols-outlined" style="position: absolute; left: 12px;" id="search-icon">search</span>
        <input type="text" id="global-search" placeholder="기업명, 종목코드로 검색..." style="width: 100%; padding-right: 48px;" />
        <kbd class="shortcut-badge" style="position: absolute; right: 8px;">⌘K</kbd>
      </div>
    </div>
  `;
}

function initTopbar() {
  const input = document.getElementById('global-search');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      location.hash = `#/company?q=${encodeURIComponent(input.value.trim())}`;
      input.value = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('global-search');
      if (searchInput) searchInput.focus();
    }
  });
}

window.renderTopbar = renderTopbar;
window.initTopbar = initTopbar;
