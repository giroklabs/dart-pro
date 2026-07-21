const fcmAdmin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 🔥 FCM 직접 발송용 인증 객체
const saPath = path.resolve(__dirname, 'service-account.json');
const auth = new GoogleAuth({
  keyFile: saPath,
  scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
});

async function sendFcmDirect(message) {
  try {
    const accessToken = await auth.getAccessToken();
    if (!accessToken) throw new Error("FCM accessToken is empty or undefined!");
    const projectId = JSON.parse(fs.readFileSync(saPath, 'utf8')).project_id;
    const postData = JSON.stringify({ message });

    const options = {
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${projectId}/messages:send`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let resData = '';
        res.on('data', (chunk) => resData += chunk);
        res.on('end', () => {
          if (res.statusCode < 300) resolve(JSON.parse(resData));
          else reject(new Error(`FCM Error (${res.statusCode}): ${resData}`));
        });
      });
      req.on('error', (e) => reject(e));
      req.write(postData);
      req.end();
    });
  } catch (err) {
    throw err;
  }
}

try {
  if (fcmAdmin.apps.length === 0) {
    fcmAdmin.initializeApp({
      credential: fcmAdmin.credential.cert(JSON.parse(fs.readFileSync(saPath, 'utf8')))
    });
  }
  console.log('🚀 FCM Ready (cert + REST hybrid).');
} catch (err) {
  console.error('❌ Initialization failed:', err.message);
}

// .env 파일 읽기 로직 (파싱 버그 수정)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > -1) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) process.env[key] = value;
      }
    });
    console.log('✅ .env configuration loaded.');
  }
} catch (err) {
  console.log('⚠️ .env file not found or unreadable.');
}

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.PORT) || 3002;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'text/xml; charset=utf-8'
};

// 데이터 파일 경로 설정 (전역 스코프)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const USER_DATA_FILE = path.join(DATA_DIR, 'user_watchlist.json');

// 실시간 로그를 임시 저장할 배열
let mlLogs = [];

// 7.5MB corps.json 파일 메모리 캐싱 및 인덱싱 (서버 기동 시 1회만 처리)
let globalCorps = [];
let globalCodeToName = {};

try {
  const corpsPath = path.join(__dirname, 'corps.json');
  if (fs.existsSync(corpsPath)) {
    const raw = fs.readFileSync(corpsPath, 'utf8');
    const parsed = JSON.parse(raw);
    
    if (Array.isArray(parsed)) {
      globalCorps = parsed;
    } else {
      globalCorps = Object.entries(parsed)
        .filter(([key, val]) => !/^[0-9]{8}$/.test(key) && /^[0-9]{8}$/.test(val))
        .map(([name, code]) => ({ code, name }));
    }
    
    // code -> name 역방향 맵 캐싱
    globalCorps.forEach(item => {
      if (item.code && item.name) {
        globalCodeToName[item.code] = item.name;
      }
    });
    console.log(`[DART] corps.json loaded on startup. Total ${globalCorps.length} corporations indexed.`);
  }
} catch (e) {
  console.error('[DART] Failed to pre-load corps.json:', e);
}

// Lean Engine DB 연결
const sqlite3 = require('sqlite3').verbose();
const LEAN_DB_PATH = path.join(__dirname, 'lean_engine.db');
const leanDb = new sqlite3.Database(LEAN_DB_PATH, (err) => {
  if (err) console.warn('[LeanDB] DB 연결 실패 (lean_engine.db 없음):', err.message);
  else console.log('[LeanDB] lean_engine.db 연결 완료.');
});

const addLog = (msg) => {
  const timestamp = new Date().toLocaleTimeString();
  const formattedMsg = `[${timestamp}] ${msg}`;
  mlLogs.push(formattedMsg);
  if (mlLogs.length > 100) mlLogs.shift(); // 최근 100개만 유지
};

const server = http.createServer((req, res) => {

  // 모든 요청에 대해 CORS 헤더 우선 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch (err) {
    res.writeHead(400);
    return res.end('Invalid URL');
  }
  const pathname = parsedUrl.pathname;

  // 실시간 로그 스트리밍 엔드포인트 (SSE)
  if (pathname === '/api/ml/logs-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // 1초마다 새로운 로그가 있는지 확인하여 전송
    const interval = setInterval(() => {
      if (mlLogs.length > 0) {
        const logsToSend = [...mlLogs];
        mlLogs = [];
        res.write(`data: ${JSON.stringify(logsToSend)}\n\n`);
      }
    }, 500);

    req.on('close', () => clearInterval(interval));
    return;
  }

  // 파이어베이스 설정 제공 API (보안 강화 - 최우선 처리)
  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: "dart-pro-26816.firebaseapp.com",
      projectId: "dart-pro-26816",
      storageBucket: "dart-pro-26816.firebasestorage.app",
      messagingSenderId: "184831339253",
      appId: "1:184831339253:web:f79382f532eb1be0ba73bc",
      measurementId: "G-7EWXBZJJGT"
    }));
  }

  // 개별 공시 블로그형 SSR 정적 페이지 (SEO)
  const dMatch = pathname.match(/^\/d\/(\d+)$/);
  if (dMatch) {
    const rcept_no = dMatch[1];
    return leanDb.get(
      'SELECT f.report_nm, f.corp_code, f.rcept_dt, s.summary_text FROM filings f LEFT JOIN summaries s ON f.rcept_no = s.rcept_no WHERE f.rcept_no = ?',
      [rcept_no],
      (err, row) => {
        if (err || !row) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h1>해당 공시를 찾을 수 없습니다.</h1><a href="/">DART Pro 홈으로 돌아가기</a>');
        }
        
        let corpName = '알 수 없음';
        try {
          const corps = JSON.parse(fs.readFileSync(path.join(__dirname, 'corps.json'), 'utf8'));
          const corp = corps.find(c => c.code === row.corp_code);
          if (corp) corpName = corp.name;
        } catch(e) {}

        const title = `[${corpName}] ${row.report_nm} - 핵심 요약`;
        const description = row.summary_text ? row.summary_text.replace(/\n/g, ' ').substring(0, 150) + '...' : `${corpName}의 ${row.report_nm} 주요 내용입니다.`;
        const dateStr = row.rcept_dt ? `${row.rcept_dt.slice(0,4)}-${row.rcept_dt.slice(4,6)}-${row.rcept_dt.slice(6,8)}` : '';

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | DART Pro</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="article">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
    .container { background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    h1 { font-size: 24px; color: #1a1a1a; margin-bottom: 8px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 16px; }
    .summary { font-size: 16px; white-space: pre-wrap; margin-bottom: 40px; }
    .btn { display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; }
    .btn:hover { background: #1d4ed8; }
    @media (max-width: 600px) { .container { padding: 20px; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>[${corpName}] ${row.report_nm}</h1>
    <div class="meta">접수일: ${dateStr} &nbsp;|&nbsp; 접수번호: ${rcept_no}</div>
    <div class="summary">${row.summary_text ? row.summary_text.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '요약 정보가 아직 준비되지 않았습니다.'}</div>
    <div style="text-align: center;">
      <a href="/#/disclosures" class="btn">🚀 DART Pro에서 실시간 공시 더보기</a>
      <div style="margin-top: 12px;"><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcept_no}" target="_blank" style="color: #666; font-size: 14px;">DART 원문 보기</a></div>
    </div>
  </div>
</body>
</html>`;
        
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      }
    );
  }

  // 대시보드 페이지 서빙
  if (pathname === '/dashboard' || pathname === '/') {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(indexPath));
    } else {
      // public 폴더에 없으면 루트 폴더 확인
      const rootIndexPath = path.join(__dirname, 'index.html');
      if (fs.existsSync(rootIndexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(rootIndexPath));
      }
    }
  }

  // 헬스체크 엔드포인트 (유연하게 매칭)
  if (pathname === '/api/health' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // ==========================================
  // Lean Engine: 공시 요약 조회 API
  // ==========================================
  const summaryMatch = pathname.match(/^\/api\/lean\/summary\/(.+)$/);
  if (summaryMatch) {
    const rcept_no = summaryMatch[1];
    leanDb.get(
      'SELECT s.summary_text, f.report_nm FROM summaries s JOIN filings f ON s.rcept_no = f.rcept_no WHERE s.rcept_no = ?',
      [rcept_no],
      (err, row) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: err.message }));
        }
        if (row) {
          const aiComments = getFormattedCommentary(row.report_nm, row.summary_text);
          let finalSummary = row.summary_text;
          if (aiComments && aiComments.length > 0) {
            finalSummary += '\n' + aiComments.join('\n');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, summary: finalSummary }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: '아직 요약이 생성되지 않았습니다.' }));
        }
      }
    );
    return;
  }

  // ==========================================
  // 0-1. AI 인사이트 리포트 조회 API
  // ==========================================
  if (pathname === '/api/reports' && req.method === 'GET') {
    leanDb.all(
      'SELECT report_id as id, category, corp_name, title, summary, publish_date FROM ai_reports ORDER BY report_id DESC LIMIT 20',
      [],
      (err, rows) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: err.message }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: rows }));
      }
    );
    return;
  }

  const reportDetailMatch = pathname.match(/^\/api\/reports\/(.+)$/);
  if (reportDetailMatch && req.method === 'GET') {
    const reportId = reportDetailMatch[1];
    leanDb.get(
      'SELECT report_id as id, category, corp_name, title, summary, content, publish_date FROM ai_reports WHERE report_id = ?',
      [reportId],
      (err, row) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: err.message }));
        }
        if (!row) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Report not found' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: row }));
      }
    );
    return;
  }

  // ==========================================
  // 0. 테스트 푸시 알림 발송 API
  // ==========================================
  if (pathname === '/api/test-push' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const parsedBody = JSON.parse(body);
        const { fcmToken, uid } = parsedBody;
        if (!fcmToken) throw new Error('FCM 토큰이 없습니다.');

        // 🧼 토큰 정제 (iOS Optional 래퍼 제거)
        let cleanToken = fcmToken;
        if (cleanToken.includes('Optional("')) {
          const match = cleanToken.match(/Optional\("(.+)"\)/);
          if (match) cleanToken = match[1];
        }
        cleanToken = cleanToken.replace(/Optional\("/g, '').replace(/"\)/g, '').trim();

        // 알림 센터에 먼저 저장 (FCM 성공 여부와 무관)
        if (uid) {
          const userNotifFile = path.join(DATA_DIR, `notifications_${uid}.json`);
          let userNotifs = [];
          if (fs.existsSync(userNotifFile)) {
            userNotifs = JSON.parse(fs.readFileSync(userNotifFile, 'utf8'));
          }
          userNotifs.unshift({
            id: Date.now().toString(),
            title: '🔔 테스트 알림',
            body: '알림 테스트가 성공적으로 완료되었습니다.',
            date: new Date().toISOString(),
            rceptNo: 'TEST_000',
            isRead: false
          });
          
          // FCM 전송 (직접 REST API 발송 - SDK 거치지 않음)
          try {
            const message = {
              notification: {
                title: '🔔 DART Pro 알림 테스트',
                body: '축하합니다! 서버와의 알림 연동이 성공적으로 완료되었습니다.'
              },
              apns: {
                headers: {
                  'apns-push-type': 'alert',
                  'apns-priority': '10'
                },
                payload: {
                  aps: {
                    alert: {
                      title: '🔔 DART Pro 알림 테스트',
                      body: '축하합니다! 서버와의 알림 연동이 성공적으로 완료되었습니다.'
                    },
                    sound: 'default'
                  }
                }
              },
              token: cleanToken
            };
            
            await sendFcmDirect(message);
            console.log('🚀 FCM 알림 발송 성공 (REST API)');
          } catch (fcmErr) {
            console.warn('[TestPush] FCM 발송 실패:', fcmErr.message);
          }
          
          fs.writeFileSync(userNotifFile, JSON.stringify(userNotifs.slice(0, 50), null, 2));
          console.log(`[TestPush] Notification saved for UID: ${uid}`);
        }

        

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: '000', message: '테스트 알림 발송 및 저장 성공' }));
      } catch (err) {
        console.error('❌ Test push ERROR DETAILS:', err); // 에러 객체 전체 출력
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: '500', message: err.message, code: err.code }));
      }
    });
    return;
  }



