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
          <button class="btn-secondary" id="btn-test-ai" onclick="testAiConnection()">연결 테스트</button>
          ${geminiKey ? '<button class="btn-secondary" onclick="clearGeminiKey()">삭제</button>' : ''}
        </div>
        <div id="ai-test-result" style="margin-top:12px; font-size:12px; display:none; padding:10px; border-radius:4px;"></div>
      </div>

      <!-- Watchlist -->
      <div class="card card-static" style="margin-bottom:var(--sp-lg);">
        <h3 class="t-headline-sm" style="margin-bottom:var(--sp-md);">관심 종목 (보유 기업)</h3>
        <p class="t-body-md" style="color:var(--on-surface-variant);margin-bottom:var(--sp-md);">
          대시보드에서 실시간 요약을 받아볼 기업을 검색하여 추가하세요.
        </p>
        <div class="search-box-container" style="position:relative;">
          <div class="form-group" style="display:flex;gap:8px;margin-bottom:0;">
            <input type="text" class="form-input" id="watch-input" placeholder="기업명 입력 (예: 미래에셋, 하나)" autocomplete="off" style="flex:1;" />
            <button class="btn-secondary" onclick="handleSearch()">검색</button>
            <button class="btn-primary" onclick="addToWatchlist()">추가</button>
          </div>
          <div id="search-suggestions" class="suggestions-list" style="display:none; margin-top:4px;"></div>
        </div>
        <div id="watchlist-display" style="margin-top:var(--sp-md);">
          ${renderWatchlistTable()}
        </div>
      </div>

      <!-- DB Management -->
      <div class="card card-static">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-md);">
          <h3 class="t-headline-sm">기업 데이터베이스 관리</h3>
          <span class="badge ${localStorage.getItem('dart_db_synced') ? 'badge-success' : 'badge-secondary'}" id="db-count-badge">
            ${localStorage.getItem('dart_db_synced') ? '전수 동기화 완료(10만+)' : '내장 데이터 모드'}
          </span>
        </div>
        <p class="t-body-md" style="color:var(--on-surface-variant);margin-bottom:var(--sp-md);">
          DART에 등록된 모든 기업(약 10만 개+)의 최신 고유번호 데이터를 로컬에 동기화합니다.
        </p>
        <div id="db-sync-status" style="margin-bottom:12px; font-size:12px; color:var(--secondary); display:none; padding:8px; background:var(--surface-container-low); border-radius:4px;"></div>
        
        <!-- Proxy Sync -->
        <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--surface-container);">
          <div class="t-label-sm" style="margin-bottom:8px; color:var(--outline);">자동 동기화 (프록시)</div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" id="btn-sync-db" onclick="syncFullDatabase()">전체 기업 데이터 동기화</button>
            <button class="btn-secondary" onclick="clearFullDatabase()">DB 초기화</button>
          </div>
        </div>

        <!-- Manual Upload Sync -->
        <div>
          <div class="t-label-sm" style="margin-bottom:8px; color:var(--outline);">수동 동기화 (프록시 오류 시 권장)</div>
          <p class="t-body-md" style="font-size:12px; margin-bottom:12px; line-height:1.4;">
            1. <a href="https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018" target="_blank" style="color:var(--secondary); text-decoration:underline; font-weight:600;">DART 사이트(클릭)</a> 하단에서 <b>[다운로드]</b> 클릭<br>
            2. 받은 CORPCODE.zip(또는 xml) 파일을 아래 버튼으로 업로드
          </p>
          <input type="file" id="db-file-input" style="display:none;" onchange="handleFileUpload(event)" accept=".xml,.zip" />
          <button class="btn-secondary" onclick="document.getElementById('db-file-input').click()" style="width:100%; border-style:dashed; height:60px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;">
            <span class="material-symbols-outlined" style="font-size:24px;">upload_file</span>
            <span style="font-size:13px; font-weight:600;">기업 코드 파일(XML/ZIP) 선택</span>
          </button>
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

async function addToWatchlist(providedCode) {
  const api = window.DART_API;
  const input = document.getElementById('watch-input');
  
  let code = providedCode;
  if (!code) {
    const val = input?.value.trim();
    if (!val) return;
    code = api.findCorpCode(val);
  }

  if (!code || code.length !== 8) {
    showToast('8자리 고유번호를 찾을 수 없습니다.');
    return;
  }

  try {
    const info = await api.getCompanyInfo(code);
    const added = api.addWatch(code, info.corp_name);
    if (added) {
      showToast(`${info.corp_name}이(가) 추가되었습니다.`);
    } else {
      showToast('이미 등록된 기업입니다.');
    }
    if (input) input.value = '';
    const suggestions = document.getElementById('search-suggestions');
    if (suggestions) suggestions.style.display = 'none';
    window.router();
  } catch (err) {
    showToast('기업 정보를 불러올 수 없습니다.');
  }
}

