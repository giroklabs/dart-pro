function renderReports() {
  return `
    <div class="header">
      <div>
        <h1 class="page-title">공시 인사이트</h1>
        <p class="page-subtitle">Gemini AI가 분석한 핵심 공시 심층 레포트입니다.</p>
      </div>
    </div>
    
    <div class="content-panel" style="max-width: 800px; margin: 0 auto;">
      <div id="reports-list">
        <!-- Mock Report Card 1 -->
        <div class="report-card" onclick="location.hash='#/reports/1'" style="border:1px solid var(--outline); border-radius:12px; padding:20px; margin-bottom:16px; cursor:pointer; transition:all 0.2s ease; background:var(--surface);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div style="display:flex; gap:8px;">
              <span class="badge" style="background:var(--primary-container); color:var(--on-primary-container); padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">실적발표</span>
              <span class="badge" style="background:#f1f3f4; color:#3c4043; padding:4px 8px; border-radius:4px; font-size:12px;">삼성전자</span>
            </div>
            <span style="font-size:12px; color:var(--on-surface-variant);">2026.07.08 발행</span>
          </div>
          <h3 style="margin:0 0 12px 0; color:var(--on-surface); font-size:18px;">삼성전자 2026년 2분기 잠정실적 분석: 어닝 서프라이즈의 배경</h3>
          <p style="margin:0; font-size:14px; color:var(--on-surface-variant); line-height:1.5;">
            매출 74조, 영업이익 10.4조로 시장 컨센서스를 대폭 상회했습니다. HBM 메모리 출하량 증가 및 파운드리 수율 안정화가 주요 원인으로 분석됩니다. 향후 AI 반도체 수요 증가에 따른 하반기 실적 전망을 심층 분석합니다.
          </p>
        </div>

        <!-- Mock Report Card 2 -->
        <div class="report-card" onclick="location.hash='#/reports/2'" style="border:1px solid var(--outline); border-radius:12px; padding:20px; margin-bottom:16px; cursor:pointer; transition:all 0.2s ease; background:var(--surface);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div style="display:flex; gap:8px;">
              <span class="badge" style="background:var(--primary-container); color:var(--on-primary-container); padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">공급계약</span>
              <span class="badge" style="background:#f1f3f4; color:#3c4043; padding:4px 8px; border-radius:4px; font-size:12px;">현대자동차</span>
            </div>
            <span style="font-size:12px; color:var(--on-surface-variant);">2026.07.05 발행</span>
          </div>
          <h3 style="margin:0 0 12px 0; color:var(--on-surface); font-size:18px;">현대차 4조원대 인도시장 배터리 공급 계약 체결 의미</h3>
          <p style="margin:0; font-size:14px; color:var(--on-surface-variant); line-height:1.5;">
            현지화 전략의 핵심인 인도 시장 점유율 확대를 위한 대규모 배터리 패키징 라인 구축. 전기차(EV) 전환 모멘텀 확보 및 향후 재무 제표에 미치는 영향을 전망합니다.
          </p>
        </div>
      </div>
      
      <!-- AdSense In-feed Placeholder -->
      <div style="width:100%; height:120px; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#999; font-size:14px; margin-bottom:20px;">
        Google AdSense In-feed 광고 삽입 영역
      </div>
    </div>
  `;
}

function initReports() {
  console.log("AI Reports module initialized.");
  
  const hashParts = location.hash.split('/');
  if (hashParts.length > 2 && hashParts[2]) {
    document.getElementById('reports-list').innerHTML = renderReportDetail(hashParts[2]);
  }
}

function renderReportDetail(id) {
  let title = id === '1' ? '삼성전자 2026년 2분기 잠정실적 분석' : '현대차 4조원대 공급 계약';
  
  return `
    <div class="report-detail" style="animation: fadeIn 0.3s ease;">
      <button onclick="location.hash='#/reports'" style="background:none; border:none; cursor:pointer; color:var(--primary); display:flex; align-items:center; gap:4px; margin-bottom:24px; padding:0;">
        <span class="material-symbols-outlined" style="font-size:20px;">arrow_back</span>
        목록으로 돌아가기
      </button>
      
      <h1 style="font-size:28px; line-height:1.4; margin-bottom:16px;">${title}</h1>
      <div style="display:flex; gap:12px; margin-bottom:32px; border-bottom:1px solid var(--outline); padding-bottom:16px; color:var(--on-surface-variant); font-size:14px;">
        <span>작성자: DART Pro AI</span>
        <span>|</span>
        <span>발행일: 2026.07.08</span>
      </div>
      
      <div class="report-content" style="font-size:16px; line-height:1.8; color:var(--on-surface);">
        <p><strong>[서론]</strong></p>
        <p>이번 분기 실적은 단순히 수치의 상승을 넘어, 미래 성장 동력이 본격적으로 가동되고 있음을 보여줍니다. 특히 시장 예상치를 크게 상회하는 결과는 핵심 사업부의 경쟁력 회복을 시사합니다.</p>
        
        <!-- AdSense In-article Placeholder -->
        <div style="width:100%; height:250px; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#999; font-size:14px; margin:32px 0;">
          Google AdSense In-article 광고 영역
        </div>
        
        <p><strong>[본론]</strong></p>
        <p>주요 요인은 다음과 같습니다. 첫째, HBM 메모리의 폭발적인 수요 증가... 둘째, 원가 절감을 통한 수익성 개선... (더 많은 분석 텍스트가 여기에 들어옵니다.)</p>
        
        <p><strong>[결론]</strong></p>
        <p>따라서, 향후 3분기 실적에도 긍정적인 가이던스가 예상되며 단기적인 외부 리스크(환율 변동 등)만 주의한다면 견조한 상승세가 지속될 것으로 평가됩니다.</p>
      </div>
    </div>
  `;
}
