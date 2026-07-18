// Disclosures Search Page
function renderDisclosures() {
  const api = window.DART_API;
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const endDe = fmtDate(today);
  const bgnDe = fmtDate(weekAgo);

  return `
    <div class="page-header">
      <h2>공시검색</h2>
    </div>
    <div class="filter-bar" style="flex-wrap: wrap;">
      <div class="form-group" style="width:100%; margin-bottom: 12px;">
        <div style="position: relative; display: flex; align-items: center;">
          <span class="material-symbols-outlined" style="position: absolute; left: 12px; color: var(--on-surface-variant); font-size: 20px;">search</span>
          <input type="text" class="form-input" id="filter-text" placeholder="기업명, 종목코드, 보고서명으로 검색..." style="width: 100%; padding-left: 40px; padding-right: 48px;" onkeypress="if(event.key==='Enter') doDisclosureSearch(1)" />
          <div style="position: absolute; right: 12px; display: flex; gap: 4px;">
            <kbd style="font-family: var(--font-mono); font-size: 11px; background: var(--surface-container-high); border: 1px solid var(--outline-variant); border-radius: 4px; padding: 2px 6px; color: var(--on-surface-variant);">↵</kbd>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; width: 100%; flex-wrap: wrap;">
        <div class="form-group">
          <label class="form-label">시작일</label>
          <input type="date" class="form-input" id="filter-bgn" value="${fmtDateInput(weekAgo)}" />
        </div>
        <div class="form-group">
          <label class="form-label">종료일</label>
          <input type="date" class="form-input" id="filter-end" value="${fmtDateInput(today)}" />
        </div>
        <div class="form-group">
          <label class="form-label">공시유형</label>
          <select class="form-input form-select" id="filter-type">
            <option value="">전체</option>
            <option value="A">정기공시</option>
            <option value="B">주요사항보고</option>
            <option value="C">발행공시</option>
            <option value="D">지분공시</option>
            <option value="E">기타공시</option>
            <option value="F">외부감사관련</option>
            <option value="I">거래소공시</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">법인구분</label>
          <select class="form-input form-select" id="filter-corp-cls">
            <option value="">전체</option>
            <option value="Y">유가증권</option>
            <option value="K">코스닥</option>
            <option value="N">코넥스</option>
            <option value="E">기타</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1; display: flex; align-items: flex-end; justify-content: flex-end;">
          <button class="btn-primary" id="btn-search" onclick="doDisclosureSearch(1)">
            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">search</span>검색
          </button>
        </div>
      </div>
    </div>
    <div id="disc-results"><div class="empty-state"><span class="material-symbols-outlined">search</span><p>검색 조건을 설정하고 검색 버튼을 눌러주세요.</p></div></div>
    <div id="disc-pagination"></div>
  `;
}

