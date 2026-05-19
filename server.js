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

// FCM REST API 직접 발송 (google-auth-library 토큰 + FCM v1 API)
async function sendFcmDirect(message) {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
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

  return new Promise((resolve, reject) => {
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

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// 데이터 파일 경로 설정 (전역 스코프)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const USER_DATA_FILE = path.join(DATA_DIR, 'user_watchlist.json');

// 실시간 로그를 임시 저장할 배열
let mlLogs = [];

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

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
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
      'SELECT summary_text FROM summaries WHERE rcept_no = ?',
      [rcept_no],
      (err, row) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: err.message }));
        }
        if (row) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, summary: row.summary_text }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: '아직 요약이 생성되지 않았습니다.' }));
        }
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
    req.on('end', async () => {
      try {
        const { corpName, reportName, rceptNo } = JSON.parse(body);
        console.log(`[AI Request] Analysing: ${corpName} - ${reportName}`);
        const apiKey = process.env.GEMINI_API_KEY;
        const cacheFile = path.join(DATA_DIR, 'ai_analysis_cache.json');
        
        // 1. 랭킹 스코어 계산 (Rule-based Logic)
        const rankScore = calculateDisclosureScore(reportName);
        const rankLabel = getRankLabel(rankScore);

        // 2. 캐시 확인
        let cache = {};
        if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        
        const cacheKey = rceptNo || `${corpName}_${reportName}`;
        if (cache[cacheKey]) {
          console.log(`[AI Cache] Hit! Returning cached analysis for: ${cacheKey}`);
          const result = { ...cache[cacheKey], rankScore, rankLabel };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }

        if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

        console.log(`[AI Cache] Miss. Requesting new analysis for: ${cacheKey}`);
        const prompt = `
너는 금융감독원 DART 공시를 분석하는 랭킹 전문 AI 어시스턴트다.

분석 대상:
- 기업명: ${corpName}
- 공시제목: ${reportName}
- 계산된 중요도 점수: ${rankScore} (0~10점 사이, 높을수록 중요)

목표:
1. 위 공시제목에서 핵심 수치(금액, 비율, 날짜)를 추출하고 그 의미를 분석한다.
2. 중요도 점수(${rankScore})를 기반으로 이 공시가 투자자에게 왜 중요한지(또는 참고용인지) 설명한다.
3. 한국어 형태소 분석 관점에서 '의사결정 동사'와 '리스크 명사'를 찾아 영향력을 평가한다.

핵심 원칙:
- 공시유형을 먼저 판단한다.
- 핵심 사건, 대상 회사, 금액, 일정, 변경사항을 우선 요약한다.
- 숫자와 날짜가 있으면 반드시 포함한다.
- 리스크, 영향, 확인 필요 사항이 있으면 짧게 제시한다.
- 출력은 5줄 내외로 제한한다.

답변은 반드시 다음 JSON 형식으로만 보내줘 (다른 텍스트 없이 JSON만):
{
  "category": "공시유형 (정기공시/주요사항보고/발행공시/지분공시/외부감사/기타공시 중 하나)",
  "insight": "[핵심요약] 1문장. [핵심수치/일정] 숫자·날짜 포함 1문장.",
  "points": [
    "[데이터 피처] 공시에서 발견된 수치나 키워드 특징 1문장",
    "[영향/의미] 중요도 점수 기반 투자자 관점 영향 1문장",
    "[확인포인트] 반드시 확인해야 할 사항 1문장"
  ],
  "impact": "핵심어 중심 한 줄 요약 (숫자/날짜 포함 시 필수 기재)",
  "typeCls": "success, warning, info, danger 중 이 공시의 투자 영향도에 맞는 등급",
  "rankScore": ${rankScore},
  "rankLabel": ${rankLabel}
}
        `;

        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const requestBody = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        });

        const gReq = https.request(apiURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000 // 30초 타임아웃 추가
        }, (gRes) => {
          let gData = '';
          gRes.on('data', chunk => gData += chunk);
          gRes.on('end', () => {
            try {
              const gJson = JSON.parse(gData);
              if (!gJson.candidates || !gJson.candidates[0]) {
                const errMsg = gJson.error?.message || 'AI 응답 형식이 올바르지 않습니다.';
                throw new Error(errMsg);
              }
              const text = gJson.candidates[0].content.parts[0].text;
              const cleanJson = text.replace(/```json|```/g, '').trim();
              const analysisResult = JSON.parse(cleanJson);
              
              // 메모리 캐시 먼저 업데이트
              cache[cacheKey] = analysisResult;
              
              // 비동기로 파일 저장 (지연 방지)
              fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), (err) => {
                if (err) console.error('Cache save error:', err);
              });
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(analysisResult));
            } catch (e) {
              console.error('❌ AI Parsing Error:', e.message);
              res.writeHead(500);
              res.end(JSON.stringify({ error: `AI 분석 실패: ${e.message}` }));
            }
          });
        });

        gReq.on('timeout', () => {
          gReq.destroy();
          res.writeHead(504);
          res.end(JSON.stringify({ error: 'AI 분석 시간 초과 (30초)' }));
        });

        gReq.on('error', (e) => { 
          console.error('❌ AI Request Error:', e.message);
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        });
        
        gReq.write(requestBody);
        gReq.end();

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
      const corpsPath = path.join(__dirname, 'corps.json');
      console.log(`[Search] Searching for "${query}" in ${corpsPath}`);
      
      if (!fs.existsSync(corpsPath)) {
        console.error('[Search] corps.json not found!');
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Data file missing' }));
      }

      const corps = JSON.parse(fs.readFileSync(corpsPath, 'utf8'));
      let results = [];
      if (Array.isArray(corps)) {
        results = corps.filter(c => (c.name && c.name.includes(query)) || (c.code && c.code.includes(query)));
      } else {
        results = Object.entries(corps)
          .filter(([key, val]) => !/^[0-9]{8}$/.test(key) && /^[0-9]{8}$/.test(val))
          .filter(([name, code]) => name.includes(query) || code.includes(query))
          .map(([name, code]) => ({ code, name }));
      }

      // INTERNAL_MAP 데이터 병합 (중복 제거)
      const internalResults = Object.entries(INTERNAL_MAP)
        .filter(([name, code]) => name.includes(query) || code.includes(query))
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
    
    let corps = {};
    try {
      const corpsPath = path.join(__dirname, 'corps.json');
      if (fs.existsSync(corpsPath)) corps = JSON.parse(fs.readFileSync(corpsPath, 'utf8'));
    } catch (e) { console.error('[API] Error loading corps.json', e); }

    const INTERNAL_MAP_REVERSE = {
      "00126380": "삼성전자", "00164779": "SK하이닉스", "00164742": "현대자동차",
      "00111722": "미래에셋증권", "01042775": "HL만도", "00547583": "하나금융지주",
      "00570387": "빌리앙뜨", "00258838": "카카오", "00266961": "NAVER",
      "00305884": "에코프로", "00126431": "대한항공", "00155167": "한화솔루션",
      "00159109": "한국전력공사", "00106641": "기아"
    };

    const codeToName = { ...INTERNAL_MAP_REVERSE };
    for (const [key, val] of Object.entries(corps)) {
      if (!/^[0-9]{8}$/.test(key) && /^[0-9]{8}$/.test(val)) {
        if (!codeToName[val]) codeToName[val] = key;
      }
    }

    const result = {};
    codes.forEach(code => {
      result[code] = codeToName[code] || code;
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }



  // ==========================================
  // 3. DART API 백엔드 프록시 (기존 기능 유지 및 개선)
  // ==========================================
  if (pathname.startsWith('/api/dart/') || pathname.startsWith('/dart/')) {
    const dartPath = pathname.replace('/api/dart/', '').replace('/dart/', '');
    const DART_API_KEY = process.env.DART_API_KEY;
    
    if (!DART_API_KEY) {
      console.error('[DART Proxy] Error: DART_API_KEY is not set in .env');
      res.writeHead(500);
      return res.end('Server Configuration Error: API Key Missing');
    }
    
    let targetUrl = `https://opendart.fss.or.kr/api/${dartPath}${parsedUrl.search}`;
    if (!targetUrl.includes('crtfc_key=')) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + `crtfc_key=${DART_API_KEY}`;
    }

    const corpCode = parsedUrl.searchParams.get('corp_code');
    const options = { headers: { 'User-Agent': 'DART-Pro-Server' } };

    // 다중 종목 코드 처리 (콤마로 구분된 경우)
    if (corpCode && corpCode.includes(',')) {
      const codes = corpCode.split(',');
      console.log(`[DART Proxy] Batch requesting for ${codes.length} codes...`);
      
      const fetchPromises = codes.map((code, index) => {
        return new Promise((resolve) => {
          // 0.1초 간격으로 순차 요청 (DART 차단 방지)
          setTimeout(() => {
            const urlObj = new URL(targetUrl);
            urlObj.searchParams.set('corp_code', code);
            urlObj.searchParams.set('page_count', '10'); // 종목당 최대 10건
            const singleUrl = urlObj.toString();

            https.get(singleUrl, options, (pRes) => {
              let data = '';
              pRes.on('data', chunk => data += chunk);
              pRes.on('end', () => {
                try { 
                  const json = JSON.parse(data);
                  resolve(json.list || []); 
                } catch (e) { resolve([]); }
              });
            }).on('error', () => resolve([]));
          }, index * 100);
        });
      });

      Promise.all(fetchPromises).then(results => {
        const mergedList = [].concat(...results).sort((a, b) => {
          const aNo = String(a.rcept_no || '0');
          const bNo = String(b.rcept_no || '0');
          return bNo.localeCompare(aNo);
        });
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: '000', message: '정상', list: mergedList.slice(0, 50) }));
      });
      return;
    }

    console.log(`[DART Proxy] Requesting: ${targetUrl.replace(DART_API_KEY, 'HIDDEN')}`);
    
    const proxyReq = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      },
      rejectUnauthorized: false // SSL 인증서 검증 일시 완화 (필요시)
    }, (proxyRes) => {
      console.log(`[DART Proxy] Response Status: ${proxyRes.statusCode}`);
      
      // 불필요하거나 문제되는 헤더 제거
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      delete headers['content-security-policy'];
      delete headers['content-length']; // 파이프 시 압축 등으로 달라질 수 있음
      
      // CORS 대응 (강력하게 설정)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error('DART 통신 에러:', err.message);
      res.writeHead(500);
      res.end('Backend Proxy Error');
    });
    
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
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 DART Pro 서버 시작 (최종 수정: 2026-05-06 13:52)`);
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
          
          // Firebase에서 푸시 대상을 조회하여 알림 발송
          for (let item of newItems.reverse()) { 
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