async function handleSearch() {
  const input = document.getElementById('watch-input');
  const query = input?.value.trim();
  if (!query) {
    showToast('검색어를 입력해 주세요.');
    return;
  }
  
  const suggestions = document.getElementById('search-suggestions');
  suggestions.innerHTML = '<div class="suggestion-item"><span class="name">검색 중...</span></div>';
  suggestions.style.display = 'block';

  const results = await window.DART_API.searchCorpCodes(query);
  
  if (results.length > 0) {
    suggestions.innerHTML = results.map(res => `
      <div class="suggestion-item" onclick="addToWatchlist('${res.code}')">
        <span class="name">${res.name}</span>
        <span class="code">${res.code}</span>
      </div>
    `).join('');
    suggestions.style.display = 'block';
  } else {
    showToast('검색 결과가 없습니다.');
    suggestions.style.display = 'none';
  }
}

function initAutocomplete() {
  const input = document.getElementById('watch-input');
  const suggestions = document.getElementById('search-suggestions');
  if (!input || !suggestions) return;

  input.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      suggestions.style.display = 'none';
      return;
    }

    const results = await window.DART_API.searchCorpCodes(query);
    if (results.length > 0) {
      suggestions.innerHTML = results.map(res => `
        <div class="suggestion-item" onclick="addToWatchlist('${res.code}')">
          <span class="name">${res.name}</span>
          <span class="code">${res.code}</span>
        </div>
      `).join('');
      suggestions.style.display = 'block';
    } else {
      suggestions.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box-container')) {
      suggestions.style.display = 'none';
    }
  });
}

const originalRenderSettings = renderSettings;
window.renderSettings = () => {
  const html = originalRenderSettings();
  setTimeout(initAutocomplete, 0);
  return html;
};

function removeFromWatchlist(code) {
  window.DART_API.removeWatch(code);
  showToast('삭제되었습니다.');
  window.router();
}

async function testAiConnection() {
  const btn = document.getElementById('btn-test-ai');
  const resEl = document.getElementById('ai-test-result');
  const api = window.DART_API;
  
  btn.disabled = true;
  btn.textContent = '테스트 중...';
  resEl.style.display = 'block';
  resEl.style.background = 'var(--surface-container)';
  resEl.style.color = 'var(--on-surface)';
  resEl.textContent = 'Gemini API에 연결을 시도하고 있습니다...';

  try {
    const result = await api.getGeminiAnalysis('삼성전자', '테스트 공시입니다.');
    if (result && result.insight) {
      resEl.style.background = 'var(--success-bg)';
      resEl.style.color = 'var(--success)';
      resEl.innerHTML = `<strong>연결 성공!</strong><br>AI 인사이트: ${result.insight}`;
    } else {
      throw new Error('응답 데이터는 성공했으나 형식이 올바르지 않습니다.');
    }
  } catch (err) {
    resEl.style.background = 'var(--error-container)';
    resEl.style.color = 'var(--error)';
    resEl.innerHTML = `<strong>연결 실패</strong><br>사유: ${err.message}`;
    console.error('AI Test Failure:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = '연결 테스트';
  }
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

window.showToast = showToast;
window.saveApiKey = saveApiKey;
window.clearApiKey = clearApiKey;
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
window.testAiConnection = testAiConnection;
window.clearGeminiKey = clearGeminiKey;
window.saveGeminiKey = saveGeminiKey;
window.handleSearch = handleSearch;

async function syncFullDatabase() {
  const btn = document.getElementById('btn-sync-db');
  const statusEl = document.getElementById('db-sync-status');
  const api = window.DART_API;

  btn.disabled = true;
  statusEl.style.display = 'block';
  
  try {
    const count = await api.syncFullDb((msg) => {
      statusEl.textContent = msg;
    });
    statusEl.textContent = `동기화 완료! 총 ${count.toLocaleString()}개 기업이 저장되었습니다.`;
    showToast('전체 기업 DB 동기화 성공');
    setTimeout(() => window.router(), 1500);
  } catch (err) {
    statusEl.textContent = `동기화 실패: ${err.message}`;
    showToast('DB 동기화 중 오류 발생');
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function clearFullDatabase() {
  if (!confirm('로컬 기업 DB를 초기화하시겠습니까?')) return;
  await window.DART_API.clearFullDb();
  showToast('DB가 초기화되었습니다.');
  window.router();
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('db-sync-status');
  const api = window.DART_API;

  statusEl.style.display = 'block';
  
  try {
    const count = await api.syncFromFile(file, (msg) => {
      statusEl.textContent = msg;
    });
    statusEl.textContent = `동기화 완료! 총 ${count.toLocaleString()}개 기업이 파일로부터 저장되었습니다.`;
    showToast('수동 DB 동기화 성공');
    setTimeout(() => window.router(), 1500);
  } catch (err) {
    statusEl.textContent = `동기화 실패: ${err.message}`;
    showToast('파일 처리 중 오류 발생');
    console.error(err);
  } finally {
    event.target.value = ''; // 초기화
  }
}

window.syncFullDatabase = syncFullDatabase;
window.clearFullDatabase = clearFullDatabase;
window.handleFileUpload = handleFileUpload;
