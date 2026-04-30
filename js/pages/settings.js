// Settings Page
function renderSettings() {
  const api = window.DART_API;
  const savedKey = api.getKey();
  const masked = savedKey ? savedKey.slice(0, 8) + '••••••••' + savedKey.slice(-4) : '';
  const watchlist = api.getWatchlist();

  return `
    <div class="page-header">
      <h2>설정</h2>
      <p>DART API 키 및 관심 종목 관리</p>
    </div>
    <div class="settings-section">
      <div class="card card-static">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">관심 종목 (보유 기업)</h3>
        <p class="t-body-md" style="color:var(--on-surface-variant);margin-bottom:var(--sp-md);">
          대시보드에서 최신 공시를 자동으로 요약해서 보여줄 기업을 등록하세요.
        </p>
        <div class="form-group" style="display:flex;gap:8px;">
          <input type="text" class="form-input" id="watch-input" placeholder="기업명 또는 고유번호 입력" />
          <button class="btn-primary" onclick="addToWatchlist()">추가</button>
        </div>
        <div id="watchlist-display" style="margin-top:var(--sp-md);">
          ${watchlist.length > 0 ? `
            <table class="data-table">
              <tbody>
                ${watchlist.map(item => `
                  <tr>
                    <td class="bold">${item.name}</td>
                    <td class="mono">${item.code}</td>
                    <td class="text-right">
                      <button class="btn-text" style="color:var(--error);" onclick="removeFromWatchlist('${item.code}')">삭제</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p style="font-size:13px;color:var(--outline);text-align:center;padding:20px;">등록된 기업이 없습니다.</p>'}
        </div>
      </div>

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
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">Gemini 1.5 Flash 연동</h3>
        <p class="t-body-md" style="color:var(--on-surface-variant);margin-bottom:var(--sp-md);">
          최신 공시 내용을 실시간으로 깊이 있게 분석하려면 Google Gemini API 키를 등록하세요.
        </p>
        <div class="form-group">
          <label class="form-label">Gemini API 키</label>
          <input type="text" class="form-input" id="gemini-api-key" placeholder="AI 분석용 API 키 입력" value="${api.getGeminiKey()}" />
        </div>
        <button class="btn-primary" onclick="saveGeminiKey()">Gemini 키 저장</button>
      </div>
    </div>
  `;
}

async function addToWatchlist() {
  const api = window.DART_API;
  const input = document.getElementById('watch-input');
  let val = input?.value.trim();
  if (!val) return;

  const code = api.findCorpCode(val);
  if (code.length !== 8) {
    showToast('8자리 고유번호를 찾을 수 없습니다.');
    return;
  }

  // 기업 정보 가져오기 (이름 확인용)
  try {
    const info = await api.getCompanyInfo(code);
    api.addWatch(code, info.corp_name);
    showToast(`${info.corp_name}이(가) 추가되었습니다.`);
    input.value = '';
    window.router();
  } catch (err) {
    showToast('기업 정보를 불러올 수 없습니다.');
  }
}

function removeFromWatchlist(code) {
  window.DART_API.removeWatch(code);
  showToast('삭제되었습니다.');
  window.router();
}

function saveGeminiKey() {
  const input = document.getElementById('gemini-api-key');
  const key = input?.value.trim();
  if (!key) { showToast('Gemini API 키를 입력해주세요.'); return; }
  window.DART_API.setGeminiKey(key);
  showToast('Gemini API 키가 저장되었습니다. 이제 AI 분석이 활성화됩니다.');
  window.router();
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
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
