// Settings Page
function renderSettings() {
  const api = window.DART_API;
  const savedKey = api.getKey();
  const masked = savedKey ? savedKey.slice(0, 8) + '••••••••' + savedKey.slice(-4) : '';

  return `
    <div class="page-header">
      <h2>설정</h2>
      <p>DART API 키 관리</p>
    </div>
    <div class="settings-section">
      <div class="card card-static">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">API 인증키</h3>
        ${savedKey ? `
          <p class="t-label-sm" style="color:var(--on-surface-variant);margin-bottom:8px;">현재 저장된 키</p>
          <div class="api-key-display" style="margin-bottom:var(--sp-md);">${masked}</div>
        ` : `
          <p style="color:var(--on-surface-variant);margin-bottom:var(--sp-md);">
            API 키가 설정되지 않았습니다.<br>
            <a href="https://opendart.fss.or.kr" target="_blank" style="color:var(--secondary);">DART 오픈API</a>에서 발급받은 인증키를 입력해주세요.
          </p>
        `}
        <div class="form-group">
          <label class="form-label">새 API 키 입력</label>
          <input type="text" class="form-input" id="settings-api-key" placeholder="40자리 인증키 입력" maxlength="40" value="" />
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" onclick="saveApiKey()">저장</button>
          ${savedKey ? '<button class="btn-secondary" onclick="clearApiKey()">키 삭제</button>' : ''}
        </div>
      </div>

      <div class="card card-static">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">정보</h3>
        <table class="data-table">
          <tbody>
            <tr><td class="bold">앱 이름</td><td>DART Pro</td></tr>
            <tr><td class="bold">버전</td><td>1.0.0</td></tr>
            <tr><td class="bold">API 서버</td><td>opendart.fss.or.kr</td></tr>
            <tr><td class="bold">CORS 프록시</td><td>corsproxy.io</td></tr>
            <tr><td class="bold">소스코드</td><td><a href="https://github.com/giroklabs/dart-pro" target="_blank" style="color:var(--secondary);">GitHub</a></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function saveApiKey() {
  const input = document.getElementById('settings-api-key');
  const key = input?.value.trim();
  if (!key) { showToast('API 키를 입력해주세요.'); return; }
  if (key.length !== 40) { showToast('API 키는 40자리여야 합니다.'); return; }
  DART_API.setKey(key);
  showToast('API 키가 저장되었습니다.');
  setTimeout(() => location.hash = '#/settings', 500);
  window.router();
}

function clearApiKey() {
  localStorage.removeItem('dart_api_key');
  showToast('API 키가 삭제되었습니다.');
  window.router();
}

function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

window.renderSettings = renderSettings;
window.saveApiKey = saveApiKey;
window.clearApiKey = clearApiKey;
window.showToast = showToast;
