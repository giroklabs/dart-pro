// Topbar Component
function renderTopbar() {
  return `
    <div class="topbar-search">
      <span class="material-symbols-outlined">search</span>
      <input type="text" id="global-search" placeholder="기업명, 종목코드로 검색..." />
    </div>
    <div class="topbar-actions">
      <button class="btn-secondary" onclick="location.hash='#/settings'" title="설정">
        <span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;">settings</span>
      </button>
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
}

window.renderTopbar = renderTopbar;
window.initTopbar = initTopbar;