async function doDisclosureSearch(page) {
  const api = window.DART_API;
  const resultsEl = document.getElementById('disc-results');
  const pagEl = document.getElementById('disc-pagination');

  const searchText = (document.getElementById('filter-text')?.value || '').trim();
  const bgn = document.getElementById('filter-bgn')?.value.replace(/-/g, '') || '';
  const end = document.getElementById('filter-end')?.value.replace(/-/g, '') || '';
  const pblntfTy = document.getElementById('filter-type')?.value || '';
  const corpCls = document.getElementById('filter-corp-cls')?.value || '';

  resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>검색 중...</div>';
  pagEl.innerHTML = '';

  try {
    let targetCorpCode = '';
    let isClientSideFilter = false;
    let pageCount = 20;

    // 텍스트 검색 로직 (하이브리드)
    if (searchText) {
      // 1. 기업명 검색 1차 시도 (정확도 높은 서버사이드 필터링용)
      const corpRes = await fetch(`/api/dart/search?query=${encodeURIComponent(searchText)}`);
      if (corpRes.ok) {
        const corps = await corpRes.json();
        // 정확히 일치하거나 가장 유사한 첫 번째 기업 선택 (종목명 또는 코드)
        const matchedCorp = corps.find(c => c.name === searchText || c.code === searchText) || corps[0];
        if (matchedCorp) {
          targetCorpCode = matchedCorp.code;
        } else {
          // 기업명이 아닌 보고서명 검색이라고 판단, 클라이언트 사이드 필터링 모드 가동
          isClientSideFilter = true;
          pageCount = 100; // 최대치로 풀링
        }
      } else {
        isClientSideFilter = true;
        pageCount = 100;
      }
    }

    const data = await api.searchDisclosures({
      corp_code: targetCorpCode,
      bgn_de: bgn, end_de: end,
      pblntf_ty: pblntfTy, corp_cls: corpCls,
      page_no: isClientSideFilter ? 1 : page, // 클라이언트 필터링 시에는 항상 1페이지만 가져와서 자름
      page_count: pageCount,
    });

    let displayList = data.list || [];

    // 2. 보고서명/기업명 텍스트 클라이언트 필터링
    if (searchText && isClientSideFilter) {
      const lowerSearch = searchText.toLowerCase();
      displayList = displayList.filter(item => 
        (item.corp_name && item.corp_name.toLowerCase().includes(lowerSearch)) ||
        (item.report_nm && item.report_nm.toLowerCase().includes(lowerSearch)) ||
        (item.corp_code && item.corp_code.includes(lowerSearch))
      );
    }

    if (!displayList || displayList.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>검색 결과가 없습니다.</p></div>';
      return;
    }

    const totalDisplayCount = isClientSideFilter ? displayList.length : data.total_count;
    const totalDisplayPage = isClientSideFilter ? 1 : data.total_page;

    resultsEl.innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--on-surface-variant);">
        총 <strong>${Number(totalDisplayCount).toLocaleString()}</strong>건 (${page}/${totalDisplayPage} 페이지) ${isClientSideFilter ? '<span style="color:var(--primary);">(검색 필터 적용됨)</span>' : ''}
      </div>
      <div class="card card-static table-responsive" style="padding:0;">
        <table class="stat-table" style="min-width: 600px;">
          <thead><tr>
            <th style="width:120px;">접수일</th>
            <th>회사명</th>
            <th>보고서명</th>
            <th style="width:80px;">법인구분</th>
            <th style="width:100px;">제출인</th>
          </tr></thead>
          <tbody>${displayList.map(item => `
            <tr style="cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='var(--surface-container-low)'" onmouseout="this.style.background='transparent'" onclick="window.open('${api.viewerUrl(item.rcept_no)}','_blank')">
              <td class="mono">${api.formatDate(item.rcept_dt)}</td>
              <td class="bold" style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.corp_name || ''}</td>
              <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.report_nm || ''}</td>
              <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="pill ${api.pillClass(item.corp_cls)}" style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600; background-color:var(--surface-container-high); border:1px solid var(--outline-variant); color:var(--on-surface);">${api.corpClsNames[item.corp_cls] || ''}</span></td>
              <td style="font-size:12px; color:var(--on-surface-variant); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${item.flr_nm || ''}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;

    // Pagination
    if (!isClientSideFilter) {
      const totalPages = parseInt(data.total_page) || 1;
      const currentPage = parseInt(data.page_no) || 1;
      if (totalPages > 1) {
        let pagHtml = '<div class="pagination">';
        pagHtml += `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="doDisclosureSearch(${currentPage - 1})">← 이전</button>`;
        const start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, currentPage + 2);
        for (let i = start; i <= end; i++) {
          pagHtml += `<button class="${i === currentPage ? 'active' : ''}" onclick="doDisclosureSearch(${i})">${i}</button>`;
        }
        pagHtml += `<button ${currentPage >= totalPages ? 'disabled' : ''} onclick="doDisclosureSearch(${currentPage + 1})">다음 →</button>`;
        pagHtml += '</div>';
        pagEl.innerHTML = pagHtml;
      }
    }
  } catch (err) {
    resultsEl.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">error</span><p>${err.message}</p></div>`;
  }
}

function fmtDate(d) {
  return d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}
function fmtDateInput(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

window.renderDisclosures = renderDisclosures;
window.doDisclosureSearch = doDisclosureSearch;

