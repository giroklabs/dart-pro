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
    const DART_API_KEY = '53887019f20e43924765d77443183569c7625167'; // 기존에 사용하시던 키
    
    let targetUrl = `https://opendart.fss.or.kr/api/${dartPath}${parsedUrl.search}`;
    if (!targetUrl.includes('crtfc_key=')) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + `crtfc_key=${DART_API_KEY}`;
    }
    
    console.log(`[DART Proxy] Requesting: ${targetUrl}`);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      },
      rejectUnauthorized: false // SSL 인증서 검증 일시 완화 (필요시)
    };

    const proxyReq = https.get(targetUrl, options, (proxyRes) => {
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
  console.log(`🚀 DART Pro 정식 백엔드 서버가 시작되었습니다.`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
  console.log(`==============================================\n`);
  console.log(`서버 종료는 Ctrl + C 를 누르세요.`);
});
