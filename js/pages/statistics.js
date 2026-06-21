// Statistics Page
async function renderStatistics() {
  return `
    <div class="page-header">
      <h2>공시통계</h2>
    </div>
    
    <div class="stats-grid">
      <!-- KPI Cards -->
      <div class="stat-card" style="grid-column: span 12;">
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          <div class="kpi-box">
            <div class="kpi-title">분석 대상 공시</div>
            <div class="kpi-value" id="kpi-total">로딩중...</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">내부자 시그널</div>
            <div class="kpi-value" id="kpi-insider">로딩중...</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">주요 자금조달</div>
            <div class="kpi-value" id="kpi-funding">로딩중...</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">긴급/위험 공시</div>
            <div class="kpi-value" id="kpi-danger">로딩중...</div>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="stat-card" style="grid-column: span 8;">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:16px;">최근 공시 발생 트렌드 (일자별)</h3>
        <div style="height: 250px;">
          <canvas id="trendChart"></canvas>
        </div>
      </div>

      <div class="stat-card" style="grid-column: span 4;">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:16px;">공시 유형별 비중</h3>
        <div style="height: 250px;">
          <canvas id="typeChart"></canvas>
        </div>
      </div>

      <!-- Ranking Table -->
      <div class="stat-card" style="grid-column: span 12;">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:16px;">최신 주요 공시 리스트 (Top 10)</h3>
        <div style="overflow-x:auto;">
          <table class="stat-table" id="ranking-table">
            <thead>
              <tr>
                <th style="width:120px;">접수일자</th>
                <th style="width:150px;">기업명</th>
                <th>공시제목</th>
                <th style="width:100px;">AI 분류</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="4" style="text-align:center; padding: 24px;">데이터를 불러오는 중입니다...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function initStatistics() {
  try {
    const CACHE_KEY = 'dart_stats_cache';
    const CACHE_TTL = 10 * 60 * 1000; // 10분 캐싱
    let list = [];
    
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          list = parsed.data;
        }
      } catch(e) {}
    }

    if (list.length === 0) {
      const res = await window.DART_API.searchDisclosures({ page_count: 100 });
      list = res.list || [];
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: list
      }));
    }
    
    // Calculate KPIs
    document.getElementById('kpi-total').innerText = list.length + ' 건';
    
    let insiderCount = 0;
    let fundingCount = 0;
    let dangerCount = 0;
    
    const categoryCount = {};
    const trendData = {};
    const top10 = [];

    list.forEach(item => {
      let cat = '기타';
      let typeCls = 'insight-default';
      
      // Attempt to use getQuickInsightData if available
      if (typeof getQuickInsightData === 'function') {
        const quick = getQuickInsightData(item);
        cat = quick.category || '기타';
        typeCls = quick.typeCls || 'insight-default';
      }
      
      if (cat === '지배구조' || cat === '내부자 시그널') insiderCount++;
      if (cat === '자금조달') fundingCount++;
      if (typeCls === 'insight-major' || typeCls === 'insight-warning') dangerCount++;
      
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      
      // trend by date (MM/DD)
      const dateStr = item.rcept_dt ? item.rcept_dt.substring(4, 8) : 'Unk'; 
      const fmtDate = dateStr !== 'Unk' ? dateStr.substring(0,2) + '/' + dateStr.substring(2,4) : 'Unk';
      trendData[fmtDate] = (trendData[fmtDate] || 0) + 1;
      
      if ((typeCls === 'insight-major' || typeCls === 'insight-warning' || typeCls === 'insight-purple') && top10.length < 10) {
        top10.push({...item, cat, typeCls});
      }
    });
    
    // Fill up to 10 if needed
    if(top10.length < 10) {
      for(let i=0; i<list.length && top10.length < 10; i++) {
        if(!top10.find(t => t.rcept_no === list[i].rcept_no)) {
          let c = '기타';
          let cls = 'insight-default';
          if (typeof getQuickInsightData === 'function') {
            const q = getQuickInsightData(list[i]);
            c = q.category || '기타';
            cls = q.typeCls || 'insight-default';
          }
          top10.push({...list[i], cat: c, typeCls: cls});
        }
      }
    }

    document.getElementById('kpi-insider').innerText = insiderCount + ' 건';
    document.getElementById('kpi-funding').innerText = fundingCount + ' 건';
    document.getElementById('kpi-danger').innerText = dangerCount + ' 건';

    // Render Table
    const tbody = document.querySelector('#ranking-table tbody');
    tbody.innerHTML = top10.map(item => `
      <tr>
        <td>${window.DART_API.formatDate(item.rcept_dt)}</td>
        <td style="font-weight:600;">${item.corp_name}</td>
        <td style="cursor:pointer; color:var(--primary);" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">${item.report_nm}</td>
        <td><span class="${item.typeCls}" style="padding:4px 8px; border-radius:4px; font-size:11px; background-color:var(--surface-container-high); border-left:3px solid currentColor;">${item.cat}</span></td>
      </tr>
    `).join('');

    // Render Charts
    if (typeof Chart !== 'undefined') {
      const sortedDates = Object.keys(trendData).sort();
      const ctxTrend = document.getElementById('trendChart').getContext('2d');
      new Chart(ctxTrend, {
        type: 'bar',
        data: {
          labels: sortedDates,
          datasets: [{
            label: '공시 건수',
            data: sortedDates.map(k => trendData[k]),
            backgroundColor: '#3b82f6',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });

      const ctxType = document.getElementById('typeChart').getContext('2d');
      new Chart(ctxType, {
        type: 'doughnut',
        data: {
          labels: Object.keys(categoryCount),
          datasets: [{
            data: Object.values(categoryCount),
            backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b', '#0ea5e9', '#ec4899'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } 
          },
          cutout: '70%'
        }
      });
    }

  } catch (err) {
    console.error('Stats error:', err);
    document.getElementById('kpi-total').innerText = '오류 발생';
  }
}

window.renderStatistics = renderStatistics;
window.initStatistics = initStatistics;
