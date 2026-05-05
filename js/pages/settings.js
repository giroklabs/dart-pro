async function renderSettings() {
  const watchlistHtml = await renderWatchlistTable();

  return `
    <div class="page-header">
      <h2>관심종목</h2>
      <p>관심 종목 관리</p>
    </div>
    
    <div class="settings-section">
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
          ${watchlistHtml}
        </div>
      </div>
    </div>
  `;
}


async function renderWatchlistTable() {
  const api = window.DART_API;
  const watchlist = api.getWatchlist(); // 이제 문자열 배열을 반환함
  if (watchlist.length === 0) {
    return '<p style="font-size:13px;color:var(--outline);text-align:center;padding:20px;">등록된 기업이 없습니다.</p>';
  }

  const rows = await Promise.all(watchlist.map(async code => {
    let displayName = '불러오는 중...';
    const corrected = await api.getCorpName(code);
    displayName = (corrected && corrected !== code) ? corrected : code;

    return `
      <tr>
        <td class="bold">${displayName}</td>
        <td class="mono">${code}</td>
        <td class="text-right">
          <button class="btn-text" style="color:var(--error);" onclick="removeFromWatchlist('${code}')">삭제</button>
        </td>
      </tr>
    `;
  }));

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 class="t-title-md">관심 종목 (보유 기업)</h3>
      <button class="btn-text" style="color:var(--error); font-size:12px;" onclick="clearAllWatchlist()">전체 삭제</button>
    </div>
    <table class="data-table">
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  `;
}

async function addToWatchlist(providedCode, providedName) {
  const api = window.DART_API;
  const input = document.getElementById('watch-input');
  
  let code = providedCode;

  if (!code) {
    const val = input?.value.trim();
    if (!val) return;
    code = await api.findCorpCode(val);
  }

  if (!code || code.length !== 8) {
    showToast('8자리 고유번호를 찾을 수 없습니다.');
    return;
  }

  const added = api.addWatch(code); // 이제 코드만 전달
  if (added) {
    showToast(`추가되었습니다.`);
    if (input) input.value = '';
    window.router();
  } else {
    showToast('이미 등록된 기업입니다.');
  }
}

async function handleSearch() {
  const input = document.getElementById('watch-input');
  const btn = document.querySelector('.btn-secondary[onclick="handleSearch()"]');
  const query = input?.value.trim();
  
  if (!query) {
    showToast('검색어를 입력해 주세요.');
    return;
  }
  
  const suggestions = document.getElementById('search-suggestions');
  suggestions.innerHTML = '<div class="suggestion-item"><span class="name">🔍 검색 중...</span></div>';
  suggestions.style.display = 'block';

  if (btn) {
    btn.disabled = true;
    btn.innerText = '...';
  }

  try {
    const results = await window.DART_API.searchCorpCodes(query);
    if (results.length > 0) {
      suggestions.innerHTML = results.map(res => `
        <div class="suggestion-item" onclick="addToWatchlist('${res.code}', '${res.name}')">
          <span class="name">${res.name}</span>
          <span class="code">${res.code}</span>
        </div>
      `).join('');
    } else {
      showToast('검색 결과가 없습니다.');
      suggestions.style.display = 'none';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '검색';
    }
  }
}

let _autoCompleteController = null;

function initAutocomplete() {
  const input = document.getElementById('watch-input');
  const suggestions = document.getElementById('search-suggestions');
  if (!input || !suggestions) return;

  if (_autoCompleteController) {
    _autoCompleteController.abort();
  }
  _autoCompleteController = new AbortController();
  const signal = _autoCompleteController.signal;

  let timer = null;
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      suggestions.style.display = 'none';
      return;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      suggestions.innerHTML = '<div class="suggestion-item"><span class="name">🔍 검색 중...</span></div>';
      suggestions.style.display = 'block';

      const results = await window.DART_API.searchCorpCodes(query);
      if (results.length > 0) {
        suggestions.innerHTML = results.map(res => `
          <div class="suggestion-item" onclick="addToWatchlist('${res.code}', '${res.name}')">
            <span class="name">${res.name}</span>
            <span class="code">${res.code}</span>
          </div>
        `).join('');
      } else {
        suggestions.style.display = 'none';
      }
    }, 300); // 300ms 디바운스 추가
  }, { signal });

  const INTERNAL_MAP = {
    "00126380": "삼성전자", "00164779": "SK하이닉스", "00164742": "현대자동차",
    "00111722": "미래에셋증권", "01042775": "HL만도", "00547583": "하나금융지주",
    "00570387": "빌리앙뜨", "00258838": "카카오", "00266961": "NAVER",
    "00305884": "에코프로", "00126431": "대한항공", "00155167": "한화솔루션",
    "00159109": "한국전력공사"
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box-container')) {
      suggestions.style.display = 'none';
    }
  }, { signal });
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

async function clearAllWatchlist() {
  if (confirm('모든 관심종목을 삭제하시겠습니까?')) {
    window.DART_API.clearWatchlist();
    showToast('모든 종목이 삭제되었습니다.');
    window.router();
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
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
window.clearAllWatchlist = clearAllWatchlist;
window.handleSearch = handleSearch;

