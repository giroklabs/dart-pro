// Sidebar Component
function renderSidebar() {
  const currentHash = location.hash || '#/';
  const items = [
    { hash: '#/', icon: 'dashboard', label: '대시보드' },
    { hash: '#/disclosures', icon: 'list_alt', label: '공시검색' },
    { hash: '#/company', icon: 'apartment', label: '기업조회' },
    { hash: '#/settings', icon: 'settings', label: '설정' },
  ];

  return `
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">D</div>
      <div class="sidebar-logo-text">
        <h1>DART Pro</h1>
        <p>전자공시 대시보드</p>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${items.map(item => `
        <a href="${item.hash}" class="nav-item ${currentHash === item.hash ? 'active' : ''}" id="nav-${item.hash.replace('#/', '') || 'home'}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <button class="btn-primary" onclick="location.hash='#/disclosures'">공시 검색하기</button>
    </div>
  `;
}
window.renderSidebar = renderSidebar;