// ==========================================
// 1.5.1 AI 코멘트 자동 생성 유틸리티
// ==========================================
function getFormattedCommentary(reportName, text) {
  const comments = [];
  
  if (/단일판매|공급계약/.test(reportName)) {
    const ratioMatch = text.match(/매출액\s*대비[^\d]*([\d.]+)(?:%)?/);
    if (ratioMatch) {
      const ratio = parseFloat(ratioMatch[1]);
      if (ratio >= 50) comments.push(`[코멘트] 전년 매출 대비 ${ratio}%에 달하는 초대형 수주입니다. 강력한 실적 턴어라운드 시그널일 수 있습니다.`);
      else if (ratio >= 20) comments.push(`[코멘트] 전년 매출 대비 ${ratio}%의 대규모 수주로, 유의미한 실적 기여가 예상됩니다.`);
      else if (ratio < 5) comments.push(`[코멘트] 전년 매출 대비 ${ratio}% 수주입니다. 단기 실적 기여도는 낮으나 안정적 수주 잔고 확보 차원에서 긍정적입니다.`);
      else comments.push(`[코멘트] 전년 매출 대비 ${ratio}% 수준의 수주 계약을 체결했습니다.`);
    }
  }
  else if (/유상증자/.test(reportName)) {
    if (text.includes('제3자배정')) {
      comments.push(`[코멘트] 제3자 배정 방식은 보통 신규 자금 유입 및 전략적 파트너십 확보로 호재로 인식됩니다.`);
    } else if (text.includes('주주배정')) {
      comments.push(`[주의 시그널] 주주배정 방식은 단기적인 주가 희석 우려가 발생할 수 있어 청약 흥행 여부가 중요합니다.`);
    }
    const discountMatch = text.match(/할인율[^\d]*([\d.]+)(?:%)?/);
    if (discountMatch) {
      const discount = parseFloat(discountMatch[1]);
      if (discount >= 20) comments.push(`[주의 시그널] 할인율이 ${discount}%로 매우 높아 기존 주주가치 희석에 주의가 필요합니다.`);
      else comments.push(`[코멘트] 할인율은 ${discount}%로 책정되었습니다.`);
    }
  }
  else if (/임원ㆍ주요주주|대량보유/.test(reportName)) {
    const isBuy = text.includes('내부자 시그널') || text.includes('내부자 매수') || /(?:장내매수|장내취득|신규보고|상속|증여받음)/.test(text);
    const isSell = text.includes('내부자 매도') || /(?:장내매도|시간외매도|장내처분|퇴임|증여함)/.test(text);
    
    if (isBuy && !isSell) {
      comments.push(`[코멘트] 내부자의 지분 매수는 현재 주가가 저평가되었다는 경영진의 자신감(책임경영)을 나타냅니다.`);
    } else if (isSell && !isBuy) {
      comments.push(`[주의 시그널] 내부자 지분 매도는 차익 실현 등 주가 단기 고점 시그널일 수 있으므로 유의해야 합니다.`);
    } else if (isBuy && isSell) {
      comments.push(`[코멘트] 내부자의 지분 매수 및 매도(처분)가 혼재되어 있습니다. 매매 사유와 순매수/순매도 여부를 상세 확인하세요.`);
    } else {
      comments.push(`[코멘트] 세부 변동 사항은 원문을 참조하세요.`);
    }
  }
  else if (/배당/.test(reportName)) {
    const yieldMatch = text.match(/시가배당률[^\d]*([\d.]+)(?:%)?/);
    if (yieldMatch) {
      const y = parseFloat(yieldMatch[1]);
      if (y >= 5) comments.push(`[코멘트] 시가 배당률 ${y}%의 고배당 정책입니다. 배당 투자자들의 강력한 매수세 유입이 기대됩니다.`);
      else if (y < 1) comments.push(`[코멘트] 배당률은 ${y}%로 다소 낮으나, 지속적인 주주 환원 정책의 일환으로 평가됩니다.`);
      else comments.push(`[코멘트] 시가 배당률은 ${y}% 수준입니다.`);
    }
  }
  else if (/무상증자/.test(reportName)) {
    const ratioMatch = text.match(/1주당\s*신주배정[^\d]*([\d.]+)/);
    if (ratioMatch) {
      const ratio = parseFloat(ratioMatch[1]);
      if (ratio >= 1) comments.push(`[코멘트] 1주당 ${ratio}주를 배정하는 대규모 무상증자입니다. 권리락 효과와 유동성 증가로 주가에 긍정적입니다.`);
      else comments.push(`[코멘트] 1주당 ${ratio}주 비율의 무상증자 결정입니다.`);
    }
  }
  else if (/전환사채|신주인수권부사채/.test(reportName)) {
    comments.push(`[주의 시그널] 메자닌 발행 공시: 향후 주식 전환 시 기존 주주 가치가 희석될 수 있으므로 전환가액을 확인하세요.`);
    if (text.includes('운영자금')) comments.push(`[주의 시그널] 조달 목적이 '운영자금'인 경우 재무 건전성에 대한 우려가 제기될 수 있습니다.`);
  }
  else if (/자기주식취득/.test(reportName)) {
    if (text.includes('소각')) comments.push(`[코멘트] 자사주 취득 후 소각은 유통 주식 수를 줄여 주당 가치를 높이는 가장 강력한 주주 환원책입니다.`);
    else comments.push(`[코멘트] 자사주 취득 결정은 주가 부양 및 책임 경영에 대한 긍정적 시그널로 해석됩니다.`);
  }
  else if (/타법인주식.*취득/.test(reportName)) {
    comments.push(`[코멘트] 신규 사업 진출 또는 시너지 창출을 위한 타법인 지분 투자입니다. 대상 기업의 성장성이 주가를 좌우합니다.`);
  }
  else if (/소송|제재|과징금|영업정지/.test(reportName)) {
    const ratioMatch = text.match(/자기자본\s*대비[^\d]*([\d.]+)(?:%)?/);
    if (ratioMatch) {
      const ratio = parseFloat(ratioMatch[1]);
      if (ratio >= 10) comments.push(`[주의 시그널] 자기자본 대비 ${ratio}%에 달하는 규모의 제재/소송입니다. 재무 및 영업 타격이 우려됩니다.`);
      else comments.push(`[주의 시그널] 자기자본 대비 ${ratio}% 규모입니다. 당장의 타격은 제한적이나 진행 상황을 주시해야 합니다.`);
    } else {
      comments.push(`[주의 시그널] 법적 리스크 공시: 최종 처분 결과에 따라 불확실성이 확대될 수 있습니다.`);
    }
  }
  else if (/감자결정|자본금감소/.test(reportName)) {
    const ratioMatch = text.match(/감자비율[^\d]*([\d.]+)(?:%)?/);
    if (ratioMatch) {
      const ratio = parseFloat(ratioMatch[1]);
      if (ratio >= 50) comments.push(`[주의 시그널] 감자비율이 ${ratio}%로 높습니다. 결손금 보전 등 재무구조 악화가 원인인지 확인하세요.`);
      else comments.push(`[주의 시그널] 감자비율 ${ratio}% 수준의 감자결정입니다. 주주가치 희석에 유의해야 합니다.`);
    } else if (text.includes('무상감자') || text.includes('결손보전')) {
      comments.push(`[주의 시그널] 결손금 보전을 위한 무상감자는 심각한 재무 악화 상태를 의미하므로 상장폐지 리스크에 각별히 유의하세요.`);
    }
  }

  const uniqueComments = [...new Set(comments)];
  return uniqueComments.map(c => {
    let cleanText = c;
    let emoji = '💡';
    if (c.startsWith('[코멘트] ')) {
      emoji = '💡';
      cleanText = c.replace('[코멘트] ', '');
    } else if (c.startsWith('[주의 시그널] ')) {
      emoji = '⚠️';
      cleanText = c.replace('[주의 시그널] ', '');
    }
    return `${emoji} ${cleanText}`;
  });
}

