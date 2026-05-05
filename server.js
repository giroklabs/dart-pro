const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
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

const admin = require('firebase-admin');

// .env 파일 읽기 로직
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) process.env[key.trim()] = value.trim();
    });
    console.log('✅ .env configuration loaded.');
  }
} catch (err) {
  console.log('⚠️ .env file not found or unreadable.');
}

// Firebase Admin 초기화
try {
  const serviceAccount = require('./service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('🚀 Firebase Admin SDK initialized.');
} catch (err) {
  console.error('❌ Firebase Admin initialization failed:', err.message);
}

// 데이터 파일 경로 설정 (전역 스코프)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const USER_DATA_FILE = path.join(DATA_DIR, 'user_watchlist.json');

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
  // 0. 테스트 푸시 알림 발송 API
  // ==========================================
  if (pathname === '/api/test-push' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { fcmToken } = JSON.parse(body);
        if (!fcmToken) throw new Error('FCM 토큰이 없습니다.');

        const message = {
          notification: {
            title: '🔔 DART Pro 알림 테스트',
            body: '축하합니다! 서버와의 알림 연동이 성공적으로 완료되었습니다.'
          },
          token: fcmToken
        };

        await admin.messaging().send(message);

        // 알림 센터 내역에 저장
        const { uid } = JSON.parse(body);
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
          // 최대 50개까지만 유지
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
  // 1.5 Gemini AI 분석 API (캐시 적용 버전)
  // ==========================================
  if (pathname === '/api/ai/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { reportName, corpName, rceptNo } = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        const cacheFile = path.join(DATA_DIR, 'ai_analysis_cache.json');
        
        // 1. 캐시 확인
        let cache = {};
        if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        
        const cacheKey = rceptNo || `${corpName}_${reportName}`;
        if (cache[cacheKey]) {
          console.log(`[AI Cache] Hit! Returning cached analysis for: ${cacheKey}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(cache[cacheKey]));
        }

        if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

        console.log(`[AI Cache] Miss. Requesting new analysis for: ${cacheKey}`);
        const prompt = `
        너는 대한민국 최고의 주식 투자 분석가이자 금융 전문가야. 
        다음 제공되는 [기업명]과 [공시제목]을 바탕으로, 해당 공시가 주가와 기업 가치에 미치는 영향을 심층 분석해줘.

        기업명: ${corpName}
        공시제목: ${reportName}

        분석 시 다음 사항을 반드시 포함해줘:
        1. 이 공시가 왜 발생했는지에 대한 배경 설명 (투자자가 이해하기 쉽게)
        2. 이 공시가 향후 주가에 미칠 긍정적/부정적 영향과 그 이유
        3. 투자자가 반드시 확인해야 할 핵심 지표나 후속 일정
        4. 이 공시를 대하는 투자자의 전략적 권고 사항

        답변은 반드시 다음 JSON 형식으로만 보내줘 (다른 텍스트 없이 JSON만):
        {
          "category": "공시의 성격 (예: 실적발표, 주주환원, 자본확충, 경영리스크 등)",
          "insight": "웹 버전처럼 상세하고 전문적인 핵심 요약 (2-3문장 이상)",
          "points": [
            "첫 번째 심층 분석 포인트 및 투자 전략",
            "두 번째 심층 분석 포인트 및 투자 전략",
            "세 번째 심층 분석 포인트 및 투자 전략"
          ],
          "impact": "투자 영향도 (예: 어닝 서프라이즈, 실적 호조, 주의 요망 등)",
          "typeCls": "success, warning, info, danger 중 가장 적절한 등급"
        }
        `;

        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const requestBody = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        });

        const gReq = https.request(apiURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
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
              
              cache[cacheKey] = analysisResult;
              fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(analysisResult));
            } catch (e) {
              console.error('❌ AI Parsing Error:', e.message);
              res.writeHead(500);
              res.end(JSON.stringify({ error: `AI 분석 실패: ${e.message}` }));
            }
          });
        });

        gReq.on('error', (e) => { throw e; });
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
    // ... (기존 검색 로직 유지)

    try {
      const corpsPath = path.join(__dirname, 'corps.json');
      console.log(`[Search] Searching for "${query}" in ${corpsPath}`);
      
      if (!fs.existsSync(corpsPath)) {
        console.error('[Search] corps.json not found!');
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Data file missing' }));
      }

      const corps = JSON.parse(fs.readFileSync(corpsPath, 'utf8'));
      // corps.json 형식이 { "code": "name" } 인지 [{code, name}] 인지 확인 필요
      // 여기서는 두 형식 모두 대응하도록 유연하게 처리
      let results = [];
      if (Array.isArray(corps)) {
        results = corps.filter(c => (c.name && c.name.includes(query)) || (c.code && c.code.includes(query)));
      } else {
        results = Object.entries(corps)
          .filter(([name, code]) => name.includes(query) || code.includes(query))
          .map(([name, code]) => ({ code, name }));
      }
      
      results = results.slice(0, 20);
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
  console.log(`🚀 DART Pro 서버 시작 (최종 수정: 2026-05-04 22:26)`);
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
              const snapshot = await admin.firestore().collection('users')
                .where('interests', 'array-contains', item.corp_code)
                .get();
              
              if (!snapshot.empty) {
                console.log(`[Monitor] Found ${snapshot.size} users tracking ${item.corp_name}`);
                snapshot.forEach(doc => {
                  const uid = doc.id;
                  const data = doc.data();
                  
                  // 1. 푸시 발송 (토큰 기준)
                  if (data.fcmToken) {
                    const message = {
                      notification: { title: `🔔 [${item.corp_name}] 공시 알림`, body: item.report_nm.trim() },
                      data: { rcept_no: item.rcept_no, corp_code: item.corp_code, type: 'DISCLOSURE' },
                      token: data.fcmToken
                    };
                    admin.messaging().send(message).catch(() => {});
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
