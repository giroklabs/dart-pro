// Company Page
function renderCompany() {
  return `
    <div class="page-header">
      <h2>기업조회</h2>
      <p>DART 고유번호로 기업개황 조회</p>
    </div>
    <div class="filter-bar">
      <div class="form-group" style="flex:2;">
        <label class="form-label">고유번호 (8자리)</label>
        <input type="text" class="form-input" id="company-corp-code" placeholder="예: 00126380 (삼성전자)" maxlength="8" />
      </div>
      <button class="btn-primary" onclick="doCompanySearch()">
        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">search</span>조회
      </button>
    </div>
    <div class="card card-static" style="margin-bottom:var(--sp-md);padding:var(--sp-md);background:var(--surface-container-low);font-size:13px;color:var(--on-surface-variant);">
      💡 <strong>주요 기업 고유번호:</strong>
      <span style="cursor:pointer;color:var(--secondary);margin-left:8px;" onclick="document.getElementById('company-corp-code').value='00126380';doCompanySearch()">삼성전자(00126380)</span>
      <span style="cursor:pointer;color:var(--secondary);margin-left:8px;" onclick="document.getElementById('company-corp-code').value='00164779';doCompanySearch()">SK하이닉스(00164779)</span>
      <span style="cursor:pointer;color:var(--secondary);margin-left:8px;" onclick="document.getElementById('company-corp-code').value='00164742';doCompanySearch()">현대자동차(00164742)</span>
      <span style="cursor:pointer;color:var(--secondary);margin-left:8px;" onclick="document.getElementById('company-corp-code').value='00258801';doCompanySearch()">카카오(00258801)</span>
    </div>
    <div id="company-result"></div>
    <div id="company-disclosures" style="margin-top:var(--sp-xl);"></div>
  `;
}

async function doCompanySearch() {
  const api = window.DART_API;
  const corpCode = document.getElementById('company-corp-code')?.value.trim();
  const resultEl = document.getElementById('company-result');
  const discEl = document.getElementById('company-disclosures');

  if (!corpCode || corpCode.length !== 8) {
    resultEl.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">warning</span><p>8자리 고유번호를 입력해주세요.</p></div>';
    return;
  }

  resultEl.innerHTML = '<div class="loading"><div class="spinner"></div>기업 정보 조회 중...</div>';
  discEl.innerHTML = '';

  try {
    const data = await api.getCompanyInfo(corpCode);
    const fields = [
      { label: '정식명칭', value: data.corp_name },
      { label: '영문명칭', value: data.corp_name_eng },
      { label: '종목명', value: data.stock_name },
      { label: '종목코드', value: data.stock_code },
      { label: '대표자', value: data.ceo_nm },
      { label: '법인구분', value: api.corpClsNames[data.corp_cls] || data.corp_cls },
      { label: '법인등록번호', value: data.jurir_no },
      { label: '사업자등록번호', value: data.bizr_no },
      { label: '주소', value: data.adres, full: true },
      { label: '홈페이지', value: data.hm_url, full: true, link: true },
      { label: '전화번호', value: data.phn_no },
      { label: '팩스번호', value: data.fax_no },
      { label: '업종코드', value: data.induty_code },
      { label: '설립일', value: api.formatDate(data.est_dt) },
      { label: '결산월', value: data.acc_mt ? data.acc_mt + '월' : '' },
    ];

    resultEl.innerHTML = `
      <div class="card card-static">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:var(--sp-lg);padding-bottom:var(--sp-md);border-bottom:1px solid var(--outline-variant);">
          <div class="feed-card-ticker" style="width:56px;height:56px;font-size:16px;">${(data.corp_name || '').slice(0, 2)}</div>
          <div>
            <h3 class="t-headline-md">${data.corp_name || ''}</h3>
            <p style="color:var(--on-surface-variant);font-size:13px;">${data.corp_name_eng || ''}</p>
          </div>
          <span class="pill ${api.pillClass(data.corp_cls)}" style="margin-left:auto;">${api.corpClsNames[data.corp_cls] || ''}</span>
        </div>
        <div class="company-card">
          ${fields.filter(f => f.value).map(f => `
            <div class="company-field ${f.full ? 'full-width' : ''}">
              <label>${f.label}</label>
              <div class="value">${f.link ? `<a href="${f.value.startsWith('http') ? '' : 'http://'}${f.value}" target="_blank" style="color:var(--secondary);">${f.value}</a>` : f.value}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 해당 기업의 최근 공시
    discEl.innerHTML = '<div class="loading"><div class="spinner"></div>공시 목록 조회 중...</div>';
    const today = new Date();
    const threeMonthsAgo = new Date(today.getTime() - 90 * 86400000);
    const discData = await api.searchDisclosures({
      corp_code: corpCode,
      bgn_de: fmtD(threeMonthsAgo),
      end_de: fmtD(today),
      page_count: 10,
    });

    if (discData.list && discData.list.length > 0) {
      discEl.innerHTML = `
        <div class="section-header"><h3 class="section-title">최근 공시 (3개월)</h3></div>
        <div class="card card-static" style="padding:0;overflow:hidden;">
          <table class="data-table">
            <thead><tr><th>접수일</th><th>보고서명</th><th>제출인</th></tr></thead>
            <tbody>${discData.list.map(item => `
              <tr style="cursor:pointer;" onclick="window.open('${api.viewerUrl(item.rcept_no)}','_blank')">
                <td class="mono">${api.formatDate(item.rcept_dt)}</td>
                <td>${item.report_nm || ''}</td>
                <td style="font-size:12px;color:var(--on-surface-variant);">${item.flr_nm || ''}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } else {
      discEl.innerHTML = '<div class="empty-state"><p>최근 3개월 내 공시가 없습니다.</p></div>';
    }
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">error</span><p>${err.message}</p></div>`;
  }
}

function fmtD(d) {
  return d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

window.renderCompany = renderCompany;
window.doCompanySearch = doCompanySearch;