// ==========================================
// 1.5 Disclosure Ranker 스코어링 유틸리티
// ==========================================
function calculateDisclosureScore(reportName) {
  let score = 0;
  // 1. 수치 데이터 포함 여부 (금액, 비율, 날짜)
  if (/[0-9]+억|[0-9,]+원|[0-9]+백만/.test(reportName)) score += 2.0;
  if (/[0-9.]+%/.test(reportName)) score += 1.2;
  if (/[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}/.test(reportName)) score += 0.8;
  
  // 2. 핵심 의사결정 키워드
  const keywords = ['결정', '체결', '취득', '처분', '변경', '발생', '해지', '완료', '승인', '의결', '정정', '연장', '배당', '수주', '공급계약', '유상증자', '무상증자', '합병', '분할'];
  if (keywords.some(k => reportName.includes(k))) score += 1.5;

  // 3. 추가 수치 가중치
  const amountMatches = (reportName.match(/[0-9]+억|[0-9,]+원|[0-9]+백만/g) || []).length;
  score += Math.min(amountMatches, 3) * 0.5;

  const percentMatches = (reportName.match(/[0-9.]+%/g) || []).length;
  score += Math.min(percentMatches, 2) * 0.3;

  // 4. 리스크 관련 키워드
  const riskKeywords = ['리스크', '불확실성', '위험', '손실', '하락', '변동성', '소송', '제재', '과징금', '관리종목', '상장폐지'];
  if (riskKeywords.some(k => reportName.includes(k))) score += 2.0;

  return parseFloat(score.toFixed(1));
}

