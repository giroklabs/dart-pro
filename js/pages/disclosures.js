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
      <p>DART 전자공시 상세 검색</p>
    </div>
    <div class="filter-bar">
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
      <button class="btn-primary" id="btn-search" onclick="doDisclosureSearch(1)">
        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">search</span>검색
      </button>
    </div>
    <div id="disc-results"><div class="empty-state"><span class="material-symbols-outlined">search</span><p>검색 조건을 설정하고 검색 버튼을 눌러주세요.</p></div></div>
    <div id="disc-pagination"></div>
  `;
}

async function doDisclosureSearch(page) {
  const api = window.DART_API;
  const resultsEl = document.getElementById('disc-results');
  const pagEl = document.getElementById('disc-pagination');

  const bgn = document.getElementById('filter-bgn')?.value.replace(/-/g, '') || '';
  const end = document.getElementById('filter-end')?.value.replace(/-/g, '') || '';
  const pblntfTy = document.getElementById('filter-type')?.value || '';
  const corpCls = document.getElementById('filter-corp-cls')?.value || '';

  resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>검색 중...</div>';
  pagEl.innerHTML = '';

  try {
    const data = await api.searchDisclosures({
      bgn_de: bgn, end_de: end,
      pblntf_ty: pblntfTy, corp_cls: corpCls,
      page_no: page, page_count: 20,
    });

    if (!data.list || data.list.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>검색 결과가 없습니다.</p></div>';
      return;
    }

    resultsEl.innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--on-surface-variant);">
        총 <strong>${Number(data.total_count).toLocaleString()}</strong>건 (${data.page_no}/${data.total_page} 페이지)
      </div>
      <div class="card card-static" style="padding:0;overflow:hidden;">
        <table class="data-table">
          <thead><tr>
            <th style="width:120px;">접수일</th>
            <th>회사명</th>
            <th>보고서명</th>
            <th style="width:80px;">법인구분</th>
            <th style="width:100px;">제출인</th>
          </tr></thead>
          <tbody>${data.list.map(item => `
            <tr style="cursor:pointer;" onclick="window.open('${api.viewerUrl(item.rcept_no)}','_blank')">
              <td class="mono">${api.formatDate(item.rcept_dt)}</td>
              <td class="bold" style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.corp_name || ''}</td>
              <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.report_nm || ''}</td>
              <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="pill ${api.pillClass(item.corp_cls)}">${api.corpClsNames[item.corp_cls] || ''}</span></td>
              <td style="font-size:12px; color:var(--on-surface-variant); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${item.flr_nm || ''}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;

    // Pagination
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
