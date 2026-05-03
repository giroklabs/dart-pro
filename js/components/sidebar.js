// Sidebar Component
function renderSidebar() {
  const currentHash = location.hash || '#/';
  const items = [
    { hash: '#/', icon: 'dashboard', label: '대시보드' },
    { hash: '#/disclosures', icon: 'list_alt', label: '공시검색' },
    { hash: '#/company', icon: 'apartment', label: '기업조회' },
    { hash: '#/settings', icon: 'settings', label: '설정' },
  ];

  const user = window.FB_AUTH?.currentUser;

  return `
    <div class="sidebar-logo">
      <img src="icon-512-maskable.png" class="sidebar-logo-icon" style="object-fit: cover;" />
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
      ${user ? `
        <div class="user-profile" style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding:0 8px;">
          <img src="${user.photoURL}" style="width:32px; height:32px; border-radius:50%;" />
          <div style="font-size:12px;">
            <div style="font-weight:600; color:var(--on-surface);">${user.displayName}</div>
            <div style="color:var(--on-surface-variant); opacity:0.7;">관심종목 동기화 중</div>
          </div>
        </div>
        <button class="btn-secondary" onclick="FB_AUTH.logout()" style="width:100%; font-size:12px;">로그아웃</button>
      ` : `
        <button class="btn-primary" onclick="FB_AUTH.login()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
          <span class="material-symbols-outlined" style="font-size:18px;">login</span>
          <span>구글 로그인</span>
        </button>
        <p style="font-size:11px; color:var(--on-surface-variant); text-align:center; margin-top:8px;">로그인 시 관심종목이 자동 저장됩니다.</p>
      `}
    </div>
  `;
}

// 인증 상태 변경 시 사이드바 다시 그리기
document.addEventListener('auth-changed', () => {
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) sidebar.innerHTML = renderSidebar();
});

window.renderSidebar = renderSidebar;
