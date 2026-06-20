// Sidebar Component
function renderSidebar() {
  const currentHash = location.hash || '#/';
  const items = [
    { hash: '#/', icon: 'dashboard', label: '대시보드' },
    { hash: '#/disclosures', icon: 'list_alt', label: '공시검색' },
    { hash: '#/company', icon: 'apartment', label: '기업조회' },
    { hash: '#/settings', icon: 'star', label: '관심종목' },
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
      
      <!-- 공시알리미 앱 배너 광고 -->
      <a href="https://apps.apple.com/kr/app/%EA%B3%B5%EC%8B%9C%EC%95%8C%EB%A6%AC%EB%AF%B8/id6766577471" target="_blank" rel="noopener noreferrer" class="sidebar-banner-link" style="margin-top: 16px; display: block; text-decoration: none; padding: 4px 0;">
        <div class="sidebar-banner" style="border-radius: 12px; overflow: hidden; border: 1px solid rgba(226, 229, 233, 0.8); background: var(--surface-container-low); transition: all 0.25s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
          <img src="images/banner_new.jpg?v=1" style="width: 100%; display: block; object-fit: cover;" alt="공시알리미" />
        </div>
      </a>
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
        <button class="btn-primary" onclick="FB_AUTH.login()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px;">
          <svg viewBox="0 0 24 24" style="width:16px; height:16px; margin-right:4px;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>구글 로그인</span>
        </button>
        <button class="btn-primary" onclick="FB_AUTH.loginWithApple()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px; background:#000000; color:#ffffff; border:1px solid #333333;">
          <svg viewBox="0 0 170 170" style="width:16px; height:16px; fill:currentColor; margin-right:4px;">
            <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.13-1.92-14.38-6.13-2.92-2.51-6.73-7.03-11.42-13.56-5.11-7.14-9.31-15.37-12.6-24.71-3.29-9.33-4.94-18.24-4.94-26.73 0-13.51 3.56-24.64 10.69-33.4 7.13-8.76 15.9-13.19 26.3-13.29 5.07 0 10.62 1.54 16.65 4.64 6.02 3.09 10.3 4.64 12.86 4.64 2.11 0 6.13-1.5 12.06-4.51 5.92-3 11.28-4.47 16.07-4.47 12.33.19 22.33 4.66 30 13.43-10.74 6.57-16.02 15.57-15.82 27 0 9.04 3.31 16.63 9.93 22.76 6.62 6.13 14.51 9.49 23.67 10.07-2.18 6.51-4.82 13-7.9 19.46zM119.5 26.85c0-6.77 2.4-13.11 7.21-18.02 4.81-4.9 10.78-7.73 17.92-8.5 0 6.61-2.4 12.87-7.21 17.78-4.8 4.91-10.87 7.74-18.22 7.74-.06-.34-.14-.68-.14-1"/>
          </svg>
          <span>애플 로그인</span>
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
