function renderSettings() {
  const api = window.DART_API;
  const dartKey = api.getKey();
  const geminiKey = api.getGeminiKey();
  
  const mask = (key) => key ? key.slice(0, 6) + '••••••••' + key.slice(-4) : '';

  return `
    <div class="page-header">
      <h2>설정</h2>
      <p>DART API 키 및 관심 종목 관리</p>
    </div>
    
    <div class="settings-section">
      <!-- DART API Key -->
      <div class="card card-static" style="margin-bottom:var(--sp-lg);">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">DART API 인증키</h3>
        <div class="api-key-status" style="margin-bottom:var(--sp-md);">
          ${dartKey ? `
            <p class="t-label-sm" style="color:var(--secondary);margin-bottom:4px;">현재 활성화됨</p>
            <div class="api-key-display">${mask(dartKey)}</div>
          ` : `
            <p class="t-label-sm" style="color:var(--error);margin-bottom:4px;">인증 필요</p>
            <div class="api-key-display" style="color:var(--outline); opacity:0.6;">등록된 키가 없습니다.</div>
          `}
        </div>
        <div class="form-group">
          <input type="text" class="form-input" id="settings-api-key" placeholder="DART 40자리 인증키 입력" maxlength="40" />
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" onclick="saveApiKey()">인증키 저장</button>
          ${dartKey ? '<button class="btn-secondary" onclick="clearApiKey()">삭제</button>' : ''}
        </div>
      </div>

      <!-- Gemini API Key -->
      <div class="card card-static" style="margin-bottom:var(--sp-lg);">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">Gemini 1.5 Flash (AI 분석)</h3>
        <div class="api-key-status" style="margin-bottom:var(--sp-md);">
          ${geminiKey ? `
            <p class="t-label-sm" style="color:var(--secondary);margin-bottom:4px;">AI 요약 활성화됨</p>
            <div class="api-key-display">${mask(geminiKey)}</div>
          ` : `
            <p class="t-label-sm" style="color:var(--outline);margin-bottom:4px;">AI 분석 비활성 (기본 요약만 제공)</p>
          `}
        </div>
        <div class="form-group">
          <input type="text" class="form-input" id="settings-gemini-key" placeholder="Gemini API 키 입력" />
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" onclick="saveGeminiKey()">Gemini 키 저장</button>
          ${geminiKey ? '<button class="btn-secondary" onclick="clearGeminiKey()">삭제</button>' : ''}
        </div>
      </div>

      <!-- Watchlist -->
      <div class="card card-static">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">관심 종목 (보유 기업)</h3>
        <p class="t-body-md" style="color:var(--on-surface-variant);margin-bottom:var(--sp-md);">
          대시보드에서 실시간 요약을 받아볼 기업을 검색하여 추가하세요.
        </p>
        <div class="search-box-container" style="position:relative;">
          <div class="form-group" style="display:flex;gap:8px;margin-bottom:0;">
            <input type="text" class="form-input" id="watch-input" placeholder="기업명 입력 (예: 현대차)" autocomplete="off" style="flex:1;" />
            <button class="btn-primary" onclick="addToWatchlist()">추가</button>
          </div>
          <div id="search-suggestions" class="suggestions-list" style="display:none;"></div>
        </div>
        <div id="watchlist-display" style="margin-top:var(--sp-md);">
          ${renderWatchlistTable()}
        </div>
      </div>
    </div>
  `;
}

function renderWatchlistTable() {
  const watchlist = window.DART_API.getWatchlist();
  if (watchlist.length === 0) {
    return '<p style="font-size:13px;color:var(--outline);text-align:center;padding:20px;">등록된 기업이 없습니다.</p>';
  }
  return `
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
  `;
}

async function saveApiKey() {
  const key = document.getElementById('settings-api-key').value.trim();
  if (key.length !== 40) return showToast('올바른 40자리 DART 키를 입력해 주세요.');
  window.DART_API.setKey(key);
  showToast('DART API 키가 저장되었습니다.');
  window.router();
}

function clearApiKey() {
  localStorage.removeItem('dart_api_key');
  showToast('DART API 키가 삭제되었습니다.');
  window.router();
}

function saveGeminiKey() {
  const key = document.getElementById('settings-gemini-key').value.trim();
  if (!key) return showToast('Gemini 키를 입력해 주세요.');
  window.DART_API.setGeminiKey(key);
  showToast('Gemini API 키가 저장되었습니다.');
  window.router();
}

function clearGeminiKey() {
  localStorage.removeItem('gemini_api_key');
  showToast('Gemini API 키가 삭제되었습니다.');
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
