// DART OpenAPI Wrapper
// 환경 자동 감지: 로컬(localhost) = server.js 내부 프록시, 배포(GitHub Pages 등) = 직접 DART 호출(CORS 프록시 경유)
const _IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const DART_DIRECT = 'https://opendart.fss.or.kr/api';
// 공개 CORS 프록시 - 배포 환경에서 DART API CORS 우회
const CORS_PROXY = 'https://corsproxy.io/?url=';

const api = {
  BASE: _IS_LOCAL ? '/api/dart' : null, // null이면 _fetch에서 직접 URL 구성
  GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta',
  
  // 상태 관리
  _geminiModel: 'models/gemini-1.5-flash',
  _corpDb: null,
  
  getKey() {
    const settings = JSON.parse(localStorage.getItem('dart_settings') || '{}');
    return settings.apiKey || '';
  },

  getGeminiKey() {
    const settings = JSON.parse(localStorage.getItem('dart_settings') || '{}');
    return settings.geminiApiKey || '';
  },

  setKey(key) {
    const settings = JSON.parse(localStorage.getItem('dart_settings') || '{}');
    settings.apiKey = key;
    localStorage.setItem('dart_settings', JSON.stringify(settings));
  },

  setGeminiKey(key) {
    const settings = JSON.parse(localStorage.getItem('dart_settings') || '{}');
    settings.geminiApiKey = key;
    localStorage.setItem('dart_settings', JSON.stringify(settings));
  },

  setGeminiModel(modelName) {
    this._geminiModel = modelName;
  },

  async _fetch(endpoint, params = {}) {
    const key = this.getKey();
    if (!key) throw new Error('API 키가 설정되지 않았습니다.');

    const cleanParams = { crtfc_key: key };
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        cleanParams[k] = params[k];
      }
    });

    const query = new URLSearchParams(cleanParams).toString();
    
    // 로컬: server.js 내부 프록시, 배포: CORS 프록시 경유 직접 호출
    let targetUrl;
    if (_IS_LOCAL && this.BASE) {
      targetUrl = `${this.BASE}/${endpoint}?${query}`;
    } else {
      const dartUrl = `${DART_DIRECT}/${endpoint}?${query}`;
      targetUrl = `${CORS_PROXY}${encodeURIComponent(dartUrl)}`;
    }

    try {
      const res = await fetch(targetUrl, { 
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      
      const data = await res.json();
      
      // DART 서버 에러 검출
      if (data.status && data.status !== '000') {
        return this._handleData(data); // 에러 파싱 후 throw
      }
      return data;
    } catch (err) {
      if (err.message.includes('DART') || err.message.includes('부적절한 값')) {
        throw err;
      }
      throw new Error(`데이터 로드 실패: ${err.message}`);
    }
  },

  _handleData(data) {
    if (data.status === '013') {
      return { ...data, list: [] }; // 에러가 아닌 빈 리스트로 정상 처리
    }
    if (data.status && data.status !== '000') {
      const messages = {
        '010': '등록되지 않은 키입니다.',
        '011': '사용할 수 없는 키입니다.',
        '020': '요청 제한을 초과하였습니다.',
        '800': '시스템 점검 중입니다.',
      };
      throw new Error(messages[data.status] || data.message || 'DART 서버 응답 오류');
    }
    return data;
  },

  // 기업 DB 초기화 (로컬 corps.json 우선)
  async initCorpCodes() {
    if (this._corpDb && this._corpDb.data) return this._corpDb.data;
    
    try {
      // 1. 서버의 corps.json 시도 (가장 권장)
      const res = await fetch('corps.json');
      if (res.ok) {
        const data = await res.json();
        this._corpDb = { data };
        console.log('[DART] Local corps.json loaded.');
        return data; // 데이터 내용물 반환
      }
    } catch (err) {
      console.warn("[DART] Local DB fetch failed:", err);
    }

    // 2. 실패 시 비상용 IndexedDB 확인 (직접 쿼리)
    try {
      const db = await this._getDb();
      const tx = db.transaction('corps', 'readonly');
      const store = tx.objectStore('corps');
      const all = await new Promise(resolve => {
        const req = store.getAll();
        req.onsuccess = () => {
          const res = {};
          req.result.forEach(item => res[item.name] = item.code);
          resolve(res);
        };
        req.onerror = () => resolve({});
      });
      if (Object.keys(all).length > 0) {
        this._corpDb = { data: all };
        return all;
      }
    } catch (e) {}

    return {};
  },

  // 고유번호로 회사 이름 찾기
  async getCorpName(code) {
    const db = await this.initCorpCodes();
    return db[code] || code;
  },

  // --- IndexedDB 기반 대용량 DB 관리 ---
  _db: null,
  async _getDb() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('dart_pro_db', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('corps')) {
          db.createObjectStore('corps', { keyPath: 'name' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async syncFullDb(progressCb) {
    const key = this.getKey();
    if (!key) throw new Error('API 키가 필요합니다.');
    
    const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`;
    const proxies = [
      u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      u => `https://thingproxy.freeboard.io/fetch/${u}` // 차선책
    ];

    let lastError = null;
    for (const getProxyUrl of proxies) {
      try {
        if (progressCb) progressCb(`${getProxyUrl('').split('/')[2]} 프록시 연결 중...`);
        const proxyUrl = getProxyUrl(url);
        const res = await fetch(proxyUrl);
        
        if (!res.ok) {
          console.warn(`Proxy ${proxyUrl} failed with status ${res.status}`);
          continue;
        }
        
        const zipData = await res.arrayBuffer();
        if (zipData.byteLength < 10000) {
          console.warn(`Proxy returned too small data (${zipData.byteLength} bytes)`);
          continue;
        }

        if (progressCb) progressCb('압축 해제 및 데이터 분석 중...');
        const zip = await JSZip.loadAsync(zipData);
        const xmlText = await zip.file("CORPCODE.xml").async("string");
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "text/xml");
        const list = xml.getElementsByTagName("list");
        
        if (progressCb) progressCb(`인덱싱 중... (총 ${list.length.toLocaleString()}개)`);
        const db = await this._getDb();
        const tx = db.transaction('corps', 'readwrite');
        const store = tx.objectStore('corps');
        store.clear();

        for (let i = 0; i < list.length; i++) {
          const name = list[i].getElementsByTagName("corp_name")[0].textContent;
          const code = list[i].getElementsByTagName("corp_code")[0].textContent;
          store.put({ name, code });
        }

        return new Promise((resolve) => {
          tx.oncomplete = () => {
            localStorage.setItem('dart_db_synced', Date.now());
            resolve(list.length);
          };
        });
      } catch (err) {
        console.error(`Sync attempt failed: ${err.message}`);
        lastError = err;
      }
    }
    
    throw new Error(`모든 프록시 시도 실패: ${lastError?.message || '알 수 없는 오류'}`);
  },

  async syncFromFile(file, progressCb) {
    if (progressCb) progressCb('파일 읽는 중...');
    let xmlText = '';

    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      xmlText = await zip.file("CORPCODE.xml").async("string");
    } else {
      xmlText = await file.text();
    }

    if (progressCb) progressCb('데이터 분석 및 인덱싱 중...');
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");
    const list = xml.getElementsByTagName("list");

    const db = await this._getDb();
    const tx = db.transaction('corps', 'readwrite');
    const store = tx.objectStore('corps');
    store.clear();

    for (let i = 0; i < list.length; i++) {
      const name = list[i].getElementsByTagName("corp_name")[0].textContent;
      const code = list[i].getElementsByTagName("corp_code")[0].textContent;
      store.put({ name, code });
    }

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        localStorage.setItem('dart_db_synced', Date.now());
        resolve(list.length);
      };
    });
  },

  async findCorpCode(name) {
    const q = name.replace(/\s/g, '').toLowerCase();
    
    // 1. IndexedDB 먼저 확인
    try {
      const db = await this._getDb();
      const tx = db.transaction('corps', 'readonly');
      const store = tx.objectStore('corps');
      const req = store.get(name);
      const res = await new Promise(r => req.onsuccess = () => r(req.result));
      if (res) return res.code;
    } catch(e) {}

    // 2. 내장 맵 및 캐시 확인
    const CORP_MAP = { "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "미래에셋증권": "00155255", "HL만도": "00155219" };
    if (CORP_MAP[name]) return CORP_MAP[name];
    
    return null;
  },

  async searchCorpCodes(query, limit = 10) {
    if (!query || query.length < 2) return [];
    const results = [];
    const q = query.replace(/\s/g, '').toLowerCase();
    const isNumber = /^\d+$/.test(q);

    // 1. 내장 맵 우선 검색 (가장 빠르고 확실함)
    const INTERNAL_MAP = { 
      "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "현대차": "00164742", 
      "미래에셋증권": "00111722", "미래에셋": "00111722", "HL만도": "01042775", "에이치엘만도": "01042775",
      "하나금융지주": "00570387", "하나금융": "00570387", "카카오": "00258838", "네이버": "00266961", "에코프로": "00305884",
      "대한항공": "00126431", "한화솔루션": "00155167", "한국전력공사": "00159109", "한국전력": "00159109"
    };

    for (const [name, code] of Object.entries(INTERNAL_MAP)) {
      const matchName = name.toLowerCase().includes(q);
      const matchCode = code.includes(q);
      if (matchName || matchCode) {
        results.push({ name, code });
      }
    }

    // 2. IndexedDB 검색 (전수 데이터가 있는 경우 추가)
    try {
      const db = await this._getDb();
      const tx = db.transaction('corps', 'readonly');
      const store = tx.objectStore('corps');
      const req = store.openCursor();
      
      await new Promise(resolve => {
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit * 2) {
            const name = cursor.value.name;
            const code = cursor.value.code;
            if (name.toLowerCase().includes(q) || code.includes(q)) {
              if (!results.find(r => r.code === code)) {
                results.push({ name, code });
              }
            }
            cursor.continue();
          } else resolve();
        };
        req.onerror = () => resolve();
      });
    } catch(e) {}

    // 정렬: 번호가 정확히 일치하거나 이름이 정확히 일치하는 항목 우선
    return results.sort((a, b) => {
      if (isNumber) {
        if (a.code === q) return -1;
        if (b.code === q) return 1;
      }
      if (a.name === query) return -1;
      if (b.name === query) return 1;
      return 0;
    }).slice(0, limit);
  },

  async getDbStatus() {
    const synced = localStorage.getItem('dart_db_synced');
    if (!synced) return { status: 'internal', count: 0 };
    return { status: 'synced', timestamp: parseInt(synced) };
  },

  async clearFullDb() {
    const db = await this._getDb();
    const tx = db.transaction('corps', 'readwrite');
    tx.objectStore('corps').clear();
    localStorage.removeItem('dart_db_synced');
  },

  // 관심 종목 관리
  getWatchlist() {
    return JSON.parse(localStorage.getItem('dart_watchlist') || '[]');
  },

  addWatch(corpCode, name) {
    const list = this.getWatchlist();
    if (!list.find(i => i.code === corpCode)) {
      // 명칭이 없는 경우 내장 맵에서 역조회
      let finalName = name;
      if (!finalName) {
        const INTERNAL_MAP = { 
          "00126380": "삼성전자(주)", "00164779": "에스케이하이닉스(주)", "00164742": "현대자동차(주)", 
          "00111722": "미래에셋증권(주)", "01042775": "에이치엘만도(주)", "00547583": "하나금융지주(주)",
          "00126431": "대한항공(주)", "00155167": "한화솔루션(주)", "00159109": "한국전력공사(주)"
        };
        finalName = INTERNAL_MAP[corpCode] || "알 수 없는 기업";
      }
      
      list.push({ code: corpCode, name: finalName });
      localStorage.setItem('dart_watchlist', JSON.stringify(list));
      return true;
    }
    return false;
  },

  removeWatch(corpCode) {
    const list = this.getWatchlist().filter(i => i.code !== corpCode);
    localStorage.setItem('dart_watchlist', JSON.stringify(list));
  },

  async getGeminiAnalysis(corpName, reportNm) {
    const key = this.getGeminiKey();
    if (!key) return null;

    if (this._geminiRateLimitUntil && Date.now() < this._geminiRateLimitUntil) {
      throw new Error(`할당량 초과 (429): 분당 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요.`);
    }

    // 전역 캐시 확인 (모든 분석 요청에 적용)
    const cacheKey = `gemini_cache_${corpName}_${reportNm}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        localStorage.removeItem(cacheKey);
      }
    }

    try {
      let modelId = this._geminiTargetModelId;
      
      // 모델 조회를 캐시하여 1분당 요청 횟수(RPM)를 절반으로 줄입니다.
      if (!modelId) {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const listRes = await fetch(listUrl);
        if (!listRes.ok) {
          const err = await listRes.json();
          throw new Error(`API 권한 오류 (${listRes.status}): ${err.error?.message || '접근 거부'}`);
        }
        
        const listData = await listRes.json();
        const availableModels = listData.models || [];
        
        let targetModel = availableModels.find(m => 
          m.name.toLowerCase().includes('1.5-flash') && 
          m.supportedGenerationMethods.includes('generateContent')
        );

        if (!targetModel) {
          targetModel = availableModels.find(m => 
            m.name.toLowerCase().includes('flash') && 
            m.supportedGenerationMethods.includes('generateContent')
          );
        }

        if (!targetModel) {
          targetModel = availableModels.find(m => 
            m.name.toLowerCase().includes('pro') && 
            m.supportedGenerationMethods.includes('generateContent')
          );
        }

        if (!targetModel) {
          throw new Error("Gemini Flash 모델을 찾을 수 없습니다. API 키의 모델 권한을 확인하세요.");
        }

        modelId = targetModel.name.split('/').pop();
        this._geminiTargetModelId = modelId; 
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
      
      const prompt = `당신은 전문 주식 투자 분석가입니다. 다음 공시 정보를 바탕으로 투자자에게 도움이 될 만한 '인사이트 요약'과 '시장 영향력'을 한국어로 작성해 주세요. 
반드시 다음 JSON 형식으로만 응답하세요. **나 * 같은 마크다운 기호는 절대 사용하지 마세요.
{ "insight": "공시의 핵심 의미 요약", "impact": "긍정적/부정적/정보확인 중 하나", "points": ["포인트1", "포인트2", "포인트3"] }

공시 정보:
기업명: ${corpName}
공시제목: ${reportNm}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!res.ok) {
        const errData = await res.json();
        const msg = errData.error?.message || '';
        if (res.status === 429) {
          // 429 에러 발생 시 60초간 API 호출 완전 차단 (서킷 브레이커)
          this._geminiRateLimitUntil = Date.now() + 60000;
          throw new Error(`할당량 초과 (429): 분당 요청 제한에 걸렸습니다. 1분 후 다시 시도하세요.`);
        }
        throw new Error(`분석 요청 실패 (${res.status}): ${msg || 'Unknown'}`);
      }

      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        const cleanedText = text.replace(/```json|```/g, '').trim();
        let parsedData = JSON.parse(cleanedText);
        
        // 불필요한 마크다운 기호(**, *) 제거
        const stripMd = (s) => typeof s === 'string' ? s.replace(/\*\*|\*/g, '').trim() : s;
        parsedData.insight = stripMd(parsedData.insight);
        parsedData.impact = stripMd(parsedData.impact);
        if (Array.isArray(parsedData.points)) {
          parsedData.points = parsedData.points.map(p => stripMd(p));
        }

        localStorage.setItem(cacheKey, JSON.stringify(parsedData));
        return parsedData;
      }
    } catch (err) {
      console.error('Gemini Analysis Critical Error:', err);
      throw err; // 상세 에러를 UI로 전달
    }
    return null;
  },

  // 1. 공시검색
  async searchDisclosures(opts = {}) {
    const params = { ...opts };
    
    // corp_code 유효성 검사 및 정제
    if (params.corp_code) {
      const sanitized = params.corp_code
        .split(',')
        .map(c => c.trim())
        .filter(c => /^[0-9]{8}$/.test(c))
        .join(',');
      
      if (sanitized) {
        params.corp_code = sanitized;
      } else {
        delete params.corp_code;
      }
    } else {
      // corp_code가 아예 없거나 null/undefined인 경우 확실히 삭제
      delete params.corp_code;
    }

    params.sort = opts.sort || 'date';
    params.sort_mth = opts.sort_mth || 'desc';
    params.page_no = opts.page_no || 1;
    params.page_count = opts.page_count || 20;
    return this._fetch('list.json', params);
  },

  // 2. 기업개황
  async getCompanyInfo(corpCode) {
    return this._fetch('company.json', { corp_code: corpCode });
  },

  // 3. 공시서류원본파일
  getDocumentUrl(rceptNo) {
    const key = this.getKey();
    return `${this.BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`;
  },

  disclosureTypes: {
    A: '정기공시', B: '주요사항보고', C: '발행공시',
    D: '지분공시', E: '기타공시', F: '외부감사관련',
    G: '펀드공시', H: '자산유동화', I: '거래소공시', J: '공정위공시',
  },

  corpClsNames: { Y: '유가증권', K: '코스닥', N: '코넥스', E: '기타' },

  pillClass(corpCls) {
    const map = { Y: 'pill-financial', K: 'pill-major', N: 'pill-equity', E: 'pill-default' };
    return map[corpCls] || 'pill-default';
  },

  formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return dateStr || '';
    return `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`;
  },

  viewerUrl(rceptNo) {
    return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
  }
};

window.DART_API = api;
window.api = api;
