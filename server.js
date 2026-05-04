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

        const response = await admin.messaging().send(message);
        console.log('✅ Test push sent successfully:', response);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: '000', message: '테스트 알림 발송 성공' }));
      } catch (err) {
        console.error('❌ Test push ERROR DETAILS:', err); // 에러 객체 전체 출력
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: '500', message: err.message, code: err.code }));
      }
    });
    return;
  }

  // 데이터 파일 경로
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
  const USER_DATA_FILE = path.join(DATA_DIR, 'user_watchlist.json');

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
          .filter(([code, name]) => name.includes(query) || code.includes(query))
          .map(([code, name]) => ({ code, name }));
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
  if ((pathname === '/api/push/register' || pathname === '/push/register') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { token, corp_codes, uid } = JSON.parse(body);
        console.log(`[Watchlist] Register request - UID: ${uid || 'N/A'}, Codes: ${corp_codes?.length || 0}`);
        
        // 구독 정보 저장 (FCM용)
        let subs = {};
        if (fs.existsSync(SUBS_FILE)) subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
        for (const code in subs) subs[code] = subs[code].filter(t => t !== token);
        corp_codes.forEach(code => {
          if (!subs[code]) subs[code] = [];
          subs[code].push(token);
        });
        fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));

        // 사용자별 관심 종목 저장 (동기화용)
        if (uid) {
          let userData = {};
          if (fs.existsSync(USER_DATA_FILE)) userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
          userData[uid] = corp_codes;
          fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2));
          console.log(`[Watchlist] Successfully saved for UID: ${uid}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/push/watchlist' || pathname === '/push/watchlist') {
    const uid = parsedUrl.searchParams.get('uid');
    console.log(`[Watchlist] Fetch request - UID: ${uid || 'unknown'}`);
    if (!uid) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'UID required' }));
    }
    let userData = {};
    if (fs.existsSync(USER_DATA_FILE)) userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(userData[uid] || []));
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
          // rcept_no(접수번호) 기준 내림차순 정렬
          return (b.rcept_no || 0) - (a.rcept_no || 0);
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
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
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
  console.log(`🚀 DART Pro 서버 시작 (최종 수정: 2026-05-04 22:22)`);
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

  https.get(url, (res) => {
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
          
          // 구독 정보 로드
          const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
          if (fs.existsSync(SUBS_FILE)) {
            const subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
            
            for (let item of newItems.reverse()) { // 오래된 것부터 순서대로 발송
              const targets = subs[item.corp_code] || [];
              if (targets.length > 0) {
                console.log(`[Monitor] Sending push for ${item.corp_name} to ${targets.length} users`);
                
                for (let token of targets) {
                  const message = {
                    notification: {
                      title: `🔔 [${item.corp_name}] 공시 알림`,
                      body: item.report_nm.trim()
                    },
                    data: {
                      rcept_no: item.rcept_no,
                      corp_code: item.corp_code,
                      type: 'DISCLOSURE'
                    },
                    token: token
                  };
                  
                  try {
                    await admin.messaging().send(message);
                  } catch (e) {
                    console.error('[Monitor] Push failed for token:', token.substring(0, 10));
                  }
                }
              }
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
