// Statistics Page
async function renderStatistics() {
  return `
    <div class="page-header" style="display: flex; align-items: baseline; gap: 12px;">
      <h2>공시통계</h2>
      <span id="stats-timestamp" style="font-size: 13px; color: var(--on-surface-variant); font-weight: 500;"></span>
    </div>
    
    <div class="stats-grid">
      <!-- KPI Cards -->
      <div class="stat-card" style="grid-column: span 12; padding: 0; background: transparent; border: none; box-shadow: none;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <div class="kpi-box">
            <div class="kpi-title"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom; color:var(--primary);">monitoring</span> 분석 대상 공시</div>
            <div class="kpi-value" id="kpi-total">로딩중...</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom; color:#a855f7;">group_work</span> 내부자 시그널</div>
            <div class="kpi-value" id="kpi-insider">로딩중...</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom; color:#22c55e;">payments</span> 주요 자금조달</div>
            <div class="kpi-value" id="kpi-funding">로딩중...</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom; color:#ef4444;">warning</span> 긴급/위험 공시</div>
            <div class="kpi-value" id="kpi-danger">로딩중...</div>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="stat-card" style="grid-column: span 8;">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:16px;">최근 7일 공시 발생 트렌드 (일자별)</h3>
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
    const CACHE_KEY = 'dart_stats_cache_7days_v3';
    const CACHE_TTL = 10 * 60 * 1000; // 10분 캐싱
    let list = [];
    let dailyCountsCache = null;
    let fetchTime = Date.now();
    
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          list = parsed.data;
          dailyCountsCache = parsed.dailyCounts || null;
          fetchTime = parsed.timestamp;
        }
      } catch(e) {}
    }

    if (list.length === 0 || !dailyCountsCache) {
      // 오늘 기준으로 최근 7일간 일자별 병렬 조회 (동적 계산)
      const promises = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}${mm}${dd}`;
        const fmtDate = `${mm}/${dd}`;
        promises.push(
          window.DART_API.searchDisclosures({ bgn_de: dateStr, end_de: dateStr, page_count: 100 })
            .then(res => ({ fmtDate, res }))
        );
      }
      const results = await Promise.all(promises);
      dailyCountsCache = {};
      results.forEach(({ fmtDate, res }) => {
        dailyCountsCache[fmtDate] = res.total_count || (res.list ? res.list.length : 0);
        if (res.list) list = list.concat(res.list);
      });
      fetchTime = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: fetchTime,
        data: list,
        dailyCounts: dailyCountsCache
      }));
    }
    
    // 가장 최신 일자 찾기
    const latestDate = list.reduce((max, item) => {
      const dt = item.rcept_dt ? item.rcept_dt.substring(0, 8) : '';
      return dt > max ? dt : max;
    }, '');
    const recentList = list.filter(item => item.rcept_dt && item.rcept_dt.startsWith(latestDate));
    
    // Set Timestamp based on data
    const latestFmtDate = latestDate ? parseInt(latestDate.substring(4,6)) + '/' + parseInt(latestDate.substring(6,8)) : '';
    const d = new Date(fetchTime);
    const tsStr = `기준: ${latestFmtDate}일자 공시 (조회: ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')})`;
    document.getElementById('stats-timestamp').innerText = tsStr;
    
    // Calculate KPIs (최신 1일 기준)
    const kpiFmtDate = latestDate ? latestDate.substring(4,6) + '/' + latestDate.substring(6,8) : '';
    document.getElementById('kpi-total').innerText = (dailyCountsCache[kpiFmtDate] || recentList.length) + ' 건';
    
    let insiderCount = 0;
    let fundingCount = 0;
    let dangerCount = 0;
    
    const categoryCount = {};
    const trendData = { ...dailyCountsCache };
    const top10 = [];

    // 일자별 트렌드는 API의 실제 총 건수(trendData)를 사용하므로
    // 아래 recentList 루프에서는 최신일자 1일 기준 분류, KPI, Top10만 집계합니다.
    recentList.forEach(item => {
      let cat = '기타';
      let typeCls = 'insight-default';
      
      if (typeof getQuickInsightData === 'function') {
        const quick = getQuickInsightData(item);
        cat = quick.category || '기타';
        typeCls = quick.typeCls || 'insight-default';
      }
      
      if (cat === '지배구조' || cat === '내부자 시그널') insiderCount++;
      if (cat === '자금조달') fundingCount++;
      if (typeCls === 'insight-major' || typeCls === 'insight-warning') dangerCount++;
      
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      
      if ((typeCls === 'insight-major' || typeCls === 'insight-warning' || typeCls === 'insight-purple') && top10.length < 10) {
        top10.push({...item, cat, typeCls});
      }
    });
    
    if(top10.length < 10) {
      for(let i=0; i<recentList.length && top10.length < 10; i++) {
        if(!top10.find(t => t.rcept_no === recentList[i].rcept_no)) {
          let c = '기타';
          let cls = 'insight-default';
          if (typeof getQuickInsightData === 'function') {
            const q = getQuickInsightData(recentList[i]);
            c = q.category || '기타';
            cls = q.typeCls || 'insight-default';
          }
          top10.push({...recentList[i], cat: c, typeCls: cls});
        }
      }
    }

    document.getElementById('kpi-insider').innerText = insiderCount + ' 건';
    document.getElementById('kpi-funding').innerText = fundingCount + ' 건';
    document.getElementById('kpi-danger').innerText = dangerCount + ' 건';

    // Render Table
    const tbody = document.querySelector('#ranking-table tbody');
    tbody.innerHTML = top10.map(item => `
      <tr style="cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='var(--surface-container-low)'" onmouseout="this.style.background='transparent'" onclick="window.open('${window.DART_API.viewerUrl(item.rcept_no)}','_blank')">
        <td>${window.DART_API.formatDate(item.rcept_dt)}</td>
        <td style="font-weight:600;">${item.corp_name}</td>
        <td style="color:var(--on-surface);">${item.report_nm}</td>
        <td><span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600; background-color:var(--surface-container-high); border:1px solid var(--outline-variant); color:var(--on-surface);">${item.cat}</span></td>
      </tr>
    `).join('');

    // Process Category Data for top 5 + '기타' (기존 기타 항목 통합 처리)
    const catEntries = Object.entries(categoryCount).sort((a,b) => b[1] - a[1]);
    const topCats = [];
    let otherCount = 0;
    
    catEntries.forEach(e => {
      if (e[0] === '기타') {
        otherCount += e[1];
      } else if (topCats.length < 5) {
        topCats.push(e);
      } else {
        otherCount += e[1];
      }
    });

    if (otherCount > 0) {
      topCats.push(['기타', otherCount]);
    }
    
    const donutLabels = topCats.map(e => e[0]);
    const donutData = topCats.map(e => e[1]);

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
          labels: donutLabels,
          datasets: [{
            data: donutData,
            backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, padding: 16 } } 
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