function getRankLabel(score) {
  if (score >= 4.0) return 3; // 매우 중요
  if (score >= 2.5) return 2; // 중요
  if (score >= 1.0) return 1; // 보통
  return 0; // 참고
}

// ==========================================
// 1.5 Gemini AI 분석 API (캐시 및 Ranker 적용)
// ==========================================
  if (pathname === '/api/ai/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { corpName, reportName, rceptNo } = JSON.parse(body);
        console.log(`[AI Hybrid Local Request] ${corpName} - ${reportName} (${rceptNo})`);
        
        const rankScore = calculateDisclosureScore(reportName);
        const rankLabel = getRankLabel(rankScore);

        // 1. lean_engine.db에서 이미 파이썬 엔진이 빌드해둔 summary_text 조회
        leanDb.get(
          'SELECT summary_text FROM summaries WHERE rcept_no = ?',
          [rceptNo],
          (err, row) => {
            if (err) {
              console.warn('[AI Local] DB Error:', err.message);
            }

            // 공시 유형 판단 유틸
            let category = '기타공시';
            let typeCls = 'info';
            if (/배당/.test(reportName)) { category = '주주환원'; typeCls = 'success'; }
            else if (/분기|반기|사업/.test(reportName)) { category = '정기공시'; typeCls = 'info'; }
            else if (/수주|공급계약/.test(reportName)) { category = '주요사항보고'; typeCls = 'success'; }
            else if (/유상증자|무상증자|사채/.test(reportName)) { category = '발행공시'; typeCls = 'warning'; }
            else if (/소유상황|대량보유/.test(reportName)) { category = '지분공시'; typeCls = 'info'; }
            else if (/정정/.test(reportName)) { category = '기타공시'; typeCls = 'warning'; }

            if (row && row.summary_text && !row.summary_text.includes('정형 표 형식이 많거나')) {
              console.log(`[AI Hybrid Local] DB Summary Hit! Parsing for rcept_no: ${rceptNo}`);
              const text = row.summary_text;
              
              // 파이썬 요약 텍스트에서 헤더와 본문 분리
              const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
              let insight = '';
              const points = [];

              // 헤더 추출 (**텍스트** 로 시작하는 줄)
              const headerLine = lines.find(l => l.includes('**'));
              if (headerLine) {
                insight = headerLine.replace(/\*\*/g, '');
              } else if (lines.length > 0) {
                insight = lines[0];
              } else {
                insight = `${corpName}의 ${reportName}이 공시되었습니다.`;
              }

              // 구형 스타일의 insight 제목을 세련된 CTA 포맷으로 실시간 보정
              if (insight.includes('의 주요 공시사항입니다.')) {
                insight = `${corpName} - ${reportName.trim()} 공시: 핵심 내용 및 상세 일정을 확인하세요.`;
              } else if (insight.includes('의 배당 관련 중요 공시가 등록되었습니다.')) {
                insight = `${corpName} - 배당 일정 공시: 주주 환원 및 시가 배당률을 확인하세요.`;
              } else if (insight.includes('의 기재 사항 정정 공시입니다.')) {
                insight = `${corpName} - 기재사항 정정 공시: 정정 전/후 주요 변동 수치를 확인하세요.`;
              } else if (insight.includes('의 임원 및 주요주주 특정증권 소유상황 보고가 접수되었습니다.')) {
                insight = `${corpName} - 지분 소유상황 보고: 주요 경영진의 지분 변동 추이를 확인하세요.`;
              } else if (insight.includes('의 감사보고서가 제출되었습니다.')) {
                insight = `${corpName} - 감사보고서 제출 공시: 외부감사인의 감사의견을 우선 확인하세요.`;
              }

              // 불릿 포인트 추출 (▪ 또는 - 로 시작하는 라인들)
              lines.forEach(line => {
                if ((line.startsWith('▪') || line.startsWith('-') || line.startsWith('💡')) && !line.includes('**')) {
                  points.push(line.replace(/^[\s▪\-💡\s]+/, ''));
                }
              });

              if (points.length === 0) {
                points.push("공시 상세 수치는 상단의 '상세보기'에서 원본으로 즉시 조회 가능합니다.");
                points.push("자체 로컬 룰 엔진 스코어 기반 중요 수치 자동 하이라이팅이 적용되었습니다.");
              }

              const aiComments = getFormattedCommentary(reportName, text);
              const finalPoints = [...points.slice(0, 3), ...aiComments];

              const result = {
                category,
                insight,
                points: finalPoints,
                impact: `로컬 Lean Engine 핵심 요약 (${rankScore}점)`,
                typeCls,
                rankScore,
                rankLabel
              };

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            } else {
              // 2. DB에 요약 데이터가 없는 경우 온더플라이 Rule 기반 Mock 요약 생성
              console.log(`[AI Hybrid Local] DB Summary Miss. Generating instant Mock for rcept_no: ${rceptNo}`);
              
              let insight = `${corpName} - ${reportName.trim()} 공시: 핵심 내용 및 상세 일정을 확인하세요.`;
              const points = [
                "해당 종목은 현재 실시간 감시 관심 종목 대상에 포함되어 모니터링 중입니다.",
                "더 빠른 상세 확인을 위해 우측 상단의 '상세보기' 버튼을 누르시면 원본 뷰어가 바로 열립니다."
              ];

              if (/배당/.test(reportName)) {
                insight = `${corpName} - 배당 일정 공시: 주주 환원 및 시가 배당률을 확인하세요.`;
                points[0] = "주주 환원 정책의 일관성 및 시가 배당률 수준 확인이 필요한 구간입니다.";
              } else if (/정정/.test(reportName)) {
                insight = `${corpName} - 기재사항 정정 공시: 정정 전/후 주요 변동 수치를 확인하세요.`;
                points[0] = "정정 전/후의 정량 수치(금액, 비율, 일정 등) 변동폭을 반드시 확인하세요.";
              } else if (/소유상황/.test(reportName)) {
                insight = `${corpName} - 지분 소유상황 보고: 주요 경영진의 지분 변동 추이를 확인하세요.`;
                points[0] = "내부 경영진의 지분 매입/매각 추이는 주가 향방의 1차 선행 시그널이 될 수 있습니다.";
              } else if (/감사보고서/.test(reportName) || /감사의견/.test(reportName)) {
                insight = `${corpName} - 감사보고서 제출 공시: 외부감사인의 감사의견을 우선 확인하세요.`;
                points[0] = "외부감사인의 감사의견(적정, 한정, 부적정, 의견거절)은 기업 생존 및 거래소퇴출 여부를 가르는 핵심 지표입니다.";
              }

              const result = {
                category,
                insight,
                points,
                impact: `실시간 대기 중 (${rankScore}점)`,
                typeCls,
                rankScore,
                rankLabel
              };

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }
          }
        );
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // 1. 종목 검색 API
  // ==========================================
  if (pathname === '/api/dart/search' || pathname === '/dart/search') {
    const query = parsedUrl.searchParams.get('query');
    if (!query || query.length < 2) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([]));
    }

    const INTERNAL_MAP = { 
      "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "현대차": "00164742", 
      "미래에셋증권": "00111722", "미래에셋": "00111722", "HL만도": "01042775", "에이치엘만도": "01042775",
      "하나금융지주": "00547583", "하나금융": "00547583", "카카오": "00258838", "네이버": "00266961", "에코프로": "00305884",
      "대한항공": "00126431", "한화솔루션": "00155167", "한국전력공사": "00159109", "한국전력": "00159109", "기아": "00106641"
    };

    try {
      let results = globalCorps.filter(c => 
        (c.name && (c.name.includes(query) || query.includes(c.name))) || 
        (c.code && c.code.includes(query))
      );

      // INTERNAL_MAP 데이터 병합 (중복 제거)
      const internalResults = Object.entries(INTERNAL_MAP)
        .filter(([name, code]) => name.includes(query) || query.includes(name) || code.includes(query))
        .map(([name, code]) => ({ code, name }));
      
      const allResults = [...internalResults];
      results.forEach(r => {
        if (!allResults.some(ir => ir.code === r.code)) allResults.push(r);
      });
      
      results = allResults.slice(0, 20);
      console.log(`[Search] Found ${results.length} results`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(results));
    } catch (e) {
      console.error('[Search] Error:', e.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ==========================================
  // 2. 구독 및 동기화 API
  // ==========================================


  if (pathname === '/api/user/notifications' || pathname === '/user/notifications') {
    const uid = parsedUrl.searchParams.get('uid');
    if (!uid) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'UID required' }));
    }
    const userNotifFile = path.join(DATA_DIR, `notifications_${uid}.json`);
    let userNotifs = [];
    if (fs.existsSync(userNotifFile)) {
      userNotifs = JSON.parse(fs.readFileSync(userNotifFile, 'utf8'));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(userNotifs));
  }

  // 종목명 조회 API (코드 -> 이름)
  if (pathname === '/api/dart/names' || pathname === '/dart/names') {
    const codesStr = parsedUrl.searchParams.get('codes') || '';
    const codes = codesStr.split(',').filter(c => c.length > 0);
    
    const INTERNAL_MAP_REVERSE = {
      "00126380": "삼성전자", "00164779": "SK하이닉스", "00164742": "현대자동차",
      "00111722": "미래에셋증권", "01042775": "HL만도", "00547583": "하나금융지주",
      "00570387": "빌리앙뜨", "00258838": "카카오", "00266961": "NAVER",
      "00305884": "에코프로", "00126431": "대한항공", "00155167": "한화솔루션",
      "00159109": "한국전력공사", "00106641": "기아"
    };

    const result = {};
    codes.forEach(code => {
      result[code] = INTERNAL_MAP_REVERSE[code] || globalCodeToName[code] || code;
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }



  // 로컬 DB 백업 데이터 조회 헬퍼 함수
  function serveFromLocalDB(corpCodesStr, res, bgnDe = '', endDe = '') {
    if (!leanDb) {
      res.writeHead(500);
      return res.end(JSON.stringify({ status: "999", message: "로컬 DB가 비활성 상태입니다." }));
    }
    
    const cleanBgn = (bgnDe || '').replace(/[-.]/g, '').trim();
    const cleanEnd = (endDe || '').replace(/[-.]/g, '').trim();

    const codes = (corpCodesStr || '').split(',').map(c => c.trim()).filter(c => c.length > 0);

    let query = `SELECT rcept_no, corp_code, report_nm, rcept_dt FROM filings`;
    const queryParams = [];
    const conditions = [];

    // 1. 종목 조건
    if (codes.length > 0) {
      const placeholders = codes.map(() => '?').join(',');
      conditions.push(`corp_code IN (${placeholders})`);
      queryParams.push(...codes);
    }

    // 2. 날짜 조건
    if (cleanBgn && cleanEnd) {
      conditions.push(`rcept_dt BETWEEN ? AND ?`);
      queryParams.push(cleanBgn, cleanEnd);
    } else if (cleanBgn) {
      conditions.push(`rcept_dt >= ?`);
      queryParams.push(cleanBgn);
    } else if (cleanEnd) {
      conditions.push(`rcept_dt <= ?`);
      queryParams.push(cleanEnd);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY rcept_dt DESC, rcept_no DESC LIMIT 50`;

    const INTERNAL_MAP_REVERSE = {
      "00126380": "삼성전자", "00164779": "SK하이닉스", "00164742": "현대자동차",
      "00111722": "미래에셋증권", "01042775": "HL만도", "00547583": "하나금융지주",
      "00258838": "카카오", "00266961": "NAVER", "00305884": "에코프로",
      "00126431": "대한항공", "00155167": "한화솔루션", "00159109": "한국전력공사", "00106641": "기아"
    };

    const codeToName = { ...globalCodeToName, ...INTERNAL_MAP_REVERSE };

    let countQuery = `SELECT COUNT(*) as total FROM filings`;
    if (conditions.length > 0) {
      countQuery += ` WHERE ` + conditions.join(' AND ');
    }

    leanDb.get(countQuery, queryParams, (cErr, countRow) => {
      const totalCount = countRow ? countRow.total : 0;

      leanDb.all(query, queryParams, (err, rows) => {
        if (err) {
          console.error('[Fallback DB] Query error:', err.message);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ status: '000', message: '정상', total_count: 0, list: [] }));
        }

        const list = (rows || []).map(row => {
          const corpName = codeToName[row.corp_code] || row.corp_code;
          const isKospi = ['00126380', '00164779', '00164742', '00126431', '00159109'].includes(row.corp_code);
          return {
            rcept_no: row.rcept_no,
            corp_code: row.corp_code,
            corp_name: corpName,
            report_nm: row.report_nm,
            rcept_dt: (row.rcept_dt || '').replace(/-/g, ''),
            flr_nm: corpName,
            corp_cls: isKospi ? 'Y' : 'K',
            rm: ''
          };
        });

        console.log(`[Fallback DB] Successfully served ${list.length} filings (Total: ${totalCount}) from local DB due to DART limit`);
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        res.end(JSON.stringify({ status: '000', message: '정상 (로컬 DB 백업 수집 데이터)', total_count: totalCount, list }));
      });
    });
  }

  // ==========================================
  // DART API 메모리 캐시 (TTL 5분, 새로고침 시 API 절약용)
  // ==========================================
  if (!global.DART_CACHE) {
    global.DART_CACHE = new Map();
    global.CACHE_TTL = 5 * 60 * 1000; // 5분
    
    // 메모리 누수 방지 주기적 캐시 비우기 (1분마다 만료분 삭제)
    setInterval(() => {
      const now = Date.now();
      for (const [key, val] of global.DART_CACHE.entries()) {
        if (now - val.timestamp > global.CACHE_TTL) {
          global.DART_CACHE.delete(key);
        }
      }
    }, 60 * 1000);
  }

  // ==========================================
  // 3. DART API 백엔드 프록시 (기존 기능 유지 및 개선)
  // ==========================================
  if (pathname.startsWith('/api/dart/') || pathname.startsWith('/dart/')) {
    const dartPath = pathname.replace('/api/dart/', '').replace('/dart/', '');
    const DART_API_KEYS = (process.env.DART_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    
    if (DART_API_KEYS.length === 0) {
      console.error('[DART Proxy] Error: DART_API_KEY is not set in .env');
      res.writeHead(500);
      return res.end('Server Configuration Error: API Key Missing');
    }

    if (global.currentKeyIndex === undefined) {
      global.currentKeyIndex = 0;
    }

    const corpCode = parsedUrl.searchParams.get('corp_code');
    const bgnDe = parsedUrl.searchParams.get('bgn_de') || '';
    const endDe = parsedUrl.searchParams.get('end_de') || '';

    // 1. 메모리 캐시 검사
    const cacheKey = req.url;
    const cached = global.DART_CACHE.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp < global.CACHE_TTL)) {
      console.log(`[DART Proxy] [Cache Hit] Serving from memory cache: ${cacheKey}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(cached.data));
    }

    // 2. company.json 인 경우 로컬 DB 영구 캐시 우선 검사 (상세정보 있는 경우만 캐시 히트)
    if (dartPath === 'company.json' && corpCode && !corpCode.includes(',')) {
      leanDb.get("SELECT * FROM company_details WHERE corp_code = ?", [corpCode], (dbErr, row) => {
        if (dbErr) console.warn('[LeanDB] company_details 조회 실패:', dbErr.message);
        // ceo_nm이 있어야 상세정보가 채워진 캐시로 간주
        if (row && row.ceo_nm) {
          console.log(`[DART Proxy] [DB Hit] Serving company details from DB for: ${corpCode}`);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: '000', message: '정상', ...row }));
        }
        // 상세정보 없으면 DART API 호출 진행 (응답 후 DB 업데이트는 executeProxyRequest 내부에서 처리)
        executeProxyRequest();
      });
    } else {
      executeProxyRequest();
    }

    function executeProxyRequest() {
      // 다중 종목 코드 처리 (콤마로 구분된 경우)
      if (corpCode && corpCode.includes(',')) {
        const codes = corpCode.split(',');
        console.log(`[DART Proxy] Batch requesting for ${codes.length} codes...`);
        
        const fetchPromises = codes.map((code, index) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              let batchKey = DART_API_KEYS[global.currentKeyIndex];
              let batchUrl = `https://opendart.fss.or.kr/api/${dartPath}${parsedUrl.search}`;
              const uObj = new URL(batchUrl);
              uObj.searchParams.set('crtfc_key', batchKey);
              uObj.searchParams.set('corp_code', code);
              uObj.searchParams.set('page_count', '10');
              const singleUrl = uObj.toString();

              https.get(singleUrl, { headers: { 'User-Agent': 'DART-Pro-Server' } }, (pRes) => {
                let data = '';
                pRes.on('data', chunk => data += chunk);
                pRes.on('end', () => {
                  try { 
                    const json = JSON.parse(data);
                    if (json.status === '020' && DART_API_KEYS.length > 1) {
                      global.currentKeyIndex = (global.currentKeyIndex + 1) % DART_API_KEYS.length;
                      console.log(`[DART Proxy] Batch key rotated to index ${global.currentKeyIndex}.`);
                    }
                    resolve({ list: json.list || [], status: json.status }); 
                  } catch (e) { resolve({ list: [], status: '999' }); }
                });
              }).on('error', () => resolve({ list: [], status: '500' }));
            }, index * 100);
          });
        });

        Promise.all(fetchPromises).then(results => {
          const hasLimitError = results.some(r => r.status === '020');
          if (hasLimitError) {
            console.warn('[DART Proxy] Batch request hit limit (020). Falling back to local DB...');
            return serveFromLocalDB(corpCode, res, bgnDe, endDe);
          }

          const mergedList = [].concat(...results.map(r => r.list)).sort((a, b) => {
            const aNo = String(a.rcept_no || '0');
            const bNo = String(b.rcept_no || '0');
            return bNo.localeCompare(aNo);
          });

          const successResponse = { status: '000', message: '정상', list: mergedList.slice(0, 50) };
          global.DART_CACHE.set(cacheKey, { timestamp: Date.now(), data: successResponse });

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(successResponse));
        });
        return;
      }

      performSingleRequest(0);
    }

    function performSingleRequest(attempt) {
      let currentKey = DART_API_KEYS[global.currentKeyIndex];
      let targetUrl = `https://opendart.fss.or.kr/api/${dartPath}${parsedUrl.search}`;
      
      const uObj = new URL(targetUrl);
      uObj.searchParams.set('crtfc_key', currentKey);
      const finalUrl = uObj.toString();

      console.log(`[DART Proxy] Requesting (Attempt ${attempt + 1}): ${finalUrl.replace(currentKey, 'HIDDEN')}`);
      
      https.get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        },
        rejectUnauthorized: false
      }, (proxyRes) => {
        console.log(`[DART Proxy] Response Status: ${proxyRes.statusCode}`);
        
        let responseData = '';
        proxyRes.on('data', chunk => responseData += chunk);
        proxyRes.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            
            if (json.status === '020') {
              if (attempt < DART_API_KEYS.length - 1) {
                global.currentKeyIndex = (global.currentKeyIndex + 1) % DART_API_KEYS.length;
                console.warn(`[DART Proxy] Key limit exceeded (020). Rotating key to index ${global.currentKeyIndex}...`);
                return performSingleRequest(attempt + 1);
              }
              
              if (dartPath === 'company.json') {
                const name = globalCodeToName[corpCode] || '알 수 없는 기업';
                const fallbackData = {
                  status: '000',
                  message: '정상 (DART 한도 초과로 인한 기본 정보 제공)',
                  corp_name: name,
                  corp_code: corpCode,
                  stock_code: '',
                  ceo_nm: 'DART 한도 초과',
                  adres: 'DART API 일일 한도가 모두 소진되어 상세 정보 로드가 불가능합니다.'
                };
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                return res.end(JSON.stringify(fallbackData));
              }
              console.warn('[DART Proxy] Single request limit exceeded (020). Falling back to local DB...');
              return serveFromLocalDB(corpCode, res, bgnDe, endDe);
            }
            
            if (json.status === '000') {
              if (proxyRes.statusCode === 200) {
                global.DART_CACHE.set(cacheKey, { timestamp: Date.now(), data: json });
              }
              
              if (dartPath === 'company.json' && corpCode) {
                console.log(`[DART Proxy] Saving company details for: ${corpCode} to local DB.`);
                leanDb.run(`
                  INSERT OR REPLACE INTO company_details (
                    corp_code, corp_name, corp_name_eng, stock_name, stock_code, ceo_nm, corp_cls,
                    jurir_no, bizr_no, adres, hm_url, ir_url, phn_no, fax_no, induty_code, est_dt, acc_mt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                  json.corp_code || corpCode, json.corp_name || '', json.corp_name_eng || '',
                  json.stock_name || '', json.stock_code || '', json.ceo_nm || '', json.corp_cls || '',
                  json.jurir_no || '', json.bizr_no || '', json.adres || '', json.hm_url || '',
                  json.ir_url || '', json.phn_no || '', json.fax_no || '', json.induty_code || '',
                  json.est_dt || '', json.acc_mt || ''
                ], (insertErr) => {
                  if (insertErr) console.error('[LeanDB] company_details 저장 실패:', insertErr.message);
                });
              }
            }
          } catch (e) {}

          const headers = { ...proxyRes.headers };
          delete headers['x-frame-options'];
          delete headers['content-security-policy'];
          delete headers['content-length'];
          
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          
          res.writeHead(proxyRes.statusCode, headers);
          res.end(responseData);
        });
      }).on('error', (err) => {
        console.error('DART 통신 에러, 로컬 DB 폴백 시도:', err.message);
        serveFromLocalDB(corpCode, res, bgnDe, endDe);
      });
    }
    return;
  }


  // ==========================================
  // 2. 정적 파일 (Frontend) 제공 라우터
  // ==========================================
  // 정적 파일 경로 매핑
  let fileName = pathname;
  if (pathname === '/' || pathname === '/dashboard') {
    fileName = 'index.html';
  }
  let filePath = path.join(__dirname, fileName);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 DART Pro 서버 시작 (최종 수정: 2026-06-04 15:18)`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
  console.log(`==============================================\n`);
  
  // 감시 엔진 시작
  startMonitoring();
});

// ==========================================
// 4. 실시간 공시 감시 엔진 (Monitoring Engine)
// ==========================================
let lastProcessedRceptNo = null;
const RCEPT_FILE = path.join(DATA_DIR, 'last_rcept_no.txt');

function startMonitoring() {
  console.log('📡 Monitoring engine started (Interval: 1 min)');
  
  // 재시작 시 마지막 접수번호 로드
  if (fs.existsSync(RCEPT_FILE)) {
    lastProcessedRceptNo = fs.readFileSync(RCEPT_FILE, 'utf8').trim();
    console.log(`[Monitor] Resuming from last rcept_no: ${lastProcessedRceptNo}`);
  }

  // 1분마다 체크 (60000ms)
  setInterval(checkNewDisclosures, 60000);
  // 시작하자마자 한 번 체크
  checkNewDisclosures();
}

async function checkNewDisclosures() {
  const DART_API_KEY = process.env.DART_API_KEY;
  if (!DART_API_KEY) return;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${DART_API_KEY}&bgn_de=${today}&page_count=20`;
  const options = { headers: { 'User-Agent': 'DART-Pro-Monitor' } };

  https.get(url, options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const json = JSON.parse(data);
        if (json.status !== '000' || !json.list || json.list.length === 0) return;

        const latest = json.list[0];
        
        // 새로운 공시가 없는 경우
        if (latest.rcept_no === lastProcessedRceptNo) return;

        // 처음 시작하거나 새로운 공시들이 있는 경우
        let newItems = [];
        if (!lastProcessedRceptNo) {
          newItems = [latest]; // 처음엔 최신 것 하나만
        } else {
          for (let item of json.list) {
            if (item.rcept_no === lastProcessedRceptNo) break;
            newItems.push(item);
          }
        }

        if (newItems.length > 0) {
          console.log(`[Monitor] Found ${newItems.length} new disclosures!`);
          
          // 푸시 중복 방지를 위한 Set (동일 기업의 동일 보고서명이 같은 배치에 여러 개일 경우 하나만 발송)
          const pushedSet = new Set();

          // Firebase에서 푸시 대상을 조회하여 알림 발송
          for (let item of newItems.reverse()) { 
            const uniqueKey = `${item.corp_code}_${item.report_nm}`;
            if (pushedSet.has(uniqueKey)) {
              console.log(`[Monitor] Skipping duplicate push in same batch: ${item.corp_name} - ${item.report_nm}`);
              continue;
            }
            pushedSet.add(uniqueKey);

            try {
              // Firebase 앱이 초기화된 경우에만 쿼리 실행
              if (fcmAdmin.apps.length > 0) {
                const snapshot = await fcmAdmin.firestore().collection('users')
                  .where('interests', 'array-contains', item.corp_code)
                  .get();
                
                if (!snapshot.empty) {
                  console.log(`[Monitor] Found ${snapshot.size} users tracking ${item.corp_name}`);
                  
                  snapshot.forEach(async doc => {
                    const uid = doc.id;
                    const data = doc.data();
                    
                    // 1. 푸시 발송 (토큰 기준)
                    if (data.fcmToken) {
                      let cleanToken = data.fcmToken;
                      if (cleanToken.includes('Optional("')) {
                        const match = cleanToken.match(/Optional\("(.+)"\)/);
                        if (match) cleanToken = match[1];
                      }
                      cleanToken = cleanToken.replace(/Optional\("/g, '').replace(/"\)/g, '').trim();

                      const message = {
                        notification: { title: `🔔 [${item.corp_name}] 공시 알림`, body: item.report_nm.trim() },
                        data: { rcept_no: item.rcept_no, corp_code: item.corp_code, type: 'DISCLOSURE' },
                        token: cleanToken
                      };
                      sendFcmDirect(message).catch((e) => console.error('Push Error:', e.message));
                    }
                    
                    // 2. 알림 내역 저장 (UID 기준 - 기존 웹 호환성 유지)
                    const userNotifFile = path.join(DATA_DIR, `notifications_${uid}.json`);
                    let userNotifs = [];
                    if (fs.existsSync(userNotifFile)) userNotifs = JSON.parse(fs.readFileSync(userNotifFile, 'utf8'));
                    
                    userNotifs.unshift({
                      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                      title: `🔔 [${item.corp_name}] 공시 알림`,
                      body: item.report_nm.trim(),
                      date: new Date().toISOString(),
                      rceptNo: item.rcept_no,
                      isRead: false
                    });
                    fs.writeFileSync(userNotifFile, JSON.stringify(userNotifs.slice(0, 50), null, 2));
                  });
                  
                }
            }
          } catch (err) {
            console.error(`[Monitor] Error querying Firestore for ${item.corp_code}:`, err);
          }
        }

          // 마지막 번호 업데이트 및 저장
          lastProcessedRceptNo = latest.rcept_no;
          fs.writeFileSync(RCEPT_FILE, lastProcessedRceptNo);
        }
      } catch (e) {
        console.error('[Monitor] Error parsing data:', e.message);
      }
    });
  }).on('error', (err) => {
    console.error('[Monitor] Network error:', err.message);
  });
}
