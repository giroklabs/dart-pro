// State management
let reportsList = [];

function renderReports() {
  return `
    <div class="header">
      <div>
        <h1 class="page-title">공시 인사이트</h1>
      </div>
    </div>
    
    <div class="content-panel" style="max-width: 800px; margin: 30px auto 0 auto;">
      <div id="reports-list-container">
        <div style="text-align:center; padding:40px; color:var(--on-surface-variant);">
          로딩 중...
        </div>
      </div>
      
      <!-- AdSense In-feed Placeholder -->
      <div style="width:100%; height:120px; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#999; font-size:14px; margin-bottom:20px;">
        Google AdSense In-feed 광고 삽입 영역
      </div>
    </div>
  `;
}

async function initReports() {
  console.log("AI Reports module initialized.");
  
  const hashParts = location.hash.split('/');
  if (hashParts.length > 2 && hashParts[2]) {
    await renderReportDetail(hashParts[2]);
  } else {
    await fetchAndRenderList();
  }
}

async function fetchAndRenderList() {
  const container = document.getElementById('reports-list-container');
  if (!container) return;

  try {
    const res = await fetch('https://dartpro.duckdns.org/api/reports');
    if (!res.ok) throw new Error('API Request Failed');
    
    const data = await res.json();
    if (data.success) {
      reportsList = data.data;
      
      let html = '';
      reportsList.forEach(report => {
        html += `
        <div class="report-card" onclick="location.hash='#/reports/${report.id}'" style="border:1px solid var(--outline); border-radius:12px; padding:20px; margin-bottom:28px; cursor:pointer; transition:all 0.2s ease; background:var(--surface);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div style="display:flex; gap:8px;">
              <span class="badge" style="background:var(--primary-container); color:var(--on-primary-container); padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">${report.category}</span>
              <span class="badge" style="background:#f1f3f4; color:#3c4043; padding:4px 8px; border-radius:4px; font-size:12px;">${report.corp_name}</span>
            </div>
            <span style="font-size:12px; color:var(--on-surface-variant);">${report.publish_date} 발행</span>
          </div>
          <h3 style="margin:0 0 12px 0; color:var(--on-surface); font-size:18px;">${report.title}</h3>
          <p style="margin:0; font-size:14px; color:var(--on-surface-variant); line-height:1.5;">
            ${report.summary}
          </p>
        </div>`;
      });
      container.innerHTML = html || '<div style="text-align:center; padding:40px;">리포트가 없습니다.</div>';
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    console.error('Failed to fetch reports list:', err);
    container.innerHTML = '<div style="color:var(--error); padding:20px;">리포트 목록을 불러오지 못했습니다.</div>';
  }
}

async function renderReportDetail(id) {
  const container = document.getElementById('reports-list-container');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--on-surface-variant);">리포트 불러오는 중...</div>';

  try {
    const res = await fetch(`https://dartpro.duckdns.org/api/reports/${id}`);
    if (!res.ok) throw new Error('API Request Failed');
    
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    const report = data.data;
    
    container.innerHTML = `
      <div class="report-detail" style="animation: fadeIn 0.3s ease;">
        <button onclick="location.hash='#/reports'" style="background:none; border:none; cursor:pointer; color:var(--primary); display:flex; align-items:center; gap:4px; margin-bottom:24px; padding:0;">
          <span class="material-symbols-outlined" style="font-size:20px;">arrow_back</span>
          목록으로 돌아가기
        </button>
        
        <h1 style="font-size:28px; line-height:1.4; margin-bottom:16px;">${report.title}</h1>
        <div style="display:flex; gap:12px; margin-bottom:32px; border-bottom:1px solid var(--outline); padding-bottom:16px; color:var(--on-surface-variant); font-size:14px;">
          <span>작성자: DART Pro AI</span>
          <span>|</span>
          <span>발행일: ${report.publish_date}</span>
        </div>
        
        <div class="report-content" style="font-size:16px; line-height:1.8; color:var(--on-surface);">
          ${report.content}
        </div>
        
        <!-- AdSense In-article Placeholder -->
        <div style="width:100%; height:250px; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#999; font-size:14px; margin:32px 0;">
          Google AdSense In-article 광고 영역
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to fetch report detail:', err);
    container.innerHTML = `
      <div style="padding:20px;">
        <button onclick="location.hash='#/reports'" style="background:none; border:none; cursor:pointer; color:var(--primary); display:flex; align-items:center; gap:4px; margin-bottom:24px; padding:0;">
          <span class="material-symbols-outlined" style="font-size:20px;">arrow_back</span>
          목록으로 돌아가기
        </button>
        <p style="color:var(--error);">리포트 상세 내용을 불러오지 못했습니다.</p>
      </div>`;
  }
}
